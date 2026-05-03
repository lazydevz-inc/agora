#!/usr/bin/env tsx
// SPEC: docs/architecture/locale-catalog.md (Stage 5-A.5 R4-A).
//
// `pnpm lint:locale` — three checks:
//   1. en/ko keyset parity (F1 enforcement)
//   2. ERROR_CATALOG cross-ref (every message_key + fix_key exists in both)
//   3. Placeholder consistency (en/ko strings for same key use same {placeholder} set)
//
// Exit code 4 (gate.gate-1-deterministic-fail per Stage 4-A.6) on any failure.

import enCatalog from "../messages/en.json" with { type: "json" };
import koCatalog from "../messages/ko.json" with { type: "json" };

import { ERROR_CATALOG } from "../src/errors/codes.ts";

interface FailureBucket {
  kind: string;
  details: string[];
}

const failures: FailureBucket[] = [];

// ─── Check 1: en/ko keyset parity ───
const enKeys = new Set(flatten(enCatalog));
const koKeys = new Set(flatten(koCatalog));
const missingInKo = setDiff(enKeys, koKeys);
const missingInEn = setDiff(koKeys, enKeys);

if (missingInKo.length > 0 || missingInEn.length > 0) {
  failures.push({
    kind: "Check 1: en/ko keyset parity",
    details: [
      ...(missingInKo.length > 0
        ? [`Missing in ko.json (${missingInKo.length}): ${missingInKo.join(", ")}`]
        : []),
      ...(missingInEn.length > 0
        ? [`Missing in en.json (${missingInEn.length}): ${missingInEn.join(", ")}`]
        : []),
    ],
  });
}

// ─── Check 2: ERROR_CATALOG cross-reference ───
const ec2Failures: string[] = [];
for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
  if (!enKeys.has(entry.message_key)) {
    ec2Failures.push(`code '${code}' references message_key '${entry.message_key}' missing from en.json`);
  }
  if (!koKeys.has(entry.message_key)) {
    ec2Failures.push(`code '${code}' references message_key '${entry.message_key}' missing from ko.json`);
  }
  if (entry.fix_key !== undefined) {
    if (!enKeys.has(entry.fix_key)) {
      ec2Failures.push(`code '${code}' references fix_key '${entry.fix_key}' missing from en.json`);
    }
    if (!koKeys.has(entry.fix_key)) {
      ec2Failures.push(`code '${code}' references fix_key '${entry.fix_key}' missing from ko.json`);
    }
  }
}
if (ec2Failures.length > 0) {
  failures.push({ kind: "Check 2: ERROR_CATALOG cross-reference", details: ec2Failures });
}

// ─── Check 3: Placeholder consistency ───
const ec3Failures: string[] = [];
const enFlat = flattenWithValues(enCatalog);
const koFlat = flattenWithValues(koCatalog);
for (const [key, enVal] of Object.entries(enFlat)) {
  const koVal = koFlat[key];
  if (koVal === undefined) continue; // already reported by Check 1
  const enPlaceholders = extractPlaceholders(enVal);
  const koPlaceholders = extractPlaceholders(koVal);
  const onlyInEn = setDiff(enPlaceholders, koPlaceholders);
  const onlyInKo = setDiff(koPlaceholders, enPlaceholders);
  if (onlyInEn.length > 0 || onlyInKo.length > 0) {
    ec3Failures.push(
      `key '${key}': en uses {${[...enPlaceholders].sort().join(", ")}}; ko uses {${[...koPlaceholders].sort().join(", ")}}; diff: en-only={${onlyInEn.join(", ")}} ko-only={${onlyInKo.join(", ")}}`,
    );
  }
}
if (ec3Failures.length > 0) {
  failures.push({ kind: "Check 3: placeholder consistency", details: ec3Failures });
}

// ─── Report + exit ───
if (failures.length === 0) {
  console.log("✓ pnpm lint:locale — all 3 checks pass.");
  process.exit(0);
}
for (const bucket of failures) {
  console.error(`\n✗ ${bucket.kind}:`);
  for (const detail of bucket.details) {
    console.error(`    ${detail}`);
  }
}
console.error(`\n${failures.length} check(s) failed.`);
process.exit(4);

// ─── Helpers ───

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      out.push(fullKey);
    } else if (typeof value === "object" && value !== null) {
      out.push(...flatten(value, fullKey));
    }
  }
  return out;
}

function flattenWithValues(obj: unknown, prefix = ""): Record<string, string> {
  if (obj === null || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      out[fullKey] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(out, flattenWithValues(value, fullKey));
    }
  }
  return out;
}

function setDiff<T>(a: Iterable<T>, b: Set<T> | Iterable<T>): T[] {
  const bSet = b instanceof Set ? b : new Set(b);
  return [...a].filter((x) => !bSet.has(x));
}

function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{([a-z_][a-z0-9_]*)\}/g);
  return [...new Set(Array.from(matches, (m) => m[1] ?? ""))].filter((s) => s.length > 0);
}
