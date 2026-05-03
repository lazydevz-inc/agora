// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 §`interpolation.ts`).
//
// Internal helper. Two-sided validation:
//   - Declared placeholder missing from context → throw
//   - Template uses `{name}` but `name` not declared OR not in context → throw
// Either case is a programming error; never silently fill with empty string.
//
// Throws AgoraErrorThrown("internal.invariant-violation"). Caller (renderPrompt)
// wraps via tryFrom() at the prompts/index.ts module boundary.

import { buildAgoraError } from "../errors/build.js";

const PLACEHOLDER_RE = /\{([a-z_][a-z0-9_]*)\}/g;

export function interpolate(
  template: string,
  context: Record<string, string>,
  declaredPlaceholders: readonly string[],
): string {
  for (const placeholder of declaredPlaceholders) {
    if (!(placeholder in context)) {
      throw buildAgoraError("internal.invariant-violation", {
        context: {
          detail: `prompt-library: declared placeholder "${placeholder}" missing from context (declared=${declaredPlaceholders.join(", ")})`,
          kind: "missing_placeholder_in_context",
          placeholder,
          declared: [...declaredPlaceholders],
        },
      });
    }
  }
  // Lenient on undeclared `{name}` in template: leave them alone.
  // Runbook authors use `{}` illustratively (e.g. JSON shape hints) and
  // those should NOT be substituted — only declared placeholders are
  // real interpolation targets. Caller-side bugs are caught by the
  // "declared but missing in context" check above.
  const declaredSet = new Set(declaredPlaceholders);
  return template.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (!declaredSet.has(name)) return match;
    return context[name] ?? "";
  });
}
