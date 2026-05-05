// SPEC: docs/loops/ralph-loop.md Gate 5 (alignment check) +
//       Stage 2-B.4 R1-A (LLM-only drift_score, 3-tier threshold) +
//       Stage 2-A.10 (Z1/Z2 escalation algorithm).
//
// Gate 5 — the "did the actual implementation serve telos?" gate.
// Single LLM call: judge git diff (this leaf's implementation work)
// against the locked seed (telos.statement, failure_signal,
// acceptance_criteria for the current leaf). drift_score 0.0
// (perfect alignment) to 1.0 (totally drifted). 3-tier action map:
//
//   < 0.15  → PASS      (leaf complete, advance)
//   < 0.30  → SOFT_WARN (leaf complete, log warn — drift accumulating)
//   < 0.60  → Z1        (leaf NOT complete; record directive for next
//                        iteration's self-correction; user retries)
//   ≥ 0.60  → Z2        (mini-alignment re-entry recommended; CLI side
//                        prompts user to confirm state in_ralph →
//                        in_alignment + reset alignment.round)
//
// Pure LLM extraction (no I/O) per Husserl/Aristotle/Plato pattern.
// Caller fetches git diff + assembles input.

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const Gate5ActionSchema = z.enum(["PASS", "SOFT_WARN", "Z1", "Z2"]);
export type Gate5Action = z.infer<typeof Gate5ActionSchema>;

export const Gate5ResultSchema = z.object({
  leaf_id: z.string(),
  drift_score: z.number().min(0).max(1),
  action: Gate5ActionSchema,
  rationale: z.string().min(1),
  z1_directive: z.string().optional(), // present when action ∈ {Z1, Z2}
  diff_source: z.enum(["head_minus_one_to_head", "unstaged", "no_git", "no_changes", "error"]),
  diff_truncated: z.boolean(),
  ran_at: z.string().datetime(),
});
export type Gate5Result = z.infer<typeof Gate5ResultSchema>;

export const GATE_5_THRESHOLDS = {
  soft_warn: 0.15,
  z1: 0.3,
  z2: 0.6,
} as const;

export interface Gate5Input {
  readonly leaf_id: string;
  readonly leaf_content: string; // ac_tree node's content
  readonly telos_statement: string;
  readonly telos_failure_signal: string;
  readonly all_acceptance_criteria: readonly { id: string; content: string }[];
  readonly diff: string;
  readonly diff_source: Gate5Result["diff_source"];
  readonly diff_truncated: boolean;
}

interface ExtractedJudgment {
  drift_score: number;
  rationale: string;
  z1_directive?: string | undefined;
}

// ─── Inline prompt ───

const GATE_5_SYSTEM = `You are administering Gate 5 (alignment check) for Ralph. Your task:
judge whether the user's actual implementation work (shown as a git
diff) serves the locked telos for this acceptance-criterion leaf.

Your output is a drift_score 0.0-1.0:
  0.0 = perfectly aligned (changes exactly serve telos for this leaf)
  1.0 = total drift (changes are unrelated, contradict telos, or break
        load-bearing acceptance criteria)

Calibration anchors:
  drift < 0.15: changes directly implement leaf intent + advance telos
  0.15-0.30: changes implement leaf intent but with minor scope creep
             or tangential additions
  0.30-0.60: changes only partially address leaf intent, OR add
             significant unrelated work, OR drift telos slightly
  0.60-1.00: changes don't address leaf intent, contradict telos
             failure_signal, or break other acceptance criteria

Hard rules:
1. Judge changes vs LEAF intent FIRST. If leaf is "add password login"
   and diff is "add OAuth login", drift is high (~0.5+) regardless of
   code quality.
2. Then judge against TELOS. If telos says "help user make connections
   across reading" and diff adds an unrelated billing system, drift is
   very high (~0.8+).
3. Then check whether diff broke any OTHER acceptance criteria
   (negatively impacted existing scope). If yes, raise drift.
4. When drift >= 0.30, also output a z1_directive: a single-sentence
   hint for the user's next iteration ("focus on X; remove Y; the leaf
   asks for Z, not W").
5. Be concrete in rationale. Cite specific files / functions / lines
   where relevant. Avoid vague critique.
6. If diff is empty / "no_changes" / "no_git" / "error", judge based on
   leaf vs telos alone and set drift to 0.50 (uncertain — caller knows).

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "drift_score": <0.0-1.0>,
  "rationale": "<2-4 sentences with concrete cites>",
  "z1_directive": "<single sentence hint for next iteration when drift >= 0.30, otherwise omit>"
}`;

function buildGate5UserPrompt(input: Gate5Input): string {
  const acsRendered = input.all_acceptance_criteria
    .map((ac) => `- ${ac.id}: ${ac.content}`)
    .join("\n");
  const diffSection =
    input.diff_source === "no_git"
      ? "(Project not in git; no diff available. Judge based on leaf + telos only.)"
      : input.diff_source === "no_changes"
        ? "(No changes detected since last commit. User may not have implemented yet.)"
        : input.diff_source === "error"
          ? "(git diff failed; no diff available.)"
          : input.diff;
  const truncationNote = input.diff_truncated
    ? "\n\nNOTE: diff truncated to 10KB; judge the visible portion."
    : "";
  return `Locked telos:
- statement: "${input.telos_statement}"
- failure_signal: "${input.telos_failure_signal}"

All acceptance criteria for this seed:
${acsRendered}

Current leaf being verified:
- id: ${input.leaf_id}
- content: "${input.leaf_content}"

Diff source: ${input.diff_source}
\`\`\`diff
${diffSection}
\`\`\`${truncationNote}

Judge per the rules. Return Gate5Output.`;
}

// ─── Orchestrator ───

export async function runGate5(
  input: Gate5Input,
  runner: ClaudeRunner,
): Promise<Result<Gate5Result, AgoraErrorThrown>> {
  const extraction = await callForJudgment(input, runner);
  if (!extraction.ok) return extraction;
  const extracted = extraction.value;

  const action = mapDriftToAction(extracted.drift_score);

  const result: Gate5Result = {
    leaf_id: input.leaf_id,
    drift_score: extracted.drift_score,
    action,
    rationale: extracted.rationale,
    ...(extracted.z1_directive !== undefined ? { z1_directive: extracted.z1_directive } : {}),
    diff_source: input.diff_source,
    diff_truncated: input.diff_truncated,
    ran_at: new Date().toISOString(),
  };

  const validated = Gate5ResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "Gate 5 result schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

export function mapDriftToAction(score: number): Gate5Action {
  if (score < GATE_5_THRESHOLDS.soft_warn) return "PASS";
  if (score < GATE_5_THRESHOLDS.z1) return "SOFT_WARN";
  if (score < GATE_5_THRESHOLDS.z2) return "Z1";
  return "Z2";
}

async function callForJudgment(
  input: Gate5Input,
  runner: ClaudeRunner,
): Promise<Result<ExtractedJudgment, AgoraErrorThrown>> {
  const response = await runner.call({
    system: GATE_5_SYSTEM,
    prompt: buildGate5UserPrompt(input),
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
        context: { detail: "Gate 5 prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = z
    .object({
      drift_score: z.number().min(0).max(1),
      rationale: z.string().min(1),
      z1_directive: z.string().optional(),
    })
    .safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "Gate 5 schema fail" },
      }),
    );
  }
  return ok(parsed.data);
}
