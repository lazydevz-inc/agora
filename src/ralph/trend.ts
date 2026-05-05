// SPEC: docs/cli/spec.md Stage 3-B.2 (agora status enrichment) +
//       Stage 6-A.24 R1-A (Gate 5 + Disputatio trend display).
//
// Pure aggregation over RalphState's gate_5_history + disputatio_history.
// Caller (cli/commands/status.ts) renders via locale strings.

import type { DisputatioResult } from "./disputatio.js";
import type { Gate5Result } from "./gate-5.js";
import type { RalphState } from "./state.js";

const SPARKLINE_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export interface Gate5TrendSummary {
  readonly count: number;
  readonly avg_drift: number | null;
  readonly last_drift: number | null;
  readonly last_action: Gate5Result["action"] | null;
  readonly sparkline: string;
}

export interface DisputatioTrendSummary {
  readonly count: number;
  readonly by_verdict: {
    readonly approved: number;
    readonly conditional: number;
    readonly rejected: number;
  };
  readonly last_verdict: DisputatioResult["respondeo"]["verdict"] | null;
}

export interface RalphTrend {
  readonly current_leaf_id: string | null;
  readonly completed_count: number;
  readonly total_iterations: number;
  readonly gate_5: Gate5TrendSummary;
  readonly disputatio: DisputatioTrendSummary;
}

export function computeRalphTrend(state: RalphState): RalphTrend {
  return {
    current_leaf_id: state.current_leaf_id,
    completed_count: state.completed_leaves.length,
    total_iterations: state.session_total_attempts,
    gate_5: summarizeGate5(state.gate_5_history),
    disputatio: summarizeDisputatio(state.disputatio_history),
  };
}

function summarizeGate5(history: readonly Gate5Result[]): Gate5TrendSummary {
  if (history.length === 0) {
    return {
      count: 0,
      avg_drift: null,
      last_drift: null,
      last_action: null,
      sparkline: "",
    };
  }
  const drifts = history.map((g) => g.drift_score);
  const sum = drifts.reduce((acc, d) => acc + d, 0);
  const last = history[history.length - 1] ?? null;
  return {
    count: history.length,
    avg_drift: sum / history.length,
    last_drift: last?.drift_score ?? null,
    last_action: last?.action ?? null,
    sparkline: renderSparkline(drifts),
  };
}

function summarizeDisputatio(history: readonly DisputatioResult[]): DisputatioTrendSummary {
  const byVerdict = { approved: 0, conditional: 0, rejected: 0 };
  for (const d of history) {
    const v = d.respondeo.verdict;
    byVerdict[v] += 1;
  }
  const last = history[history.length - 1] ?? null;
  return {
    count: history.length,
    by_verdict: byVerdict,
    last_verdict: last?.respondeo.verdict ?? null,
  };
}

/**
 * Render a Unicode sparkline for a series of values in [0, 1]. Each value
 * maps to one of 8 block characters ▁..█. Empty input → empty string.
 * Values outside [0, 1] are clamped (defensive — drift_score is bounded
 * by Gate5ResultSchema but a future producer could violate that).
 */
export function renderSparkline(values: readonly number[]): string {
  if (values.length === 0) return "";
  const chars = values.map((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    const idx = Math.min(SPARKLINE_CHARS.length - 1, Math.floor(clamped * SPARKLINE_CHARS.length));
    return SPARKLINE_CHARS[idx] ?? SPARKLINE_CHARS[0];
  });
  return chars.join("");
}
