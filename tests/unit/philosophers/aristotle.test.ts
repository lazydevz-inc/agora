// SPEC: docs/philosophers/runbooks/aristotle.md (Stage 5-A.3 Rev 2).

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type AristotleTelosInput,
  type AristotleUi,
  runAristotleTelosRound,
  TelosClaimSchema,
} from "@/philosophers/aristotle.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const response = this.responses[this.idx];
    this.idx += 1;
    if (response === undefined) {
      throw new Error(`QueueRunner exhausted at call ${String(this.idx)}`);
    }
    return response;
  }
  get callCount(): number {
    return this.idx;
  }
}

function okExtraction(opts: {
  statement: string;
  served_good?: string;
  failure_signal?: string;
  noun_phrase?: boolean;
  reason?: string;
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      statement: opts.statement,
      served_good: opts.served_good ?? "Connection-making across time",
      failure_signal:
        opts.failure_signal ?? "After 6 months I'm still searching memory not the tool",
      noun_phrase_telos: opts.noun_phrase ?? false,
      ...(opts.noun_phrase === true && opts.reason !== undefined
        ? { noun_phrase_reason: opts.reason }
        : {}),
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput: AristotleTelosInput = {
  raw_intake: "I read 50 books a year and want to capture insights for later",
  current_round: 1,
};

interface RecordedUi extends AristotleUi {
  asked: { which: string; payload?: unknown }[];
}

function makeUi(opts: {
  why?: string;
  served?: string;
  failure?: string;
  refinement?: string;
}): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askWhyExists: async () => {
      ui.asked.push({ which: "why" });
      return opts.why ?? "So I can find half-formed thoughts later";
    },
    askServedGood: async () => {
      ui.asked.push({ which: "served" });
      return opts.served ?? "Helps me make connections across reading";
    },
    askFailureSignal: async () => {
      ui.asked.push({ which: "failure" });
      return opts.failure ?? "After 6 months I'm still searching memory";
    },
    askNounPhraseRefinement: async ({ detected, reason }) => {
      ui.asked.push({ which: "refine", payload: { detected, reason } });
      return opts.refinement ?? "";
    },
  };
  return ui;
}

describe("Aristotle telos round — happy path", () => {
  test("3 questions asked + 1 LLM call → TelosClaim", async () => {
    const runner = new QueueRunner([
      okExtraction({
        statement: "Help me make connections across reading I'd otherwise lose",
      }),
    ]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.asked.map((a) => a.which)).toEqual(["why", "served", "failure"]);
    expect(runner.callCount).toBe(1);
    expect(result.value.statement).toContain("connections");
    expect(result.value.maturity).toBe("dianoia");
    expect(result.value.noun_phrase_refinement_triggered).toBe(false);
  });

  test("output validates against TelosClaimSchema", async () => {
    const runner = new QueueRunner([okExtraction({ statement: "Reduce cognitive load" })]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(TelosClaimSchema.safeParse(result.value).success).toBe(true);
  });

  test("optional success_signal extracted when LLM provides it", async () => {
    const runner = new QueueRunner([
      {
        ok: true,
        content: {
          statement: "Reduce cognitive load",
          served_good: "Reduced friction",
          failure_signal: "I keep checking memory not the tool",
          success_signal: "I check the tool first by reflex",
          noun_phrase_telos: false,
        },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success_signal).toBe("I check the tool first by reflex");
  });
});

describe("Aristotle telos round — F-Aristotle-1 noun-phrase rebuttal", () => {
  test("noun-phrase detection triggers refinement loop + 2nd LLM call", async () => {
    const runner = new QueueRunner([
      okExtraction({
        statement: "A note-taking app",
        noun_phrase: true,
        reason: "Telos read as artifact name not served good",
      }),
      okExtraction({
        statement: "Help me make connections across reading I'd otherwise lose",
      }),
    ]);
    const ui = makeUi({ refinement: "It serves connection-making across what I've read" });
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.callCount).toBe(2);
    expect(ui.asked.map((a) => a.which)).toEqual(["why", "served", "failure", "refine"]);
    expect(result.value.noun_phrase_refinement_triggered).toBe(true);
    expect(result.value.statement).not.toContain("note-taking app");
  });

  test("empty refinement on noun-phrase rebuttal → user.aborted", async () => {
    const runner = new QueueRunner([
      okExtraction({
        statement: "A blog",
        noun_phrase: true,
        reason: "Artifact name",
      }),
    ]);
    const ui = makeUi({ refinement: "   " });
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
  });
});

describe("Aristotle telos round — error paths", () => {
  test("empty Q1 → user.aborted (all 3 questions required)", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi({ why: "" });
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
  });

  test("LLM error → llm.internal-error", async () => {
    const runner = new QueueRunner([
      {
        ok: false,
        error: { code: "internal_error", detail: "test failure" },
        attempts: 1,
        total_duration_ms: 0,
        source: "subprocess",
      },
    ]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.internal-error");
  });

  test("LLM returns non-object content → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      {
        ok: true,
        content: "just a string",
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });

  test("LLM returns malformed JSON shape → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      {
        ok: true,
        content: { wrong_field: "x" },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const ui = makeUi({});
    const result = await runAristotleTelosRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
