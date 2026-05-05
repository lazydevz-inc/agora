// SPEC: docs/loops/ralph-loop.md (Gate 3+4 — Aquinas Disputatio) +
//       docs/philosophers/runbooks/aquinas.md §3.2 (4-stage protocol) +
//       Stage 2-B.3 R2-A (per-critic Videtur) + F-Aquinas-3 (Respondeo
//       independence) + F-Aquinas-4 (per-objection Ad singula).
//
// Aquinas Disputatio — implementation-quality verdict via 4-stage
// dialectic:
//
//   1. Videtur:    each selected critic raises objections (parallel
//                  LLM calls; uses critic prompts from PROMPT_LIBRARY
//                  via renderPrompt).
//   2. Sed contra: single counter-position synthesizing the case FOR
//                  the implementation despite objections.
//   3. Respondeo:  master verdict (approved/conditional/rejected) +
//                  reasoning. Per F-Aquinas-3: first paragraph MUST
//                  be independent stance (don't reference Videtur or
//                  Sed contra in opening).
//   4. Ad singula: one ruling per objection (concedo/distinguo/nego)
//                  + concrete action_or_reason. Per F-Aquinas-4: every
//                  objection gets exactly ONE ruling — no silent skip.
//
// Per Stage 6-A.21 R4-A: verdict drives leaf-advance:
//   approved → leaf complete (PASS-equivalent)
//   conditional → leaf complete + action_items recorded as z1_directives
//                 for next leaf
//   rejected → leaf NOT complete; user retries with Ad singula rulings
//
// LAYER 2 — depends on LAYER 0 (errors / result) + LAYER 1 (critics +
// llm + prompts). Pure orchestration; no I/O (caller fetches critics
// + assembles context + invokes runner).

import { z } from "zod";
import { selectCritics } from "../critics/registry.js";
import type { CriticContext, CriticDef } from "../critics/types.js";
import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import type { PromptKey } from "../prompts/_generated.js";
import { renderPrompt } from "../prompts/index.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const ObjectionSeveritySchema = z.enum(["minor", "major", "critical"]);
export type ObjectionSeverity = z.infer<typeof ObjectionSeveritySchema>;

export const ObjectionSchema = z.object({
  id: z.string().min(1),
  critic_id: z.string().min(1),
  claim: z.string().min(1),
  evidence: z.string().min(1),
  severity: ObjectionSeveritySchema,
});
export type Objection = z.infer<typeof ObjectionSchema>;

export const VideturPerCriticSchema = z.object({
  critic_id: z.string().min(1),
  objections: z.array(ObjectionSchema),
  no_objections_reason: z.string().optional(),
});
export type VideturPerCritic = z.infer<typeof VideturPerCriticSchema>;

export const VerdictSchema = z.enum(["approved", "conditional", "rejected"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const RespondeoSchema = z.object({
  verdict: VerdictSchema,
  reasoning: z.string().min(1),
});
export type Respondeo = z.infer<typeof RespondeoSchema>;

export const AdSingulaRulingSchema = z.object({
  objection_id: z.string().min(1),
  ruling: z.enum(["concedo", "distinguo", "nego"]),
  action_or_reason: z.string().min(1),
});
export type AdSingulaRuling = z.infer<typeof AdSingulaRulingSchema>;

export const DisputatioResultSchema = z.object({
  leaf_id: z.string().min(1),
  videtur: z.array(VideturPerCriticSchema),
  sed_contra: z.string().min(1),
  respondeo: RespondeoSchema,
  ad_singula: z.array(AdSingulaRulingSchema),
  action_items: z.array(z.string()),
  all_objections_count: z.number().int().min(0),
  critical_objections_count: z.number().int().min(0),
  ran_at: z.string().datetime(),
});
export type DisputatioResult = z.infer<typeof DisputatioResultSchema>;

// ─── Per-critic LLM response shape (passthrough to allow critic-
//     specific extras like `principle` or `concern`). ───

const CriticResponseSchema = z.object({
  objections: z.array(
    z
      .object({
        id: z.string().min(1),
        claim: z.string().min(1),
        evidence: z.string().min(1),
        severity: ObjectionSeveritySchema,
      })
      .passthrough(),
  ),
  no_objections_reason: z.string().optional(),
});

// ─── Aquinas-side inline prompts (replace via prompt-library refactor) ───

const SED_CONTRA_SYSTEM = `You are Aquinas conducting Sed contra. Synthesize a SINGLE counter-
position to all the objections raised in Videtur — make the strongest
case FOR the implementation despite the objections.

Hard rules:
1. ONE paragraph (3-5 sentences). Not per-objection rebuttals — that's
   Ad singula's job. This is one unified counter-thrust.
2. Cite the strongest reasons the implementation was the right choice
   given constraints (telos / form / time / scope).
3. Acknowledge the objections exist; argue they're outweighed.
4. NEVER say "all objections are wrong" — that's not Sed contra's
   structure. Sed contra is "yes, but here's why anyway".

Return EXACTLY this JSON shape, no extra keys:
{
  "sed_contra": "<single paragraph counter-position>"
}`;

const RESPONDEO_SYSTEM = `You are Aquinas conducting Respondeo. Produce YOUR OWN analysis +
verdict. NOT a synthesis of Videtur. NOT a summary of Sed contra. Your
independent position on whether this implementation should advance.

Hard rules (F-Aquinas-3):
1. FIRST PARAGRAPH FORBIDDEN from referencing Videtur or Sed contra.
   You must articulate your own position before acknowledging the
   prior stages.
2. After your independent position, you MAY engage with objections
   and case-for — but only to explain how your position relates.
3. Verdict options:
   - approved:    implementation serves telos + AC, no critical
                  objections, ready to advance.
   - conditional: implementation serves telos + AC, but specific
                  objections require before-advance action items
                  (most common when there ARE objections).
   - rejected:    implementation does not serve telos OR critical
                  objections compound against advancing.
4. Reasoning is CONCRETE. Cite specific objections by id when
   relevant. Avoid vague critique.

Return EXACTLY this JSON shape, no extra keys:
{
  "verdict": "approved" | "conditional" | "rejected",
  "reasoning": "<2-4 paragraphs starting with INDEPENDENT first paragraph>"
}`;

const AD_SINGULA_SYSTEM = `You are Aquinas producing Ad singula — a SEPARATE ruling for EACH
objection. No silent skipping (F-Aquinas-4).

Hard rules:
1. EVERY objection from Videtur gets exactly ONE ruling. No exceptions.
2. Ruling options:
   - concedo:    "I concede this objection. {action} must happen
                  before advancing."
   - distinguo:  "I distinguish: this is true in {case_X} but not
                  {case_Y}. {action_or_no_action}."
   - nego:       "I deny this objection because {specific_reason}."
3. concedo MUST include a concrete action (file path + change shape).
4. distinguo MUST identify both cases (where true, where not).
5. nego MUST include a specific reason — never just "I disagree".

Return EXACTLY this JSON shape, no extra keys:
{
  "rulings": [
    {
      "objection_id": "<obj_id from Videtur>",
      "ruling": "concedo" | "distinguo" | "nego",
      "action_or_reason": "<concrete text per the ruling type's rule>"
    }
  ]
}`;

export interface DisputatioInput {
  readonly leaf_id: string;
  readonly leaf_content: string;
  readonly telos_statement: string;
  readonly telos_failure_signal: string;
  readonly all_acceptance_criteria: readonly { id: string; content: string }[];
  readonly completed_leaves_summary: string;
  readonly diff: string;
  readonly diff_source: string;
  readonly critic_context: CriticContext;
}

// ─── Orchestrator ───

export async function runDisputatio(
  input: DisputatioInput,
  runner: ClaudeRunner,
): Promise<Result<DisputatioResult, AgoraErrorThrown>> {
  // 1. Videtur — call selected critics in parallel.
  const critics = selectCritics(input.critic_context);
  if (critics.length === 0) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: {
          detail: "Disputatio: no critics matched context (always-trigger universal expected).",
        },
      }),
    );
  }

  const videturResults = await runVidetur(critics, input, runner);
  if (!videturResults.ok) return videturResults;
  const videtur = videturResults.value;
  const allObjections = videtur.flatMap((v) => v.objections);

  // 2. Sed contra — single counter-position.
  const sedContraResult = await callSedContra(input, allObjections, runner);
  if (!sedContraResult.ok) return sedContraResult;
  const sedContra = sedContraResult.value;

  // 3. Respondeo — independent verdict.
  const respondeoResult = await callRespondeo(input, allObjections, sedContra, runner);
  if (!respondeoResult.ok) return respondeoResult;
  const respondeo = respondeoResult.value;

  // 4. Ad singula — per-objection rulings.
  const adSingulaResult = await callAdSingula(input, allObjections, respondeo, runner);
  if (!adSingulaResult.ok) return adSingulaResult;
  const adSingula = adSingulaResult.value;

  // F-Aquinas-4 enforcement: every objection must have exactly one ruling.
  const ruledIds = new Set(adSingula.map((r) => r.objection_id));
  const unruled = allObjections.filter((o) => !ruledIds.has(o.id));
  if (unruled.length > 0) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: {
          detail: `F-Aquinas-4 violation: ${String(unruled.length)} objection(s) without Ad singula ruling: ${unruled.map((o) => o.id).join(", ")}`,
        },
      }),
    );
  }

  // Action items distilled from concedo rulings.
  const actionItems = adSingula
    .filter((r) => r.ruling === "concedo")
    .map((r) => r.action_or_reason);

  const result: DisputatioResult = {
    leaf_id: input.leaf_id,
    videtur,
    sed_contra: sedContra,
    respondeo,
    ad_singula: adSingula,
    action_items: actionItems,
    all_objections_count: allObjections.length,
    critical_objections_count: allObjections.filter((o) => o.severity === "critical").length,
    ran_at: new Date().toISOString(),
  };

  const validated = DisputatioResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "Disputatio result schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

// ─── Stage helpers ───

async function runVidetur(
  critics: readonly CriticDef[],
  input: DisputatioInput,
  runner: ClaudeRunner,
): Promise<Result<VideturPerCritic[], AgoraErrorThrown>> {
  const acsRendered = input.all_acceptance_criteria
    .map((ac) => `- ${ac.id}: ${ac.content}`)
    .join("\n");
  // Build full context — each critic uses what it declares in placeholders.
  const ctx: Record<string, string> = {
    leaf_id: input.leaf_id,
    leaf_content: input.leaf_content,
    telos_statement: input.telos_statement,
    telos_failure_signal: input.telos_failure_signal,
    all_acceptance_criteria: acsRendered,
    completed_leaves_summary: input.completed_leaves_summary,
    diff: input.diff,
    diff_source: input.diff_source,
  };

  const calls = critics.map(async (critic): Promise<Result<VideturPerCritic, AgoraErrorThrown>> => {
    const key: PromptKey = `critic:${critic.id}` as PromptKey;
    const rendered = renderPrompt(key, ctx);
    if (!rendered.ok) return rendered;
    const response = await runner.call({
      system: rendered.value.system,
      prompt: rendered.value.user,
      format: "json",
      timeout_ms: 60_000,
    });
    if (!response.ok) {
      return err(
        buildAgoraError("llm.internal-error", {
          context: {
            detail: `critic ${critic.id}: ${response.error?.detail ?? "no response"}`,
          },
        }),
      );
    }
    const content = response.content;
    if (typeof content !== "object" || content === null) {
      return err(
        buildAgoraError("llm.invalid-response", {
          context: { detail: `critic ${critic.id}: did not return a JSON object` },
        }),
      );
    }
    const parsed = CriticResponseSchema.safeParse(content);
    if (!parsed.success) {
      return err(
        buildAgoraError("llm.invalid-response", {
          context: {
            detail: `critic ${critic.id}: ${parsed.error.issues[0]?.message ?? "schema fail"}`,
          },
        }),
      );
    }
    // Stamp critic_id onto each objection (LLM only emits its own id field).
    const objections = parsed.data.objections.map((o) => ({
      id: o.id,
      critic_id: critic.id,
      claim: o.claim,
      evidence: o.evidence,
      severity: o.severity,
    }));
    return ok({
      critic_id: critic.id,
      objections,
      ...(parsed.data.no_objections_reason !== undefined
        ? { no_objections_reason: parsed.data.no_objections_reason }
        : {}),
    });
  });

  const results = await Promise.all(calls);
  for (const r of results) {
    if (!r.ok) return r;
  }
  return ok(results.map((r) => (r.ok ? r.value : (undefined as never))));
}

async function callSedContra(
  input: DisputatioInput,
  objections: readonly Objection[],
  runner: ClaudeRunner,
): Promise<Result<string, AgoraErrorThrown>> {
  const objectionsRendered = renderObjections(objections);
  const prompt = `Proposition: implement leaf "${input.leaf_id}" — "${input.leaf_content}"

Settled telos: "${input.telos_statement}"

Objections raised in Videtur:
${objectionsRendered.length > 0 ? objectionsRendered : "(no objections raised)"}

Synthesize ONE counter-position paragraph per the rules.`;
  const response = await runner.call({
    system: SED_CONTRA_SYSTEM,
    prompt,
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: `Sed contra: ${response.error?.detail ?? "no response"}` },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Sed contra: not a JSON object" },
      }),
    );
  }
  const parsed = z.object({ sed_contra: z.string().min(1) }).safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "Sed contra schema fail" },
      }),
    );
  }
  return ok(parsed.data.sed_contra);
}

async function callRespondeo(
  input: DisputatioInput,
  objections: readonly Objection[],
  sedContra: string,
  runner: ClaudeRunner,
): Promise<Result<Respondeo, AgoraErrorThrown>> {
  const objectionsRendered = renderObjections(objections);
  const prompt = `Proposition: implement leaf "${input.leaf_id}" — "${input.leaf_content}"

Settled telos: "${input.telos_statement}"
Failure signal: "${input.telos_failure_signal}"

Videtur objections (${String(objections.length)} total):
${objectionsRendered.length > 0 ? objectionsRendered : "(none)"}

Sed contra:
${sedContra}

Now produce your INDEPENDENT Respondeo per the rules. First paragraph
MUST NOT reference Videtur or Sed contra (F-Aquinas-3).`;
  const response = await runner.call({
    system: RESPONDEO_SYSTEM,
    prompt,
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: `Respondeo: ${response.error?.detail ?? "no response"}` },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Respondeo: not a JSON object" },
      }),
    );
  }
  const parsed = RespondeoSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "Respondeo schema fail" },
      }),
    );
  }
  return ok(parsed.data);
}

async function callAdSingula(
  input: DisputatioInput,
  objections: readonly Objection[],
  respondeo: Respondeo,
  runner: ClaudeRunner,
): Promise<Result<AdSingulaRuling[], AgoraErrorThrown>> {
  if (objections.length === 0) {
    return ok([]);
  }
  const objectionsWithIds = objections
    .map((o) => `- ${o.id} (${o.severity}): ${o.claim} — Evidence: ${o.evidence}`)
    .join("\n");
  const prompt = `Leaf: ${input.leaf_id} — "${input.leaf_content}"

Objections from Videtur (${String(objections.length)} total):
${objectionsWithIds}

Respondeo verdict: ${respondeo.verdict}
Respondeo reasoning: ${respondeo.reasoning}

For EACH objection above (${String(objections.length)} total), produce
ONE ruling per the rules. Return rulings array with exactly ${String(objections.length)}
entries.`;
  const response = await runner.call({
    system: AD_SINGULA_SYSTEM,
    prompt,
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: `Ad singula: ${response.error?.detail ?? "no response"}` },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Ad singula: not a JSON object" },
      }),
    );
  }
  const parsed = z.object({ rulings: z.array(AdSingulaRulingSchema) }).safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "Ad singula schema fail" },
      }),
    );
  }
  return ok(parsed.data.rulings);
}

function renderObjections(objections: readonly Objection[]): string {
  return objections
    .map(
      (o) =>
        `  - ${o.id} [${o.critic_id} / ${o.severity}]: ${o.claim}\n    Evidence: ${o.evidence}`,
    )
    .join("\n");
}
