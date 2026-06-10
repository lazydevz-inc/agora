// SPEC: docs/loops/alignment-loop.md (Phase 1 Open Intake §192+).

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
  archivedOriginals: string[];
  softCaps: number[];
  hardCaps: { bytes: number; archivePath: string | null }[];
  echoes: { wordCount: number; method: string; estimatedRounds: string }[];
}

function makeUi(opts: {
  inlineReturns?: string[];
  editorReturns?: string[];
  repromptReturns?: string[];
  archiveReturn?: string | null;
  archiveThrows?: boolean;
}): RecordedUi {
  const inlineQueue = [...(opts.inlineReturns ?? [])];
  const editorQueue = [...(opts.editorReturns ?? [])];
  const repromptQueue = [...(opts.repromptReturns ?? [])];
  const ui: RecordedUi = {
    inlineCalls: 0,
    editorCalls: 0,
    repromptCalls: 0,
    archivedOriginals: [],
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
    archiveOriginal: async (original) => {
      ui.archivedOriginals.push(original);
      if (opts.archiveThrows === true) throw new Error("disk full");
      return opts.archiveReturn ?? ".agora/history/intake-original-test.md";
    },
    displaySoftCap: (b) => {
      ui.softCaps.push(b);
    },
    displayHardCap: (bytes, archivePath) => {
      ui.hardCaps.push({ bytes, archivePath });
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
  test("caps sized per amended R3-A: 16 KB soft / 64 KB hard", () => {
    expect(SOFT_CAP_BYTES).toBe(16 * 1024);
    expect(HARD_CAP_BYTES).toBe(64 * 1024);
  });

  test("input under soft cap → no warning, no truncate, no archive", async () => {
    const ui = makeUi({ inlineReturns: ["short text"] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.softCaps).toEqual([]);
    expect(ui.hardCaps).toEqual([]);
    expect(ui.archivedOriginals).toEqual([]);
    expect(result.value.intake_truncated).toBe(false);
    expect(result.value.intake_original_byte_size).toBeNull();
    expect(result.value.intake_original_path).toBeNull();
  });

  test("input ≥ soft cap but < hard cap → soft cap warning, no truncate, no archive", async () => {
    const long = "a".repeat(SOFT_CAP_BYTES + 100);
    const ui = makeUi({ inlineReturns: [long] });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ui.softCaps).toHaveLength(1);
    expect(ui.softCaps[0]).toBeGreaterThanOrEqual(SOFT_CAP_BYTES);
    expect(ui.hardCaps).toEqual([]);
    expect(ui.archivedOriginals).toEqual([]);
    expect(result.value.intake_truncated).toBe(false);
    expect(result.value.intake_byte_size).toBe(SOFT_CAP_BYTES + 100);
  });

  test("input ≥ hard cap → archive FULL original first, then truncate + flag", async () => {
    const long = "a".repeat(HARD_CAP_BYTES + 5000);
    const ui = makeUi({
      inlineReturns: [long],
      archiveReturn: ".agora/history/intake-original-x.md",
    });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Lossless cut: the archive hook received the COMPLETE original.
    expect(ui.archivedOriginals).toHaveLength(1);
    expect(ui.archivedOriginals[0]).toBe(long);
    expect(ui.hardCaps).toEqual([
      { bytes: HARD_CAP_BYTES + 5000, archivePath: ".agora/history/intake-original-x.md" },
    ]);
    expect(result.value.intake_truncated).toBe(true);
    expect(result.value.intake_byte_size).toBe(HARD_CAP_BYTES);
    expect(result.value.intake_original_byte_size).toBe(HARD_CAP_BYTES + 5000);
    expect(result.value.intake_original_path).toBe(".agora/history/intake-original-x.md");
  });

  test("archive failure (throw) degrades to flagged cut — never blocks intake", async () => {
    const long = "b".repeat(HARD_CAP_BYTES + 10);
    const ui = makeUi({ inlineReturns: [long], archiveThrows: true });
    const result = await runPhase1Intake(baseInput, ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intake_truncated).toBe(true);
    expect(result.value.intake_original_byte_size).toBe(HARD_CAP_BYTES + 10);
    expect(result.value.intake_original_path).toBeNull();
    expect(ui.hardCaps).toEqual([{ bytes: HARD_CAP_BYTES + 10, archivePath: null }]);
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
