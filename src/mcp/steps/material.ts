// SPEC: ADR-0010 (host-reasoning stepped MCP tools) —
//       material state machine.
//
// Aristotle material round (Phase 2, round 3) — simpler than telos/form:
// 3 user questions → 1 LLM extract → MaterialClaim. No refinement loop.
// Q1 phrasing depends on is_brownfield (confirm-detected vs from-scratch).
// brownfield_auto_filled is computed locally from extracted vs detected.
//
// LAYER 2.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import {
  ARISTOTLE_MATERIAL_SYSTEM,
  type AristotleMaterialInput,
  buildMaterialUserPrompt,
  type ExtractedMaterial,
  type MaterialClaim,
  MaterialClaimSchema,
  MaterialExtractionResponseSchema,
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

const MaterialStepInputSchema = z.object({
  telos_statement: z.string().min(1),
  form_essential_structure: z.string().optional(),
  detected_stack: z.array(z.string()),
  is_brownfield: z.boolean(),
  current_round: z.number().int().min(1),
});

const MaterialRawAnswersSchema = z.object({
  stack_confirmation: z.string().min(1),
  data_shape: z.string().min(1),
  infrastructure: z.string().min(1),
});

const MaterialScratchSchema = z.object({
  input: MaterialStepInputSchema,
  raw: MaterialRawAnswersSchema.optional(),
});
type MaterialScratch = z.infer<typeof MaterialScratchSchema>;

export type MaterialStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; claim: MaterialClaim }
  | { type: "error"; envelope: ErrorEnvelope };

export function beginMaterial(input: AristotleMaterialInput): MaterialStepOutcome {
  return issueQuestionsStep({
    input: {
      telos_statement: input.telos_statement,
      detected_stack: [...input.detected_stack],
      is_brownfield: input.is_brownfield,
      current_round: input.current_round,
      ...(input.form_essential_structure !== undefined
        ? { form_essential_structure: input.form_essential_structure }
        : {}),
    },
  });
}

export function advanceMaterial(pending: McpPending, args: StepArgs): MaterialStepOutcome {
  const parsed = MaterialScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `material scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "material.questions":
      return handleQuestionsApply(scratch, args);
    case "material.extract":
      return handleExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown material step: ${pending.step}`,
        ),
      };
  }
}

function issueQuestionsStep(scratch: MaterialScratch): MaterialStepOutcome {
  // Confirm-detected phrasing only makes sense when something WAS detected.
  // A brownfield repo with an empty detected stack (bare git init, non-JS
  // project) was asked to "accept as-is" an empty list — ask from scratch
  // instead. (Dogfood QA 2026-06-10.)
  const confirmDetected = scratch.input.is_brownfield && scratch.input.detected_stack.length > 0;
  const stackPrompt = confirmDetected
    ? localized("cli.material.q_confirm_stack", {
        detected: scratch.input.detected_stack.slice(0, 15).join(", "),
      })
    : localized("cli.material.q_tech_stack_fresh");
  const questions: StepQuestion[] = [
    {
      id: "q_stack",
      prompt: stackPrompt,
      hint: confirmDetected
        ? "confirm + add/remove (comma-separated)"
        : "language + framework + key libs",
    },
    {
      id: "q_data_shape",
      prompt: localized("cli.material.q_data_shape"),
      hint: "one paragraph",
    },
    {
      id: "q_infrastructure",
      prompt: localized("cli.material.q_infrastructure"),
      hint: "where it runs",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "material.questions", questions),
    pending: {
      version: 1,
      owner: "align",
      step: "material.questions",
      expects: "user_answers",
      issued_questions: questions,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: MaterialScratch): MaterialStepOutcome {
  if (scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "material.extract issued without raw answers",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "extract",
      system: ARISTOTLE_MATERIAL_SYSTEM,
      user: buildMaterialUserPrompt(buildAristotleInput(scratch.input), {
        stackConfirmation: scratch.raw.stack_confirmation,
        dataShape: scratch.raw.data_shape,
        infrastructure: scratch.raw.infrastructure,
      }),
      expect: "json",
      schema_hint: "{ tech_stack: string[], data_shape, infrastructure }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "material.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "material.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function handleQuestionsApply(scratch: MaterialScratch, args: StepArgs): MaterialStepOutcome {
  const answers = args.user_answers;
  if (answers === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "material.questions expects user_answers; none provided.",
      ),
    };
  }
  const stackConfirmation = (answers.q_stack ?? "").trim();
  const dataShape = (answers.q_data_shape ?? "").trim();
  const infrastructure = (answers.q_infrastructure ?? "").trim();
  if (stackConfirmation.length === 0 || dataShape.length === 0 || infrastructure.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "material.questions requires non-empty q_stack, q_data_shape, q_infrastructure.",
      ),
    };
  }
  return issueExtractStep({
    ...scratch,
    raw: {
      stack_confirmation: stackConfirmation,
      data_shape: dataShape,
      infrastructure,
    },
  });
}

function handleExtractApply(scratch: MaterialScratch, args: StepArgs): MaterialStepOutcome {
  const extraction = parseLlmExtraction(args, "extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  return finalizeClaim(scratch, extraction.value);
}

function finalizeClaim(
  scratch: MaterialScratch,
  extracted: ExtractedMaterial,
): MaterialStepOutcome {
  // brownfield_auto_filled: brownfield + every detected entry retained.
  const detectedSet = new Set(scratch.input.detected_stack.map((s) => s.toLowerCase()));
  const extractedSet = new Set(extracted.tech_stack.map((s) => s.toLowerCase()));
  const allDetectedKept =
    scratch.input.is_brownfield &&
    scratch.input.detected_stack.length > 0 &&
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
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `material claim validation failed: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", claim: validated.data };
}

function parseLlmExtraction(
  args: StepArgs,
  id: string,
): Result<ExtractedMaterial, AgoraErrorThrown> {
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
  const parsed = MaterialExtractionResponseSchema.safeParse(obj);
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

function buildAristotleInput(input: MaterialScratch["input"]): AristotleMaterialInput {
  return {
    telos_statement: input.telos_statement,
    detected_stack: input.detected_stack,
    is_brownfield: input.is_brownfield,
    current_round: input.current_round,
    ...(input.form_essential_structure !== undefined
      ? { form_essential_structure: input.form_essential_structure }
      : {}),
  };
}

function serializeScratch(scratch: MaterialScratch): Record<string, unknown> {
  return MaterialScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
