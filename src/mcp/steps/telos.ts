// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — telos state machine.
//
// 4-step state machine that turns a single Aristotle telos round into a
// sequence of "ask host" exchanges over the stepped MCP boundary:
//
//   telos.questions   → host asks user 3 Qs (whyExists / servedGood / failureSignal)
//   telos.extract     → host reasons about the raw answers (first LLM call)
//   telos.refinement  → only if noun-phrase telos was detected: host
//                       asks the user one refinement Q
//   telos.re_extract  → second LLM call with the refinement appended
//   complete          → orchestrator persists TelosClaim + advances state
//
// Shares prompt-builders and the extraction schema with the Mode 2 path
// (`runAristotleTelosRound` in src/philosophers/aristotle.ts) — only the
// "where does the answer come from" seam differs.
//
// LAYER 2 — depends on philosophers/aristotle (prompt helpers + types) +
// errors + result + i18n + mcp/{step,pending}.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import {
  ARISTOTLE_TELOS_SYSTEM,
  type AristotleTelosInput,
  buildTelosUserPrompt,
  type ExtractedTelos,
  type TelosClaim,
  TelosClaimSchema,
  TelosExtractionResponseSchema,
} from "../../philosophers/aristotle.js";
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

// ─── Scratch — accumulates as the state machine progresses ───

const TelosStepInputSchema = z.object({
  raw_intake: z.string().min(1),
  defended_frame_chosen_form: z.string().optional(),
  current_round: z.number().int().min(1),
});

const TelosRawAnswersSchema = z.object({
  why_exists: z.string().min(1),
  served_good: z.string().min(1),
  failure_signal: z.string().min(1),
});

const TelosScratchSchema = z.object({
  input: TelosStepInputSchema,
  raw: TelosRawAnswersSchema.optional(),
  first_extraction: TelosExtractionResponseSchema.optional(),
  refinement: z.string().min(1).optional(),
});
type TelosScratch = z.infer<typeof TelosScratchSchema>;

// ─── Outcome ADT ───

export type TelosStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; claim: TelosClaim }
  | { type: "error"; envelope: ErrorEnvelope };

// ─── Public API ───

/** First call (no pending): open with the 3 telos questions. */
export function beginTelos(input: AristotleTelosInput): TelosStepOutcome {
  const scratch: TelosScratch = { input };
  return issueQuestionsStep(scratch);
}

/**
 * Pending was found owned by telos. Validate args against pending,
 * apply, and produce the next outcome (issue next sub-step, complete,
 * or error).
 */
export function advanceTelos(pending: McpPending, args: StepArgs): TelosStepOutcome {
  const scratchResult = TelosScratchSchema.safeParse(pending.scratch);
  if (!scratchResult.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `telos scratch invalid: ${scratchResult.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = scratchResult.data;

  switch (pending.step) {
    case "telos.questions":
      return handleQuestionsApply(scratch, args);
    case "telos.extract":
      return handleExtractApply(scratch, args);
    case "telos.refinement":
      return handleRefinementApply(scratch, args);
    case "telos.re_extract":
      return handleReExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown telos step: ${pending.step}`,
        ),
      };
  }
}

// ─── Step issuers (envelope + pending) ───

function issueQuestionsStep(scratch: TelosScratch): TelosStepOutcome {
  const questions: StepQuestion[] = [
    {
      id: "q_why_exists",
      prompt: localized("cli.telos.q_why_exists"),
      hint: "Because I want to...",
      open_question: true,
    },
    {
      id: "q_served_good",
      prompt: localized("cli.telos.q_served_good"),
      hint: "Name the goodness, not the activity",
      open_question: true,
    },
    {
      id: "q_failure_signal",
      prompt: localized("cli.telos.q_failure_signal"),
      hint: "After N months, I notice...",
      open_question: true,
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "telos.questions", questions),
    pending: {
      version: 1,
      owner: "align",
      step: "telos.questions",
      expects: "user_answers",
      issued_questions: questions,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: TelosScratch): TelosStepOutcome {
  if (scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "telos.extract issued without raw answers",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "extract",
      system: ARISTOTLE_TELOS_SYSTEM,
      user: buildTelosUserPrompt(buildAristotleInput(scratch.input), {
        whyExists: scratch.raw.why_exists,
        servedGood: scratch.raw.served_good,
        failureSignal: scratch.raw.failure_signal,
      }),
      expect: "json",
      schema_hint:
        "{ statement, served_good, failure_signal, success_signal?, noun_phrase_telos: bool, noun_phrase_reason? }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "telos.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "telos.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueRefinementStep(scratch: TelosScratch): TelosStepOutcome {
  if (scratch.first_extraction === undefined || scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "telos.refinement issued without first_extraction or raw",
      ),
    };
  }
  const detected = scratch.raw.why_exists;
  const reason =
    scratch.first_extraction.noun_phrase_reason ??
    "Telos statement read as a noun-phrase artifact.";
  const question: StepQuestion = {
    id: "q_refinement",
    prompt: localized("cli.telos.q_noun_phrase_refinement"),
    hint: `What good does "${detected}" serve? (${reason})`,
    open_question: true,
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "telos.refinement", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "telos.refinement",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueReExtractStep(scratch: TelosScratch): TelosStepOutcome {
  if (scratch.raw === undefined || scratch.refinement === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "telos.re_extract issued without raw or refinement",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "re_extract",
      system: ARISTOTLE_TELOS_SYSTEM,
      user: buildTelosUserPrompt(buildAristotleInput(scratch.input), {
        whyExists: scratch.raw.why_exists,
        servedGood: scratch.raw.served_good,
        failureSignal: scratch.raw.failure_signal,
        refinement: scratch.refinement,
      }),
      expect: "json",
      schema_hint:
        "{ statement, served_good, failure_signal, success_signal?, noun_phrase_telos: bool, noun_phrase_reason? }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "telos.re_extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "telos.re_extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Step appliers ───

function handleQuestionsApply(scratch: TelosScratch, args: StepArgs): TelosStepOutcome {
  const answers = args.user_answers;
  if (answers === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "telos.questions expects user_answers; none provided.",
      ),
    };
  }
  const whyExists = (answers.q_why_exists ?? "").trim();
  const servedGood = (answers.q_served_good ?? "").trim();
  const failureSignal = (answers.q_failure_signal ?? "").trim();
  if (whyExists.length === 0 || servedGood.length === 0 || failureSignal.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "telos.questions requires non-empty q_why_exists, q_served_good, q_failure_signal.",
      ),
    };
  }
  const next: TelosScratch = {
    ...scratch,
    raw: { why_exists: whyExists, served_good: servedGood, failure_signal: failureSignal },
  };
  return issueExtractStep(next);
}

function handleExtractApply(scratch: TelosScratch, args: StepArgs): TelosStepOutcome {
  const extraction = parseLlmExtraction(args, "extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  const extracted = extraction.value;
  if (extracted.noun_phrase_telos) {
    const next: TelosScratch = { ...scratch, first_extraction: extracted };
    return issueRefinementStep(next);
  }
  return finalizeClaim(extracted, false);
}

function handleRefinementApply(scratch: TelosScratch, args: StepArgs): TelosStepOutcome {
  const refinement = (args.user_answers?.q_refinement ?? "").trim();
  if (refinement.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "telos.refinement requires non-empty q_refinement answer.",
      ),
    };
  }
  const next: TelosScratch = { ...scratch, refinement };
  return issueReExtractStep(next);
}

function handleReExtractApply(scratch: TelosScratch, args: StepArgs): TelosStepOutcome {
  const extraction = parseLlmExtraction(args, "re_extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  // scratch is unused in finalize but kept in handler signatures for symmetry
  void scratch;
  return finalizeClaim(extraction.value, true);
}

function finalizeClaim(extracted: ExtractedTelos, refinementTriggered: boolean): TelosStepOutcome {
  const claim: TelosClaim = {
    statement: extracted.statement,
    served_good: extracted.served_good,
    failure_signal: extracted.failure_signal,
    ...(extracted.success_signal !== undefined ? { success_signal: extracted.success_signal } : {}),
    maturity: "dianoia",
    noun_phrase_refinement_triggered: refinementTriggered,
  };
  const validated = TelosClaimSchema.safeParse(claim);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `telos claim validation failed: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", claim: validated.data };
}

// ─── Helpers ───

function parseLlmExtraction(args: StepArgs, id: string): Result<ExtractedTelos, AgoraErrorThrown> {
  const responses = args.llm_responses;
  if (responses === undefined || responses.length === 0) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `${id}: llm_responses missing.` },
      }),
    );
  }
  const found = responses.find((r) => r.id === id);
  if (found === undefined) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `${id}: no llm_response with id="${id}".` },
      }),
    );
  }
  const obj =
    typeof found.content === "string" ? safeJsonParse(found.content) : (found.content as unknown);
  if (obj === null || typeof obj !== "object") {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `${id}: content is not a JSON object.` },
      }),
    );
  }
  const parsed = TelosExtractionResponseSchema.safeParse(obj);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `${id}: ${parsed.error.issues[0]?.message ?? "schema fail"}` },
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

function buildAristotleInput(scratch: TelosScratch["input"]): AristotleTelosInput {
  return {
    raw_intake: scratch.raw_intake,
    ...(scratch.defended_frame_chosen_form !== undefined
      ? { defended_frame_chosen_form: scratch.defended_frame_chosen_form }
      : {}),
    current_round: scratch.current_round,
  };
}

function serializeScratch(scratch: TelosScratch): Record<string, unknown> {
  // Re-parse to drop unknown keys and produce a plain JSON-shaped object
  // for storage.
  return TelosScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
