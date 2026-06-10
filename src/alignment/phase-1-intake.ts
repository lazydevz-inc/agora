// SPEC: docs/loops/alignment-loop.md (Phase 1 Open Intake §192+).
//
// Phase 1 collects the user's first substantive context dump in one turn.
// LAYER 2 — depends on shared/ + state/ + Phase 0 output. Pure logic +
// IntakeUi adapter (mirrors HusserlUi pattern from src/philosophers/husserl.ts).
//
// Algorithm (orchestrator-side):
//   1. Compose prompt text (caller passes it; we accept whatever locale
//      catalog rendered — see src/cli/commands/intake.ts).
//   2. Read input via ui.askInline(promptText). Three signal classifications:
//        - empty string  → editor escape (open ui.openEditor; if THAT
//                           returns empty, re-prompt once via ui.askReprompt;
//                           empty twice → user.aborted)
//        - contains '\n' → method = "paste"
//        - otherwise     → method = "inline"
//   3. Cap handling on the resolved string:
//        - byte_size >= HARD_CAP_BYTES → archive the FULL original via
//                               ui.archiveOriginal (lossless cut — archive
//                               failure never blocks intake), then truncate
//                               to the cap, intake_truncated = true,
//                               ui.displayHardCap(originalByteSize, archivePath)
//        - byte_size >= SOFT_CAP_BYTES → ui.displaySoftCap(byteSize), no truncate
//   4. Compute word_count + estimated_rounds bucket (per SPEC L273-277):
//        < 50 words   → "5–8 rounds (lots to clarify)"
//        50-300 words → "3–5 rounds"
//        > 300 words  → "2–3 rounds"
//   5. ui.displayEcho({...}) — mechanical, no LLM.
//   6. Return Phase1Result (Zod-validated).
//
// Boundaries:
//   - No LLM calls. Phase 1 is pure intake; Phase 2 starts the dialogue.
//   - No state writes. Caller persists .agora/intake.json + advances state.
//   - No editor spawn. Caller passes the editor function via ui.openEditor.
//   - 16/64 KB are byte limits, not word limits (per SPEC R3-A rationale,
//     amended 2026-06-11: sized so UTF-8 Korean — 3 bytes/syllable — is not
//     capped at roughly half the English word count, and so MCP host-relayed
//     PRDs fit without a lossy cut).

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const IntakeMethodSchema = z.enum(["inline", "editor", "paste"]);
export type IntakeMethod = z.infer<typeof IntakeMethodSchema>;

export const Phase1ResultSchema = z.object({
  raw_intake: z.string().min(1),
  intake_method: IntakeMethodSchema,
  intake_word_count: z.number().int().min(0),
  intake_byte_size: z.number().int().min(0),
  intake_truncated: z.boolean(),
  // Lossless hard cap (R3-A amendment): when truncated, the pre-cut size and
  // the archive path of the FULL original. Both null when not truncated (and
  // path null if archiving failed). Defaults keep pre-amendment intake.json
  // files parseable (seed-builder validates with this schema).
  intake_original_byte_size: z.number().int().min(0).nullable().default(null),
  intake_original_path: z.string().nullable().default(null),
  intake_duration_ms: z.number().int().min(0),
  estimated_rounds: z.string(),
  classification: z.enum(["brownfield", "greenfield"]),
  created_at: z.string().datetime(),
});
export type Phase1Result = z.infer<typeof Phase1ResultSchema>;

export interface IntakeUi {
  /** Show prompt + read inline. Empty string = user pressed Enter without text. */
  askInline(promptText: string): Promise<string>;
  /** Spawn editor for long-form input. Returns content (empty string = empty save). */
  openEditor(): Promise<string>;
  /** Re-prompt after empty editor. Returns user's retry input. */
  askReprompt(noticeText: string): Promise<string>;
  /**
   * Hard cap hit: persist the FULL original somewhere durable BEFORE the
   * orchestrator truncates (lossless cut). Returns the archive path for
   * display + Phase1Result, or null when archiving failed. Must not throw
   * fatally — the orchestrator treats a throw as null and proceeds.
   */
  archiveOriginal(original: string): Promise<string | null>;
  /** SOFT_CAP+ but under HARD_CAP: gentle "long input" notice. Continues. */
  displaySoftCap(byteSize: number): void;
  /**
   * HARD_CAP+: input was truncated; flag set in Phase1Result. archivePath
   * is where archiveOriginal preserved the full original (null = failed).
   */
  displayHardCap(originalByteSize: number, archivePath: string | null): void;
  /** Mechanical echo. No LLM-generated summary. */
  displayEcho(args: { wordCount: number; method: IntakeMethod; estimatedRounds: string }): void;
}

export interface Phase1Input {
  readonly promptText: string;
  readonly emptyRepromptText: string;
  readonly classification: "brownfield" | "greenfield";
}

// ─── Constants (per SPEC "Phase 1 Open Intake" INPUT_RULES + R3-A) ───
//
// R3-A amended 2026-06-11 (was 8/16 KB): byte-denominated for determinism,
// sized so no first-class locale is penalized — UTF-8 Korean costs 3 bytes
// per syllable, so the old caps bit Korean users at ~half the English word
// count. 64 KB also admits deliberate large relays (MCP host passing a full
// PRD) while still blocking pathological pastes (multi-MB logs). The hard
// cap is lossless: ui.archiveOriginal preserves the full text pre-cut.

export const SOFT_CAP_BYTES = 16 * 1024; // 16 KB ≈ 3,000 EN words / ≈1,600 KO 어절
export const HARD_CAP_BYTES = 64 * 1024; // 64 KB ≈ 12,000 EN words / ≈6,500 KO 어절

export function estimateRounds(wordCount: number): string {
  if (wordCount < 50) return "5–8 rounds (lots to clarify)";
  if (wordCount <= 300) return "3–5 rounds";
  return "2–3 rounds";
}

export function countWords(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// ─── Orchestrator ───

export async function runPhase1Intake(
  input: Phase1Input,
  ui: IntakeUi,
): Promise<Result<Phase1Result, AgoraErrorThrown>> {
  const startedAt = Date.now();

  // 1+2. Read input with editor-escape + re-prompt-once + abort-on-empty-twice.
  const collected = await collectInput(input, ui);
  if (!collected.ok) return collected;
  const { rawText: rawTextInitial, method } = collected.value;

  // 3. Cap handling.
  const originalBytes = Buffer.byteLength(rawTextInitial, "utf8");
  let rawText = rawTextInitial;
  let truncated = false;
  let originalPath: string | null = null;
  if (originalBytes >= HARD_CAP_BYTES) {
    // Lossless cut: archive the full original BEFORE truncating. Archive
    // failure must never block intake — degrade to the flagged cut.
    try {
      originalPath = await ui.archiveOriginal(rawTextInitial);
    } catch {
      originalPath = null;
    }
    rawText = truncateToBytes(rawTextInitial, HARD_CAP_BYTES);
    truncated = true;
    ui.displayHardCap(originalBytes, originalPath);
  } else if (originalBytes >= SOFT_CAP_BYTES) {
    ui.displaySoftCap(originalBytes);
  }

  // 4. Word count + estimated rounds.
  const wordCount = countWords(rawText);
  const estimated = estimateRounds(wordCount);

  // 5. Mechanical echo.
  ui.displayEcho({ wordCount, method, estimatedRounds: estimated });

  // 6. Build Phase1Result.
  const result: Phase1Result = {
    raw_intake: rawText,
    intake_method: method,
    intake_word_count: wordCount,
    intake_byte_size: Buffer.byteLength(rawText, "utf8"),
    intake_truncated: truncated,
    intake_original_byte_size: truncated ? originalBytes : null,
    intake_original_path: originalPath,
    intake_duration_ms: Date.now() - startedAt,
    estimated_rounds: estimated,
    classification: input.classification,
    created_at: new Date().toISOString(),
  };

  const validated = Phase1ResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "Phase1Result schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

interface CollectedInput {
  rawText: string;
  method: IntakeMethod;
}

async function collectInput(
  input: Phase1Input,
  ui: IntakeUi,
): Promise<Result<CollectedInput, AgoraErrorThrown>> {
  const inline = await ui.askInline(input.promptText);

  if (inline.length === 0) {
    // Empty Enter → editor escape (per SPEC L240-242).
    const editorContent = await ui.openEditor();
    if (editorContent.trim().length > 0) {
      return ok({ rawText: editorContent, method: "editor" });
    }
    // Empty after editor → one re-prompt (per SPEC L259-260).
    const retry = await ui.askReprompt(input.emptyRepromptText);
    if (retry.trim().length === 0) {
      // Empty twice → abort with exit 2 (per SPEC L261).
      return err(
        buildAgoraError("user.aborted", {
          context: { detail: "Phase 1 intake aborted: input was empty twice." },
        }),
      );
    }
    return ok({ rawText: retry, method: classifyByShape(retry) });
  }

  return ok({ rawText: inline, method: classifyByShape(inline) });
}

function classifyByShape(input: string): IntakeMethod {
  return input.includes("\n") ? "paste" : "inline";
}

function truncateToBytes(input: string, maxBytes: number): string {
  // Truncate at the byte level but never split a UTF-8 codepoint.
  const buf = Buffer.from(input, "utf8");
  if (buf.byteLength <= maxBytes) return input;
  // Walk back from maxBytes until we land on a codepoint boundary
  // (continuation bytes have the bit pattern 10xxxxxx).
  let cut = maxBytes;
  while (cut > 0) {
    const byte = buf[cut];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) break;
    cut -= 1;
  }
  return buf.subarray(0, cut).toString("utf8");
}
