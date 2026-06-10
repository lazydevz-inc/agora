// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — §"Tool surface".
//
// StepEnvelope types + zod schemas + small envelope builders. Returned
// by the agora_align_step / agora_ralph_step MCP tools (slices A-E).
// Tool input is also zod-validated here (`AlignStepArgsSchema` etc.) so
// the orchestrator can reject malformed host responses at the boundary.
//
// LAYER 1 (types/result only) — pure data, no I/O.

import { z } from "zod";

// ─── Tool input — host's response on subsequent calls ───

const LlmResponseEntrySchema = z
  .object({
    id: z.string().min(1),
    // String when expect="text" (free-form), object when expect="json"
    // (host already parsed). We accept either + the orchestrator coerces
    // per the pending record's expected shape.
    content: z.union([z.string(), z.record(z.string(), z.unknown())]),
  })
  .strict();
export type LlmResponseEntry = z.infer<typeof LlmResponseEntrySchema>;

export const StepArgsSchema = z
  .object({
    user_answers: z.record(z.string(), z.string()).optional(),
    llm_responses: z.array(LlmResponseEntrySchema).optional(),
  })
  .strict();
export type StepArgs = z.infer<typeof StepArgsSchema>;

// ─── Envelope leaves ───

// The five first-class philosopher modules (CLAUDE.md; adding a 6th
// requires an ADR). Used to attribute a question to the module asking it.
export const PhilosopherIdSchema = z.enum(["husserl", "socrates", "aristotle", "plato", "aquinas"]);
export type PhilosopherId = z.infer<typeof PhilosopherIdSchema>;

export const StepQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    hint: z.string().optional(),
    // Attribution metadata — which philosopher module is asking, and why
    // this question exists (alignment-loop.md round planner's
    // purpose_label; forbidden pattern F2 bans questions without a
    // "why this question" label). The host relay contract requires
    // surfacing BOTH to the user alongside the prompt. Omitted only for
    // loop-policy questions no philosopher owns (e.g. Ralph Z2 confirm
    // carries purpose_label but no philosopher).
    philosopher: PhilosopherIdSchema.optional(),
    purpose_label: z.string().min(1).optional(),
    // Host relay contract: true marks an open-ended examination question
    // (Socratic probe, Noesis test, telos answers). The host MAY draft
    // candidate answers as selectable options, but must present them as
    // suggestions, state that the question is open, invite the user's
    // own thoughts beyond the options, and compose the submitted answer
    // from what the user actually selected/wrote — never substitute
    // reasoning the user didn't voice. (Dogfood 2026-06-10: a host turned
    // the Noesis test into "(Recommended)" multiple choice + self-graded
    // it noesis, so the maturity reloop could never fire.)
    open_question: z.boolean().optional(),
  })
  .strict();
export type StepQuestion = z.infer<typeof StepQuestionSchema>;

export const StepPromptSchema = z
  .object({
    id: z.string().min(1),
    system: z.string().min(1),
    user: z.string().min(1),
    expect: z.enum(["json", "text"]),
    schema_hint: z.string().optional(),
  })
  .strict();
export type StepPrompt = z.infer<typeof StepPromptSchema>;

export const StepLoopSchema = z.enum(["align", "ralph"]);
export type StepLoop = z.infer<typeof StepLoopSchema>;

// ─── Envelope variants ───

export const DoneEnvelopeSchema = z
  .object({
    kind: z.literal("done"),
    loop: StepLoopSchema,
    summary: z.string().min(1),
  })
  .strict();
export type DoneEnvelope = z.infer<typeof DoneEnvelopeSchema>;

export const AdvancedEnvelopeSchema = z
  .object({
    kind: z.literal("advanced"),
    loop: StepLoopSchema,
    step: z.string().min(1),
    message: z.string().min(1),
    state_after: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AdvancedEnvelope = z.infer<typeof AdvancedEnvelopeSchema>;

export const NeedsUserInputEnvelopeSchema = z
  .object({
    kind: z.literal("needs_user_input"),
    loop: StepLoopSchema,
    step: z.string().min(1),
    questions: z.array(StepQuestionSchema).min(1),
  })
  .strict();
export type NeedsUserInputEnvelope = z.infer<typeof NeedsUserInputEnvelopeSchema>;

export const NeedsReasoningEnvelopeSchema = z
  .object({
    kind: z.literal("needs_reasoning"),
    loop: StepLoopSchema,
    step: z.string().min(1),
    prompts: z.array(StepPromptSchema).min(1),
  })
  .strict();
export type NeedsReasoningEnvelope = z.infer<typeof NeedsReasoningEnvelopeSchema>;

export const ErrorEnvelopeSchema = z
  .object({
    kind: z.literal("error"),
    loop: StepLoopSchema,
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const StepEnvelopeSchema = z.discriminatedUnion("kind", [
  DoneEnvelopeSchema,
  AdvancedEnvelopeSchema,
  NeedsUserInputEnvelopeSchema,
  NeedsReasoningEnvelopeSchema,
  ErrorEnvelopeSchema,
]);
export type StepEnvelope = z.infer<typeof StepEnvelopeSchema>;

// ─── Tiny builders (keep call sites legible; nothing more) ───

export function envDone(loop: StepLoop, summary: string): DoneEnvelope {
  return { kind: "done", loop, summary };
}

export function envAdvanced(
  loop: StepLoop,
  step: string,
  message: string,
  state_after?: Record<string, unknown>,
): AdvancedEnvelope {
  return state_after === undefined
    ? { kind: "advanced", loop, step, message }
    : { kind: "advanced", loop, step, message, state_after };
}

export function envNeedsUserInput(
  loop: StepLoop,
  step: string,
  questions: readonly StepQuestion[],
): NeedsUserInputEnvelope {
  return { kind: "needs_user_input", loop, step, questions: [...questions] };
}

export function envNeedsReasoning(
  loop: StepLoop,
  step: string,
  prompts: readonly StepPrompt[],
): NeedsReasoningEnvelope {
  return { kind: "needs_reasoning", loop, step, prompts: [...prompts] };
}

export function envError(loop: StepLoop, code: string, message: string): ErrorEnvelope {
  return { kind: "error", loop, code, message };
}
