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
import { runDoctorCommand } from "./commands/doctor.js";
import { runVersionCommand } from "./commands/version.js";
import { type GlobalFlags, parseArgv } from "./flags.js";
import { type EmitMode, emit, emitAgoraError } from "./render.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsedResult = parseArgv(argv);
  if (!parsedResult.ok) {
    const mode: EmitMode = inferEmitMode(argv);
    emitAgoraError(parsedResult.error, mode, useColorFromEnv());
    process.exit(5);
  }
  const { flags, positional } = parsedResult.value;
  setLocale(flags.locale);
  const mode: EmitMode = flags.json ? "json" : "tui";
  const useColor = !flags.noColor && !flags.json && supportsColor();

  // Help short-circuit.
  if (flags.help && positional.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Version short-circuit (also default for first slice with no command).
  if (flags.version) {
    await dispatchVersion(flags, mode, useColor);
    return;
  }

  const command = positional[0];
  if (command === "doctor") {
    await dispatchDoctor(flags, mode, useColor);
    return;
  }

  // No command + no --version: print version-style summary for now.
  // (Stage 3-B.7 default command lands in a later slice.)
  await dispatchVersion(flags, mode, useColor);
}

async function dispatchVersion(
  flags: GlobalFlags,
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = runVersionCommand(flags);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(1);
  }
  emit(result.value, mode, useColor);
  process.exit(result.value.exit_code);
}

async function dispatchDoctor(
  flags: GlobalFlags,
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runDoctorCommand(flags);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(1);
  }
  // Doctor TUI rendering happens inside the command (multi-line, color-aware).
  // For JSON mode, render via the standard envelope emitter.
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

function printHelp(): void {
  console.log(
    "agora — agent harness where ancient philosophers gather to refine intent into reality.",
  );
  console.log("Usage: agora [command] [options]");
  console.log("");
  console.log("Commands:");
  console.log("  agora             (default) print version + suggested next");
  console.log("  agora doctor      Diagnose environment + run Gate 0 probes");
  console.log("");
  console.log("Universal flags:");
  console.log("  -h, --help        Show this message");
  console.log("  -v, --version     Show Agora version");
  console.log("      --json        JSON output mode");
  console.log("      --locale=<c>  ko or en (default: env LANG or en)");
  console.log("");
  console.log("doctor flags:");
  console.log("      --refresh           Bust cached Gate 0 probe results");
  console.log("      --include-disabled  Show disabled probes as warnings");
  console.log("");
  console.log("Full CLI surface arrives in subsequent Stage 6 slices.");
}

function inferEmitMode(argv: readonly string[]): EmitMode {
  return argv.includes("--json") || process.env["AGORA_JSON"] === "1" ? "json" : "tui";
}

function useColorFromEnv(): boolean {
  return process.env["NO_COLOR"] === undefined && supportsColor();
}

function supportsColor(): boolean {
  return process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined;
}

process.on("uncaughtException", (error: unknown) => handleUncaught(error));
process.on("unhandledRejection", (reason: unknown) => handleUncaught(reason));

function handleUncaught(reason: unknown): void {
  const mode: EmitMode = inferEmitMode(process.argv.slice(2));
  const useColor = useColorFromEnv();
  if (reason instanceof AgoraErrorThrown) {
    emitAgoraError(reason, mode, useColor);
    process.exit(1);
  }
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
