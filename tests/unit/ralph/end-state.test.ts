// SPEC: src/ralph/end-state.ts pure aggregation.

import { describe, expect, test } from "vitest";

import type { ACNode } from "@/handoff/dihairesis.js";
import type { DisputatioResult } from "@/ralph/disputatio.js";
import { aggregateRalphStats, renderStatsTable } from "@/ralph/end-state.js";
import type { Gate5Result } from "@/ralph/gate-5.js";
import type { Gate1Result, RalphState } from "@/ralph/state.js";

function leaf(id: string): ACNode {
  return { id, content: `${id} content`, depth: 1, atomic: true, children: [] };
}
function branch(id: string, children: ACNode[]): ACNode {
  return { id, content: `${id} content`, depth: 0, atomic: false, children };
}

const tree: ACNode[] = [branch("ac_001", [leaf("ac_001.1"), leaf("ac_001.2")]), leaf("ac_002")];

function gate1(): Gate1Result {
  return {
    commands: [
      {
        name: "typecheck",
        exit_code: 0,
        duration_ms: 1,
        passed: true,
        timed_out: false,
        stdout_tail: "",
        stderr_tail: "",
      },
      {
        name: "lint",
        exit_code: 0,
        duration_ms: 1,
        passed: true,
        timed_out: false,
        stdout_tail: "",
        stderr_tail: "",
      },
      {
        name: "test",
        exit_code: 0,
        duration_ms: 1,
        passed: true,
        timed_out: false,
        stdout_tail: "",
        stderr_tail: "",
      },
      {
        name: "build",
        exit_code: 0,
        duration_ms: 1,
        passed: true,
        timed_out: false,
        stdout_tail: "",
        stderr_tail: "",
      },
    ],
    overall_passed: true,
    total_duration_ms: 4,
    ran_at: "2026-05-06T00:00:01.000Z",
  };
}

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
    current_leaf_id: null,
    completed_leaves: ["ac_001.1", "ac_001.2", "ac_002"],
    per_leaf_attempts: { "ac_001.1": 1, "ac_001.2": 2, ac_002: 1 },
    session_total_attempts: 4,
    iteration_cap_per_leaf: 10,
    session_cap_total: 25,
    started_at: "2026-05-06T00:00:00.000Z",
    updated_at: "2026-05-06T00:05:00.000Z",
    gate_5_history: [gate5("ac_001.1", 0.05), gate5("ac_001.2", 0.2), gate5("ac_002", 0.1)],
    disputatio_history: [
      dispute("ac_001.1", "approved"),
      dispute("ac_001.2", "conditional"),
      dispute("ac_002", "approved"),
    ],
    z1_directives: [],
    ac_tree_snapshot: tree,
    last_gate_1_result: gate1(),
    ...opts,
  };
}

describe("aggregateRalphStats — completed session", () => {
  test("counts total / completed / cap-reached / in-progress leaves", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    expect(stats.total_leaves).toBe(3);
    expect(stats.completed_leaves).toBe(3);
    expect(stats.cap_reached_leaves).toBe(0);
    expect(stats.in_progress_leaves).toBe(0);
  });

  test("aggregates total_iterations + estimated LLM calls", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    expect(stats.total_iterations).toBe(4);
    expect(stats.total_llm_calls_estimate).toBe(4 * 7);
  });

  test("computes session duration", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    expect(stats.session_duration_ms).toBe(5 * 60_000);
  });

  test("computes avg drift across Gate 5 history", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    expect(stats.avg_drift_score).toBeCloseTo((0.05 + 0.2 + 0.1) / 3, 3);
  });

  test("per_leaf entries enriched with gate_5 + disputatio last-result", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    expect(stats.per_leaf.length).toBe(3);
    const ac1_1 = stats.per_leaf.find((p) => p.leaf_id === "ac_001.1");
    expect(ac1_1?.status).toBe("completed");
    expect(ac1_1?.attempts).toBe(1);
    expect(ac1_1?.last_drift_score).toBe(0.05);
    expect(ac1_1?.last_verdict).toBe("approved");
  });
});

describe("aggregateRalphStats — cap-reached session", () => {
  test("leaf with attempts >= iteration_cap_per_leaf → cap-reached status", () => {
    const stats = aggregateRalphStats(
      makeState({
        completed_leaves: ["ac_001.1"],
        per_leaf_attempts: { "ac_001.1": 1, ac_002: 10 }, // ac_002 hit cap=10
      }),
      tree,
    );
    expect(stats.cap_reached_leaves).toBe(1);
    expect(stats.completed_leaves).toBe(1);
    expect(stats.in_progress_leaves).toBe(1); // ac_001.2 unattempted
    const ac002 = stats.per_leaf.find((p) => p.leaf_id === "ac_002");
    expect(ac002?.status).toBe("cap-reached");
  });
});

describe("aggregateRalphStats — empty history", () => {
  test("avg_drift_score is null when no Gate 5 history", () => {
    const stats = aggregateRalphStats(
      makeState({ gate_5_history: [], disputatio_history: [] }),
      tree,
    );
    expect(stats.avg_drift_score).toBeNull();
  });

  test("per_leaf has null drift / verdict when no history for that leaf", () => {
    const stats = aggregateRalphStats(
      makeState({
        completed_leaves: [],
        per_leaf_attempts: {},
        session_total_attempts: 0,
        gate_5_history: [],
        disputatio_history: [],
      }),
      tree,
    );
    for (const p of stats.per_leaf) {
      expect(p.last_drift_score).toBeNull();
      expect(p.last_verdict).toBeNull();
      expect(p.status).toBe("in-progress");
    }
  });
});

describe("renderStatsTable", () => {
  test("renders header + rows + aggregate", () => {
    const stats = aggregateRalphStats(makeState(), tree);
    const text = renderStatsTable(stats);
    expect(text).toContain("leaf_id");
    expect(text).toContain("attempts");
    expect(text).toContain("ac_001.1");
    expect(text).toContain("Aggregate");
    expect(text).toContain("3/3 leaves complete");
  });

  test("handles empty Gate 5 history (avg drift null)", () => {
    const stats = aggregateRalphStats(
      makeState({ gate_5_history: [], disputatio_history: [] }),
      tree,
    );
    const text = renderStatsTable(stats);
    expect(text).toContain("(no Gate 5 history)");
  });
});
