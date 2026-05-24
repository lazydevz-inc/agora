// SPEC: ADR-0010 (host-reasoning stepped MCP tools) +
//       docs/philosophers/runbooks/plato.md §3.2 (Divided Line) —
//       maturity state machine.
//
// 4-cause sequential Noesis test. Per cause:
//   maturity.ask     → host asks the user one Noesis question
//   maturity.extract → host reasons about the response (1 LLM call)
//                      and returns tagged_maturity + rejected_alternatives
// After all 4 causes processed → complete with PlatoMaturityResult.
//
// LAYER 2.

import { z } from "zod";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { MaturitySchema } from "../../philosophers/aristotle.js";
import {
  buildDLUserPrompt,
  CauseFieldPath,
  type ExtractedDLTag,
  MATURITY_ORDER,
  PLATO_DL_SYSTEM,
  type PlatoDLPerCauseOutput,
  PlatoDLPerCauseOutputSchema,
  type PlatoMaturityResult,
  PlatoMaturityResultSchema,
  REQUIRED_FLOORS,
  RejectedAlternativeSchema,
} from "../../philosophers/plato.js";
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

const CauseEntrySchema = z.object({
  field_path: CauseFieldPath,
  claim_content: z.string().min(1),
});

const PlatoExtractionResponseSchema = z.object({
  tagged_maturity: MaturitySchema,
  rejected_alternatives: z.array(RejectedAlternativeSchema).default([]),
});

const MaturityScratchSchema = z.object({
  causes: z.array(CauseEntrySchema).length(4),
  current_cause_index: z.number().int().min(0).max(4),
  current_user_response: z.string().optional(),
  per_cause_outputs: z.array(PlatoDLPerCauseOutputSchema),
});
type MaturityScratch = z.infer<typeof MaturityScratchSchema>;

export type MaturityStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; result: PlatoMaturityResult }
  | { type: "error"; envelope: ErrorEnvelope };

export interface MaturityStepInput {
  readonly causes: readonly {
    field_path: PlatoDLPerCauseOutput["field_path"];
    claim_content: string;
  }[];
}

export function beginMaturity(input: MaturityStepInput): MaturityStepOutcome {
  if (input.causes.length !== 4) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `maturity expects 4 causes, got ${String(input.causes.length)}`,
      ),
    };
  }
  const scratch: MaturityScratch = {
    causes: [...input.causes],
    current_cause_index: 0,
    per_cause_outputs: [],
  };
  return issueAskStep(scratch);
}

export function advanceMaturity(pending: McpPending, args: StepArgs): MaturityStepOutcome {
  const parsed = MaturityScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `maturity scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "maturity.ask":
      return handleAskApply(scratch, args);
    case "maturity.extract":
      return handleExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown maturity step: ${pending.step}`,
        ),
      };
  }
}

// ─── Issuers ───

function issueAskStep(scratch: MaturityScratch): MaturityStepOutcome {
  const cause = scratch.causes[scratch.current_cause_index];
  if (cause === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "maturity.ask: current_cause_index out of range",
      ),
    };
  }
  const required = REQUIRED_FLOORS[cause.field_path];
  const question: StepQuestion = {
    id: "q_noesis",
    prompt: localized("cli.maturity.q_noesis_test", {
      field_path: cause.field_path,
      claim_content: cause.claim_content,
      required_floor: required,
    }),
    hint: 'Name the alternative + why-rejected (≥ 2 sentences for "noesis").',
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "maturity.ask", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "maturity.ask",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: MaturityScratch): MaturityStepOutcome {
  const cause = scratch.causes[scratch.current_cause_index];
  if (cause === undefined || scratch.current_user_response === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "maturity.extract issued without cause or user_response",
      ),
    };
  }
  const required = REQUIRED_FLOORS[cause.field_path];
  const prompts: StepPrompt[] = [
    {
      id: "tag",
      system: PLATO_DL_SYSTEM,
      user: buildDLUserPrompt(
        {
          field_path: cause.field_path,
          claim_content: cause.claim_content,
          required_floor: required,
        },
        scratch.current_user_response,
      ),
      expect: "json",
      schema_hint: '{ tagged_maturity: "pistis"|"dianoia"|"noesis", rejected_alternatives: [] }',
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "maturity.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "maturity.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Appliers ───

function handleAskApply(scratch: MaturityScratch, args: StepArgs): MaturityStepOutcome {
  const response = (args.user_answers?.q_noesis ?? "").trim();
  if (response.length === 0) {
    return {
      type: "error",
      envelope: envError("align", "user.aborted", "maturity.ask: q_noesis is empty."),
    };
  }
  return issueExtractStep({ ...scratch, current_user_response: response });
}

function handleExtractApply(scratch: MaturityScratch, args: StepArgs): MaturityStepOutcome {
  const extraction = parseExtraction(args, "tag");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  const cause = scratch.causes[scratch.current_cause_index];
  if (cause === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "maturity.extract: cursor out of range",
      ),
    };
  }
  const required = REQUIRED_FLOORS[cause.field_path];
  const passed = MATURITY_ORDER[extraction.value.tagged_maturity] >= MATURITY_ORDER[required];
  const perCause: PlatoDLPerCauseOutput = {
    field_path: cause.field_path,
    tagged_maturity: extraction.value.tagged_maturity,
    required_floor: required,
    passed,
    rejected_alternatives: extraction.value.rejected_alternatives,
    ...(passed ? {} : { reloop_directive_field: cause.field_path }),
  };
  const validated = PlatoDLPerCauseOutputSchema.safeParse(perCause);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `maturity per-cause schema fail: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  const nextScratch: MaturityScratch = {
    ...scratch,
    per_cause_outputs: [...scratch.per_cause_outputs, validated.data],
    current_cause_index: scratch.current_cause_index + 1,
  };
  const cleared: MaturityScratch = { ...nextScratch };
  delete (cleared as Partial<MaturityScratch>).current_user_response;
  return advanceCursor(cleared);
}

function advanceCursor(scratch: MaturityScratch): MaturityStepOutcome {
  if (scratch.current_cause_index >= scratch.causes.length) {
    const failing = scratch.per_cause_outputs.filter((c) => !c.passed).map((c) => c.field_path);
    const result: PlatoMaturityResult = {
      per_cause: scratch.per_cause_outputs,
      all_passed: failing.length === 0,
      failing_causes: failing,
      created_at: new Date().toISOString(),
    };
    const validated = PlatoMaturityResultSchema.safeParse(result);
    if (!validated.success) {
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `maturity result schema fail: ${validated.error.issues[0]?.message ?? "?"}`,
        ),
      };
    }
    return { type: "complete", result: validated.data };
  }
  return issueAskStep(scratch);
}

// ─── Helpers ───

function parseExtraction(args: StepArgs, id: string): Result<ExtractedDLTag, AgoraErrorThrown> {
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
  const parsed = PlatoExtractionResponseSchema.safeParse(obj);
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

function serializeScratch(scratch: MaturityScratch): Record<string, unknown> {
  return MaturityScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
