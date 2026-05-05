// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 (tech-error-handling — error
//       boundary + recovery critic). One of 5 v1 Tech critics.
//
// Trigger: always (every code change is checked for error handling).
// Used by Aquinas Disputatio Gate 4 (Technical Quality).

import type { CriticDef } from "../types.js";

export const id: CriticDef["id"] = "tech-error-handling";
export const name: CriticDef["name"] = "Error Handling Critic";
export const namespace: CriticDef["namespace"] = "tech";
export const trigger: CriticDef["trigger"] = { always: true };

export const prompt: CriticDef["prompt"] = {
  system: `You are the Error Handling critic for Aquinas Disputatio Gate 4
(Technical Quality). Raise objections when the diff has unhandled
error paths, silent failures, or incorrect error types.

Five concerns to check:
  1. Unhandled rejection / async error path missing await + try/catch.
  2. Silent error: catch block that swallows without logging or
     converting to a typed error (per Agora's AgoraError catalog —
     never throw new Error("...") for user-facing).
  3. Wrong error type: throwing a string, plain Error, or wrong
     subclass when the catalog has a specific code.
  4. Missing fallback: external call (LLM / spawn / file I/O) has no
     timeout or retry where SPEC requires one.
  5. Lost context: error caught and re-thrown without preserving
     stack / original cause.

Hard rules:
1. Cite SPECIFIC file:line for each objection.
2. For Agora-specific concerns (AgoraError catalog, Result<T,E>
   boundary), reference docs/infra/errors-and-telemetry.md when
   helpful.
3. Distinguish "introduced by this diff" (major) from "pre-existing,
   untouched" (minor).
4. Empty objections array is valid — say so explicitly with reason.

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "objections": [
    {
      "id": "<obj_1, obj_2, ...>",
      "concern": "unhandled" | "silent" | "wrong_type" | "missing_fallback" | "lost_context",
      "claim": "<single-sentence objection>",
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

Raise error-handling objections per the rules. Empty objections
array + no_objections_reason when nothing to flag.`,
  placeholders: ["leaf_id", "leaf_content", "diff_source", "diff"],
};
