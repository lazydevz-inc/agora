// SPEC: docs/loops/alignment-loop.md (Phase 1 Open Intake §201-282).

import { describe, expect, test } from "vitest";

import {
  countWords,
  estimateRounds,
  HARD_CAP_BYTES,
  type IntakeUi,
  Phase1ResultSchema,
  runPhase1Intake,
  SOFT_CAP_BYTES,
} from "@/alignment/phase-1-intake.js";

interface RecordedUi extends IntakeUi {
  inlineCalls: number;
  editorCalls: number;
  repromptCalls: number;
  softCaps: number[];
  hardCaps: number[];
  echoes: { wordCount: number; method: string; estimatedRounds: string }[];
}

function makeUi(opts: {
  inlineReturns?: string[];
  editorReturns?: string[];
  repromptReturns?: string[];
}): RecordedUi {
  const inlineQueue = [...(opts.inlineReturns ?? [])];
  const editorQueue = [...(opts.editorReturns ?? [])];
  const repromptQueue = [...(opts.repromptReturns ?? [])];
  const ui: RecordedUi = {
    inlineCalls: 0,
    editorCalls: 0,
    repromptCalls: 0,
    softCaps: [],
    hardCaps: [],
    echoes: [],
    askInline: async () => {
      ui.inlineCalls += 1;
      return inlineQueue.shift() ?? "";
    },
    openEditor: async () => {
      ui.editorCalls += 1;
      return editorQueue.shift() ?? "";
    },
    askReprompt: async () => {
      ui.repromptCalls += 1;
      return repromptQueue.shift() ?? "";
    },
    displaySoftCap: (b) => {
      ui.softCaps.push(b);
    },
    displayHardCap: (b) => {
      ui.hardCaps.push(b);
    },
    displayEcho: (e) => {
      ui.echoes.push(e);
    },
  };
  return ui;
}

const baseInput = {
  promptText: "What would you like to build?",
  emptyRepromptText: "Need at least one sentence — try again.",
  classification: "greenfield" as const,
};

describe("Phase 1 intake — input classification", () => {
  test("inline single-line input → method = inline", async () => {
    const ui = makeUi({ inlineReturns: ["I want to build a CLI tool"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intake_method).toBe("inline");
    expect(result.value.raw_intake).toBe("I want to build a CLI tool");
    expect(ui.editorCalls).toBe(0);
    expect(ui.repromptCalls).toBe(0);
  });

  test("multi-line inline input → method = paste", async () => {
    const ui = makeUi({ inlineReturns: ["line one\nline two\nline three"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intake_method).toBe("paste");
  });

  test("empty inline → editor opens → editor returns content → method = editor", async () => {
    const ui = makeUi({
      inlineReturns: [""],
      editorReturns: ["Long-form intake from $EDITOR"],
    });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intake_method).toBe("editor");
    expect(result.value.raw_intake).toBe("Long-form intake from $EDITOR");
    expect(ui.editorCalls).toBe(1);
    expect(ui.repromptCalls).toBe(0);
  });

  test("empty inline → empty editor → re-prompt → user types → method = inline", async () => {
    const ui = makeUi({
      inlineReturns: [""],
      editorReturns: [""],
      repromptReturns: ["Quick retry input"],
    });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw_intake).toBe("Quick retry input");
    expect(result.value.intake_method).toBe("inline");
    expect(ui.repromptCalls).toBe(1);
  });

  test("empty twice → user.aborted (exit 2)", async () => {
    const ui = makeUi({
      inlineReturns: [""],
      editorReturns: [""],
      repromptReturns: [""],
    });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
    expect(result.error.category).toBe("user");
  });
});

describe("Phase 1 intake — cap mechanics (R3-A)", () => {
  test("input under 8KB → no warning, no truncate", async () => {
    const ui = makeUi({ inlineReturns: ["short text"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.softCaps).toEqual([]);
    expect(ui.hardCaps).toEqual([]);
    expect(result.value.intake_truncated).toBe(false);
  });

  test("input ≥ 8KB but < 16KB → soft cap warning, no truncate", async () => {
    const long = "a".repeat(SOFT_CAP_BYTES + 100);
    const ui = makeUi({ inlineReturns: [long] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.softCaps).toHaveLength(1);
    expect(ui.softCaps[0]).toBeGreaterThanOrEqual(SOFT_CAP_BYTES);
    expect(ui.hardCaps).toEqual([]);
    expect(result.value.intake_truncated).toBe(false);
    expect(result.value.intake_byte_size).toBe(SOFT_CAP_BYTES + 100);
  });

  test("input ≥ 16KB → hard cap truncate + flag set", async () => {
    const long = "a".repeat(HARD_CAP_BYTES + 5000);
    const ui = makeUi({ inlineReturns: [long] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.hardCaps).toHaveLength(1);
    expect(ui.hardCaps[0]).toBe(HARD_CAP_BYTES + 5000);
    expect(result.value.intake_truncated).toBe(true);
    expect(result.value.intake_byte_size).toBe(HARD_CAP_BYTES);
  });

  test("UTF-8 codepoint boundary preserved on hard truncate", async () => {
    // Build content that puts a multi-byte codepoint exactly at the boundary.
    const filler = "한".repeat(HARD_CAP_BYTES); // each '한' = 3 bytes
    const ui = makeUi({ inlineReturns: [filler] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Truncated string must be valid UTF-8 (round-trips through Buffer).
    const roundTrip = Buffer.from(result.value.raw_intake, "utf8").toString("utf8");
    expect(roundTrip).toBe(result.value.raw_intake);
    expect(result.value.intake_byte_size).toBeLessThanOrEqual(HARD_CAP_BYTES);
  });
});

describe("Phase 1 intake — estimated rounds + word count", () => {
  test("countWords handles whitespace + empty", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("one  two\nthree")).toBe(3);
  });

  test("estimateRounds bucket boundaries", () => {
    expect(estimateRounds(0)).toContain("5–8");
    expect(estimateRounds(49)).toContain("5–8");
    expect(estimateRounds(50)).toContain("3–5");
    expect(estimateRounds(300)).toContain("3–5");
    expect(estimateRounds(301)).toContain("2–3");
  });

  test("echo is called with computed values (mechanical, no LLM)", async () => {
    const ui = makeUi({ inlineReturns: ["one two three four five six"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    expect(ui.echoes).toHaveLength(1);
    expect(ui.echoes[0]?.wordCount).toBe(6);
    expect(ui.echoes[0]?.method).toBe("inline");
    expect(ui.echoes[0]?.estimatedRounds).toContain("5–8");
  });
});

describe("Phase 1 intake — Phase1Result schema", () => {
  test("output validates against Phase1ResultSchema", async () => {
    const ui = makeUi({ inlineReturns: ["valid intake content"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = Phase1ResultSchema.safeParse(result.value);
    expect(parsed.success).toBe(true);
  });

  test("classification is preserved from input", async () => {
    const ui = makeUi({ inlineReturns: ["text"] });
    const result = await runPhase1Intake({ ...baseInput, classification: "brownfield" }, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classification).toBe("brownfield");
  });
});
