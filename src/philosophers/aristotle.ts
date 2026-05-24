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

export const FormClaimSchema = z.object({
  essential_structure: z.string().min(1),
  irreducible_parts: z.array(z.string().min(1)).min(1),
  feature_list_warning_triggered: z.boolean().default(false),
  maturity: MaturitySchema.default("dianoia"),
});
export type FormClaim = z.infer<typeof FormClaimSchema>;

export const MaterialClaimSchema = z.object({
  tech_stack: z.array(z.string().min(1)).min(1).max(20),
  data_shape: z.string().min(1),
  infrastructure: z.string().min(1),
  brownfield_auto_filled: z.boolean().default(false),
  // Per runbook §4.3: material's maturity floor is "pistis" (lighter than
  // telos/form). Plato (future slice) re-tags after Divided Line check.
  maturity: MaturitySchema.default("pistis"),
});
export type MaterialClaim = z.infer<typeof MaterialClaimSchema>;

export const EfficientClaimSchema = z.object({
  who: z.string().min(1),
  when: z.string().min(1),
  how: z.string().min(1),
  // Per runbook §4.4: efficient maturity floor is "pistis"; lightest of
  // the four. Plato re-tags upward where rigor warrants.
  maturity: MaturitySchema.default("pistis"),
});
export type EfficientClaim = z.infer<typeof EfficientClaimSchema>;

// FourCauses schema — all 4 cause slots optional. When all 4 present +
// Plato tags noesis floors, Y2 termination becomes reachable.
export const FourCausesSchema = z.object({
  telos: TelosClaimSchema.optional(),
  form: FormClaimSchema.optional(),
  material: MaterialClaimSchema.optional(),
  efficient: EfficientClaimSchema.optional(),
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

// Exported for ADR-0010 stepped-tool reuse (`src/mcp/steps/telos.ts`):
// the MCP path builds the same prompt and parses the same JSON shape,
// then hands the parsed extraction back through `applyTelosExtract`.
export const TelosExtractionResponseSchema = z.object({
  statement: z.string().min(1),
  served_good: z.string().min(1),
  failure_signal: z.string().min(1),
  success_signal: z.string().optional(),
  noun_phrase_telos: z.boolean(),
  noun_phrase_reason: z.string().optional(),
});
export type ExtractedTelos = z.infer<typeof TelosExtractionResponseSchema>;

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

export const ARISTOTLE_TELOS_SYSTEM = `You are Aristotle extracting the TELOS (final cause) from a user's
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

export function buildTelosUserPrompt(
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
  const parsed = TelosExtractionResponseSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "telos schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}

// ─── Form round (runbook §4.2 aristotle:form-question) ───
//
// Form follows telos in Phase 2. Inputs: settled telos.statement +
// (optional) defended_frame.chosen_form. Pattern matches telos round:
// 2 questions asked locally, 1 LLM call extracts (essential_structure,
// irreducible_parts) + flags F-Aristotle-3 (feature-list warning).

export interface AristotleFormInput {
  readonly telos_statement: string;
  readonly defended_frame_chosen_form?: string;
  readonly current_round: number;
}

export interface AristotleFormUi {
  /** Q1: Given your telos, what shape carries it? → essential_structure */
  askEssentialStructure(args: { telos_statement: string }): Promise<string>;
  /** Q2: What components are essential, not decoration? → irreducible_parts (comma-separated user input) */
  askIrreduciblePartsList(args: { essential_structure: string }): Promise<string>;
  /** F-Aristotle-3 mitigation: when user lists features instead of structure, ask refinement. */
  askFeatureListRefinement(args: { detected: string; reason: string }): Promise<string>;
}

// Exported for ADR-0010 stepped path (`src/mcp/steps/form.ts`).
export const FormExtractionResponseSchema = z.object({
  essential_structure: z.string().min(1),
  irreducible_parts: z.array(z.string().min(1)).min(1),
  feature_list_warning: z.boolean(),
  feature_list_reason: z.string().optional(),
});
export type ExtractedForm = z.infer<typeof FormExtractionResponseSchema>;

export const ARISTOTLE_FORM_SYSTEM = `You are Aristotle extracting the FORM (essential structure / what-shape-
it-takes) from a user's raw answers, AFTER telos is settled.

Hard rules:
1. Form is STRUCTURE, not feature list. Reject feature lists like
   "login, signup, profile, settings, dashboard". Set
   feature_list_warning=true with feature_list_reason explaining what
   to ask instead.
2. essential_structure is a high-level shape (e.g. "single-page CRUD
   with offline-first sync" / "CLI with subcommand-per-cause").
3. irreducible_parts are components without which the telos cannot be
   served. Each part is a noun phrase, not an action.
4. Reference the settled telos when shaping the response.
5. NEVER let the user list features. Form is structure, not catalog.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "essential_structure": "<high-level shape phrase>",
  "irreducible_parts": ["<part 1>", "<part 2>", ...],
  "feature_list_warning": <boolean>,
  "feature_list_reason": "<reason string when feature_list_warning=true, else omit>"
}`;

export function buildFormUserPrompt(
  input: AristotleFormInput,
  raw: {
    essentialStructure: string;
    irreduciblePartsRaw: string;
    refinement?: string;
  },
): string {
  const formLine =
    input.defended_frame_chosen_form !== undefined && input.defended_frame_chosen_form.length > 0
      ? `Defended frame chosen_form: "${input.defended_frame_chosen_form}"
`
      : "";
  const refinementLine =
    raw.refinement !== undefined && raw.refinement.length > 0
      ? `
User refinement after feature-list rebuttal:
"${raw.refinement}"
`
      : "";
  return `Round: ${String(input.current_round)}

Settled telos.statement:
"${input.telos_statement}"

${formLine}Form questions and raw answers:
Q1 — "Given your telos, what shape carries it?"
A1: "${raw.essentialStructure}"

Q2 — "What components are essential to the telos, not decoration?"
A2: "${raw.irreduciblePartsRaw}"
${refinementLine}
Extract the FormClaim per the JSON shape. Apply F-Aristotle-3
(feature-list detection) on Q2; if A2 looks like a feature catalog
rather than structural components, set feature_list_warning=true
and provide feature_list_reason.`;
}

export async function runAristotleFormRound(
  input: AristotleFormInput,
  runner: ClaudeRunner,
  ui: AristotleFormUi,
): Promise<Result<FormClaim, AgoraErrorThrown>> {
  const essentialStructure = await ui.askEssentialStructure({
    telos_statement: input.telos_statement,
  });
  const irreduciblePartsRaw = await ui.askIrreduciblePartsList({
    essential_structure: essentialStructure,
  });

  if (essentialStructure.trim().length === 0 || irreduciblePartsRaw.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "Form round needs both Q1 and Q2 answers — empty input." },
      }),
    );
  }

  const extraction = await callForFormExtraction(input, runner, {
    essentialStructure,
    irreduciblePartsRaw,
  });
  if (!extraction.ok) return extraction;
  let extracted = extraction.value;
  let warningTriggered = false;

  if (extracted.feature_list_warning) {
    warningTriggered = true;
    const refinement = await ui.askFeatureListRefinement({
      detected: irreduciblePartsRaw,
      reason:
        extracted.feature_list_reason ??
        "Q2 read as feature catalog rather than structural components.",
    });
    if (refinement.trim().length === 0) {
      return err(
        buildAgoraError("user.aborted", {
          context: { detail: "Feature-list rebuttal needs a refinement — empty." },
        }),
      );
    }
    const reExtraction = await callForFormExtraction(input, runner, {
      essentialStructure,
      irreduciblePartsRaw,
      refinement,
    });
    if (!reExtraction.ok) return reExtraction;
    extracted = reExtraction.value;
  }

  const claim: FormClaim = {
    essential_structure: extracted.essential_structure,
    irreducible_parts: extracted.irreducible_parts,
    feature_list_warning_triggered: warningTriggered,
    maturity: "dianoia",
  };
  const validated = FormClaimSchema.safeParse(claim);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "form schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForFormExtraction(
  input: AristotleFormInput,
  runner: ClaudeRunner,
  raw: { essentialStructure: string; irreduciblePartsRaw: string; refinement?: string },
): Promise<Result<ExtractedForm, AgoraErrorThrown>> {
  const response = await runner.call({
    system: ARISTOTLE_FORM_SYSTEM,
    prompt: buildFormUserPrompt(input, raw),
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
        context: { detail: "Aristotle form prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = FormExtractionResponseSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "form schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}

// ─── Material round (runbook §4.3 aristotle:material-question) ───
//
// Material follows form. For brownfield projects, much of this is auto-
// detected from cwd_signal (Phase 0 scan); slice respects R3-A by
// pre-filling tech_stack from detected_stack and asking for confirmation/
// extension rather than re-interview. Greenfield asks from scratch.
//
// F-Aristotle-2 mitigation: if the user offers material before telos was
// settled, refuse with a rebuttal. In this slice the upstream guard
// (telos must exist in four_causes.json before runMaterialCommand
// dispatches) handles the case operationally; the runbook-level rebuttal
// is informational here.

export interface AristotleMaterialInput {
  readonly telos_statement: string;
  readonly form_essential_structure?: string;
  readonly detected_stack: readonly string[];
  readonly is_brownfield: boolean;
  readonly current_round: number;
}

export interface AristotleMaterialUi {
  /** For brownfield: confirm/extend the auto-detected stack. */
  askConfirmDetectedStack(args: { detected: readonly string[] }): Promise<string>;
  /** For greenfield: ask tech stack from scratch. */
  askTechStackFromScratch(): Promise<string>;
  /** Q for both: data shape (one paragraph). */
  askDataShape(): Promise<string>;
  /** Q for both: infrastructure (one paragraph). */
  askInfrastructure(): Promise<string>;
}

export const MaterialExtractionResponseSchema = z.object({
  tech_stack: z.array(z.string().min(1)).min(1).max(20),
  data_shape: z.string().min(1),
  infrastructure: z.string().min(1),
});
export type ExtractedMaterial = z.infer<typeof MaterialExtractionResponseSchema>;

export const ARISTOTLE_MATERIAL_SYSTEM = `You are Aristotle extracting the MATERIAL cause (what-it's-made-of)
from a user's raw answers, AFTER telos and form are settled.

Hard rules:
1. tech_stack is the language + framework + key libs (≤ 10-20 entries).
   Each entry is a noun phrase (library name, language). For brownfield
   projects, the detected stack is the starting point — the user's
   confirmation or addition merges with the detected list.
2. data_shape is one paragraph describing the shape of the primary
   data this software handles.
3. infrastructure is one paragraph describing where it runs (deploy
   target, runtime, hosting).
4. For brownfield, set brownfield_auto_filled=true ONLY if the user
   accepted the detected stack without removing entries (additions OK).
   For greenfield, brownfield_auto_filled is always false.
5. NEVER let material lead the interview — telos+form are settled
   before material runs. If the user veers back to telos/form in their
   answers, capture material faithfully but flag in raw output.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "tech_stack": ["<entry 1>", "<entry 2>", ...],
  "data_shape": "<one-paragraph description>",
  "infrastructure": "<one-paragraph description>"
}`;

export function buildMaterialUserPrompt(
  input: AristotleMaterialInput,
  raw: {
    stackConfirmation: string;
    dataShape: string;
    infrastructure: string;
  },
): string {
  const formLine =
    input.form_essential_structure !== undefined && input.form_essential_structure.length > 0
      ? `Settled form.essential_structure: "${input.form_essential_structure}"\n`
      : "";
  const detectedLine =
    input.detected_stack.length > 0
      ? `Detected stack (Phase 0 scan): [${input.detected_stack.slice(0, 15).join(", ")}]\n`
      : "Detected stack: (empty — greenfield or no markers)\n";
  return `Round: ${String(input.current_round)}

Settled telos: "${input.telos_statement}"
${formLine}${detectedLine}Project type: ${input.is_brownfield ? "brownfield" : "greenfield"}

Material questions and raw answers:
Q1 — ${
    input.is_brownfield
      ? '"Confirm or extend the detected stack (additions/removals)"'
      : '"What\'s the tech stack? (language + framework + key libs)"'
  }
A1: "${raw.stackConfirmation}"

Q2 — "What's the shape of the primary data?"
A2: "${raw.dataShape}"

Q3 — "Where does it run? (deploy / runtime / hosting)"
A3: "${raw.infrastructure}"

Extract the MaterialClaim per the JSON shape. Merge detected_stack with
A1 confirmations/additions for tech_stack output.`;
}

export async function runAristotleMaterialRound(
  input: AristotleMaterialInput,
  runner: ClaudeRunner,
  ui: AristotleMaterialUi,
): Promise<Result<MaterialClaim, AgoraErrorThrown>> {
  const stackConfirmation = input.is_brownfield
    ? await ui.askConfirmDetectedStack({ detected: input.detected_stack })
    : await ui.askTechStackFromScratch();
  const dataShape = await ui.askDataShape();
  const infrastructure = await ui.askInfrastructure();

  if (
    stackConfirmation.trim().length === 0 ||
    dataShape.trim().length === 0 ||
    infrastructure.trim().length === 0
  ) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "Material round needs all 3 question answers — empty input." },
      }),
    );
  }

  const extraction = await callForMaterialExtraction(input, runner, {
    stackConfirmation,
    dataShape,
    infrastructure,
  });
  if (!extraction.ok) return extraction;
  const extracted = extraction.value;

  // Determine brownfield_auto_filled: brownfield + user did not remove
  // any detected entries (additions OK).
  const detectedSet = new Set(input.detected_stack.map((s) => s.toLowerCase()));
  const extractedSet = new Set(extracted.tech_stack.map((s) => s.toLowerCase()));
  const allDetectedKept =
    input.is_brownfield &&
    input.detected_stack.length > 0 &&
    [...detectedSet].every((d) => extractedSet.has(d));
  const claim: MaterialClaim = {
    tech_stack: extracted.tech_stack,
    data_shape: extracted.data_shape,
    infrastructure: extracted.infrastructure,
    brownfield_auto_filled: allDetectedKept,
    maturity: "pistis",
  };
  const validated = MaterialClaimSchema.safeParse(claim);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "material schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForMaterialExtraction(
  input: AristotleMaterialInput,
  runner: ClaudeRunner,
  raw: { stackConfirmation: string; dataShape: string; infrastructure: string },
): Promise<Result<ExtractedMaterial, AgoraErrorThrown>> {
  const response = await runner.call({
    system: ARISTOTLE_MATERIAL_SYSTEM,
    prompt: buildMaterialUserPrompt(input, raw),
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
        context: { detail: "Aristotle material prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = MaterialExtractionResponseSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "material schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}

// ─── Efficient round (runbook §4.4 aristotle:efficient-question) ───
//
// Efficient is the lightest of the four causes — captures who/when/how
// (people, timeline+cadence, process+sequence). Per runbook §3.2: "Even
// for solo projects, capture this — it informs Ralph's verbosity, gate
// strictness, and over-engineering tolerance." Pistis is the floor.

export interface AristotleEfficientInput {
  readonly telos_statement: string;
  readonly form_essential_structure?: string;
  readonly material_tech_stack?: readonly string[];
  readonly detected_patterns: readonly string[];
  readonly current_round: number;
}

export interface AristotleEfficientUi {
  /** Q1: Who is involved? (solo / team of N / specific roles) */
  askWho(): Promise<string>;
  /** Q2: When? (timeline + cadence — e.g. "evenings, 30 min sessions") */
  askWhen(): Promise<string>;
  /** Q3: How? (process tools + sequence — e.g. "TDD with vitest, deploy on push") */
  askHow(): Promise<string>;
}

export const EfficientExtractionResponseSchema = z.object({
  who: z.string().min(1),
  when: z.string().min(1),
  how: z.string().min(1),
});
export type ExtractedEfficient = z.infer<typeof EfficientExtractionResponseSchema>;

export const ARISTOTLE_EFFICIENT_SYSTEM = `You are Aristotle extracting the EFFICIENT cause (who / when / how-process)
from a user's raw answers. Lightest of the four causes — keep extraction
faithful + brief.

Hard rules:
1. NEVER skip even for solo projects. Solo IS an efficient cause that
   constrains everything downstream.
2. Capture three sub-fields:
   - who: people involved (e.g. "solo: Sang", "team of 2", "Sang + 1 reviewer")
   - when: timeline + cadence (e.g. "evenings, 30 min sessions",
     "full-time, 2-week sprints")
   - how: process tools + sequence (e.g. "TDD with vitest, deploy on push",
     "Linear for tickets, branches per cause")
3. Each field is a single sentence (≤ 100 chars target). Faithful to user
   wording; do not editorialize.
4. If the user mentions detected_patterns (e.g. uses_pnpm), incorporate
   into 'how' where appropriate.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "who": "<one sentence>",
  "when": "<one sentence>",
  "how": "<one sentence>"
}`;

export function buildEfficientUserPrompt(
  input: AristotleEfficientInput,
  raw: {
    who: string;
    when: string;
    how: string;
  },
): string {
  const formLine =
    input.form_essential_structure !== undefined && input.form_essential_structure.length > 0
      ? `Settled form.essential_structure: "${input.form_essential_structure}"\n`
      : "";
  const materialLine =
    input.material_tech_stack !== undefined && input.material_tech_stack.length > 0
      ? `Settled material.tech_stack: [${input.material_tech_stack.slice(0, 8).join(", ")}]\n`
      : "";
  const patternsLine =
    input.detected_patterns.length > 0
      ? `Detected efficient patterns (Phase 0): [${input.detected_patterns.slice(0, 10).join(", ")}]\n`
      : "";
  return `Round: ${String(input.current_round)}

Settled telos: "${input.telos_statement}"
${formLine}${materialLine}${patternsLine}
Efficient questions and raw answers:
Q1 — "Who is involved?"
A1: "${raw.who}"

Q2 — "When? (timeline + cadence)"
A2: "${raw.when}"

Q3 — "How? (process tools + sequence)"
A3: "${raw.how}"

Extract the EfficientClaim per the JSON shape. Pistis is the floor;
keep brief and faithful to user wording.`;
}

export async function runAristotleEfficientRound(
  input: AristotleEfficientInput,
  runner: ClaudeRunner,
  ui: AristotleEfficientUi,
): Promise<Result<EfficientClaim, AgoraErrorThrown>> {
  const who = await ui.askWho();
  const whenAns = await ui.askWhen();
  const how = await ui.askHow();

  if (who.trim().length === 0 || whenAns.trim().length === 0 || how.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "Efficient round needs all 3 question answers — empty input." },
      }),
    );
  }

  const extraction = await callForEfficientExtraction(input, runner, {
    who,
    when: whenAns,
    how,
  });
  if (!extraction.ok) return extraction;
  const extracted = extraction.value;

  const claim: EfficientClaim = {
    who: extracted.who,
    when: extracted.when,
    how: extracted.how,
    maturity: "pistis",
  };
  const validated = EfficientClaimSchema.safeParse(claim);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "efficient schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForEfficientExtraction(
  input: AristotleEfficientInput,
  runner: ClaudeRunner,
  raw: { who: string; when: string; how: string },
): Promise<Result<ExtractedEfficient, AgoraErrorThrown>> {
  const response = await runner.call({
    system: ARISTOTLE_EFFICIENT_SYSTEM,
    prompt: buildEfficientUserPrompt(input, raw),
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
        context: { detail: "Aristotle efficient prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = EfficientExtractionResponseSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "efficient schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}
