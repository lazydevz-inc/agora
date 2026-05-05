// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 R4-A (selectCritics
//       single-entry; trigger evaluation in one place).
//
// LAYER 1. Loads all critic def files at module-init time and exposes
// `selectCritics(context)` that returns the critics whose triggers
// match the context. Aquinas Disputatio (Gate 3+4 — future slice)
// calls this once per iteration to decide which critics to run.

import * as techErrorHandling from "./definitions/tech-error-handling.js";
import * as techSolid from "./definitions/tech-solid.js";
import * as universalTelosAlignment from "./definitions/universal-telos-alignment.js";
import { type CriticContext, type CriticDef, CriticDefSchema } from "./types.js";

// Module-init: assemble registry. Each def exports id/name/namespace/
// trigger/prompt as named exports; we compose them into CriticDef +
// validate via schema (catches typos at startup, not at first call).

export const ALL_CRITICS: readonly CriticDef[] = [
  CriticDefSchema.parse({
    id: universalTelosAlignment.id,
    name: universalTelosAlignment.name,
    namespace: universalTelosAlignment.namespace,
    trigger: universalTelosAlignment.trigger,
    prompt: universalTelosAlignment.prompt,
  }),
  CriticDefSchema.parse({
    id: techSolid.id,
    name: techSolid.name,
    namespace: techSolid.namespace,
    trigger: techSolid.trigger,
    prompt: techSolid.prompt,
  }),
  CriticDefSchema.parse({
    id: techErrorHandling.id,
    name: techErrorHandling.name,
    namespace: techErrorHandling.namespace,
    trigger: techErrorHandling.trigger,
    prompt: techErrorHandling.prompt,
  }),
];

export function selectCritics(ctx: CriticContext): CriticDef[] {
  const matched: CriticDef[] = [];
  for (const critic of ALL_CRITICS) {
    if (ctx.namespace_filter !== undefined && critic.namespace !== ctx.namespace_filter) {
      continue;
    }
    if (matchesTrigger(critic, ctx)) {
      matched.push(critic);
    }
  }
  return matched;
}

export function findCriticById(id: string): CriticDef | undefined {
  return ALL_CRITICS.find((c) => c.id === id);
}

function matchesTrigger(critic: CriticDef, ctx: CriticContext): boolean {
  const t = critic.trigger;
  if (t.always === true) return true;
  if (t.ac_field !== undefined && ctx.ac_fields_present !== undefined) {
    if (t.ac_field.some((f) => ctx.ac_fields_present?.includes(f))) return true;
  }
  if (t.tech_stack !== undefined && ctx.tech_stack !== undefined) {
    const lower = ctx.tech_stack.map((s) => s.toLowerCase());
    if (t.tech_stack.some((s) => lower.includes(s.toLowerCase()))) return true;
  }
  if (t.file_pattern !== undefined && ctx.changed_files !== undefined) {
    if (t.file_pattern.some((pat) => ctx.changed_files?.some((f) => matchGlob(f, pat)))) {
      return true;
    }
  }
  return false;
}

/**
 * Tiny glob matcher — supports `**` (any depth) + `*` (single segment).
 * Avoids pulling in a glob dep for v1; expand if patterns demand more.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const re =
    "^" +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "::DBLSTAR::")
      .replace(/\*/g, "[^/]*")
      .replace(/::DBLSTAR::/g, ".*") +
    "$";
  return new RegExp(re).test(filePath);
}
