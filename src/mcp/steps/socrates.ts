// SPEC: ADR-0010 (host-reasoning stepped MCP tools) +
//       docs/philosophers/runbooks/socrates.md (Stage 5-A.3) — socrates
//       state machine.
//
// Socrates Elenchus probes the load-bearing claims (telos + form)
// sequentially: per-claim "construct case (LLM)" → "ask user the
// question (user_answers)" → local categorize. F-Socrates-1
// (sycophantic) + F-Socrates-3 (brownfield hypothetical) are handled by
// re-issuing the same construct step once with demandCwdGrounding /
// implicit reset, surfaced to the host as an additional reasoning turn.
//
// Output: { elenched: ElenchedClaim[] } — the orchestrator (align-step)
// persists elenchus.json and folds refined_content back into
// four_causes.json.
//
// LAYER 2.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import {
  buildSocratesUserPrompt,
  ConstructedCaseResponseSchema,
  CwdSignalSchema,
  categorizeResponse,
  type ElenchedClaim,
  ElenchedClaimSchema,
  isSycophantic,
  PriorClaimSchema,
  SOCRATES_SYSTEM,
  type SocratesClaim,
  SocratesClaimSchema,
  type SocratesInput,
} from "../../philosophers/socrates.js";
import { err, ok, type Result } from "../../result/index.js";
import type { McpPending } from "../pending.js";
import type {
  ErrorEnvelope,
  NeedsReasoningEnvelope,
  NeedsUserInputEnvelope,
  StepArgs,
  StepPrompt,
  StepQuestion,
} from "../step.js";
import { envError, envNeedsReasoning, envNeedsUserInput } from "../step.js";

// ─── Scratch ───

const ConstructedSchema = ConstructedCaseResponseSchema;
type Constructed = z.infer<typeof ConstructedSchema>;

const SocratesScratchSchema = z.object({
  claims: z.array(SocratesClaimSchema).min(1),
  cwd_signal: CwdSignalSchema,
  locale: z.enum(["en", "ko"]),
  current_claim_index: z.number().int().min(0),
  prior_history: z.array(PriorClaimSchema),
  current_constructed: ConstructedSchema.optional(),
  current_construct_retries: z.number().int().min(0),
  current_construct_demand_cwd: z.boolean(),
  elenched: z.array(ElenchedClaimSchema),
});
type SocratesScratch = z.infer<typeof SocratesScratchSchema>;

// ─── Outcome ADT ───

export type SocratesStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; elenched: ElenchedClaim[] }
  | { type: "error"; envelope: ErrorEnvelope };

export interface SocratesStepInput {
  readonly claims: readonly SocratesClaim[];
  readonly cwd_signal: SocratesInput["cwd_signal"];
  readonly locale: "en" | "ko";
}

export function beginSocrates(input: SocratesStepInput): SocratesStepOutcome {
  const scratch: SocratesScratch = {
    claims: [...input.claims],
    cwd_signal: input.cwd_signal,
    locale: input.locale,
    current_claim_index: 0,
    prior_history: [],
    current_construct_retries: 0,
    current_construct_demand_cwd: false,
    elenched: [],
  };
  return advanceClaimCursor(scratch);
}

export function advanceSocrates(pending: McpPending, args: StepArgs): SocratesStepOutcome {
  const parsed = SocratesScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `socrates scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "socrates.construct":
      return handleConstructApply(scratch, args);
    case "socrates.respond":
      return handleRespondApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown socrates step: ${pending.step}`,
        ),
      };
  }
}

// ─── Step issuers ───

function issueConstructStep(scratch: SocratesScratch): SocratesStepOutcome {
  const claim = scratch.claims[scratch.current_claim_index];
  if (claim === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `socrates: current_claim_index ${scratch.current_claim_index} out of range`,
      ),
    };
  }
  const input: SocratesInput = {
    claim,
    cwd_signal: scratch.cwd_signal,
    prior_round_history: scratch.prior_history,
    locale: scratch.locale,
  };
  const prompts: StepPrompt[] = [
    {
      id: "construct",
      system: SOCRATES_SYSTEM,
      user: buildSocratesUserPrompt(input, scratch.current_construct_demand_cwd),
      expect: "json",
      schema_hint: "{ case, grounding, grounding_ref?, quoted_prior_id?, question }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "socrates.construct", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "socrates.construct",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueRespondStep(scratch: SocratesScratch): SocratesStepOutcome {
  if (scratch.current_constructed === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "socrates.respond issued without current_constructed",
      ),
    };
  }
  const claim = scratch.claims[scratch.current_claim_index];
  if (claim === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "socrates.respond: current_claim_index out of range",
      ),
    };
  }
  const question: StepQuestion = {
    id: "q_response",
    prompt: scratch.current_constructed.question,
    hint: `Case: ${scratch.current_constructed.case}\n(Probing claim: ${claim.cause} — "${claim.content}")`,
    open_question: true,
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "socrates.respond", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "socrates.respond",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Step appliers ───

function handleConstructApply(scratch: SocratesScratch, args: StepArgs): SocratesStepOutcome {
  const responses = args.llm_responses;
  if (responses === undefined || responses.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "llm.invalid-response",
        "socrates.construct: llm_responses missing.",
      ),
    };
  }
  const found = responses.find((r) => r.id === "construct");
  if (found === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "llm.invalid-response",
        'socrates.construct: no llm_response with id="construct".',
      ),
    };
  }
  const parsed = parseConstructed(found.content);
  if (!parsed.ok) {
    return {
      type: "error",
      envelope: envError("align", parsed.error.code, parsed.error.message),
    };
  }
  const constructed = parsed.value;

  // F-Socrates-1: sycophantic paraphrase → regenerate once.
  // F-Socrates-3: brownfield+files but hypothetical grounding → regenerate
  //               once demanding cwd grounding.
  const claim = scratch.claims[scratch.current_claim_index];
  if (claim === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "socrates.construct: current_claim_index out of range",
      ),
    };
  }
  const hasFiles = scratch.cwd_signal.is_brownfield && scratch.cwd_signal.detected_files.length > 0;
  const sycophantic = isSycophantic(constructed.question);
  const hypotheticalInBrownfield = hasFiles && constructed.grounding === "hypothetical";
  if ((sycophantic || hypotheticalInBrownfield) && scratch.current_construct_retries === 0) {
    return issueConstructStep({
      ...scratch,
      current_construct_retries: scratch.current_construct_retries + 1,
      current_construct_demand_cwd: hypotheticalInBrownfield
        ? true
        : scratch.current_construct_demand_cwd,
    });
  }

  // Accept the constructed case; issue the user response step.
  return issueRespondStep({
    ...scratch,
    current_constructed: constructed,
  });
}

function handleRespondApply(scratch: SocratesScratch, args: StepArgs): SocratesStepOutcome {
  const response = (args.user_answers?.q_response ?? "").trim();
  if (response.length === 0) {
    return {
      type: "error",
      envelope: envError("align", "user.aborted", "socrates.respond: q_response is empty."),
    };
  }
  const constructed = scratch.current_constructed;
  const claim = scratch.claims[scratch.current_claim_index];
  if (constructed === undefined || claim === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "socrates.respond apply without current_constructed/claim",
      ),
    };
  }

  const outcome = categorizeResponse(response, scratch.locale);
  const aporiaCount = claim.prior_aporia_count + (outcome === "aporia_then_refined" ? 1 : 0);

  const elenched: ElenchedClaim = {
    claim_id: claim.id,
    original_content: claim.content,
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
    user_response: response,
    outcome,
    ...(outcome !== "confirmed" ? { refined_content: response } : {}),
    aporia_count: aporiaCount,
    unsurfaced_objections: [],
    load_bearing_pass: true,
  };
  const validated = ElenchedClaimSchema.safeParse(elenched);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `socrates: elenched validation failed: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }

  // Push elenched, push prior, advance cursor, reset per-claim flags.
  const nextScratch: SocratesScratch = {
    ...scratch,
    elenched: [...scratch.elenched, validated.data],
    prior_history: [
      ...scratch.prior_history,
      {
        id: claim.id,
        content: claim.content,
        outcome: validated.data.outcome,
      },
    ],
    current_claim_index: scratch.current_claim_index + 1,
    current_construct_retries: 0,
    current_construct_demand_cwd: false,
  };
  // current_constructed cleared by next claim's construct step.
  const cleared: SocratesScratch = { ...nextScratch };
  delete (cleared as Partial<SocratesScratch>).current_constructed;
  return advanceClaimCursor(cleared);
}

// ─── Cursor: pick next claim or finalize ───

function advanceClaimCursor(scratch: SocratesScratch): SocratesStepOutcome {
  if (scratch.current_claim_index >= scratch.claims.length) {
    return { type: "complete", elenched: scratch.elenched };
  }
  const claim = scratch.claims[scratch.current_claim_index];
  if (claim === undefined) {
    return {
      type: "error",
      envelope: envError("align", "internal.invariant-violation", "socrates: cursor out of range"),
    };
  }
  // F-Socrates-2: non-load-bearing → auto-skip (no probe; "confirmed" with
  // load_bearing_pass=false).
  if (!claim.load_bearing) {
    const skipped: ElenchedClaim = {
      claim_id: claim.id,
      original_content: claim.content,
      case_probed: null,
      user_response: "",
      outcome: "confirmed",
      aporia_count: 0,
      unsurfaced_objections: [],
      load_bearing_pass: false,
    };
    return advanceClaimCursor({
      ...scratch,
      elenched: [...scratch.elenched, skipped],
      current_claim_index: scratch.current_claim_index + 1,
      current_construct_retries: 0,
      current_construct_demand_cwd: false,
    });
  }
  return issueConstructStep(scratch);
}

// ─── Helpers ───

function parseConstructed(
  raw: string | Record<string, unknown>,
): Result<Constructed, AgoraErrorThrown> {
  const obj = typeof raw === "string" ? safeJsonParse(raw) : (raw as unknown);
  if (obj === null || typeof obj !== "object") {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "socrates.construct: content is not a JSON object." },
      }),
    );
  }
  const parsed = ConstructedSchema.safeParse(obj);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: {
          detail: `socrates.construct: ${parsed.error.issues[0]?.message ?? "schema fail"}`,
        },
      }),
    );
  }
  return ok(parsed.data);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serializeScratch(scratch: SocratesScratch): Record<string, unknown> {
  return SocratesScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
