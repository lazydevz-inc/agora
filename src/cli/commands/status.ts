// SPEC: docs/cli/spec.md Stage 3-B.2 — `agora status` command.
//
// Reads .agora/state.json and renders current phase + progress. When no
// session exists, suggests `agora new`. JSON envelope mirrors TUI data.

import pc from "picocolors";

import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { ok, type Result } from "../../result/index.js";
import { findProjectRoot } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import type { State } from "../../state/types.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runStatusCommand(
  flags: GlobalFlags,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  const state = stateResult.value;

  if (!flags.json) emitTui(state);
  return ok(buildEnvelope(state));
}

function emitTui(state: State | null): void {
  if (state === null) {
    console.log(localized("cli.status.no_session"));
    console.log("");
    console.log(localized("cli.status.suggest_new"));
    return;
  }
  console.log(pc.bold(localized("cli.status.phase_label", { phase: state.current_phase })));
  if (state.current_phase === "in_alignment" && state.alignment !== undefined) {
    console.log(
      pc.dim(
        localized("cli.status.alignment_progress", {
          phase: String(state.alignment.phase),
          round: String(state.alignment.round),
        }),
      ),
    );
  }
  if (state.current_phase === "in_ralph" && state.ralph !== undefined) {
    console.log(
      pc.dim(
        localized("cli.status.ralph_progress", {
          iteration: String(state.ralph.iteration),
          last_gate: String(state.ralph.last_gate),
        }),
      ),
    );
  }
  console.log("");
  console.log(
    pc.dim(
      localized("cli.status.timestamps", {
        created: state.created_at,
        updated: state.updated_at,
      }),
    ),
  );
}

function buildEnvelope(state: State | null): CommandEnvelope {
  return {
    command: "agora status",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        session_present: state !== null,
        ...(state !== null ? { state } : {}),
      },
    },
    next:
      state === null
        ? [
            {
              id: "start_new",
              description: "Start a new Agora session",
              command: "agora new <name>",
            },
          ]
        : [],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}

function getAgoraVersion(): string {
  try {
    const url = new URL("../../../package.json", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
