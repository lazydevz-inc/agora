// SPEC: docs/cli/spec.md Stage 3-B.5 R2-A (ralph_complete dialog) +
//       docs/loops/ralph-loop.md Stage 2-C.2 R4-A (re_align /
//       accept_deferred / view_log).
//
// Pure aggregation helpers for ralph_complete end-state UX. No I/O.
// Caller (resume.ts handleRalphComplete) renders the table via clack.

import type { ACNode } from "../handoff/dihairesis.js";
import { countAtomicLeaves } from "./leaf-selector.js";
import type { RalphState } from "./state.js";

export interface PerLeafSummary {
  leaf_id: string;
  attempts: number;
  status: "completed" | "cap-reached" | "in-progress";
  last_drift_score: number | null;
  last_verdict: "approved" | "conditional" | "rejected" | null;
}

export interface RalphSessionStats {
  total_leaves: number;
  completed_leaves: number;
  cap_reached_leaves: number;
  in_progress_leaves: number;
  total_iterations: number;
  total_llm_calls_estimate: number; // Gate 5 (1) + critics (3) + Aquinas (3) per iteration
  session_duration_ms: number;
  avg_drift_score: number | null;
  per_leaf: PerLeafSummary[];
}

const PER_ITERATION_LLM_CALLS_ESTIMATE = 7; // Gate 5 + 3 critics + Sed contra + Respondeo + Ad singula

export function aggregateRalphStats(
  state: RalphState,
  acTree: readonly ACNode[],
): RalphSessionStats {
  const totalLeaves = countAtomicLeaves(acTree);
  const completedSet = new Set(state.completed_leaves);

  const perLeaf: PerLeafSummary[] = [];
  walkLeaves(acTree, (node) => {
    const attempts = state.per_leaf_attempts[node.id] ?? 0;
    let status: PerLeafSummary["status"];
    if (completedSet.has(node.id)) {
      status = "completed";
    } else if (attempts >= state.iteration_cap_per_leaf) {
      status = "cap-reached";
    } else {
      status = "in-progress";
    }

    const matchedGate5 = findLastByLeaf(state.gate_5_history, node.id);
    const matchedDisputatio = findLastByLeaf(state.disputatio_history, node.id);

    perLeaf.push({
      leaf_id: node.id,
      attempts,
      status,
      last_drift_score: matchedGate5?.drift_score ?? null,
      last_verdict: matchedDisputatio?.respondeo.verdict ?? null,
    });
  });

  const startedAt = Date.parse(state.started_at);
  const updatedAt = Date.parse(state.updated_at);
  const sessionDuration =
    Number.isFinite(startedAt) && Number.isFinite(updatedAt)
      ? Math.max(0, updatedAt - startedAt)
      : 0;

  const driftScores = state.gate_5_history.map((g) => g.drift_score);
  const avgDrift =
    driftScores.length > 0 ? driftScores.reduce((sum, d) => sum + d, 0) / driftScores.length : null;

  return {
    total_leaves: totalLeaves,
    completed_leaves: state.completed_leaves.length,
    cap_reached_leaves: perLeaf.filter((p) => p.status === "cap-reached").length,
    in_progress_leaves: perLeaf.filter((p) => p.status === "in-progress").length,
    total_iterations: state.session_total_attempts,
    total_llm_calls_estimate: state.session_total_attempts * PER_ITERATION_LLM_CALLS_ESTIMATE,
    session_duration_ms: sessionDuration,
    avg_drift_score: avgDrift,
    per_leaf: perLeaf,
  };
}

/**
 * Render a fixed-width table for clack TUI. Returns multi-line string
 * suitable for log.message.
 */
export function renderStatsTable(stats: RalphSessionStats): string {
  const header = "  leaf_id          attempts  status         drift   verdict";
  const sep = `  ${"─".repeat(60)}`;
  const rows = stats.per_leaf.map((p) => {
    const id = p.leaf_id.padEnd(15);
    const att = String(p.attempts).padStart(8);
    const status = p.status.padEnd(13);
    const drift = p.last_drift_score !== null ? p.last_drift_score.toFixed(2).padStart(5) : "  -  ";
    const verdict = p.last_verdict ?? "-";
    return `  ${id} ${att}  ${status}  ${drift}   ${verdict}`;
  });
  const aggregate = [
    "",
    `  Aggregate: ${String(stats.completed_leaves)}/${String(stats.total_leaves)} leaves complete · ${String(stats.cap_reached_leaves)} cap-reached · ${String(stats.in_progress_leaves)} in-progress`,
    `             ${String(stats.total_iterations)} total iterations · ~${String(stats.total_llm_calls_estimate)} LLM calls · ${formatDuration(stats.session_duration_ms)}`,
    stats.avg_drift_score !== null
      ? `             avg drift ${stats.avg_drift_score.toFixed(2)} across ${String(stats.per_leaf.filter((p) => p.last_drift_score !== null).length)} measured iterations`
      : "             (no Gate 5 history)",
  ];
  return [header, sep, ...rows, ...aggregate].join("\n");
}

function walkLeaves(tree: readonly ACNode[], visit: (node: ACNode) => void): void {
  for (const node of tree) {
    if (node.atomic && node.children.length === 0) {
      visit(node);
    }
    for (const child of node.children) {
      walkSingle(child, visit);
    }
  }
}

function walkSingle(node: ACNode, visit: (node: ACNode) => void): void {
  if (node.atomic && node.children.length === 0) {
    visit(node);
  }
  for (const child of node.children) {
    walkSingle(child, visit);
  }
}

function findLastByLeaf<T extends { leaf_id: string }>(
  history: readonly T[],
  leafId: string,
): T | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.leaf_id === leafId) return history[i];
  }
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${String(minutes)}m ${String(seconds)}s`;
}
