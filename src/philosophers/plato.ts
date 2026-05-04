// SPEC: docs/philosophers/runbooks/plato.md (Stage 5-A.3 Rev 2) +
//       docs/philosophy/04-plato-divided-line-and-dihairesis.md (Stage 1).
//
// Third philosopher implementation. Plato Divided Line (DL) — maturity
// tagging gate that prevents Pistis-level claims from being declared
// "settled" and entering Ralph (where they would drift catastrophically
// per the 0.9^10 math).
//
// This slice ONLY implements Divided Line. Dihairesis (DH) — decomposing
// acceptance criteria into ac_tree — lands in a future handoff slice.
//
// Simplification vs runbook §3.2 (per-claim multi-turn LLM dialogue):
// the Noesis test is asked LOCALLY through PlatoUi adapter (one
// question: "What alternative did you consider for this claim, and why
// did you reject it?"); a single LLM call extracts tagged_maturity +
// rejected_alternatives. Same pattern as Husserl/Aristotle slices.
//
// Required floors per cause (per alignment-loop.md L1210 LOAD_BEARING_
// FIELDS + MANIFESTO § telos load-bearing):
//   telos     → noesis  (most load-bearing; rejected_alternatives required)
//   form      → dianoia
//   material  → pistis
//   efficient → pistis

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";
import { type Maturity, MaturitySchema } from "./aristotle.js";

// ─── Types ───

export const RejectedAlternativeSchema = z.object({
  alternative: z.string().min(1),
  why_rejected: z.string().min(1),
});
export type RejectedAlternative = z.infer<typeof RejectedAlternativeSchema>;

export const CauseFieldPath = z.enum(["telos", "form", "material", "efficient"]);
export type CauseField = z.infer<typeof CauseFieldPath>;

export const PlatoDLPerCauseOutputSchema = z.object({
  field_path: CauseFieldPath,
  tagged_maturity: MaturitySchema,
  required_floor: MaturitySchema,
  passed: z.boolean(),
  rejected_alternatives: z.array(RejectedAlternativeSchema).default([]),
  reloop_directive_field: z.string().optional(),
});
export type PlatoDLPerCauseOutput = z.infer<typeof PlatoDLPerCauseOutputSchema>;

export const PlatoMaturityResultSchema = z.object({
  per_cause: z.array(PlatoDLPerCauseOutputSchema),
  all_passed: z.boolean(),
  failing_causes: z.array(CauseFieldPath),
  created_at: z.string().datetime(),
});
export type PlatoMaturityResult = z.infer<typeof PlatoMaturityResultSchema>;

const MATURITY_ORDER: Record<Maturity, number> = {
  pistis: 0,
  dianoia: 1,
  noesis: 2,
};

export const REQUIRED_FLOORS: Record<CauseField, Maturity> = {
  telos: "noesis",
  form: "dianoia",
  material: "pistis",
  efficient: "pistis",
};

export interface PlatoNoesisTestInput {
  readonly field_path: CauseField;
  readonly claim_content: string;
  readonly required_floor: Maturity;
}

export interface PlatoUi {
  /** Ask the Noesis test for a single claim and return the user's response. */
  askNoesisTest(args: {
    field_path: CauseField;
    claim_content: string;
    required_floor: Maturity;
  }): Promise<string>;
}

interface ExtractedDLTag {
  tagged_maturity: Maturity;
  rejected_alternatives: RejectedAlternative[];
}

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

const PLATO_DL_SYSTEM = `You are administering Plato's Noesis test on a single claim. Maturity
tagging is the gate that prevents Pistis-level claims from being declared
"settled" and entering Ralph (where they would drift catastrophically per
the 0.9^10 math).

Hard rules:
1. Categorize the user's response per the maturity criteria:
   - Noesis: alternative named + why-rejected explained (≥ 2 sentences,
     specific reasoning — not vague)
   - Dianoia: reasoning from premises but no specific rejected alternative
   - Pistis: just-believe ("I think it's right", "feels obvious")
   - Eikasia: vague association — DOWNGRADE to "pistis" in output
     (4-level model collapsed to 3-level for this slice)
2. NEVER coach. Categorize what was actually said, not what could have
   been said with a follow-up.
3. When tagged == "noesis", extract every named alternative + its
   why_rejected reason as rejected_alternatives[].
4. When tagged < "noesis", rejected_alternatives is empty array.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "tagged_maturity": "pistis" | "dianoia" | "noesis",
  "rejected_alternatives": [
    { "alternative": "<text>", "why_rejected": "<text>" },
    ...
  ]
}`;

function buildDLUserPrompt(input: PlatoNoesisTestInput, userResponse: string): string {
  return `Claim being measured:
- field_path: ${input.field_path}
- content: "${input.claim_content}"
- required_floor: ${input.required_floor}

Noesis test question asked: "What alternative did you consider for this
claim, and why did you reject it?"

User response:
"${userResponse}"

Categorize the response per the rules. Return PlatoDLOutput.`;
}

// ─── Orchestrators ───

export async function runPlatoNoesisTest(
  input: PlatoNoesisTestInput,
  runner: ClaudeRunner,
  ui: PlatoUi,
): Promise<Result<PlatoDLPerCauseOutput, AgoraErrorThrown>> {
  const userResponse = await ui.askNoesisTest({
    field_path: input.field_path,
    claim_content: input.claim_content,
    required_floor: input.required_floor,
  });
  if (userResponse.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: `Noesis test for ${input.field_path}: empty response.` },
      }),
    );
  }

  const extraction = await callForDLTag(input, runner, userResponse);
  if (!extraction.ok) return extraction;
  const extracted = extraction.value;

  const passed = MATURITY_ORDER[extracted.tagged_maturity] >= MATURITY_ORDER[input.required_floor];
  const result: PlatoDLPerCauseOutput = {
    field_path: input.field_path,
    tagged_maturity: extracted.tagged_maturity,
    required_floor: input.required_floor,
    passed,
    rejected_alternatives: extracted.rejected_alternatives,
    ...(passed ? {} : { reloop_directive_field: input.field_path }),
  };

  const validated = PlatoDLPerCauseOutputSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "DL output schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

export interface PlatoMaturityRunInput {
  readonly causes: readonly {
    field_path: CauseField;
    claim_content: string;
  }[];
}

export async function runPlatoMaturityForAllCauses(
  input: PlatoMaturityRunInput,
  runner: ClaudeRunner,
  ui: PlatoUi,
): Promise<Result<PlatoMaturityResult, AgoraErrorThrown>> {
  const perCause: PlatoDLPerCauseOutput[] = [];
  for (const cause of input.causes) {
    const required = REQUIRED_FLOORS[cause.field_path];
    const r = await runPlatoNoesisTest(
      {
        field_path: cause.field_path,
        claim_content: cause.claim_content,
        required_floor: required,
      },
      runner,
      ui,
    );
    if (!r.ok) return r;
    perCause.push(r.value);
  }
  const failing = perCause.filter((c) => !c.passed).map((c) => c.field_path);
  const result: PlatoMaturityResult = {
    per_cause: perCause,
    all_passed: failing.length === 0,
    failing_causes: failing,
    created_at: new Date().toISOString(),
  };
  const validated = PlatoMaturityResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "maturity result schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForDLTag(
  input: PlatoNoesisTestInput,
  runner: ClaudeRunner,
  userResponse: string,
): Promise<Result<ExtractedDLTag, AgoraErrorThrown>> {
  const response = await runner.call({
    system: PLATO_DL_SYSTEM,
    prompt: buildDLUserPrompt(input, userResponse),
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
        context: { detail: "Plato DL prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = z
    .object({
      tagged_maturity: MaturitySchema,
      rejected_alternatives: z.array(RejectedAlternativeSchema).default([]),
    })
    .safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "DL tag schema parse failed" },
      }),
    );
  }
  return ok(parsed.data);
}
