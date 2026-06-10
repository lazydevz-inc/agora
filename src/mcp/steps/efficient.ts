// SPEC: ADR-0010 (host-reasoning stepped MCP tools) —
//       efficient state machine.
//
// Aristotle efficient round (Phase 2, round 4 — final Aristotle cause).
// Simplest pattern: 3 user questions → 1 LLM extract → EfficientClaim.
// No refinement loop, no auto-fill computation.
//
// LAYER 2.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import {
  ARISTOTLE_EFFICIENT_SYSTEM,
  type AristotleEfficientInput,
  buildEfficientUserPrompt,
  type EfficientClaim,
  EfficientClaimSchema,
  EfficientExtractionResponseSchema,
  type ExtractedEfficient,
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

const EfficientStepInputSchema = z.object({
  telos_statement: z.string().min(1),
  form_essential_structure: z.string().optional(),
  material_tech_stack: z.array(z.string()).optional(),
  detected_patterns: z.array(z.string()),
  current_round: z.number().int().min(1),
});

const EfficientRawAnswersSchema = z.object({
  who: z.string().min(1),
  when: z.string().min(1),
  how: z.string().min(1),
});

const EfficientScratchSchema = z.object({
  input: EfficientStepInputSchema,
  raw: EfficientRawAnswersSchema.optional(),
});
type EfficientScratch = z.infer<typeof EfficientScratchSchema>;

export type EfficientStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; claim: EfficientClaim }
  | { type: "error"; envelope: ErrorEnvelope };

export function beginEfficient(input: AristotleEfficientInput): EfficientStepOutcome {
  return issueQuestionsStep({
    input: {
      telos_statement: input.telos_statement,
      detected_patterns: [...input.detected_patterns],
      current_round: input.current_round,
      ...(input.form_essential_structure !== undefined
        ? { form_essential_structure: input.form_essential_structure }
        : {}),
      ...(input.material_tech_stack !== undefined
        ? { material_tech_stack: [...input.material_tech_stack] }
        : {}),
    },
  });
}

export function advanceEfficient(pending: McpPending, args: StepArgs): EfficientStepOutcome {
  const parsed = EfficientScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `efficient scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "efficient.questions":
      return handleQuestionsApply(scratch, args);
    case "efficient.extract":
      return handleExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown efficient step: ${pending.step}`,
        ),
      };
  }
}

function issueQuestionsStep(scratch: EfficientScratch): EfficientStepOutcome {
  const questions: StepQuestion[] = [
    {
      id: "q_who",
      prompt: localized("cli.efficient.q_who"),
      hint: "solo / team of N / me + 1 reviewer",
      philosopher: "aristotle",
      purpose_label: localized("cli.efficient.purpose_q_who"),
      open_question: true,
    },
    {
      id: "q_when",
      prompt: localized("cli.efficient.q_when"),
      hint: "evenings, 30 min sessions / full-time, 2-week sprints",
      philosopher: "aristotle",
      purpose_label: localized("cli.efficient.purpose_q_when"),
      open_question: true,
    },
    {
      id: "q_how",
      prompt: localized("cli.efficient.q_how"),
      hint: "TDD with vitest, deploy on push",
      philosopher: "aristotle",
      purpose_label: localized("cli.efficient.purpose_q_how"),
      open_question: true,
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "efficient.questions", questions),
    pending: {
      version: 1,
      owner: "align",
      step: "efficient.questions",
      expects: "user_answers",
      issued_questions: questions,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: EfficientScratch): EfficientStepOutcome {
  if (scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "efficient.extract issued without raw answers",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "extract",
      system: ARISTOTLE_EFFICIENT_SYSTEM,
      user: buildEfficientUserPrompt(buildAristotleInput(scratch.input), {
        who: scratch.raw.who,
        when: scratch.raw.when,
        how: scratch.raw.how,
      }),
      expect: "json",
      schema_hint: "{ who, when, how }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "efficient.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "efficient.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function handleQuestionsApply(scratch: EfficientScratch, args: StepArgs): EfficientStepOutcome {
  const answers = args.user_answers;
  if (answers === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "efficient.questions expects user_answers; none provided.",
      ),
    };
  }
  const who = (answers.q_who ?? "").trim();
  const when = (answers.q_when ?? "").trim();
  const how = (answers.q_how ?? "").trim();
  if (who.length === 0 || when.length === 0 || how.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "efficient.questions requires non-empty q_who, q_when, q_how.",
      ),
    };
  }
  return issueExtractStep({ ...scratch, raw: { who, when, how } });
}

function handleExtractApply(scratch: EfficientScratch, args: StepArgs): EfficientStepOutcome {
  const extraction = parseLlmExtraction(args, "extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  void scratch;
  return finalizeClaim(extraction.value);
}

function finalizeClaim(extracted: ExtractedEfficient): EfficientStepOutcome {
  const claim: EfficientClaim = {
    who: extracted.who,
    when: extracted.when,
    how: extracted.how,
    maturity: "pistis",
  };
  const validated = EfficientClaimSchema.safeParse(claim);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `efficient claim validation failed: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", claim: validated.data };
}

function parseLlmExtraction(
  args: StepArgs,
  id: string,
): Result<ExtractedEfficient, AgoraErrorThrown> {
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
  const parsed = EfficientExtractionResponseSchema.safeParse(obj);
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

function buildAristotleInput(input: EfficientScratch["input"]): AristotleEfficientInput {
  return {
    telos_statement: input.telos_statement,
    detected_patterns: input.detected_patterns,
    current_round: input.current_round,
    ...(input.form_essential_structure !== undefined
      ? { form_essential_structure: input.form_essential_structure }
      : {}),
    ...(input.material_tech_stack !== undefined
      ? { material_tech_stack: input.material_tech_stack }
      : {}),
  };
}

function serializeScratch(scratch: EfficientScratch): Record<string, unknown> {
  return EfficientScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
