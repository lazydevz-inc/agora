// SPEC: docs/philosophers/runbooks/aquinas.md §3.2 (4-stage protocol) +
//       F-Aquinas-3 + F-Aquinas-4.

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import { type DisputatioInput, DisputatioResultSchema, runDisputatio } from "@/ralph/disputatio.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const r = this.responses[this.idx];
    this.idx += 1;
    if (r === undefined) throw new Error(`QueueRunner exhausted at ${String(this.idx)}`);
    return r;
  }
  get callCount(): number {
    return this.idx;
  }
}

function criticEmpty(reason = "no objections"): ClaudeResponse {
  return {
    ok: true,
    content: { objections: [], no_objections_reason: reason },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

function criticOne(opts: {
  id: string;
  severity?: "minor" | "major" | "critical";
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      objections: [
        {
          id: opts.id,
          claim: `claim for ${opts.id}`,
          evidence: `evidence for ${opts.id}`,
          severity: opts.severity ?? "minor",
        },
      ],
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

function sedContraResp(text = "but here's the case for it"): ClaudeResponse {
  return {
    ok: true,
    content: { sed_contra: text },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

function respondeoResp(
  verdict: "approved" | "conditional" | "rejected",
  reasoning = "x",
): ClaudeResponse {
  return {
    ok: true,
    content: { verdict, reasoning },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

function adSingulaResp(
  rulings: {
    objection_id: string;
    ruling: "concedo" | "distinguo" | "nego";
    action_or_reason: string;
  }[],
): ClaudeResponse {
  return {
    ok: true,
    content: { rulings },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput: DisputatioInput = {
  leaf_id: "ac_001.1",
  leaf_content: "implement password login",
  telos_statement: "help users authenticate quickly",
  telos_failure_signal: "users abandon at login screen",
  all_acceptance_criteria: [{ id: "ac_001", content: "users can authenticate" }],
  completed_leaves_summary: "(none)",
  diff: "diff --git a/src/auth.ts b/src/auth.ts\n+...",
  diff_source: "head_minus_one_to_head",
  critic_context: { leaf_content: "implement password login" },
};

describe("runDisputatio — happy path: approved verdict, no objections", () => {
  test("3 critics empty → sed_contra → respondeo approved → ad_singula empty", async () => {
    // 3 critics × empty + sed_contra + respondeo + (ad_singula skipped: 0 objections)
    const runner = new QueueRunner([
      criticEmpty(),
      criticEmpty(),
      criticEmpty(),
      sedContraResp(),
      respondeoResp("approved", "telos served, no concerns"),
      // ad_singula not called (objections.length === 0 short-circuits)
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.respondeo.verdict).toBe("approved");
    expect(result.value.all_objections_count).toBe(0);
    expect(result.value.critical_objections_count).toBe(0);
    expect(result.value.ad_singula).toEqual([]);
    expect(result.value.action_items).toEqual([]);
    expect(result.value.videtur.length).toBe(3);
    expect(runner.callCount).toBe(5); // 3 critics + sed + respondeo
  });
});

describe("runDisputatio — conditional verdict with concedo action", () => {
  test("1 objection → conditional → ad_singula concedo → action_items populated", async () => {
    const runner = new QueueRunner([
      criticOne({ id: "obj_1", severity: "major" }),
      criticEmpty(),
      criticEmpty(),
      sedContraResp("the case for it"),
      respondeoResp("conditional", "telos served, but obj_1 must be addressed"),
      adSingulaResp([
        {
          objection_id: "obj_1",
          ruling: "concedo",
          action_or_reason: "add input validation in src/auth.ts:42",
        },
      ]),
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.respondeo.verdict).toBe("conditional");
    expect(result.value.all_objections_count).toBe(1);
    expect(result.value.action_items).toEqual(["add input validation in src/auth.ts:42"]);
  });
});

describe("runDisputatio — rejected verdict", () => {
  test("critical objection → rejected verdict surfaces", async () => {
    const runner = new QueueRunner([
      criticOne({ id: "obj_1", severity: "critical" }),
      criticEmpty(),
      criticEmpty(),
      sedContraResp(),
      respondeoResp("rejected", "critical violation"),
      adSingulaResp([
        { objection_id: "obj_1", ruling: "concedo", action_or_reason: "fix critical violation" },
      ]),
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.respondeo.verdict).toBe("rejected");
    expect(result.value.critical_objections_count).toBe(1);
    expect(result.value.action_items.length).toBe(1);
  });
});

describe("runDisputatio — F-Aquinas-4 enforcement", () => {
  test("Ad singula missing a ruling for one objection → internal.invariant-violation", async () => {
    const runner = new QueueRunner([
      criticOne({ id: "obj_1" }),
      criticOne({ id: "obj_2" }),
      criticEmpty(),
      sedContraResp(),
      respondeoResp("conditional"),
      adSingulaResp([
        // only obj_1 ruled, obj_2 missing
        { objection_id: "obj_1", ruling: "nego", action_or_reason: "actually fine" },
      ]),
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("internal.invariant-violation");
    expect(result.error.context?.["detail"]).toContain("F-Aquinas-4");
  });
});

describe("runDisputatio — output validates against schema", () => {
  test("DisputatioResult conforms to Zod schema", async () => {
    const runner = new QueueRunner([
      criticEmpty(),
      criticEmpty(),
      criticEmpty(),
      sedContraResp(),
      respondeoResp("approved"),
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DisputatioResultSchema.safeParse(result.value).success).toBe(true);
  });
});

describe("runDisputatio — error paths", () => {
  test("critic LLM error → llm.internal-error", async () => {
    const runner = new QueueRunner([
      {
        ok: false,
        error: { code: "internal_error", detail: "test" },
        attempts: 1,
        total_duration_ms: 0,
        source: "subprocess",
      },
      criticEmpty(),
      criticEmpty(),
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.internal-error");
  });

  test("malformed Sed contra → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      criticEmpty(),
      criticEmpty(),
      criticEmpty(),
      {
        ok: true,
        content: { wrong: "shape" },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });

  test("malformed Respondeo (bad verdict) → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      criticEmpty(),
      criticEmpty(),
      criticEmpty(),
      sedContraResp(),
      {
        ok: true,
        content: { verdict: "bogus", reasoning: "x" },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const result = await runDisputatio(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
