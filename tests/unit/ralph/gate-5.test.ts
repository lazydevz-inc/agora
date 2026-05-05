// SPEC: docs/loops/ralph-loop.md Gate 5 + Stage 2-B.4 R1-A 3-tier.

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  GATE_5_THRESHOLDS,
  Gate5ResultSchema,
  mapDriftToAction,
  runGate5,
} from "@/ralph/gate-5.js";

class StubRunner implements ClaudeRunner {
  constructor(public readonly response: ClaudeResponse) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    return this.response;
  }
}

function okExtraction(opts: {
  drift: number;
  rationale?: string;
  directive?: string;
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      drift_score: opts.drift,
      rationale: opts.rationale ?? "OK",
      ...(opts.directive !== undefined ? { z1_directive: opts.directive } : {}),
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput = {
  leaf_id: "ac_001.1",
  leaf_content: "Implement password login",
  telos_statement: "help users authenticate quickly",
  telos_failure_signal: "users abandon at login screen",
  all_acceptance_criteria: [{ id: "ac_001", content: "users authenticate" }],
  diff: "diff --git a/src/auth.ts b/src/auth.ts\n+function login() {...}",
  diff_source: "head_minus_one_to_head" as const,
  diff_truncated: false,
};

describe("mapDriftToAction — 3-tier (Stage 2-B.4 R1-A)", () => {
  test("0.00 → PASS", () => {
    expect(mapDriftToAction(0)).toBe("PASS");
  });
  test("just under soft_warn (0.149) → PASS", () => {
    expect(mapDriftToAction(0.149)).toBe("PASS");
  });
  test("at soft_warn (0.15) → SOFT_WARN", () => {
    expect(mapDriftToAction(0.15)).toBe("SOFT_WARN");
  });
  test("just under z1 (0.299) → SOFT_WARN", () => {
    expect(mapDriftToAction(0.299)).toBe("SOFT_WARN");
  });
  test("at z1 (0.30) → Z1", () => {
    expect(mapDriftToAction(0.3)).toBe("Z1");
  });
  test("just under z2 (0.599) → Z1", () => {
    expect(mapDriftToAction(0.599)).toBe("Z1");
  });
  test("at z2 (0.60) → Z2", () => {
    expect(mapDriftToAction(0.6)).toBe("Z2");
  });
  test("1.00 → Z2", () => {
    expect(mapDriftToAction(1)).toBe("Z2");
  });
  test("threshold constants per SPEC", () => {
    expect(GATE_5_THRESHOLDS.soft_warn).toBe(0.15);
    expect(GATE_5_THRESHOLDS.z1).toBe(0.3);
    expect(GATE_5_THRESHOLDS.z2).toBe(0.6);
  });
});

describe("runGate5 — happy path", () => {
  test("PASS extraction → action=PASS, no z1_directive", async () => {
    const runner = new StubRunner(okExtraction({ drift: 0.05, rationale: "Aligned" }));
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("PASS");
    expect(result.value.drift_score).toBe(0.05);
    expect(result.value.z1_directive).toBeUndefined();
    expect(result.value.diff_source).toBe("head_minus_one_to_head");
  });

  test("SOFT_WARN extraction → action=SOFT_WARN", async () => {
    const runner = new StubRunner(okExtraction({ drift: 0.2, rationale: "minor scope creep" }));
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("SOFT_WARN");
  });

  test("Z1 extraction with directive → action=Z1, directive preserved", async () => {
    const runner = new StubRunner(
      okExtraction({
        drift: 0.45,
        rationale: "added unrelated billing",
        directive: "remove billing changes; focus on auth",
      }),
    );
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("Z1");
    expect(result.value.z1_directive).toContain("billing");
  });

  test("Z2 extraction → action=Z2", async () => {
    const runner = new StubRunner(
      okExtraction({
        drift: 0.85,
        rationale: "diff implements something contradicting telos",
        directive: "alignment likely off — re-align",
      }),
    );
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("Z2");
    expect(result.value.z1_directive).toContain("re-align");
  });

  test("output validates against Gate5ResultSchema", async () => {
    const runner = new StubRunner(okExtraction({ drift: 0.1, rationale: "ok" }));
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Gate5ResultSchema.safeParse(result.value).success).toBe(true);
  });

  test("preserves diff_source + diff_truncated in result", async () => {
    const runner = new StubRunner(okExtraction({ drift: 0.05, rationale: "ok" }));
    const result = await runGate5(
      { ...baseInput, diff_source: "no_git", diff_truncated: true },
      runner,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff_source).toBe("no_git");
    expect(result.value.diff_truncated).toBe(true);
  });
});

describe("runGate5 — error paths", () => {
  test("LLM error → llm.internal-error", async () => {
    const runner = new StubRunner({
      ok: false,
      error: { code: "internal_error", detail: "test" },
      attempts: 1,
      total_duration_ms: 0,
      source: "subprocess",
    });
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.internal-error");
  });

  test("non-object content → llm.invalid-response", async () => {
    const runner = new StubRunner({
      ok: true,
      content: "just a string",
      attempts: 1,
      total_duration_ms: 100,
      source: "subprocess",
    });
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });

  test("malformed schema → llm.invalid-response", async () => {
    const runner = new StubRunner({
      ok: true,
      content: { wrong: "shape" },
      attempts: 1,
      total_duration_ms: 100,
      source: "subprocess",
    });
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });

  test("drift_score out of range → llm.invalid-response", async () => {
    const runner = new StubRunner({
      ok: true,
      content: { drift_score: 1.5, rationale: "x" },
      attempts: 1,
      total_duration_ms: 100,
      source: "subprocess",
    });
    const result = await runGate5(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
