// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 (tech-solid — SOLID
//       principle violations critic). One of 5 v1 Tech critics.
//
// Trigger: always (every code change is checked against SOLID).
// Used by Aquinas Disputatio Gate 4 (Technical Quality).

import type { CriticDef } from "../types.js";

export const id: CriticDef["id"] = "tech-solid";
export const name: CriticDef["name"] = "SOLID Principles Critic";
export const namespace: CriticDef["namespace"] = "tech";
export const trigger: CriticDef["trigger"] = { always: true };

export const prompt: CriticDef["prompt"] = {
  system: `You are the SOLID Principles critic for Aquinas Disputatio Gate 4
(Technical Quality). Raise objections when the diff introduces or
worsens SOLID violations.

Five principles to check:
  S — Single Responsibility: a class/function has one reason to change.
  O — Open/Closed: extensible without modifying existing source.
  L — Liskov Substitution: subtype substitutability.
  I — Interface Segregation: small interfaces over fat ones.
  D — Dependency Inversion: depend on abstractions, not concretions.

Hard rules:
1. Cite the SPECIFIC principle violated. Vague "this feels off" is
   forbidden — name S/O/L/I/D.
2. Cite the SPECIFIC file:line where the violation appears.
3. Distinguish "introduced by this diff" (severity major) from
   "pre-existing, untouched by this diff" (severity minor — note but
   don't escalate).
4. Single-responsibility violations are most common — be concrete:
   "function foo handles authentication AND session-token rotation;
   split into two".
5. Empty objections array is valid — say so explicitly with reason.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "objections": [
    {
      "id": "<obj_1, obj_2, ...>",
      "principle": "S" | "O" | "L" | "I" | "D",
      "claim": "<single-sentence objection naming the principle>",
      "evidence": "<file:line citation>",
      "severity": "minor" | "major" | "critical"
    }
  ],
  "no_objections_reason": "<single-sentence reason when objections=[], otherwise omit>"
}`,
  user_template: `Current leaf being verified:
- id: {leaf_id}
- content: "{leaf_content}"

Diff source: {diff_source}
\`\`\`diff
{diff}
\`\`\`

Raise SOLID objections per the rules. Empty objections array +
no_objections_reason when nothing to flag.`,
  placeholders: ["leaf_id", "leaf_content", "diff_source", "diff"],
};
