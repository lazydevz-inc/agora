// SPEC: src/ralph/state.ts schema validation.

import { describe, expect, test } from "vitest";

import {
  Gate1ResultSchema,
  newRalphState,
  RALPH_PER_LEAF_CAP_DEFAULT,
  RALPH_SESSION_CAP_DEFAULT,
  RalphStateSchema,
} from "@/ralph/state.js";

describe("RalphStateSchema", () => {
  test("newRalphState returns valid initial state", () => {
    const state = newRalphState({
      ac_tree: [{ id: "ac_001", content: "x", depth: 0, atomic: true, children: [] }],
      initial_leaf_id: "ac_001",
    });
    expect(state.version).toBe(1);
    expect(state.current_leaf_id).toBe("ac_001");
    expect(state.completed_leaves).toEqual([]);
    expect(state.session_total_attempts).toBe(0);
    expect(state.iteration_cap_per_leaf).toBe(RALPH_PER_LEAF_CAP_DEFAULT);
    expect(state.session_cap_total).toBe(RALPH_SESSION_CAP_DEFAULT);
    expect(RalphStateSchema.safeParse(state).success).toBe(true);
  });

  test("RALPH_PER_LEAF_CAP_DEFAULT is 10 (Stage 2-B.5)", () => {
    expect(RALPH_PER_LEAF_CAP_DEFAULT).toBe(10);
  });

  test("RALPH_SESSION_CAP_DEFAULT is 25 (Stage 2-B.5)", () => {
    expect(RALPH_SESSION_CAP_DEFAULT).toBe(25);
  });

  test("rejects unknown keys (.strict)", () => {
    const ts = new Date().toISOString();
    const bad = {
      version: 1,
      current_leaf_id: "ac_001",
      completed_leaves: [],
      per_leaf_attempts: {},
      session_total_attempts: 0,
      iteration_cap_per_leaf: 10,
      session_cap_total: 25,
      started_at: ts,
      updated_at: ts,
      ac_tree_snapshot: [],
      __extra: "should fail",
    };
    expect(RalphStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("Gate1ResultSchema", () => {
  test("requires exactly 4 commands", () => {
    const ts = new Date().toISOString();
    const cmd = {
      name: "typecheck" as const,
      exit_code: 0,
      duration_ms: 100,
      passed: true,
      timed_out: false,
      stdout_tail: "",
      stderr_tail: "",
    };
    const tooFew = { commands: [cmd], overall_passed: true, total_duration_ms: 100, ran_at: ts };
    expect(Gate1ResultSchema.safeParse(tooFew).success).toBe(false);

    const fourCmds = {
      commands: [
        cmd,
        { ...cmd, name: "lint" as const },
        { ...cmd, name: "test" as const },
        { ...cmd, name: "build" as const },
      ],
      overall_passed: true,
      total_duration_ms: 100,
      ran_at: ts,
    };
    expect(Gate1ResultSchema.safeParse(fourCmds).success).toBe(true);
  });
});
