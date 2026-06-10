// SPEC: docs/cli/spec.md (Stage 3-A.3 — Global Flags + Precedence)
//
// Global flag parsing + forbidden combination validation.
//
// Refactor (Stage 6-A.2 R5-A): split into small helpers per category to keep
// the entry parser's cognitive complexity within Biome's 15 threshold.

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { type Locale, resolveEnvLocale, SUPPORTED_LOCALES } from "../i18n/index.js";
import { err, ok, type Result } from "../result/index.js";

export interface GlobalFlags {
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly locale: Locale;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly noColor: boolean;
  readonly refresh: boolean; // doctor + future commands
  readonly includeDisabled: boolean; // doctor
  readonly configPath?: string;
}

export interface ParsedArgv {
  readonly flags: GlobalFlags;
  readonly positional: readonly string[];
}

interface RawFlags {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  noColor: boolean;
  refresh: boolean;
  includeDisabled: boolean;
  localeFlag: string | undefined;
  configPath: string | undefined;
  positional: string[];
}

export function parseArgv(argv: readonly string[]): Result<ParsedArgv, AgoraErrorThrown> {
  const raw = scanArgv(argv);
  const localeResult = resolveLocale(raw.localeFlag);
  if (!localeResult.ok) return localeResult;
  const comboResult = validateForbiddenCombinations(raw);
  if (!comboResult.ok) return comboResult;
  const flags: GlobalFlags = {
    help: raw.help,
    version: raw.version,
    json: raw.json,
    locale: localeResult.value,
    quiet: raw.quiet,
    verbose: raw.verbose,
    noColor: raw.noColor,
    refresh: raw.refresh,
    includeDisabled: raw.includeDisabled,
    ...(raw.configPath !== undefined ? { configPath: raw.configPath } : {}),
  };
  return ok({ flags, positional: raw.positional });
}

function scanArgv(argv: readonly string[]): RawFlags {
  const raw: RawFlags = {
    help: false,
    version: false,
    json: false,
    quiet: false,
    verbose: false,
    noColor: false,
    refresh: false,
    includeDisabled: false,
    localeFlag: undefined,
    configPath: undefined,
    positional: [],
  };
  for (const arg of argv) {
    classifyArg(arg, raw);
  }
  return raw;
}

function classifyArg(arg: string, raw: RawFlags): void {
  if (matchBooleanFlag(arg, raw)) return;
  if (arg.startsWith("--locale=")) {
    raw.localeFlag = arg.slice("--locale=".length);
    return;
  }
  if (arg.startsWith("--config=")) {
    raw.configPath = arg.slice("--config=".length);
    return;
  }
  raw.positional.push(arg);
}

function matchBooleanFlag(arg: string, raw: RawFlags): boolean {
  switch (arg) {
    case "--help":
    case "-h":
      raw.help = true;
      return true;
    case "--version":
    case "-v":
      raw.version = true;
      return true;
    case "--json":
      raw.json = true;
      return true;
    case "--quiet":
    case "-q":
      raw.quiet = true;
      return true;
    case "--verbose":
      raw.verbose = true;
      return true;
    case "--no-color":
      raw.noColor = true;
      return true;
    case "--refresh":
      raw.refresh = true;
      return true;
    case "--include-disabled":
      raw.includeDisabled = true;
      return true;
    default:
      return false;
  }
}

function resolveLocale(localeFlag: string | undefined): Result<Locale, AgoraErrorThrown> {
  // Only an EXPLICIT --locale=<x> may hard-error: the user stated an
  // intent we can't honor. Environment-derived locales (AGORA_LOCALE /
  // LANG) fall back to "en" — LANG is set by the OS for every process
  // (CI runners ship C.UTF-8, users run ja_JP.UTF-8 etc.), and rejecting
  // it made EVERY CLI invocation exit 2 in those environments.
  if (localeFlag !== undefined) {
    const normalized = normalizeLocale(localeFlag);
    if (!SUPPORTED_LOCALES.includes(normalized as Locale)) {
      return err(
        buildAgoraError("user.forbidden-flag-combo", {
          context: {
            detail: `Locale '${localeFlag}' not bundled. v1 supports: ${SUPPORTED_LOCALES.join(", ")}.`,
            flag: "--locale",
          },
        }),
      );
    }
    return ok(normalized as Locale);
  }
  return ok(resolveEnvLocale());
}

function normalizeLocale(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("en")) return "en";
  return lower;
}

function validateForbiddenCombinations(raw: RawFlags): Result<void, AgoraErrorThrown> {
  const checks: { when: boolean; detail: string }[] = [
    {
      when: raw.json && raw.verbose,
      detail: "--verbose has no effect with --json (output is always batched).",
    },
    {
      when: raw.json && raw.noColor,
      detail: "--no-color has no effect with --json (color already absent).",
    },
    { when: raw.quiet && raw.verbose, detail: "Cannot combine --quiet and --verbose." },
  ];
  for (const check of checks) {
    if (check.when) {
      return err(
        buildAgoraError("user.forbidden-flag-combo", { context: { detail: check.detail } }),
      );
    }
  }
  return ok(undefined);
}
