// SPEC: docs/philosophers/runbooks/aristotle.md §4.4 (efficient-question).

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type AristotleEfficientInput,
  type AristotleEfficientUi,
  EfficientClaimSchema,
  runAristotleEfficientRound,
} from "@/philosophers/aristotle.js";

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

function okExtraction(opts: { who?: string; when?: string; how?: string }): ClaudeResponse {
  return {
    ok: true,
    content: {
      who: opts.who ?? "solo: Sang",
      when: opts.when ?? "evenings, 30 min sessions",
      how: opts.how ?? "TDD with vitest, deploy on push",
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput: AristotleEfficientInput = {
  telos_statement: "help me X",
  detected_patterns: ["uses_pnpm", "uses_typescript"],
  current_round: 4,
};

interface RecordedUi extends AristotleEfficientUi {
  asked: string[];
}

function makeUi(opts: { who?: string; when?: string; how?: string }): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askWho: async () => {
      ui.asked.push("who");
      return opts.who ?? "solo: Sang";
    },
    askWhen: async () => {
      ui.asked.push("when");
      return opts.when ?? "evenings, 30 min sessions";
    },
    askHow: async () => {
      ui.asked.push("how");
      return opts.how ?? "TDD with vitest, deploy on push";
    },
  };
  return ui;
}

describe("Aristotle efficient round — happy path", () => {
  test("3 questions asked + 1 LLM → EfficientClaim", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.asked).toEqual(["who", "when", "how"]);
    expect(result.value.maturity).toBe("pistis");
  });

  test("output validates against EfficientClaimSchema", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(EfficientClaimSchema.safeParse(result.value).success).toBe(true);
  });

  test("solo project still captures all 3 (no skip)", async () => {
    const runner = new QueueRunner([
      okExtraction({ who: "solo: Sang", when: "ad-hoc", how: "vibe coding" }),
    ]);
    const ui = makeUi({ who: "solo: Sang", when: "ad-hoc", how: "vibe coding" });
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.who).toContain("solo");
    expect(result.value.when).toBeDefined();
    expect(result.value.how).toBeDefined();
  });
});

describe("Aristotle efficient round — error paths", () => {
  test("empty Q1 (who) → user.aborted", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi({ who: "" });
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
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
    const ui = makeUi({});
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
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
    const ui = makeUi({});
    const result = await runAristotleEfficientRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
