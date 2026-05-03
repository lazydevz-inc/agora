// SPEC: docs/loops/alignment-loop.md (Phase 1 Open Intake §201-282).
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
//        - byte_size >= 16384 → truncate to 16384, intake_truncated = true,
//                               ui.displayHardCap(originalByteSize)
//        - byte_size >= 8192  → ui.displaySoftCap(byteSize), no truncate
//   4. Compute word_count + estimated_rounds bucket (per SPEC L266-270):
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
//   - 8/16 KB are byte limits, not word limits (per SPEC R3-A rationale).

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
  /** 8KB+ but <16KB: gentle "long input" notice. Continues. */
  displaySoftCap(byteSize: number): void;
  /** 16KB+: input was truncated; flag will be set in Phase1Result. */
  displayHardCap(originalByteSize: number): void;
  /** Mechanical echo. No LLM-generated summary. */
  displayEcho(args: { wordCount: number; method: IntakeMethod; estimatedRounds: string }): void;
}

export interface Phase1Input {
  readonly promptText: string;
  readonly emptyRepromptText: string;
  readonly classification: "brownfield" | "greenfield";
}

// ─── Constants (per SPEC L245, L250, L266-270) ───

export const SOFT_CAP_BYTES = 8 * 1024; // 8 KB
export const HARD_CAP_BYTES = 16 * 1024; // 16 KB

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
  if (originalBytes >= HARD_CAP_BYTES) {
    rawText = truncateToBytes(rawTextInitial, HARD_CAP_BYTES);
    truncated = true;
    ui.displayHardCap(originalBytes);
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
    // Empty after editor → one re-prompt (per SPEC L252-253).
    const retry = await ui.askReprompt(input.emptyRepromptText);
    if (retry.trim().length === 0) {
      // Empty twice → abort with exit 2 (per SPEC L254).
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
