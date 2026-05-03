// SPEC: docs/architecture/locale-catalog.md (Stage 5-A.5)
//
// Catalog loading + dotted-key lookup with hybrid nested + flat-leaf-with-dots
// support (R3-A).

import enCatalog from "../../messages/en.json" with { type: "json" };
import koCatalog from "../../messages/ko.json" with { type: "json" };

export const CATALOGS = { en: enCatalog, ko: koCatalog } as const;
export type Locale = keyof typeof CATALOGS;
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ko"];

export function loadCatalog(locale: Locale): unknown {
  return CATALOGS[locale];
}

/**
 * Walk a nested object catalog by dotted key, supporting flat-leaf-with-dots
 * keys at any depth (e.g. "errors.config.missing_version.fix" matches either
 * a fully nested path OR a flat leaf "missing_version.fix" under errors.config).
 *
 * Per Stage 5-A.5 R3-A: at each depth, try matching the remaining segments as
 * a single flat-leaf string key before descending further.
 */
export function lookupKey(catalog: unknown, dottedKey: string): string | undefined {
  const segments = dottedKey.split(".");
  let cursor: unknown = catalog;

  for (let i = 0; i < segments.length; i++) {
    if (cursor === null || typeof cursor !== "object") return undefined;

    // Try matching the rest as a flat leaf key at this depth.
    const remainingKey = segments.slice(i).join(".");
    const cursorObj = cursor as Record<string, unknown>;
    const flatMatch = cursorObj[remainingKey];
    if (typeof flatMatch === "string") return flatMatch;

    // Otherwise descend by next segment.
    const segment = segments[i];
    if (segment === undefined) return undefined;
    cursor = cursorObj[segment];
  }
  return typeof cursor === "string" ? cursor : undefined;
}
