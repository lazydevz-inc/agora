// SPEC: docs/philosophers/runbooks/aristotle.md §4.2 (form-question).

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type AristotleFormInput,
  type AristotleFormUi,
  FormClaimSchema,
  runAristotleFormRound,
} from "@/philosophers/aristotle.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const response = this.responses[this.idx];
    this.idx += 1;
    if (response === undefined) throw new Error(`QueueRunner exhausted at ${String(this.idx)}`);
    return response;
  }
  get callCount(): number {
    return this.idx;
  }
}

function okExtraction(opts: {
  essential_structure?: string;
  irreducible_parts?: string[];
  feature_warning?: boolean;
  reason?: string;
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      essential_structure: opts.essential_structure ?? "single-page CRUD with offline-first sync",
      irreducible_parts: opts.irreducible_parts ?? [
        "sync engine",
        "local store",
        "conflict resolver",
      ],
      feature_list_warning: opts.feature_warning ?? false,
      ...(opts.feature_warning === true && opts.reason !== undefined
        ? { feature_list_reason: opts.reason }
        : {}),
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput: AristotleFormInput = {
  telos_statement: "Help me make connections across reading I'd otherwise lose",
  current_round: 2,
};

interface RecordedFormUi extends AristotleFormUi {
  asked: { which: string; payload?: unknown }[];
}

function makeUi(opts: { essential?: string; parts?: string; refinement?: string }): RecordedFormUi {
  const ui: RecordedFormUi = {
    asked: [],
    askEssentialStructure: async () => {
      ui.asked.push({ which: "essential" });
      return opts.essential ?? "single-page CRUD with offline-first sync";
    },
    askIrreduciblePartsList: async () => {
      ui.asked.push({ which: "parts" });
      return opts.parts ?? "sync engine, local store, conflict resolver";
    },
    askFeatureListRefinement: async ({ detected, reason }) => {
      ui.asked.push({ which: "refine", payload: { detected, reason } });
      return opts.refinement ?? "";
    },
  };
  return ui;
}

describe("Aristotle form round — happy path", () => {
  test("2 questions asked + 1 LLM call → FormClaim", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleFormRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.asked.map((a) => a.which)).toEqual(["essential", "parts"]);
    expect(runner.callCount).toBe(1);
    expect(result.value.essential_structure).toContain("CRUD");
    expect(result.value.irreducible_parts.length).toBeGreaterThan(0);
    expect(result.value.maturity).toBe("dianoia");
    expect(result.value.feature_list_warning_triggered).toBe(false);
  });

  test("output validates against FormClaimSchema", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleFormRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(FormClaimSchema.safeParse(result.value).success).toBe(true);
  });
});

describe("Aristotle form round — F-Aristotle-3 feature-list rebuttal", () => {
  test("feature-list detection triggers refinement loop + 2nd LLM call", async () => {
    const runner = new QueueRunner([
      okExtraction({
        irreducible_parts: ["login", "signup", "settings"],
        feature_warning: true,
        reason: "Q2 read as feature catalog rather than structural components",
      }),
      okExtraction({
        essential_structure: "single-page CRUD with offline-first sync",
        irreducible_parts: ["sync engine", "local store"],
      }),
    ]);
    const ui = makeUi({ refinement: "structurally: sync, store, conflict resolver" });
    const result = await runAristotleFormRound(baseInput, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.callCount).toBe(2);
    expect(ui.asked.map((a) => a.which)).toEqual(["essential", "parts", "refine"]);
    expect(result.value.feature_list_warning_triggered).toBe(true);
    expect(result.value.irreducible_parts).not.toContain("login");
  });

  test("empty refinement on feature-list rebuttal → user.aborted", async () => {
    const runner = new QueueRunner([
      okExtraction({
        irreducible_parts: ["x"],
        feature_warning: true,
        reason: "feature catalog",
      }),
    ]);
    const ui = makeUi({ refinement: "   " });
    const result = await runAristotleFormRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
  });
});

describe("Aristotle form round — error paths", () => {
  test("empty Q1 → user.aborted", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi({ essential: "" });
    const result = await runAristotleFormRound(baseInput, runner, ui);
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
    const result = await runAristotleFormRound(baseInput, runner, ui);
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
    const result = await runAristotleFormRound(baseInput, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
