// SPEC: src/ralph/trend.ts pure aggregation.

import { describe, expect, test } from "vitest";

import type { ACNode } from "@/handoff/dihairesis.js";
import type { DisputatioResult } from "@/ralph/disputatio.js";
import type { Gate5Result } from "@/ralph/gate-5.js";
import type { RalphState } from "@/ralph/state.js";
import { computeRalphTrend, renderSparkline } from "@/ralph/trend.js";

function leaf(id: string): ACNode {
  return { id, content: `${id} content`, depth: 1, atomic: true, children: [] };
}

const tree: ACNode[] = [leaf("ac_001.1"), leaf("ac_001.2"), leaf("ac_002")];

function gate5(leaf_id: string, drift: number): Gate5Result {
  return {
    leaf_id,
    drift_score: drift,
    action: drift < 0.15 ? "PASS" : drift < 0.3 ? "SOFT_WARN" : drift < 0.6 ? "Z1" : "Z2",
    rationale: "ok",
    diff_source: "head_minus_one_to_head",
    diff_truncated: false,
    ran_at: "2026-05-06T00:00:01.000Z",
  };
}

function dispute(
  leaf_id: string,
  verdict: "approved" | "conditional" | "rejected",
): DisputatioResult {
  return {
    leaf_id,
    videtur: [],
    sed_contra: "x",
    respondeo: { verdict, reasoning: "ok" },
    ad_singula: [],
    action_items: [],
    all_objections_count: 0,
    critical_objections_count: 0,
    ran_at: "2026-05-06T00:00:01.000Z",
  };
}

function makeState(opts: Partial<RalphState> = {}): RalphState {
  return {
    version: 1,
    current_leaf_id: "ac_002",
    completed_leaves: ["ac_001.1", "ac_001.2"],
    per_leaf_attempts: { "ac_001.1": 1, "ac_001.2": 2, ac_002: 1 },
    session_total_attempts: 4,
    iteration_cap_per_leaf: 10,
    session_cap_total: 25,
    started_at: "2026-05-06T00:00:00.000Z",
    updated_at: "2026-05-06T00:05:00.000Z",
    gate_5_history: [gate5("ac_001.1", 0.05), gate5("ac_001.2", 0.2), gate5("ac_002", 0.55)],
    disputatio_history: [
      dispute("ac_001.1", "approved"),
      dispute("ac_001.2", "conditional"),
      dispute("ac_002", "rejected"),
    ],
    z1_directives: [],
    ac_tree_snapshot: tree,
    ...opts,
  };
}

describe("computeRalphTrend — populated history", () => {
  test("aggregates current_leaf + completed + iterations", () => {
    const trend = computeRalphTrend(makeState());
    expect(trend.current_leaf_id).toBe("ac_002");
    expect(trend.completed_count).toBe(2);
    expect(trend.total_iterations).toBe(4);
  });

  test("Gate 5 summary: count + last + avg + sparkline length", () => {
    const trend = computeRalphTrend(makeState());
    expect(trend.gate_5.count).toBe(3);
    expect(trend.gate_5.last_drift).toBe(0.55);
    expect(trend.gate_5.last_action).toBe("Z1");
    expect(trend.gate_5.avg_drift).toBeCloseTo((0.05 + 0.2 + 0.55) / 3, 3);
    expect(trend.gate_5.sparkline).toHaveLength(3);
  });

  test("Gate 5 summary exposes drifts array (Stage 6-A.28)", () => {
    const trend = computeRalphTrend(makeState());
    expect(trend.gate_5.drifts).toEqual([0.05, 0.2, 0.55]);
    expect(trend.gate_5.drifts).toHaveLength(trend.gate_5.sparkline.length);
  });

  test("Disputatio summary: count + by_verdict + last_verdict", () => {
    const trend = computeRalphTrend(makeState());
    expect(trend.disputatio.count).toBe(3);
    expect(trend.disputatio.by_verdict.approved).toBe(1);
    expect(trend.disputatio.by_verdict.conditional).toBe(1);
    expect(trend.disputatio.by_verdict.rejected).toBe(1);
    expect(trend.disputatio.last_verdict).toBe("rejected");
  });
});

describe("computeRalphTrend — empty history", () => {
  test("Gate 5 + Disputatio summaries handle empty arrays", () => {
    const trend = computeRalphTrend(makeState({ gate_5_history: [], disputatio_history: [] }));
    expect(trend.gate_5.count).toBe(0);
    expect(trend.gate_5.avg_drift).toBeNull();
    expect(trend.gate_5.last_drift).toBeNull();
    expect(trend.gate_5.last_action).toBeNull();
    expect(trend.gate_5.sparkline).toBe("");
    expect(trend.gate_5.drifts).toEqual([]);
    expect(trend.disputatio.count).toBe(0);
    expect(trend.disputatio.last_verdict).toBeNull();
    expect(trend.disputatio.by_verdict.approved).toBe(0);
  });
});

describe("computeRalphTrend — all-complete session", () => {
  test("current_leaf_id null when complete, completed_count reflects it", () => {
    const trend = computeRalphTrend(
      makeState({
        current_leaf_id: null,
        completed_leaves: ["ac_001.1", "ac_001.2", "ac_002"],
      }),
    );
    expect(trend.current_leaf_id).toBeNull();
    expect(trend.completed_count).toBe(3);
  });
});

describe("renderSparkline", () => {
  test("empty input → empty string", () => {
    expect(renderSparkline([])).toBe("");
  });

  test("monotone increasing values produce monotone-rising chars", () => {
    const s = renderSparkline([0.0, 0.25, 0.5, 0.75, 1.0]);
    expect(s).toHaveLength(5);
    // first char must be the lowest, last must be the highest
    expect(s[0]).toBe("▁");
    expect(s[s.length - 1]).toBe("█");
  });

  test("clamps values outside [0,1]", () => {
    const s = renderSparkline([-1, 0, 1, 2]);
    expect(s).toHaveLength(4);
    expect(s[0]).toBe("▁"); // -1 clamped to 0
    expect(s[3]).toBe("█"); // 2 clamped to 1
  });

  test("constant value series produces uniform char", () => {
    const s = renderSparkline([0.3, 0.3, 0.3]);
    expect(s.split("").every((c) => c === s[0])).toBe(true);
  });
});
