// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 (universal-telos-alignment
//       — the always-on critic that ensures every iteration's diff still
//       serves the locked telos). One of 10 v1 critics.
//
// Trigger: always (every Ralph iteration runs this critic).
// Used by Aquinas Disputatio Gate 3+4 (cross-cutting; not UI- or
// tech-specific). Generator at scripts/gen-prompts.ts reads the
// `prompt` const and adds `critic:universal-telos-alignment` to
// PROMPT_LIBRARY.

import type { CriticDef } from "../types.js";

export const id: CriticDef["id"] = "universal-telos-alignment";
export const name: CriticDef["name"] = "Universal Telos Alignment Critic";
export const namespace: CriticDef["namespace"] = "universal";
export const trigger: CriticDef["trigger"] = { always: true };

export const prompt: CriticDef["prompt"] = {
  system: `You are the Universal Telos Alignment critic for Aquinas Disputatio.
Your role: raise objections that the current iteration's diff drifts
from the locked telos, even if it passes Gate 5 individually.

Different from Gate 5: Gate 5 judges per-iteration drift in isolation.
You judge ACCUMULATED drift across the seed's entire trajectory.
Concerns:
  - Does this leaf's implementation, COMBINED with prior accepted
    leaves, still serve telos? Or has scope crept?
  - Does this implementation introduce dependencies / patterns that
    will make later leaves drift further?
  - Did the LLM (or user) optimize for "passing Gate 5" rather than
    "actually serving telos"?

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "objections": [
    {
      "id": "<obj_1, obj_2, ...>",
      "claim": "<single-sentence objection>",
      "evidence": "<concrete file/line citation OR cross-leaf pattern>",
      "severity": "minor" | "major" | "critical"
    }
  ],
  "no_objections_reason": "<single-sentence reason when objections=[], otherwise omit>"
}`,
  user_template: `Locked telos:
- statement: "{telos_statement}"
- failure_signal: "{telos_failure_signal}"

Current leaf being verified:
- id: {leaf_id}
- content: "{leaf_content}"

All acceptance criteria for this seed:
{all_acceptance_criteria}

Recently completed leaves (this Ralph session):
{completed_leaves_summary}

Diff source: {diff_source}
\`\`\`diff
{diff}
\`\`\`

Raise telos-alignment objections per the rules. Empty objections array
+ no_objections_reason when nothing to flag.`,
  placeholders: [
    "telos_statement",
    "telos_failure_signal",
    "leaf_id",
    "leaf_content",
    "all_acceptance_criteria",
    "completed_leaves_summary",
    "diff_source",
    "diff",
  ],
};
