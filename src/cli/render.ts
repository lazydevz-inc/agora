// SPEC: docs/cli/spec.md (Stage 3-A.1 — Output Format Framework)
//
// Universal output envelope per Stage 3-A.1 R2-A. Two render modes for
// this slice: TUI (human stderr/stdout) + JSON (single-shot). MCP mode
// arrives with Stage 4-A.5 implementation.

import pc from "picocolors";
import type { AgoraErrorThrown } from "../errors/types.js";

export type EmitMode = "tui" | "json";

export interface CommandEnvelope {
  readonly command: string;
  readonly version: string;
  readonly timestamp: string;
  readonly result: {
    readonly ok: boolean;
    readonly data?: Record<string, unknown>;
  };
  readonly next: readonly NextSuggestion[];
  readonly warnings: readonly Warning[];
  readonly errors: readonly EnvelopeError[];
  readonly exit_code: 0 | 1 | 2 | 4 | 5 | 20;
}

export interface NextSuggestion {
  readonly id: string;
  readonly description: string;
  readonly command: string;
}

export interface Warning {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

export interface EnvelopeError {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly fix?: string;
  readonly context?: Record<string, unknown>;
}

export function emit(envelope: CommandEnvelope, mode: EmitMode, useColor: boolean): void {
  if (mode === "json") {
    emitJson(envelope);
    return;
  }
  emitTui(envelope, useColor);
}

function emitJson(envelope: CommandEnvelope): void {
  // JSON envelope per Stage 3-A.1 — exit_code is internal field; present
  // in JSON for AI agents to programmatically inspect, but the process
  // exit() call also uses it.
  console.log(JSON.stringify(envelope, null, 2));
}

function emitTui(envelope: CommandEnvelope, useColor: boolean): void {
  const c = makeColors(useColor);
  // For first slice the only TUI path is `agora --version` → single-line.
  if (envelope.command === "agora --version") {
    const version = envelope.result.data?.["agora_version"];
    if (typeof version === "string") {
      console.log(`agora ${version}`);
    }
    return;
  }
  // Fallback (shouldn't hit in this slice): print errors to stderr.
  for (const e of envelope.errors) {
    console.error(c.red("✗"), e.message);
    if (e.fix !== undefined) {
      console.error(c.dim("  Fix:"), e.fix);
    }
  }
}

export function emitAgoraError(error: AgoraErrorThrown, mode: EmitMode, useColor: boolean): void {
  const c = makeColors(useColor);
  if (mode === "json") {
    const envelope: CommandEnvelope = {
      command: "agora",
      version: readPackageVersion(),
      timestamp: new Date().toISOString(),
      result: { ok: false },
      next: [],
      warnings: [],
      errors: [
        {
          code: error.code,
          category: error.category,
          message: error.message,
          ...(error.fix !== undefined ? { fix: error.fix } : {}),
          ...(error.context !== undefined ? { context: error.context } : {}),
        },
      ],
      exit_code: getExitCodeForError(error),
    };
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.error(c.red("agora: error:"), error.message);
  if (error.fix !== undefined) {
    console.error(c.dim("  Fix:"), error.fix);
  }
}

function getExitCodeForError(error: AgoraErrorThrown): 0 | 1 | 2 | 4 | 5 | 20 {
  // Look up exit code via the catalog without circular import — derive from
  // category (matches the per-category default; specific codes can carry
  // their own exit_code, looked up at error-construction time eventually).
  // For this slice, category-derived mapping suffices.
  switch (error.category) {
    case "config":
    case "state":
      return 20;
    case "user":
      return 5;
    case "gate":
    case "probe":
      return 4;
    default:
      return 1;
  }
}

interface Colors {
  red: (s: string) => string;
  green: (s: string) => string;
  cyan: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

function makeColors(useColor: boolean): Colors {
  if (!useColor) {
    const id = (s: string) => s;
    return { red: id, green: id, cyan: id, dim: id, bold: id };
  }
  return {
    red: pc.red,
    green: pc.green,
    cyan: pc.cyan,
    dim: pc.dim,
    bold: pc.bold,
  };
}

function readPackageVersion(): string {
  // Lightweight fallback used when emitAgoraError fires before normal
  // version-resolution path. Avoids circular import with commands/version.
  // Best-effort; returns "unknown" if package.json cannot be located here.
  try {
    // Resolve relative to compiled dist/cli/render.js → ../../package.json
    const url = new URL("../../package.json", import.meta.url);
    // Synchronous read to keep error path fully sync.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
