#!/usr/bin/env node

// SPEC: docs/cli/spec.md (Stage 3) + docs/infra/install.md (Stage 4-A.1)
//
// CLI top-level entry per Stage 5-A.6 R3-A:
// - Parse argv via cli/flags.ts (returns Result)
// - Dispatch to command (returns Result)
// - emit() result + process.exit(exit_code)
// - Top-level uncaughtException handler catches AgoraErrorThrown and any
//   unexpected throw → emit + exit per Stage 4-A.6 R2-A.

import { AgoraErrorThrown } from "../errors/types.js";
import { setLocale } from "../i18n/index.js";
import { runVersionCommand } from "./commands/version.js";
import { parseArgv } from "./flags.js";
import { type EmitMode, emit, emitAgoraError } from "./render.js";

async function main(): Promise<void> {
  // Skip first 2 argv entries (node + script path).
  const argv = process.argv.slice(2);
  const parsedResult = parseArgv(argv);
  if (!parsedResult.ok) {
    const mode: EmitMode = inferEmitMode(argv);
    emitAgoraError(parsedResult.error, mode, useColorFromEnv());
    process.exit(5); // user.forbidden-flag-combo → exit 5
  }
  const { flags } = parsedResult.value;
  setLocale(flags.locale);
  const mode: EmitMode = flags.json ? "json" : "tui";
  const useColor = !flags.noColor && !flags.json && supportsColor();

  // Dispatch — first slice handles only --version (and falls back to
  // version when no command yet specified). Other commands land in
  // subsequent slices.
  if (flags.version || flags.help === false) {
    const result = runVersionCommand(flags);
    if (!result.ok) {
      emitAgoraError(result.error, mode, useColor);
      process.exit(1);
    }
    emit(result.value, mode, useColor);
    process.exit(result.value.exit_code);
  }

  // Help fallback (minimal for first slice — full help in later slice).
  if (flags.help) {
    console.log(
      "agora — agent harness where ancient philosophers gather to refine intent into reality.",
    );
    console.log("Usage: agora [command] [options]");
    console.log("");
    console.log("Universal flags:");
    console.log("  -h, --help        Show this message");
    console.log("  -v, --version     Show Agora version");
    console.log("      --json        JSON output mode");
    console.log("      --locale=<c>  ko or en (default: env LANG or en)");
    console.log("");
    console.log("Full CLI surface arrives in subsequent Stage 6 slices.");
    process.exit(0);
  }

  // No-op default for first slice (will be replaced by `agora` default
  // command per Stage 3-B.7).
  emit(
    {
      command: "agora",
      version: "unknown",
      timestamp: new Date().toISOString(),
      result: {
        ok: true,
        data: { message: "Stage 6-A.1 first slice — only --version is wired up." },
      },
      next: [
        {
          id: "show_version",
          description: "Print Agora version",
          command: "agora --version",
        },
      ],
      warnings: [],
      errors: [],
      exit_code: 0,
    },
    mode,
    useColor,
  );
  process.exit(0);
}

function inferEmitMode(argv: readonly string[]): EmitMode {
  return argv.includes("--json") || process.env["AGORA_JSON"] === "1" ? "json" : "tui";
}

function useColorFromEnv(): boolean {
  return process.env["NO_COLOR"] === undefined && supportsColor();
}

function supportsColor(): boolean {
  // Per Stage 3-A.1: TTY detection + NO_COLOR env. Strict (TTY required).
  return process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined;
}

// Top-level uncaught handlers (Stage 4-A.6 R2-A).
process.on("uncaughtException", (error: unknown) => handleUncaught(error));
process.on("unhandledRejection", (reason: unknown) => handleUncaught(reason));

function handleUncaught(reason: unknown): void {
  const mode: EmitMode = inferEmitMode(process.argv.slice(2));
  const useColor = useColorFromEnv();
  if (reason instanceof AgoraErrorThrown) {
    emitAgoraError(reason, mode, useColor);
    process.exit(1);
  }
  // Unknown error — wrap as internal.uncaught (stringified)
  const wrapped = new AgoraErrorThrown({
    code: "internal.uncaught",
    category: "internal",
    message: reason instanceof Error ? reason.message : String(reason),
    message_key: "errors.internal.uncaught",
    cause: reason,
  });
  emitAgoraError(wrapped, mode, useColor);
  process.exit(1);
}

main().catch(handleUncaught);
