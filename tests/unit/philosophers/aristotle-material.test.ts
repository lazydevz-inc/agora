// SPEC: docs/philosophers/runbooks/aristotle.md §4.3 (material-question).

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type AristotleMaterialInput,
  type AristotleMaterialUi,
  MaterialClaimSchema,
  runAristotleMaterialRound,
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

function okExtraction(opts: {
  tech_stack?: string[];
  data_shape?: string;
  infrastructure?: string;
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      tech_stack: opts.tech_stack ?? ["typescript", "vitest", "biome"],
      data_shape: opts.data_shape ?? "JSON files in .agora/, no DB",
      infrastructure: opts.infrastructure ?? "Local CLI, npx invocation",
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseGreenfield: AristotleMaterialInput = {
  telos_statement: "help me X",
  detected_stack: [],
  is_brownfield: false,
  current_round: 3,
};

const baseBrownfield: AristotleMaterialInput = {
  telos_statement: "help me X",
  detected_stack: ["typescript", "vitest", "biome"],
  is_brownfield: true,
  current_round: 3,
};

interface RecordedUi extends AristotleMaterialUi {
  asked: string[];
}

function makeUi(opts: { stack?: string; data?: string; infra?: string }): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askConfirmDetectedStack: async () => {
      ui.asked.push("confirm");
      return opts.stack ?? "ok";
    },
    askTechStackFromScratch: async () => {
      ui.asked.push("scratch");
      return opts.stack ?? "typescript, vitest, biome";
    },
    askDataShape: async () => {
      ui.asked.push("data");
      return opts.data ?? "JSON files";
    },
    askInfrastructure: async () => {
      ui.asked.push("infra");
      return opts.infra ?? "Local CLI";
    },
  };
  return ui;
}

describe("Aristotle material round — happy path", () => {
  test("greenfield: askTechStackFromScratch + 1 LLM → MaterialClaim", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.asked).toEqual(["scratch", "data", "infra"]);
    expect(result.value.brownfield_auto_filled).toBe(false);
    expect(result.value.maturity).toBe("pistis");
  });

  test("brownfield: askConfirmDetectedStack used", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseBrownfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.asked).toEqual(["confirm", "data", "infra"]);
  });

  test("output validates against MaterialClaimSchema", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(MaterialClaimSchema.safeParse(result.value).success).toBe(true);
  });
});

describe("Aristotle material round — brownfield_auto_filled flag", () => {
  test("brownfield + all detected entries kept → flag true", async () => {
    const runner = new QueueRunner([
      okExtraction({ tech_stack: ["typescript", "vitest", "biome", "zod"] }),
    ]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseBrownfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brownfield_auto_filled).toBe(true);
  });

  test("brownfield + user removed an entry → flag false", async () => {
    const runner = new QueueRunner([okExtraction({ tech_stack: ["typescript", "biome"] })]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseBrownfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brownfield_auto_filled).toBe(false);
  });

  test("greenfield → flag always false even when stack matches", async () => {
    const runner = new QueueRunner([okExtraction({})]);
    const ui = makeUi({});
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brownfield_auto_filled).toBe(false);
  });
});

describe("Aristotle material round — error paths", () => {
  test("empty data shape → user.aborted", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi({ data: "" });
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
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
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
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
    const result = await runAristotleMaterialRound(baseGreenfield, runner, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});
