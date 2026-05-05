// SPEC: docs/cli/spec.md Stage 3-B.2 — `agora status` command +
//       Stage 6-A.24 R1-A (Gate 5 + Disputatio trend display when
//       state.current_phase ∈ {in_ralph, in_ralph_paused, ralph_complete}).
//
// Reads .agora/state.json and renders current phase + progress. When no
// session exists, suggests `agora new`. When in a Ralph phase with a
// readable ralph_state.json, also surfaces gate_5 + disputatio trend
// (R3-A: only Ralph phases; R5-A: corrupt ralph_state → warning, not
// error). JSON envelope mirrors TUI data with optional `data.ralph_trend`.

import { join } from "node:path";

import pc from "picocolors";

import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { type RalphState, RalphStateSchema } from "../../ralph/state.js";
import { computeRalphTrend, type RalphTrend } from "../../ralph/trend.js";
import { ok, type Result } from "../../result/index.js";
import { readJsonOrNull } from "../../shared/io.js";
import { findProjectRoot } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import type { Phase, State } from "../../state/types.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

const RALPH_PHASES: ReadonlySet<Phase> = new Set(["in_ralph", "in_ralph_paused", "ralph_complete"]);

interface TrendLoadResult {
  readonly trend?: RalphTrend;
  readonly warning?: string;
}

export async function runStatusCommand(
  flags: GlobalFlags,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  const state = stateResult.value;

  const trendLoad =
    state !== null && RALPH_PHASES.has(state.current_phase)
      ? await loadRalphTrend(cwd)
      : ({} as TrendLoadResult);

  if (!flags.json) emitTui(state, trendLoad.trend);
  return ok(buildEnvelope(state, trendLoad));
}

async function loadRalphTrend(cwd: string): Promise<TrendLoadResult> {
  const ralphStatePath = join(cwd, ".agora", "ralph_state.json");
  const raw = await readJsonOrNull<unknown>(ralphStatePath);
  if (raw === null) {
    return { warning: localized("cli.status.ralph_trend_missing") };
  }
  const parsed = RalphStateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      warning: localized("cli.status.ralph_trend_corrupt", {
        detail: parsed.error.issues[0]?.message ?? "validation failed",
      }),
    };
  }
  return { trend: computeRalphTrend(parsed.data as RalphState) };
}

function emitTui(state: State | null, trend: RalphTrend | undefined): void {
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
  if (trend !== undefined) {
    console.log("");
    emitTrendTui(trend);
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

function emitTrendTui(trend: RalphTrend): void {
  console.log(pc.bold(localized("cli.status.ralph_trend_header")));
  console.log(
    localized("cli.status.ralph_trend_summary", {
      current_leaf: trend.current_leaf_id ?? "(none — complete)",
      completed: String(trend.completed_count),
      iterations: String(trend.total_iterations),
    }),
  );
  if (trend.gate_5.count === 0) {
    console.log(pc.dim(localized("cli.status.ralph_trend_no_gate_5")));
  } else {
    console.log(
      localized("cli.status.ralph_trend_gate_5", {
        count: String(trend.gate_5.count),
        sparkline: trend.gate_5.sparkline,
        last_drift: (trend.gate_5.last_drift ?? 0).toFixed(2),
        last_action: trend.gate_5.last_action ?? "-",
        avg_drift: (trend.gate_5.avg_drift ?? 0).toFixed(2),
      }),
    );
  }
  if (trend.disputatio.count === 0) {
    console.log(pc.dim(localized("cli.status.ralph_trend_no_disputatio")));
  } else {
    console.log(
      localized("cli.status.ralph_trend_disputatio", {
        count: String(trend.disputatio.count),
        approved: String(trend.disputatio.by_verdict.approved),
        conditional: String(trend.disputatio.by_verdict.conditional),
        rejected: String(trend.disputatio.by_verdict.rejected),
        last_verdict: trend.disputatio.last_verdict ?? "-",
      }),
    );
  }
}

function buildEnvelope(state: State | null, trendLoad: TrendLoadResult): CommandEnvelope {
  return {
    command: "agora status",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        session_present: state !== null,
        ...(state !== null ? { state } : {}),
        ...(trendLoad.trend !== undefined
          ? { ralph_trend: trendLoad.trend as unknown as Record<string, unknown> }
          : {}),
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
    warnings:
      trendLoad.warning !== undefined
        ? [{ code: "ralph_trend.unavailable", message: trendLoad.warning }]
        : [],
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
