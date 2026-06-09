#!/usr/bin/env node

// SPEC: docs/cli/spec.md (Stage 3) + docs/infra/install.md (Stage 4-A.1)
//
// CLI top-level entry per Stage 5-A.6 R3-A:
// - Parse argv via cli/flags.ts (returns Result)
// - Dispatch to command (returns Result)
// - emit() result + process.exit(exit_code)
// - Top-level uncaughtException handler catches AgoraErrorThrown and any
//   unexpected throw → emit + exit per Stage 4-A.6 R2-A.

import { buildAgoraError, exitCodeForError } from "../errors/build.js";
import { AgoraErrorThrown } from "../errors/types.js";
import { setLocale } from "../i18n/index.js";
import { appendEvent } from "../shared/events.js";
import { findProjectRoot } from "../shared/path.js";
import { runAcCommand } from "./commands/ac.js";
import { runBracketCommand } from "./commands/bracket.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runEfficientCommand } from "./commands/efficient.js";
import { runFormCommand } from "./commands/form.js";
import { runHandoffCommand } from "./commands/handoff.js";
import { runIntakeCommand } from "./commands/intake.js";
import { runMaterialCommand } from "./commands/material.js";
import { runMaturityCommand } from "./commands/maturity.js";
import { runNewCommand } from "./commands/new.js";
import { runPingCommand } from "./commands/ping.js";
import { runRalphCommand } from "./commands/ralph.js";
import { runResumeCommand } from "./commands/resume.js";
import { runRoundCommand } from "./commands/round.js";
import { runSocratesCommand } from "./commands/socrates.js";
import { runStatusCommand } from "./commands/status.js";
import { runTelosCommand } from "./commands/telos.js";
import { runTraceCommand } from "./commands/trace.js";
import { runVersionCommand } from "./commands/version.js";
import { type GlobalFlags, parseArgv } from "./flags.js";
import { type EmitMode, emit, emitAgoraError } from "./render.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsedResult = parseArgv(argv);
  if (!parsedResult.ok) {
    const mode: EmitMode = inferEmitMode(argv);
    emitAgoraError(parsedResult.error, mode, useColorFromEnv());
    process.exit(exitCodeForError(parsedResult.error));
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
    await emitCommandInvoked("agora --version", flags, positional);
    await dispatchVersion(flags, mode, useColor);
    return;
  }

  const command = positional[0];
  await emitCommandInvoked(command !== undefined ? `agora ${command}` : "agora", flags, positional);
  if (command === "doctor") {
    await dispatchDoctor(flags, mode, useColor);
    return;
  }
  if (command === "ping") {
    await dispatchPing(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "status") {
    await dispatchStatus(flags, mode, useColor);
    return;
  }
  if (command === "new") {
    await dispatchNew(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "bracket") {
    await dispatchBracket(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "resume") {
    await dispatchResume(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "intake") {
    await dispatchIntake(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "round") {
    await dispatchRound(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "telos") {
    await dispatchTelos(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "form") {
    await dispatchForm(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "material") {
    await dispatchMaterial(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "efficient") {
    await dispatchEfficient(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "socrates") {
    await dispatchSocrates(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "maturity") {
    await dispatchMaturity(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "ac") {
    await dispatchAc(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "handoff") {
    await dispatchHandoff(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "ralph") {
    await dispatchRalph(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "trace") {
    await dispatchTrace(flags, positional.slice(1), mode, useColor);
    return;
  }
  if (command === "mcp") {
    // Launch the MCP server (ADR-0009 primary mode). Does NOT return —
    // server.connect keeps the process alive on stdio. No emit()/exit
    // here; stdout belongs to the MCP protocol.
    const { startAgoraMcpServer } = await import("../mcp/server.js");
    await startAgoraMcpServer();
    return;
  }

  // An unrecognized command is a usage error — never silently fall through
  // to the version summary (that swallows typos with exit 0). The bare
  // `agora` (no positional) intentionally prints the version-style summary.
  if (command !== undefined) {
    const unknown = buildAgoraError("user.unknown-command", {
      context: { command },
    });
    emitAgoraError(unknown, mode, useColor);
    process.exit(exitCodeForError(unknown));
  }

  // No command + no --version: print version-style summary (default action).
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
    process.exit(exitCodeForError(result.error));
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
    process.exit(exitCodeForError(result.error));
  }
  // Doctor TUI rendering happens inside the command (multi-line, color-aware).
  // For JSON mode, render via the standard envelope emitter.
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchPing(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runPingCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchStatus(
  flags: GlobalFlags,
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runStatusCommand(flags);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchNew(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runNewCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchBracket(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runBracketCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchResume(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runResumeCommand(flags, positional);
  if (!result.ok) {
    // Exit code is the per-code value pinned in ERROR_CATALOG (single
    // source of truth; matches the JSON envelope's exit_code field).
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchIntake(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runIntakeCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchRound(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runRoundCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchTelos(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runTelosCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchForm(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runFormCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchMaterial(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runMaterialCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchEfficient(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runEfficientCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchSocrates(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runSocratesCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchMaturity(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runMaturityCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchAc(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runAcCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchHandoff(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runHandoffCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchRalph(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runRalphCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
  if (mode === "json") {
    emit(result.value, mode, useColor);
  }
  process.exit(result.value.exit_code);
}

async function dispatchTrace(
  flags: GlobalFlags,
  positional: readonly string[],
  mode: EmitMode,
  useColor: boolean,
): Promise<void> {
  const result = await runTraceCommand(flags, positional);
  if (!result.ok) {
    emitAgoraError(result.error, mode, useColor);
    process.exit(exitCodeForError(result.error));
  }
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
  console.log("  agora ping [pmt]  Send a small prompt to Claude (LLM smoke test)");
  console.log("  agora status      Show current session phase + progress");
  console.log("  agora new [name]  Start a new alignment session (Phase 0 auto-scan)");
  console.log("  agora bracket     Run Husserl Phase −1 Epoché (interactive)");
  console.log("  agora resume      Resume work from current state.json phase");
  console.log("  agora intake      Run Phase 1 open intake (interactive)");
  console.log(
    "  agora round       Run next Phase 2 round (auto-picks telos/form/material/efficient/maturity)",
  );
  console.log("");
  console.log("  Phase 2 explicit shortcuts (rarely needed; agora round picks the right one):");
  console.log("    agora telos        Force Aristotle telos round");
  console.log("    agora form         Force Aristotle form round");
  console.log("    agora material     Force Aristotle material round");
  console.log("    agora efficient    Force Aristotle efficient round");
  console.log("    agora socrates     Force Socrates elenchus (case-probe load-bearing claims)");
  console.log("    agora maturity     Force Plato Divided Line maturity tagging");
  console.log("    agora ac           Capture acceptance criteria (after maturity-pass)");
  console.log(
    "    agora handoff      Lock seed: Plato Dihairesis + seed.json + transition to ready_for_ralph",
  );
  console.log("");
  console.log(
    "  agora ralph       Run Ralph iteration: pick next leaf + Gate 1 (typecheck/lint/test/build)",
  );
  console.log(
    "  agora trace       View .agora/events.jsonl audit log (--type, --since, --command, --limit)",
  );
  console.log(
    "  agora mcp         Run as an MCP server inside Claude Code (read-only tools; zero LLM calls)",
  );
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

// Commands that are pure read-only observers of .agora/events.jsonl —
// recording their own invocation would create a self-referential loop
// (every `agora trace` would polute the very log it reads). Skip emit
// for these; AGORA_COMMAND env still gets stamped for downstream LLM
// attribution (which never runs for these read-only commands anyway).
const COMMAND_INVOKED_SKIP: ReadonlySet<string> = new Set(["agora trace"]);

async function emitCommandInvoked(
  command: string,
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<void> {
  process.env["AGORA_COMMAND"] = command;
  if (COMMAND_INVOKED_SKIP.has(command)) return;
  // Audit-log entry per Stage 6-A.23 R5-A. Fail-soft: if no .agora/
  // exists (greenfield pre-`agora new`), appendEvent returns false.
  await appendEvent(findProjectRoot(process.cwd()), {
    type: "command.invoked",
    command,
    data: {
      positional: [...positional],
      flags: {
        json: flags.json,
        locale: flags.locale,
        no_color: flags.noColor,
        help: flags.help,
        version: flags.version,
      },
    },
  });
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
