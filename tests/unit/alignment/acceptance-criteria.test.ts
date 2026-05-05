// SPEC: docs/loops/alignment-loop.md (seed.acceptance_criteria) +
//       Stage 6-A.16 R3-A minimal schema.

import { describe, expect, test } from "vitest";

import {
  type AcCaptureInput,
  type AcCaptureUi,
  AcceptanceCriteriaResultSchema,
  formatAcId,
  runAcCapture,
} from "@/alignment/acceptance-criteria.js";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const r = this.responses[this.idx];
    this.idx += 1;
    if (r === undefined) throw new Error(`QueueRunner exhausted at ${String(this.idx)}`);
    return r;
  }
}

function okExtraction(items: string[]): ClaudeResponse {
  return {
    ok: true,
    content: { criteria: items.map((c) => ({ content: c })) },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput: AcCaptureInput = {
  telos_statement: "help me make connections across reading",
  form_essential_structure: "single-page CRUD with offline-first sync",
};

interface RecordedUi extends AcCaptureUi {
  asked: { telos: string; form: string }[];
}

function makeUi(rawInput: string): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askAcsList: async ({ telos, form }) => {
      ui.asked.push({ telos, form });
      return rawInput;
    },
  };
  return ui;
}

describe("formatAcId", () => {
  test("pads to 3 digits", () => {
    expect(formatAcId(1)).toBe("ac_001");
    expect(formatAcId(42)).toBe("ac_042");
    expect(formatAcId(999)).toBe("ac_999");
  });
});

describe("runAcCapture — happy path", () => {
  test("user list + 1 LLM call → AcceptanceCriteriaResult with auto IDs", async () => {
    const runner = new QueueRunner([
      okExtraction([
        "User can capture a thought in <5 seconds",
        "Search returns relevant past notes",
        "Backlinks appear automatically when related notes exist",
      ]),
    ]);
    const ui = makeUi("- capture in 5 sec\n- search past notes\n- backlinks auto");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.length).toBe(3);
    expect(result.value.criteria[0]?.id).toBe("ac_001");
    expect(result.value.criteria[1]?.id).toBe("ac_002");
    expect(result.value.criteria[2]?.id).toBe("ac_003");
    expect(ui.asked.length).toBe(1);
    expect(ui.asked[0]?.telos).toContain("connections");
  });

  test("output validates against AcceptanceCriteriaResultSchema", async () => {
    const runner = new QueueRunner([okExtraction(["valid criterion text"])]);
    const ui = makeUi("just one AC");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(AcceptanceCriteriaResultSchema.safeParse(result.value).success).toBe(true);
  });

  test("raw_input preserved on result", async () => {
    const rawInput = "AC 1\nAC 2\nAC 3";
    const runner = new QueueRunner([
      okExtraction(["First criterion text", "Second criterion text", "Third criterion text"]),
    ]);
    const ui = makeUi(rawInput);
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw_input).toBe(rawInput);
  });

  test("LLM may split compounds (4 input → 5 criteria)", async () => {
    const runner = new QueueRunner([
      okExtraction([
        "Login works",
        "Logout works",
        "Search returns results",
        "Backlinks appear",
        "Notes persist across restart",
      ]),
    ]);
    const ui = makeUi("- Login + logout work\n- Search\n- Backlinks\n- Persist");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.length).toBe(5);
  });
});

describe("runAcCapture — error paths", () => {
  test("empty input → user.aborted", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi("");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
  });

  test("LLM error → llm.internal-error", async () => {
    const runner = new QueueRunner([
      {
        ok: false,
        error: { code: "internal_error", detail: "test" },
        attempts: 1,
        total_duration_ms: 0,
        source: "subprocess",
      },
    ]);
    const ui = makeUi("some ACs");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.internal-error");
  });

  test("malformed schema → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      {
        ok: true,
        content: { wrong: "shape" },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const ui = makeUi("some ACs");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });

  test("LLM returns AC < 5 chars → llm.invalid-response (filter trivial)", async () => {
    const runner = new QueueRunner([okExtraction(["ok"])]);
    const ui = makeUi("ACs");
    const result = await runAcCapture(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
