// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — acceptance-
//       criteria capture state machine.
//
// Simplest cause: 1 free-text user question → 1 LLM extract →
// AcceptanceCriteriaResult. The cleanup work (dedup, split compounds,
// drop bullets) lives entirely in the LLM prompt; the orchestrator
// only assigns ac_NNN ids.
//
// LAYER 2.

import { z } from "zod";

import {
  AC_EXTRACT_SYSTEM,
  type AcCaptureInput,
  type AcceptanceCriteriaResult,
  AcceptanceCriteriaResultSchema,
  type AcceptanceCriterion,
  AcExtractionResponseSchema,
  buildAcUserPrompt,
  type ExtractedAcs,
  formatAcId,
} from "../../alignment/acceptance-criteria.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
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

const AcStepInputSchema = z.object({
  telos_statement: z.string().min(1),
  form_essential_structure: z.string().min(1),
});

const AcScratchSchema = z.object({
  input: AcStepInputSchema,
  raw_input: z.string().min(1).optional(),
});
type AcScratch = z.infer<typeof AcScratchSchema>;

export type AcStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; result: AcceptanceCriteriaResult }
  | { type: "error"; envelope: ErrorEnvelope };

export function beginAc(input: AcCaptureInput): AcStepOutcome {
  return issueAskStep({ input });
}

export function advanceAc(pending: McpPending, args: StepArgs): AcStepOutcome {
  const parsed = AcScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `ac scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "ac.ask":
      return handleAskApply(scratch, args);
    case "ac.extract":
      return handleExtractApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown ac step: ${pending.step}`,
        ),
      };
  }
}

function issueAskStep(scratch: AcScratch): AcStepOutcome {
  const question: StepQuestion = {
    id: "q_acs_list",
    prompt: localized("cli.ac.q_acs_list", {
      telos: scratch.input.telos_statement,
      form: scratch.input.form_essential_structure,
    }),
    hint: "one per line, or comma-separated; bullets are fine",
    // Round-planner attribution: AC drafting is Aristotle's round
    // (alignment-loop.md §Round-planner, "Aristotle.ac_drafter").
    philosopher: "aristotle",
    purpose_label: localized("cli.ac.purpose_q_acs_list"),
    open_question: true,
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "ac.ask", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "ac.ask",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueExtractStep(scratch: AcScratch): AcStepOutcome {
  if (scratch.raw_input === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "ac.extract issued without raw_input",
      ),
    };
  }
  const prompts: StepPrompt[] = [
    {
      id: "extract",
      system: AC_EXTRACT_SYSTEM,
      user: buildAcUserPrompt(scratch.input, scratch.raw_input),
      expect: "json",
      schema_hint: '{ criteria: [{ content: "<single testable condition>" }] }',
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "ac.extract", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "ac.extract",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function handleAskApply(scratch: AcScratch, args: StepArgs): AcStepOutcome {
  const raw = (args.user_answers?.q_acs_list ?? "").trim();
  if (raw.length === 0) {
    return {
      type: "error",
      envelope: envError("align", "user.aborted", "ac.ask: q_acs_list is empty."),
    };
  }
  return issueExtractStep({ ...scratch, raw_input: raw });
}

function handleExtractApply(scratch: AcScratch, args: StepArgs): AcStepOutcome {
  if (scratch.raw_input === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "ac.extract: raw_input missing from scratch",
      ),
    };
  }
  const extraction = parseExtraction(args, "extract");
  if (!extraction.ok) {
    return {
      type: "error",
      envelope: envError("align", extraction.error.code, extraction.error.message),
    };
  }
  const criteria: AcceptanceCriterion[] = extraction.value.criteria.map((c, i) => ({
    id: formatAcId(i + 1),
    content: c.content,
  }));
  const result: AcceptanceCriteriaResult = {
    criteria,
    raw_input: scratch.raw_input,
    created_at: new Date().toISOString(),
  };
  const validated = AcceptanceCriteriaResultSchema.safeParse(result);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        `ac result schema fail: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", result: validated.data };
}

function parseExtraction(args: StepArgs, id: string): Result<ExtractedAcs, AgoraErrorThrown> {
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
  const parsed = AcExtractionResponseSchema.safeParse(obj);
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

function serializeScratch(scratch: AcScratch): Record<string, unknown> {
  return AcScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
