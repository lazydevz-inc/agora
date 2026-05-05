// SPEC: docs/loops/alignment-loop.md (seed.acceptance_criteria) +
//       docs/philosophers/runbooks/plato.md §5 PlatoDHInput (consumes
//       this output as the AC tree's roots).
//
// Phase 2 AC capture (Stage 6-A.16) — collects user-supplied
// acceptance criteria after maturity tagging passes. Pure capture;
// Plato Dihairesis (handoff slice, future) decomposes each AC into
// the ac_tree structure.
//
// Pattern matches Aristotle/Plato extraction slices: 1 question asked
// locally → 1 LLM call extracts structured AcceptanceCriterion[].
// LLM is used for cleanup (deduplication, splitting compound items)
// not for facilitation. Cookie-cutter local-question + LLM-extraction.
//
// Schema is intentionally minimal per Stage 6-A.16 R3-A YAGNI: just
// id + content. Plato DH slice will extend (parent_id / children /
// atomic / split_principle / split_defense / depth) per runbook §5.

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const AcceptanceCriterionSchema = z.object({
  id: z.string().regex(/^ac_\d{3}$/, "id must match ac_NNN"),
  content: z.string().min(1),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const AcceptanceCriteriaResultSchema = z.object({
  criteria: z.array(AcceptanceCriterionSchema).min(1).max(50),
  raw_input: z.string().min(1),
  created_at: z.string().datetime(),
});
export type AcceptanceCriteriaResult = z.infer<typeof AcceptanceCriteriaResultSchema>;

export interface AcCaptureInput {
  readonly telos_statement: string;
  readonly form_essential_structure: string;
}

export interface AcCaptureUi {
  /** Single ask: free-text AC list (newlines/commas separated). */
  askAcsList(args: { telos: string; form: string }): Promise<string>;
}

interface ExtractedAcs {
  criteria: { content: string }[];
}

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

const AC_EXTRACT_SYSTEM = `You are extracting an acceptance-criteria list from a user's free-text
input. The user has already settled telos + form via Aristotle and passed
maturity tagging via Plato. They now list the conditions under which the
software will be considered "done" — the acceptance criteria.

Hard rules:
1. Each output AC is a SINGLE testable condition. Split compound items
   (e.g. "users can log in AND log out" → two ACs) so each can be
   independently verified.
2. Preserve user wording where reasonable. Light cleanup (dedup, split
   compounds, normalize phrasing) is OK; rewriting intent is NOT.
3. Drop empty lines + comments + bullet markers (-, *, 1., a.) from the
   raw input; output is just the criterion content as a sentence.
4. Do NOT invent ACs the user didn't mention. If the user writes 3
   bullets, output exactly 3 (or more if you split compounds).
5. Each AC content ≥ 5 chars (filter trivial/empty).

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "criteria": [
    { "content": "<single testable condition>" },
    ...
  ]
}`;

function buildAcUserPrompt(input: AcCaptureInput, rawInput: string): string {
  return `Settled telos.statement: "${input.telos_statement}"
Settled form.essential_structure: "${input.form_essential_structure}"

User's free-text acceptance-criteria input:
"""
${rawInput}
"""

Extract per the JSON shape. Split compounds; preserve wording where
reasonable; drop bullets/markers; do not invent ACs.`;
}

// ─── Orchestrator ───

export async function runAcCapture(
  input: AcCaptureInput,
  runner: ClaudeRunner,
  ui: AcCaptureUi,
): Promise<Result<AcceptanceCriteriaResult, AgoraErrorThrown>> {
  const rawInput = await ui.askAcsList({
    telos: input.telos_statement,
    form: input.form_essential_structure,
  });
  if (rawInput.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "AC capture: empty input." },
      }),
    );
  }

  const extraction = await callForAcExtraction(input, runner, rawInput);
  if (!extraction.ok) return extraction;
  const extracted = extraction.value;

  if (extracted.criteria.length === 0) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "AC extraction returned zero criteria." },
      }),
    );
  }

  const criteria: AcceptanceCriterion[] = extracted.criteria.map((c, i) => ({
    id: formatAcId(i + 1),
    content: c.content,
  }));

  const result: AcceptanceCriteriaResult = {
    criteria,
    raw_input: rawInput,
    created_at: new Date().toISOString(),
  };
  const validated = AcceptanceCriteriaResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "AC schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

export function formatAcId(n: number): string {
  return `ac_${String(n).padStart(3, "0")}`;
}

async function callForAcExtraction(
  input: AcCaptureInput,
  runner: ClaudeRunner,
  rawInput: string,
): Promise<Result<ExtractedAcs, AgoraErrorThrown>> {
  const response = await runner.call({
    system: AC_EXTRACT_SYSTEM,
    prompt: buildAcUserPrompt(input, rawInput),
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: response.error?.detail ?? "no response" },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "AC extraction prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = z
    .object({
      criteria: z
        .array(z.object({ content: z.string().min(5) }))
        .min(1)
        .max(50),
    })
    .safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "AC extraction schema fail" },
      }),
    );
  }
  return ok(parsed.data);
}
