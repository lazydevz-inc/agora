// SPEC: docs/architecture/locale-catalog.md (Stage 5-A.5) +
//       docs/infra/errors-and-telemetry.md (Stage 4-A.6 R5-A)
//
// Public i18n API: setLocale / getLocale / localized.
//
// localized() throws on missing key (NO silent en fallback for ko — F1
// enforcement). The throw is the documented English-fallback exception
// (Stage 5-A.5 + 5-A.6 R5-A): we cannot resolve the missing-key error's
// own message via catalog, so we hardcode an English description.
//
// This module imports `@/errors/types` ONLY (types — no logic) to avoid
// circular dep with @/errors/build (which depends on this module).

import { AgoraErrorThrown } from "../errors/types.js";
import { CATALOGS, type Locale, lookupKey } from "./catalog.js";

export { type Locale, loadCatalog, SUPPORTED_LOCALES } from "./catalog.js";

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

// Single source of truth for environment locale sniffing (AGORA_LOCALE,
// then LANG). Env-derived locales never hard-error: the OS sets LANG for
// every process (CI ships C.UTF-8, users run ja_JP.UTF-8 etc.), so
// unsupported values fall back to "en". Only an explicit --locale flag may
// refuse (cli/flags.ts). Callers: CLI flag resolution (env branch), MCP
// tool entry (mcp/tools.ts), Mode 2 cost warning (llm/selection.ts).
export function resolveEnvLocale(): Locale {
  const raw = (process.env["AGORA_LOCALE"] ?? process.env["LANG"] ?? "en").toLowerCase();
  return raw.startsWith("ko") ? "ko" : "en";
}

export function localized(key: string, ctx?: Record<string, string>): string {
  const catalog = CATALOGS[currentLocale];
  const template = lookupKey(catalog, key);
  if (template === undefined) {
    throw makeMissingKeyError(key, currentLocale);
  }
  return interpolate(template, ctx ?? {});
}

function interpolate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_match, name) => {
    if (!(name in ctx)) {
      throw makeMissingPlaceholderError(name, template);
    }
    const value = ctx[name];
    return value ?? "";
  });
}

function makeMissingKeyError(key: string, locale: Locale): AgoraErrorThrown {
  return new AgoraErrorThrown({
    code: "internal.invariant-violation",
    category: "internal",
    message: `i18n: missing locale key "${key}" in catalog "${locale}.json"`,
    message_key: "errors.internal.invariant_violation",
    context: { kind: "missing_locale_key", key, locale },
  });
}

function makeMissingPlaceholderError(name: string, template: string): AgoraErrorThrown {
  return new AgoraErrorThrown({
    code: "internal.invariant-violation",
    category: "internal",
    message: `i18n: missing placeholder "${name}" in context for template`,
    message_key: "errors.internal.invariant_violation",
    context: {
      kind: "missing_placeholder",
      placeholder: name,
      template_excerpt: template.slice(0, 100),
    },
  });
}
