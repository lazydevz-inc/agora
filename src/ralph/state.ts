// SPEC: docs/loops/ralph-loop.md (Stage 2-B) +
//       docs/loops/handoff.md Stage 2-C.3 R1-A (single state pointer) +
//       docs/loops/handoff.md Stage 2-C.2 R3-B (DFS leftmost; no manual
//       skip/reorder).
//
// Per-session Ralph state. Persisted at .agora/ralph_state.json.
// Independent from .agora/state.json (which holds the alignment-loop
// phase pointer); ralph_state.json is the iteration-level scratchpad
// for the active Ralph session.
//
// Per Stage 6-A.18 R5-A:
//   - per_leaf_attempts caps at 10 (warn after; no auto-skip in v1)
//   - session_total_attempts caps at 25 (soft warn)
// Stage 2-B.5's third tier (1M absolute cap) is enforced by user
// patience, not by code.

import { z } from "zod";

import { ACNodeSchema } from "../handoff/dihairesis.js";
import { DisputatioResultSchema } from "./disputatio.js";
import { Gate5ResultSchema } from "./gate-5.js";

export const Gate1CommandResultSchema = z.object({
  name: z.enum(["typecheck", "lint", "test", "build"]),
  exit_code: z.number().int(),
  duration_ms: z.number().int().min(0),
  passed: z.boolean(),
  timed_out: z.boolean(),
  stdout_tail: z.string(), // last ~2KB of stdout for context
  stderr_tail: z.string(),
});
export type Gate1CommandResult = z.infer<typeof Gate1CommandResultSchema>;

export const Gate1ResultSchema = z.object({
  commands: z.array(Gate1CommandResultSchema).length(4),
  overall_passed: z.boolean(),
  total_duration_ms: z.number().int().min(0),
  ran_at: z.string().datetime(),
});
export type Gate1Result = z.infer<typeof Gate1ResultSchema>;

export const RALPH_PER_LEAF_CAP_DEFAULT = 10;
export const RALPH_SESSION_CAP_DEFAULT = 25;

export const RalphStateSchema = z
  .object({
    version: z.literal(1),
    current_leaf_id: z.string().nullable(), // null when complete
    completed_leaves: z.array(z.string()),
    per_leaf_attempts: z.record(z.string(), z.number().int().min(0)),
    session_total_attempts: z.number().int().min(0),
    iteration_cap_per_leaf: z.number().int().min(1),
    session_cap_total: z.number().int().min(1),
    last_gate_1_result: Gate1ResultSchema.optional(),
    last_gate_5_result: Gate5ResultSchema.optional(),
    last_disputatio_result: DisputatioResultSchema.optional(),
    // Per-iteration Gate 5 trend history (Stage 6-A.19 R5-A); cap-bounded
    // by session_cap_total since each entry corresponds to ≤1 iteration.
    gate_5_history: z.array(Gate5ResultSchema).default([]),
    // Per-iteration Disputatio trend history (Stage 6-A.21 R5-A).
    disputatio_history: z.array(DisputatioResultSchema).default([]),
    // Z1 / Disputatio-conditional self-correction hints accumulated
    // across iterations. Cleared when leaf advances (PASS / SOFT_WARN /
    // approved verdict). Surfaced in CLI output for next iteration.
    z1_directives: z.array(z.string()).default([]),
    started_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    // ac_tree snapshot — captured at Ralph start so leaf-selector is
    // deterministic across sessions even if seed.json mutates.
    ac_tree_snapshot: z.array(ACNodeSchema),
  })
  .strict();
export type RalphState = z.infer<typeof RalphStateSchema>;

export function newRalphState(args: {
  ac_tree: z.input<typeof ACNodeSchema>[];
  initial_leaf_id: string;
  now?: Date;
}): RalphState {
  const ts = (args.now ?? new Date()).toISOString();
  return RalphStateSchema.parse({
    version: 1,
    current_leaf_id: args.initial_leaf_id,
    completed_leaves: [],
    per_leaf_attempts: {},
    session_total_attempts: 0,
    iteration_cap_per_leaf: RALPH_PER_LEAF_CAP_DEFAULT,
    session_cap_total: RALPH_SESSION_CAP_DEFAULT,
    started_at: ts,
    updated_at: ts,
    ac_tree_snapshot: args.ac_tree,
  });
}
