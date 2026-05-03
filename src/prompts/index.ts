// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 R5-A "Runtime
//       Lookup API").
//
// Public surface for the auto-generated prompt library. Type-safe key
// lookup + placeholder interpolation.
//
// Stage 5-A.6 R3-A reconciliation: renderPrompt returns Result<...> at
// the module boundary; internal helpers (interpolate) throw freely. The
// `getPrompt` accessor is type-safe (PromptKey union) so a missing key
// is a compile error, not a runtime fail.

import { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";
import { PROMPT_LIBRARY, type PromptKey } from "./_generated.js";
import { interpolate } from "./interpolation.js";

export { PROMPT_LIBRARY, type PromptKey } from "./_generated.js";
export type { PromptEntry } from "./types.js";

export function getPrompt<K extends PromptKey>(key: K): (typeof PROMPT_LIBRARY)[K] {
  return PROMPT_LIBRARY[key];
}

export function renderPrompt<K extends PromptKey>(
  key: K,
  context: Record<string, string>,
): Result<{ system: string; user: string }, AgoraErrorThrown> {
  const entry = getPrompt(key);
  try {
    return ok({
      system: interpolate(entry.system_prompt, context, entry.placeholders),
      user: interpolate(entry.user_prompt_template, context, entry.placeholders),
    });
  } catch (e) {
    if (e instanceof AgoraErrorThrown) return err(e);
    throw e;
  }
}
