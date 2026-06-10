// SPEC: ADR-0010 Slice E + docs/loops/ralph-loop.md (Gate 3+4 Aquinas
//       Disputatio) — disputatio state machine.
//
// 4-stage protocol broken into MCP steps:
//
//   disputatio.videtur     — host reasons about N critic prompts in
//                            parallel (one StepPrompt per selected
//                            critic; the host returns N llm_responses).
//   disputatio.sed_contra  — single counter-position synthesis (1 LLM).
//   disputatio.respondeo   — independent verdict (1 LLM). F-Aquinas-3
//                            enforced server-side via the existing
//                            RESPONDEO_SYSTEM prompt.
//   disputatio.ad_singula  — per-objection ruling (1 LLM). Skipped if
//                            videtur produced zero objections.
//
// Output: DisputatioResult. F-Aquinas-4 ("every objection gets exactly
// one ruling") is enforced before complete.
//
// LAYER 2.

import { z } from "zod";

import type { CriticDef } from "../../critics/types.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { PromptKey } from "../../prompts/_generated.js";
import { renderPrompt } from "../../prompts/index.js";
import {
  AD_SINGULA_SYSTEM,
  AdSingulaResponseSchema,
  AdSingulaRulingSchema,
  CriticResponseSchema,
  type DisputatioResult,
  DisputatioResultSchema,
  type Objection,
  ObjectionSchema,
  RESPONDEO_SYSTEM,
  RespondeoSchema,
  renderObjections,
  SED_CONTRA_SYSTEM,
  SedContraResponseSchema,
  stampObjectionIds,
  type VideturPerCritic,
  VideturPerCriticSchema,
} from "../../ralph/disputatio.js";
import { err, ok, type Result } from "../../result/index.js";
import type { McpPending } from "../pending.js";
import type { ErrorEnvelope, NeedsReasoningEnvelope, StepArgs, StepPrompt } from "../step.js";
import { envError, envNeedsReasoning } from "../step.js";

const DisputatioScratchSchema = z.object({
  leaf_id: z.string().min(1),
  leaf_content: z.string().min(1),
  telos_statement: z.string().min(1),
  telos_failure_signal: z.string().min(1),
  all_acceptance_criteria: z.array(z.object({ id: z.string(), content: z.string() })),
  completed_leaves_summary: z.string(),
  diff: z.string(),
  diff_source: z.string(),
  critic_ids: z.array(z.string().min(1)).min(1),
  videtur_results: z.array(VideturPerCriticSchema).optional(),
  sed_contra: z.string().optional(),
  respondeo: RespondeoSchema.optional(),
  ad_singula: z.array(AdSingulaRulingSchema).optional(),
});
type DisputatioScratch = z.infer<typeof DisputatioScratchSchema>;

export type DisputatioStepOutcome =
  | {
      type: "issue";
      envelope: NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; result: DisputatioResult }
  | { type: "error"; envelope: ErrorEnvelope };

export interface DisputatioStepInput {
  readonly leaf_id: string;
  readonly leaf_content: string;
  readonly telos_statement: string;
  readonly telos_failure_signal: string;
  readonly all_acceptance_criteria: readonly { id: string; content: string }[];
  readonly completed_leaves_summary: string;
  readonly diff: string;
  readonly diff_source: string;
  readonly critics: readonly CriticDef[];
}

export function beginDisputatio(input: DisputatioStepInput): DisputatioStepOutcome {
  if (input.critics.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        "Disputatio: no critics matched context (always-trigger universal expected).",
      ),
    };
  }
  const scratch: DisputatioScratch = {
    leaf_id: input.leaf_id,
    leaf_content: input.leaf_content,
    telos_statement: input.telos_statement,
    telos_failure_signal: input.telos_failure_signal,
    all_acceptance_criteria: [...input.all_acceptance_criteria],
    completed_leaves_summary: input.completed_leaves_summary,
    diff: input.diff,
    diff_source: input.diff_source,
    critic_ids: input.critics.map((c) => c.id),
  };
  return issueVideturStep(scratch);
}

export function advanceDisputatio(pending: McpPending, args: StepArgs): DisputatioStepOutcome {
  const parsed = DisputatioScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "state.corrupt",
        `disputatio scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "disputatio.videtur":
      return handleVideturApply(scratch, args);
    case "disputatio.sed_contra":
      return handleSedContraApply(scratch, args);
    case "disputatio.respondeo":
      return handleRespondeoApply(scratch, args);
    case "disputatio.ad_singula":
      return handleAdSingulaApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "ralph",
          "internal.invariant-violation",
          `Unknown disputatio step: ${pending.step}`,
        ),
      };
  }
}

// ─── Issuers ───

function issueVideturStep(scratch: DisputatioScratch): DisputatioStepOutcome {
  const acsRendered = scratch.all_acceptance_criteria
    .map((ac) => `- ${ac.id}: ${ac.content}`)
    .join("\n");
  const ctx: Record<string, string> = {
    leaf_id: scratch.leaf_id,
    leaf_content: scratch.leaf_content,
    telos_statement: scratch.telos_statement,
    telos_failure_signal: scratch.telos_failure_signal,
    all_acceptance_criteria: acsRendered,
    completed_leaves_summary: scratch.completed_leaves_summary,
    diff: scratch.diff,
    diff_source: scratch.diff_source,
  };
  const prompts: StepPrompt[] = [];
  for (const criticId of scratch.critic_ids) {
    const key = `critic:${criticId}` as PromptKey;
    const rendered = renderPrompt(key, ctx);
    if (!rendered.ok) {
      return {
        type: "error",
        envelope: envError(
          "ralph",
          rendered.error.code,
          `disputatio.videtur: render failed for critic ${criticId}: ${rendered.error.message}`,
        ),
      };
    }
    prompts.push({
      id: criticId,
      system: rendered.value.system,
      user: rendered.value.user,
      expect: "json",
      schema_hint:
        '{ objections: [{ id, claim, evidence, severity: "minor"|"major"|"critical" }], no_objections_reason? }',
    });
  }
  return {
    type: "issue",
    envelope: envNeedsReasoning("ralph", "disputatio.videtur", prompts),
    pending: {
      version: 1,
      owner: "ralph",
      step: "disputatio.videtur",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueSedContraStep(scratch: DisputatioScratch): DisputatioStepOutcome {
  if (scratch.videtur_results === undefined) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        "disputatio.sed_contra issued without videtur_results",
      ),
    };
  }
  const allObjections = collectObjections(scratch.videtur_results);
  const objectionsRendered = renderObjections(allObjections);
  const user = `Proposition: implement leaf "${scratch.leaf_id}" — "${scratch.leaf_content}"

Settled telos: "${scratch.telos_statement}"

Objections raised in Videtur:
${objectionsRendered.length > 0 ? objectionsRendered : "(no objections raised)"}

Synthesize ONE counter-position paragraph per the rules.`;
  const prompts: StepPrompt[] = [
    {
      id: "sed_contra",
      system: SED_CONTRA_SYSTEM,
      user,
      expect: "json",
      schema_hint: '{ sed_contra: "<single paragraph>" }',
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("ralph", "disputatio.sed_contra", prompts),
    pending: {
      version: 1,
      owner: "ralph",
      step: "disputatio.sed_contra",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueRespondeoStep(scratch: DisputatioScratch): DisputatioStepOutcome {
  if (scratch.videtur_results === undefined || scratch.sed_contra === undefined) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        "disputatio.respondeo issued without videtur_results / sed_contra",
      ),
    };
  }
  const allObjections = collectObjections(scratch.videtur_results);
  const objectionsRendered = renderObjections(allObjections);
  const user = `Proposition: implement leaf "${scratch.leaf_id}" — "${scratch.leaf_content}"

Settled telos: "${scratch.telos_statement}"
Failure signal: "${scratch.telos_failure_signal}"

Videtur objections (${String(allObjections.length)} total):
${objectionsRendered.length > 0 ? objectionsRendered : "(none)"}

Sed contra:
${scratch.sed_contra}

Now produce your INDEPENDENT Respondeo per the rules. First paragraph
MUST NOT reference Videtur or Sed contra (F-Aquinas-3).`;
  const prompts: StepPrompt[] = [
    {
      id: "respondeo",
      system: RESPONDEO_SYSTEM,
      user,
      expect: "json",
      schema_hint: '{ verdict: "approved"|"conditional"|"rejected", reasoning }',
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("ralph", "disputatio.respondeo", prompts),
    pending: {
      version: 1,
      owner: "ralph",
      step: "disputatio.respondeo",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueAdSingulaStep(scratch: DisputatioScratch): DisputatioStepOutcome {
  if (scratch.videtur_results === undefined || scratch.respondeo === undefined) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        "disputatio.ad_singula issued without videtur_results / respondeo",
      ),
    };
  }
  const allObjections = collectObjections(scratch.videtur_results);
  const objectionsWithIds = allObjections
    .map((o) => `- ${o.id} (${o.severity}): ${o.claim} — Evidence: ${o.evidence}`)
    .join("\n");
  const user = `Leaf: ${scratch.leaf_id} — "${scratch.leaf_content}"

Objections from Videtur (${String(allObjections.length)} total):
${objectionsWithIds}

Respondeo verdict: ${scratch.respondeo.verdict}
Respondeo reasoning: ${scratch.respondeo.reasoning}

For EACH objection above (${String(allObjections.length)} total), produce
ONE ruling per the rules. Return rulings array with exactly ${String(allObjections.length)}
entries.`;
  const prompts: StepPrompt[] = [
    {
      id: "ad_singula",
      system: AD_SINGULA_SYSTEM,
      user,
      expect: "json",
      schema_hint:
        '{ rulings: [{ objection_id, ruling: "concedo"|"distinguo"|"nego", action_or_reason }] }',
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("ralph", "disputatio.ad_singula", prompts),
    pending: {
      version: 1,
      owner: "ralph",
      step: "disputatio.ad_singula",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Appliers ───

function handleVideturApply(scratch: DisputatioScratch, args: StepArgs): DisputatioStepOutcome {
  const responses = args.llm_responses ?? [];
  const results: VideturPerCritic[] = [];
  for (const criticId of scratch.critic_ids) {
    const found = responses.find((r) => r.id === criticId);
    if (found === undefined) {
      return {
        type: "error",
        envelope: envError(
          "ralph",
          "llm.invalid-response",
          `disputatio.videtur: missing llm_response for critic "${criticId}".`,
        ),
      };
    }
    const obj =
      typeof found.content === "string" ? safeJsonParse(found.content) : (found.content as unknown);
    if (obj === null || typeof obj !== "object") {
      return {
        type: "error",
        envelope: envError(
          "ralph",
          "llm.invalid-response",
          `disputatio.videtur (${criticId}): content is not a JSON object.`,
        ),
      };
    }
    const parsed = CriticResponseSchema.safeParse(obj);
    if (!parsed.success) {
      return {
        type: "error",
        envelope: envError(
          "ralph",
          "llm.invalid-response",
          `disputatio.videtur (${criticId}): ${parsed.error.issues[0]?.message ?? "schema fail"}`,
        ),
      };
    }
    const objections = stampObjectionIds(criticId, parsed.data.objections).map((o) =>
      ObjectionSchema.parse(o),
    );
    results.push(
      VideturPerCriticSchema.parse({
        critic_id: criticId,
        objections,
        ...(parsed.data.no_objections_reason !== undefined
          ? { no_objections_reason: parsed.data.no_objections_reason }
          : {}),
      }),
    );
  }
  // Zero objections across every critic: Sed contra ("the strongest case
  // FOR despite the objections") has nothing to argue against — issuing it
  // would ask the host to argue with nobody (and burn a reasoning
  // round-trip per clean leaf). Skip straight to Respondeo; the verdict is
  // still owed. Ad singula already skips on zero objections.
  if (collectObjections(results).length === 0) {
    return issueRespondeoStep({
      ...scratch,
      videtur_results: results,
      sed_contra: "(no objections raised — Sed contra vacuous, skipped)",
    });
  }
  return issueSedContraStep({ ...scratch, videtur_results: results });
}

function handleSedContraApply(scratch: DisputatioScratch, args: StepArgs): DisputatioStepOutcome {
  const parsed = parseJsonResponse(args, "sed_contra", SedContraResponseSchema);
  if (!parsed.ok) {
    return {
      type: "error",
      envelope: envError("ralph", parsed.error.code, parsed.error.message),
    };
  }
  return issueRespondeoStep({ ...scratch, sed_contra: parsed.value.sed_contra });
}

function handleRespondeoApply(scratch: DisputatioScratch, args: StepArgs): DisputatioStepOutcome {
  const parsed = parseJsonResponse(args, "respondeo", RespondeoSchema);
  if (!parsed.ok) {
    return {
      type: "error",
      envelope: envError("ralph", parsed.error.code, parsed.error.message),
    };
  }
  const respondeo = parsed.value;
  const objections = collectObjections(scratch.videtur_results ?? []);
  if (objections.length === 0) {
    // No objections → finalize without Ad singula.
    return finalize({ ...scratch, respondeo, ad_singula: [] });
  }
  return issueAdSingulaStep({ ...scratch, respondeo });
}

function handleAdSingulaApply(scratch: DisputatioScratch, args: StepArgs): DisputatioStepOutcome {
  const parsed = parseJsonResponse(args, "ad_singula", AdSingulaResponseSchema);
  if (!parsed.ok) {
    return {
      type: "error",
      envelope: envError("ralph", parsed.error.code, parsed.error.message),
    };
  }
  return finalize({ ...scratch, ad_singula: parsed.value.rulings });
}

function finalize(scratch: DisputatioScratch): DisputatioStepOutcome {
  if (
    scratch.videtur_results === undefined ||
    scratch.sed_contra === undefined ||
    scratch.respondeo === undefined ||
    scratch.ad_singula === undefined
  ) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        "Disputatio finalize: missing stage outputs",
      ),
    };
  }
  const allObjections = collectObjections(scratch.videtur_results);
  // F-Aquinas-4: every objection must have exactly one ruling.
  const ruledIds = new Set(scratch.ad_singula.map((r) => r.objection_id));
  const unruled = allObjections.filter((o) => !ruledIds.has(o.id));
  if (unruled.length > 0) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        `F-Aquinas-4 violation: ${String(unruled.length)} objection(s) without Ad singula ruling: ${unruled.map((o) => o.id).join(", ")}`,
      ),
    };
  }
  const actionItems = scratch.ad_singula
    .filter((r) => r.ruling === "concedo")
    .map((r) => r.action_or_reason);
  const result: DisputatioResult = {
    leaf_id: scratch.leaf_id,
    videtur: scratch.videtur_results,
    sed_contra: scratch.sed_contra,
    respondeo: scratch.respondeo,
    ad_singula: scratch.ad_singula,
    action_items: actionItems,
    all_objections_count: allObjections.length,
    critical_objections_count: allObjections.filter((o) => o.severity === "critical").length,
    ran_at: new Date().toISOString(),
  };
  const validated = DisputatioResultSchema.safeParse(result);
  if (!validated.success) {
    return {
      type: "error",
      envelope: envError(
        "ralph",
        "internal.invariant-violation",
        `Disputatio result schema fail: ${validated.error.issues[0]?.message ?? "?"}`,
      ),
    };
  }
  return { type: "complete", result: validated.data };
}

// ─── Helpers ───

function collectObjections(videtur: readonly VideturPerCritic[]): Objection[] {
  return videtur.flatMap((v) => v.objections);
}

function parseJsonResponse<T>(
  args: StepArgs,
  id: string,
  schema: z.ZodType<T>,
): Result<T, AgoraErrorThrown> {
  const responses = args.llm_responses ?? [];
  const found = responses.find((r) => r.id === id);
  if (found === undefined) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `disputatio.${id}: no llm_response with id="${id}".` },
      }),
    );
  }
  const obj =
    typeof found.content === "string" ? safeJsonParse(found.content) : (found.content as unknown);
  if (obj === null || typeof obj !== "object") {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `disputatio.${id}: content is not a JSON object.` },
      }),
    );
  }
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: {
          detail: `disputatio.${id}: ${parsed.error.issues[0]?.message ?? "schema fail"}`,
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

function serializeScratch(scratch: DisputatioScratch): Record<string, unknown> {
  return DisputatioScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
