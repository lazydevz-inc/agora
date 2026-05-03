// SPEC: docs/cli/spec.md (Stage 3-A.3 — Global Flags + Precedence)
//
// Global flag parsing + forbidden combination validation. First slice
// implements the subset needed for `agora --version`:
//   --version / -v       (this slice)
//   --json               (this slice)
//   --locale=<code>      (this slice)
//   --help / -h          (this slice — minimal)
//   --quiet / -q         (parsed; no behavior yet)
//   --verbose            (parsed; no behavior yet)
//   --no-color           (parsed; no behavior yet)
//   --config=<path>      (parsed; no behavior — first config-using slice)
//
// Returns parsed flags + remaining argv (for command dispatch).

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { type Locale, SUPPORTED_LOCALES } from "../i18n/index.js";
import { err, ok, type Result } from "../result/index.js";

export interface GlobalFlags {
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly locale: Locale;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly noColor: boolean;
  readonly configPath?: string;
}

export interface ParsedArgv {
  readonly flags: GlobalFlags;
  readonly positional: readonly string[];
}

export function parseArgv(argv: readonly string[]): Result<ParsedArgv, AgoraErrorThrown> {
  const positional: string[] = [];
  let help = false;
  let version = false;
  let json = false;
  let quiet = false;
  let verbose = false;
  let noColor = false;
  let localeFlag: string | undefined;
  let configPath: string | undefined;

  for (const arg of argv) {
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-v":
        version = true;
        break;
      case "--json":
        json = true;
        break;
      case "--quiet":
      case "-q":
        quiet = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--no-color":
        noColor = true;
        break;
      default:
        if (arg.startsWith("--locale=")) {
          localeFlag = arg.slice("--locale=".length);
        } else if (arg.startsWith("--config=")) {
          configPath = arg.slice("--config=".length);
        } else if (arg.startsWith("-")) {
          // Unknown flag — let downstream commands decide; ignored at global level for now.
          // First slice has no command flags beyond the global set above.
          positional.push(arg);
        } else {
          positional.push(arg);
        }
        break;
    }
  }

  // Resolve locale: --locale > AGORA_LOCALE > LANG > default "en"
  const envLocale = process.env["AGORA_LOCALE"] ?? process.env["LANG"];
  const localeRaw = localeFlag ?? envLocale ?? "en";
  const localeNormalized = normalizeLocale(localeRaw);
  if (!SUPPORTED_LOCALES.includes(localeNormalized as Locale)) {
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: {
          detail: `Locale '${localeRaw}' not bundled. v1 supports: ${SUPPORTED_LOCALES.join(", ")}.`,
          flag: "--locale",
        },
      }),
    );
  }
  const locale = localeNormalized as Locale;

  // Forbidden combinations (subset enforced this slice).
  if (json && verbose) {
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: { detail: "--verbose has no effect with --json (output is always batched)." },
      }),
    );
  }
  if (json && noColor) {
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: { detail: "--no-color has no effect with --json (color already absent)." },
      }),
    );
  }
  if (quiet && verbose) {
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: { detail: "Cannot combine --quiet and --verbose." },
      }),
    );
  }

  const flags: GlobalFlags = {
    help,
    version,
    json,
    locale,
    quiet,
    verbose,
    noColor,
    ...(configPath !== undefined ? { configPath } : {}),
  };
  return ok({ flags, positional });
}

function normalizeLocale(raw: string): string {
  // LANG can be "ko_KR.UTF-8" or "en_US.UTF-8" — extract leading 2-letter code.
  const lower = raw.toLowerCase();
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("en")) return "en";
  return lower;
}
