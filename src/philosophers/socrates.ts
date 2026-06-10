// SPEC: docs/philosophers/runbooks/socrates.md (Stage 5-A.3 Rev 2) +
//       docs/philosophy/02-socrates-elenchus.md (Stage 1).
//
// Fourth philosopher implementation. Socrates Elenchus — case-probe a
// single load-bearing claim toward aporia (productive confusion), so the
// user re-articulates sharper BEFORE the claim enters Ralph (where a
// Pistis-level belief drifts catastrophically per the 0.9^10 math).
//
// Phase 2 conductor: Aristotle picks WHAT to probe, Socrates probes, Plato
// measures the result's maturity. One claim per call.
//
// Simplification vs runbook §3.2 (which implies two LLM turns): the LLM
// constructs ONE concrete case + question (call #1). The user's reply is
// then categorized LOCALLY via explicit linguistic markers — exactly as
// runbook §10 mandates ("aporia detection uses explicit linguistic
// markers, not sentiment analysis"). So this is ONE LLM call + local
// categorization, consistent with the Husserl/Aristotle/Plato slices.
//
// Forbidden-pattern guards implemented:
//   F-Socrates-1  sycophantic paraphrase in the question → regenerate once
//   F-Socrates-2  load_bearing == false → skip probe entirely
//   F-Socrates-3  brownfield with files available but hypothetical grounding
//                 → regenerate once demanding cwd grounding

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const ClaimCauseSchema = z.enum(["telos", "form", "material", "efficient", "ac", "other"]);
export type ClaimCause = z.infer<typeof ClaimCauseSchema>;

export const GroundingSchema = z.enum(["cwd_file", "cwd_pattern", "real_world", "hypothetical"]);
export type Grounding = z.infer<typeof GroundingSchema>;

export const ElenchusOutcomeSchema = z.enum([
  "confirmed", // user agreed; case becomes a scope-defining example
  "refined_with_addition", // user added a condition / exception
  "aporia_then_refined", // user reached aporia, re-articulated
]);
export type ElenchusOutcome = z.infer<typeof ElenchusOutcomeSchema>;

export const PriorClaimSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  outcome: ElenchusOutcomeSchema,
});
export type PriorClaim = z.infer<typeof PriorClaimSchema>;

export const SocratesClaimSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  cause: ClaimCauseSchema,
  load_bearing: z.boolean(),
  prior_aporia_count: z.number().int().min(0),
});
export type SocratesClaim = z.infer<typeof SocratesClaimSchema>;

export const CwdSignalSchema = z.object({
  is_brownfield: z.boolean(),
  detected_files: z.array(z.string()).default([]),
  detected_patterns: z.array(z.string()).default([]),
});
export type CwdSignal = z.infer<typeof CwdSignalSchema>;

export interface SocratesInput {
  readonly claim: SocratesClaim;
  readonly cwd_signal: CwdSignal;
  readonly prior_round_history: readonly PriorClaim[];
  readonly locale: "en" | "ko";
}

export const CaseProbedSchema = z.object({
  case: z.string().min(1),
  grounding: GroundingSchema,
  grounding_ref: z.string().optional(),
  quoted_prior_id: z.string().optional(),
});
export type CaseProbed = z.infer<typeof CaseProbedSchema>;

export const ElenchedClaimSchema = z
  .object({
    claim_id: z.string().min(1),
    original_content: z.string().min(1),
    case_probed: CaseProbedSchema.nullable(), // null only when skipped
    user_response: z.string(),
    outcome: ElenchusOutcomeSchema,
    refined_content: z.string().optional(), // present iff outcome != confirmed
    aporia_count: z.number().int().min(0),
    unsurfaced_objections: z.array(z.string()).default([]),
    load_bearing_pass: z.boolean(), // false ONLY when claim.load_bearing was false
  })
  .strict();
export type ElenchedClaim = z.infer<typeof ElenchedClaimSchema>;

export const SocratesOutputSchema = z
  .object({
    elenched_claim: ElenchedClaimSchema,
    ready_for_plato_maturity_check: z.boolean(),
  })
  .strict();
export type SocratesOutput = z.infer<typeof SocratesOutputSchema>;

export interface SocratesUi {
  /** Present the constructed case-probing question; return the user's verbatim reply. */
  askElenchusResponse(args: { question: string; claim_content: string }): Promise<string>;
}

// ─── Aporia / refinement linguistic markers (runbook §10: markers, not sentiment) ───

// Biased toward sensitivity: a missed refinement silently drops the user's
// sharpened commitment from elenchus_refinement (data loss), while a false
// positive merely stores conversational text alongside the untouched clean
// statement (cheap). Dogfood QA 2026-06-10: "Good catch — I hadn't pinned
// this down. Decision: …" classified as "confirmed" and lost the refinement.
const APORIA_MARKERS_EN = [
  "i hadn't", // generalizes "i hadn't thought/considered/pinned/decided/realized"
  "hadn't considered",
  "let me say",
  "say it more",
  "say that more",
  "more carefully",
  "more precisely",
  "not quite what i meant",
  "that's not what i meant",
  "actually no",
  "actually, no",
  "wait",
  "oh —",
  "oh-",
  "the real",
  "good catch",
  "fair hit",
  "fair point",
  "you're right",
  "i was wrong",
  "didn't think of",
  "didn't think about",
  "i missed",
];
const APORIA_MARKERS_KO = [
  "생각 못",
  "생각못",
  "안 했",
  "다시 말하",
  "다시말하",
  "정확히 말하",
  "그건 아니",
  "그게 아니",
  "사실은",
  "아 —",
  "진짜",
  "좋은 지적",
  "맞는 지적",
  "놓쳤",
  "미처",
];
const EXCEPTION_MARKERS_EN = ["but ", "except", "unless", "only if", "as long as"];
const EXCEPTION_MARKERS_KO = ["근데", "다만", "단,", "예외", "경우엔", "경우에만"];

const SYCOPHANTIC_PATTERNS = [
  "so what you're really saying",
  "so what you are really saying",
  "if i understand correctly",
  "it sounds like you mean",
  "what you're really saying is",
];

// Exported for the ADR-0010 stepped path (`src/mcp/steps/socrates.ts`):
// host reasons about the case-construction LLM call, then submits the
// parsed object which is validated against this schema.
export const ConstructedCaseResponseSchema = z.object({
  case: z.string().min(1),
  grounding: GroundingSchema,
  grounding_ref: z.string().optional(),
  quoted_prior_id: z.string().optional(),
  question: z.string().min(1),
});

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

export const SOCRATES_SYSTEM = `You are conducting Socrates's elenchus on a single load-bearing claim.
Construct ONE concrete case the claim implies, to be presented to the user.

Hard rules:
1. The case MUST be concrete — a specific scenario the user can picture, not
   "consider edge cases".
2. The case MUST be grounded:
   - Brownfield (files provided): cite a real file or pattern. grounding =
     "cwd_file" or "cwd_pattern", grounding_ref = the file/pattern.
   - Greenfield: cite a similar real-world case. grounding = "real_world",
     grounding_ref = the domain.
   - Last resort only: grounding = "hypothetical", prefaced "If we imagine that...".
3. NEVER paraphrase the user's claim back as profound. FORBIDDEN phrases:
   "So what you're really saying is", "If I understand correctly",
   "It sounds like you mean".
4. Quote at least ONE prior-history claim by content when any are provided.
   Set quoted_prior_id to that claim's id.
5. The case must be a FAIR implication of the claim, never a strawman.
6. ASK EXACTLY ONE QUESTION inside "question".

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "case": "<the concrete case + the single probing question, as one block>",
  "grounding": "cwd_file" | "cwd_pattern" | "real_world" | "hypothetical",
  "grounding_ref": "<file path / pattern / domain, optional>",
  "quoted_prior_id": "<prior claim id if quoted, optional>",
  "question": "<the single question to ask the user>"
}`;

interface ConstructedCase {
  case: string;
  grounding: Grounding;
  grounding_ref?: string;
  quoted_prior_id?: string;
  question: string;
}

export function buildSocratesUserPrompt(input: SocratesInput, demandCwdGrounding: boolean): string {
  const c = input.claim;
  const files = input.cwd_signal.detected_files.slice(0, 5);
  const priors = input.prior_round_history
    .slice(-3)
    .map((p) => `- (${p.id}) "${p.content}" [${p.outcome}]`)
    .join("\n");
  const roundGoal =
    c.prior_aporia_count === 0
      ? "The user has not been case-probed on this claim. Construct ONE concrete case and ask."
      : "The user already reached aporia and re-articulated. Construct ONE NEW case testing the refined version — do NOT re-ask the original case.";
  const cwdDemand = demandCwdGrounding
    ? "\nIMPORTANT: brownfield files are available — you MUST ground the case in a real file or pattern (grounding = cwd_file or cwd_pattern). Do NOT use a hypothetical."
    : "";
  return `Claim being probed (id: ${c.id}, cause: ${c.cause}):
"${c.content}"

Project context:
- Brownfield: ${String(input.cwd_signal.is_brownfield)}
- Detected files (top 5): ${files.length > 0 ? files.join(", ") : "(none)"}
- Detected patterns: ${input.cwd_signal.detected_patterns.join(", ") || "(none)"}

Prior round history (most recent 3):
${priors.length > 0 ? priors : "(none yet — first probe)"}

Round goal: ${roundGoal}
Locale: ${input.locale}${cwdDemand}

Construct the case per the rules. Return the JSON shape.`;
}

// ─── Orchestrator ───

export async function runSocratesElenchus(
  input: SocratesInput,
  runner: ClaudeRunner,
  ui: SocratesUi,
): Promise<Result<SocratesOutput, AgoraErrorThrown>> {
  const validatedInput = SocratesClaimSchema.safeParse(input.claim);
  if (!validatedInput.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: {
          detail: validatedInput.error.issues[0]?.message ?? "SocratesInput.claim invalid",
        },
      }),
    );
  }

  // F-Socrates-2: decorative (non-load-bearing) claims pass without probe.
  if (!input.claim.load_bearing) {
    return buildSkippedOutput(input.claim);
  }

  // LLM call #1 — construct the concrete case + question.
  const built = await constructCase(input, runner, false);
  if (!built.ok) return built;
  let constructed = built.value;

  // F-Socrates-3: brownfield with files available but hypothetical grounding
  // → regenerate once demanding cwd grounding.
  const hasFiles = input.cwd_signal.is_brownfield && input.cwd_signal.detected_files.length > 0;
  if (hasFiles && constructed.grounding === "hypothetical") {
    const retry = await constructCase(input, runner, true);
    if (!retry.ok) return retry;
    constructed = retry.value;
  }

  // Present the question; collect the user's verbatim reply.
  const userResponse = await ui.askElenchusResponse({
    question: constructed.question,
    claim_content: input.claim.content,
  });
  if (userResponse.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: `Elenchus on ${input.claim.id}: empty response.` },
      }),
    );
  }

  // Local categorization via explicit markers (runbook §10).
  const outcome = categorizeResponse(userResponse, input.locale);
  const aporiaCount = input.claim.prior_aporia_count + (outcome === "aporia_then_refined" ? 1 : 0);

  const elenched: ElenchedClaim = {
    claim_id: input.claim.id,
    original_content: input.claim.content,
    case_probed: {
      case: constructed.case,
      grounding: constructed.grounding,
      ...(constructed.grounding_ref !== undefined
        ? { grounding_ref: constructed.grounding_ref }
        : {}),
      ...(constructed.quoted_prior_id !== undefined
        ? { quoted_prior_id: constructed.quoted_prior_id }
        : {}),
    },
    user_response: userResponse,
    outcome,
    ...(outcome !== "confirmed" ? { refined_content: userResponse.trim() } : {}),
    aporia_count: aporiaCount,
    unsurfaced_objections: [],
    load_bearing_pass: true,
  };

  const result: SocratesOutput = {
    elenched_claim: elenched,
    ready_for_plato_maturity_check: true,
  };
  const validated = SocratesOutputSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "Socrates output schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

function buildSkippedOutput(claim: SocratesClaim): Result<SocratesOutput, AgoraErrorThrown> {
  const elenched: ElenchedClaim = {
    claim_id: claim.id,
    original_content: claim.content,
    case_probed: null,
    user_response: "",
    outcome: "confirmed",
    aporia_count: 0,
    unsurfaced_objections: [],
    load_bearing_pass: false,
  };
  return ok({ elenched_claim: elenched, ready_for_plato_maturity_check: true });
}

async function constructCase(
  input: SocratesInput,
  runner: ClaudeRunner,
  demandCwdGrounding: boolean,
): Promise<Result<ConstructedCase, AgoraErrorThrown>> {
  const response = await runner.call({
    system: SOCRATES_SYSTEM,
    prompt: buildSocratesUserPrompt(input, demandCwdGrounding),
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
        context: { detail: "Socrates prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = z
    .object({
      case: z.string().min(1),
      grounding: GroundingSchema,
      grounding_ref: z.string().optional(),
      quoted_prior_id: z.string().optional(),
      question: z.string().min(1),
    })
    .safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "Socrates case schema parse failed" },
      }),
    );
  }

  // F-Socrates-1: regenerate once if the question is sycophantic paraphrase.
  if (!demandCwdGrounding && isSycophantic(parsed.data.question)) {
    return constructCase(input, runner, demandCwdGrounding);
  }

  const data = parsed.data;
  return ok({
    case: data.case,
    grounding: data.grounding,
    question: data.question,
    ...(data.grounding_ref !== undefined ? { grounding_ref: data.grounding_ref } : {}),
    ...(data.quoted_prior_id !== undefined ? { quoted_prior_id: data.quoted_prior_id } : {}),
  });
}

export function isSycophantic(question: string): boolean {
  const lower = question.toLowerCase();
  return SYCOPHANTIC_PATTERNS.some((p) => lower.includes(p));
}

export function categorizeResponse(userResponse: string, locale: "en" | "ko"): ElenchusOutcome {
  const lower = userResponse.toLowerCase();
  const aporiaMarkers = locale === "ko" ? APORIA_MARKERS_KO : APORIA_MARKERS_EN;
  const exceptionMarkers = locale === "ko" ? EXCEPTION_MARKERS_KO : EXCEPTION_MARKERS_EN;
  // ko markers are not lowercased (Korean has no case); match against raw too.
  const haystack = locale === "ko" ? userResponse : lower;
  if (aporiaMarkers.some((m) => haystack.includes(m))) {
    return "aporia_then_refined";
  }
  if (exceptionMarkers.some((m) => haystack.includes(m))) {
    return "refined_with_addition";
  }
  return "confirmed";
}
