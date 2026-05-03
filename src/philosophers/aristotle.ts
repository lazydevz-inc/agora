// SPEC: docs/philosophers/runbooks/aristotle.md (Stage 5-A.3 Rev 2) +
//       docs/philosophy/03-aristotle-four-causes.md (Stage 1).
//
// Second philosopher implementation. Aristotle Phase 2 telos-first round.
// This slice covers ONLY the telos round (Stage 2-A.5 hard gate); form /
// material / efficient land in future slices that extend FourCauses.
//
// Simplification vs runbook §3.2 (multi-turn LLM dialogue per question):
// the 3 telos questions (statement / served_good / failure_signal) are
// asked LOCALLY through the AristotleUi adapter. A single LLM call then
// extracts the structured TelosClaim from the raw answers AND flags
// noun-phrase telos (F-Aristotle-1). When flagged, one follow-up local
// question + one re-extraction LLM call resolves it. Net: ≤2 LLM calls
// per telos round vs the runbook's per-question dialogue.
//
// Future iteration: when prompt-library generator (Stage 5-A.4) lands,
// the inline ARISTOTLE_TELOS_SYSTEM constant becomes
// renderPrompt("aristotle:telos-question", ctx).

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const MaturitySchema = z.enum(["pistis", "dianoia", "noesis"]);
export type Maturity = z.infer<typeof MaturitySchema>;

export const TelosClaimSchema = z.object({
  statement: z.string().min(1),
  served_good: z.string().min(1),
  failure_signal: z.string().min(1),
  success_signal: z.string().optional(),
  // Maturity is a Plato-tagged field; Aristotle outputs at "dianoia" as the
  // initial floor. Plato (future slice) re-tags after Divided Line check.
  maturity: MaturitySchema.default("dianoia"),
  noun_phrase_refinement_triggered: z.boolean().default(false),
});
export type TelosClaim = z.infer<typeof TelosClaimSchema>;

// FourCauses schema seeded with telos only for this slice; form/material/
// efficient land as future slices flesh them out. Optional fields keep
// the file forward-compatible.
export const FourCausesSchema = z.object({
  telos: TelosClaimSchema.optional(),
  // form/material/efficient placeholders — to be filled by future slices.
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type FourCauses = z.infer<typeof FourCausesSchema>;

export interface AristotleTelosInput {
  readonly raw_intake: string;
  readonly defended_frame_chosen_form?: string;
  readonly current_round: number;
}

export interface AristotleUi {
  /** Q1: "Why does this exist?" → statement */
  askWhyExists(): Promise<string>;
  /** Q2: "What good does it serve? Name the goodness, not the activity." → served_good */
  askServedGood(): Promise<string>;
  /** Q3: "How will you know if you built the thing but it failed at its purpose?" → failure_signal */
  askFailureSignal(): Promise<string>;
  /** F-Aristotle-1 mitigation: noun-phrase telos detected; ask user to refine. */
  askNounPhraseRefinement(args: { detected: string; reason: string }): Promise<string>;
}

interface ExtractedTelos {
  statement: string;
  served_good: string;
  failure_signal: string;
  success_signal?: string | undefined;
  noun_phrase_telos: boolean;
  noun_phrase_reason?: string | undefined;
}

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

const ARISTOTLE_TELOS_SYSTEM = `You are Aristotle extracting the TELOS (final cause) from a user's
raw answers to three telos questions. The telos is the most load-bearing
claim in the alignment seed — without it, every other cause is mere
description.

Hard rules:
1. NEVER accept a noun-phrase that names the artifact as the telos
   statement. Forbidden: "A comment system" / "A notes app" / "An API".
   Telos must be a verb-phrase about the served good.
2. If the user's Q1 answer is a noun-phrase artifact, set
   noun_phrase_telos=true and noun_phrase_reason explaining what to ask
   instead. The orchestrator will re-prompt the user.
3. The failure_signal often surfaces a different (sharper) telos than
   the user's Q1 answer. When it does, the statement should reflect the
   sharper telos.
4. statement should be a single sentence in the user's voice (not
   editorialized). Verb phrase about the served good.
5. served_good is the *goodness* itself (a noun like "Connection-making
   across time" / "Reduced cognitive load"), distinct from the activity.
6. failure_signal is concrete and observable.

Return EXACTLY this JSON shape, with no extra keys, no commentary outside JSON:
{
  "statement": "<verb-phrase about served good>",
  "served_good": "<the goodness this serves>",
  "failure_signal": "<concrete observable failure>",
  "success_signal": "<optional inverse of failure_signal>",
  "noun_phrase_telos": <boolean>,
  "noun_phrase_reason": "<reason string when noun_phrase_telos=true, otherwise omit>"
}`;

function buildTelosUserPrompt(
  input: AristotleTelosInput,
  raw: {
    whyExists: string;
    servedGood: string;
    failureSignal: string;
    refinement?: string;
  },
): string {
  const formLine =
    input.defended_frame_chosen_form !== undefined && input.defended_frame_chosen_form.length > 0
      ? `Chosen form (from Phase −1): "${input.defended_frame_chosen_form}"\n`
      : "";
  const refinementLine =
    raw.refinement !== undefined && raw.refinement.length > 0
      ? `\nUser refinement after noun-phrase rebuttal:\n"${raw.refinement}"\n`
      : "";
  return `Round: ${String(input.current_round)}

User raw intake (Phase 1):
"${input.raw_intake}"

${formLine}Telos questions and raw answers:
Q1 — "Why does this exist?"
A1: "${raw.whyExists}"

Q2 — "What good does it serve? Name the goodness, not the activity."
A2: "${raw.servedGood}"

Q3 — "How will you know if you built the thing but it failed at its purpose?"
A3: "${raw.failureSignal}"
${refinementLine}
Extract the TelosClaim per the JSON shape. Apply F-Aristotle-1 (noun-phrase
detection) on Q1; if A1 is a noun-phrase artifact, set noun_phrase_telos=true
and provide noun_phrase_reason for the orchestrator's re-prompt.`;
}

// ─── Orchestrator ───

export async function runAristotleTelosRound(
  input: AristotleTelosInput,
  runner: ClaudeRunner,
  ui: AristotleUi,
): Promise<Result<TelosClaim, AgoraErrorThrown>> {
  // 1. Ask the 3 telos questions locally (per runbook §4.1 hard rule 2:
  //    "ASK THREE QUESTIONS in order, capturing each").
  const whyExists = await ui.askWhyExists();
  const servedGood = await ui.askServedGood();
  const failureSignal = await ui.askFailureSignal();

  if (
    whyExists.trim().length === 0 ||
    servedGood.trim().length === 0 ||
    failureSignal.trim().length === 0
  ) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "Telos round needs all 3 question answers — empty input." },
      }),
    );
  }

  // 2. First extraction.
  const extraction = await callForExtraction(input, runner, {
    whyExists,
    servedGood,
    failureSignal,
  });
  if (!extraction.ok) return extraction;

  let nounRefinementTriggered = false;
  let extracted = extraction.value;

  // 3. F-Aristotle-1 follow-up loop (one iteration max).
  if (extracted.noun_phrase_telos) {
    nounRefinementTriggered = true;
    const refinement = await ui.askNounPhraseRefinement({
      detected: whyExists,
      reason: extracted.noun_phrase_reason ?? "Telos statement read as a noun-phrase artifact.",
    });
    if (refinement.trim().length === 0) {
      return err(
        buildAgoraError("user.aborted", {
          context: { detail: "Noun-phrase telos rebuttal needs a refinement — empty." },
        }),
      );
    }
    // Re-extract with the refinement appended.
    const reExtraction = await callForExtraction(input, runner, {
      whyExists,
      servedGood,
      failureSignal,
      refinement,
    });
    if (!reExtraction.ok) return reExtraction;
    extracted = reExtraction.value;
  }

  // 4. Build TelosClaim.
  const claim: TelosClaim = {
    statement: extracted.statement,
    served_good: extracted.served_good,
    failure_signal: extracted.failure_signal,
    ...(extracted.success_signal !== undefined ? { success_signal: extracted.success_signal } : {}),
    maturity: "dianoia",
    noun_phrase_refinement_triggered: nounRefinementTriggered,
  };

  const validated = TelosClaimSchema.safeParse(claim);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "telos schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForExtraction(
  input: AristotleTelosInput,
  runner: ClaudeRunner,
  raw: { whyExists: string; servedGood: string; failureSignal: string; refinement?: string },
): Promise<Result<ExtractedTelos, AgoraErrorThrown>> {
  const response = await runner.call({
    system: ARISTOTLE_TELOS_SYSTEM,
    prompt: buildTelosUserPrompt(input, raw),
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: response.error?.detail ?? "no response" },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Aristotle telos prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = z
    .object({
      statement: z.string().min(1),
      served_good: z.string().min(1),
      failure_signal: z.string().min(1),
      success_signal: z.string().optional(),
      noun_phrase_telos: z.boolean(),
      noun_phrase_reason: z.string().optional(),
    })
    .safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "telos schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}
