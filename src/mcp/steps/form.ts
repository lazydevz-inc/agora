// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — form state machine.
//
// Aristotle form round (Phase 2, round 2) — 4-step state machine that
// mirrors telos: 2 user questions → extract → optional refinement → optional
// re-extract → FormClaim. Triggers feature-list rebuttal (F-Aristotle-3)
// instead of telos's noun-phrase rebuttal.
//
// LAYER 2.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import {
  ARISTOTLE_FORM_SYSTEM,
  type AristotleFormInput,
  buildFormUserPrompt,
  type FormClaim,
  FormClaimSchema,
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

const FormStepInputSchema = z.object({
  telos_statement: z.string().min(1),
  defended_frame_chosen_form: z.string().optional(),
  current_round: z.number().int().min(1),
});

const FormRawAnswersSchema = z.object({
  essential_structure: z.string().min(1),
  irreducible_parts_raw: z.string().min(1),
});

const FormExtractionResponseSchema = z.object({
  essential_structure: z.string().min(1),
  irreducible_parts: z.array(z.string().min(1)).min(1),
  feature_list_warning: z.boolean(),
  feature_list_reason: z.string().optional(),
});
type ExtractedForm = z.infer<typeof FormExtractionResponseSchema>;

const FormScratchSchema = z.object({
  input: FormStepInputSchema,
  raw: FormRawAnswersSchema.optional(),
  first_extraction: FormExtractionResponseSchema.optional(),
  refinement: z.string().min(1).optional(),
});
type FormScratch = z.infer<typeof FormScratchSchema>;

export type FormStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; claim: FormClaim }
  | { type: "error"; envelope: ErrorEnvelope };

export function beginForm(input: AristotleFormInput): FormStepOutcome {
  return issueQuestionsStep({ input });
}

export function advanceForm(pending: McpPending, args: StepArgs): FormStepOutcome {
  const parsed = FormScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `form scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "form.questions":
      return handleQuestionsApply(scratch, args);
    case "form.extract":
      return handleExtractApply(scratch, args);
    case "form.refinement":
      return handleRefinementApply(scratch, args);
    case "form.re_extract":
      return handleReExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown form step: ${pending.step}`,
        ),
      };
  }
}

// ─── Issuers ───

function issueQuestionsStep(scratch: FormScratch): FormStepOutcome {
  const questions: StepQuestion[] = [
    {
      id: "q_essential_structure",
      prompt: localized("cli.form.q_essential_structure", { telos: scratch.input.telos_statement }),
      hint: "high-level structure, not feature list",
      philosopher: "aristotle",
      purpose_label: localized("cli.form.purpose_q_essential_structure"),
      open_question: true,
    },
    {
      id: "q_irreducible_parts",
      prompt: localized("cli.form.q_irreducible_parts"),
      hint: "comma-separated list",
      philosopher: "aristotle",
      purpose_label: localized("cli.form.purpose_q_irreducible_parts"),
      open_question: true,
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "form.questions", questions),
    pending: {
      version: 1,
      owner: "align",
      step: "form.questions",
      expects: "user_answers",
      issued_questions: questions,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: FormScratch): FormStepOutcome {
  if (scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "form.extract issued without raw answers",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "extract",
      system: ARISTOTLE_FORM_SYSTEM,
      user: buildFormUserPrompt(buildAristotleInput(scratch.input), {
        essentialStructure: scratch.raw.essential_structure,
        irreduciblePartsRaw: scratch.raw.irreducible_parts_raw,
      }),
      expect: "json",
      schema_hint:
        "{ essential_structure, irreducible_parts: string[], feature_list_warning: bool, feature_list_reason? }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "form.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "form.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueRefinementStep(scratch: FormScratch): FormStepOutcome {
  if (scratch.first_extraction === undefined || scratch.raw === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "form.refinement issued without first_extraction or raw",
      ),
    };
  }
  const reason =
    scratch.first_extraction.feature_list_reason ??
    "Q2 read as a feature catalog rather than structural components.";
  const question: StepQuestion = {
    id: "q_refinement",
    prompt: localized("cli.form.q_feature_list_refinement"),
    hint: `Re-articulate without listing features (${reason})`,
    philosopher: "aristotle",
    purpose_label: localized("cli.form.purpose_q_refinement"),
    open_question: true,
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "form.refinement", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "form.refinement",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueReExtractStep(scratch: FormScratch): FormStepOutcome {
  if (scratch.raw === undefined || scratch.refinement === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "form.re_extract issued without raw or refinement",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "re_extract",
      system: ARISTOTLE_FORM_SYSTEM,
      user: buildFormUserPrompt(buildAristotleInput(scratch.input), {
        essentialStructure: scratch.raw.essential_structure,
        irreduciblePartsRaw: scratch.raw.irreducible_parts_raw,
        refinement: scratch.refinement,
      }),
      expect: "json",
      schema_hint:
        "{ essential_structure, irreducible_parts: string[], feature_list_warning: bool, feature_list_reason? }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "form.re_extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "form.re_extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Appliers ───

function handleQuestionsApply(scratch: FormScratch, args: StepArgs): FormStepOutcome {
  const answers = args.user_answers;
  if (answers === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "form.questions expects user_answers; none provided.",
      ),
    };
  }
  const essentialStructure = (answers.q_essential_structure ?? "").trim();
  const irreduciblePartsRaw = (answers.q_irreducible_parts ?? "").trim();
  if (essentialStructure.length === 0 || irreduciblePartsRaw.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "form.questions requires non-empty q_essential_structure and q_irreducible_parts.",
      ),
    };
  }
  return issueExtractStep({
    ...scratch,
    raw: { essential_structure: essentialStructure, irreducible_parts_raw: irreduciblePartsRaw },
  });
}

function handleExtractApply(scratch: FormScratch, args: StepArgs): FormStepOutcome {
  const extraction = parseLlmExtraction(args, "extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  const extracted = extraction.value;
  if (extracted.feature_list_warning) {
    return issueRefinementStep({ ...scratch, first_extraction: extracted });
  }
  return finalizeClaim(extracted, false);
}

function handleRefinementApply(scratch: FormScratch, args: StepArgs): FormStepOutcome {
  const refinement = (args.user_answers?.q_refinement ?? "").trim();
  if (refinement.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        "form.refinement requires non-empty q_refinement answer.",
      ),
    };
  }
  return issueReExtractStep({ ...scratch, refinement });
}

function handleReExtractApply(scratch: FormScratch, args: StepArgs): FormStepOutcome {
  const extraction = parseLlmExtraction(args, "re_extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  void scratch;
  return finalizeClaim(extraction.value, true);
}

function finalizeClaim(extracted: ExtractedForm, warningTriggered: boolean): FormStepOutcome {
  const claim: FormClaim = {
    essential_structure: extracted.essential_structure,
    irreducible_parts: extracted.irreducible_parts,
    feature_list_warning_triggered: warningTriggered,
    maturity: "dianoia",
  };
  const validated = FormClaimSchema.safeParse(claim);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `form claim validation failed: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", claim: validated.data };
}

// ─── Helpers ───

function parseLlmExtraction(args: StepArgs, id: string): Result<ExtractedForm, AgoraErrorThrown> {
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
  const parsed = FormExtractionResponseSchema.safeParse(obj);
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

function buildAristotleInput(input: FormScratch["input"]): AristotleFormInput {
  return {
    telos_statement: input.telos_statement,
    ...(input.defended_frame_chosen_form !== undefined
      ? { defended_frame_chosen_form: input.defended_frame_chosen_form }
      : {}),
    current_round: input.current_round,
  };
}

function serializeScratch(scratch: FormScratch): Record<string, unknown> {
  return FormScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
