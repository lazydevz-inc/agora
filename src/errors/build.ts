// SPEC: docs/infra/errors-and-telemetry.md (Stage 4-A.6)
//
// buildAgoraError(code, opts) — constructs AgoraErrorThrown with localized
// message + fix. Constructor pattern (does NOT throw; caller chooses
// throw or err() wrap).

import { localized } from "../i18n/index.js";
import { ERROR_CATALOG, type ErrorCatalogEntry, type ErrorCode } from "./codes.js";
import { AgoraErrorThrown } from "./types.js";

export interface BuildOptions {
  context?: Record<string, unknown> | undefined;
  cause?: unknown;
}

export function buildAgoraError(code: ErrorCode, opts?: BuildOptions): AgoraErrorThrown {
  // Cast widens from `satisfies`-narrowed literal to the full ErrorCatalogEntry
  // shape (which has fix_key as optional). Same data; broader interface.
  const entry = ERROR_CATALOG[code] as ErrorCatalogEntry;
  // Locale interpolation only accepts string context; coerce here so callers
  // can pass structured (numbers, paths) in opts.context for crash reports.
  const localeContext = stringifyContext(opts?.context);
  const message = localized(entry.message_key, localeContext);
  const fix = entry.fix_key !== undefined ? localized(entry.fix_key, localeContext) : undefined;
  return new AgoraErrorThrown({
    code,
    category: entry.category,
    message,
    message_key: entry.message_key,
    fix,
    fix_key: entry.fix_key,
    cause: opts?.cause,
    context: opts?.context,
  });
}

/**
 * Canonical process/envelope exit code for an error — the per-code value
 * pinned in ERROR_CATALOG (Stage 4-A.6 R2-A), NOT a category-derived guess.
 * Both the JSON envelope (render.ts) and the CLI process exit (cli/index.ts)
 * must use this so the two never disagree.
 */
export function exitCodeForError(error: { code: ErrorCode }): ErrorCatalogEntry["exit_code"] {
  return (ERROR_CATALOG[error.code] as ErrorCatalogEntry).exit_code;
}

function stringifyContext(ctx: Record<string, unknown> | undefined): Record<string, string> {
  if (ctx === undefined) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx)) {
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}
