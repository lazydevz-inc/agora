// SPEC: docs/loops/handoff.md (Stage 2-C.3 R1-A — single phase pointer)
//
// .agora/state.json schema (Zod). v1 holds the minimum needed for `agora
// status`: phase pointer + per-phase progress fields. Bypass records
// (Stage 2-B.7) land in a Ralph slice; alignment-specific fields (drift,
// Z1 attempts) land in their own slices.

import { z } from "zod";

export const PhaseSchema = z.enum([
  "no_session",
  "in_alignment",
  "in_handoff",
  "in_ralph",
  "ralph_complete",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const AlignmentProgressSchema = z.object({
  // Stage 2-A phases: -1 (Husserl Epoché), 0 (auto-scan), 1 (intake),
  // 2 (philosopher rounds).
  phase: z.number().int().min(-1).max(2),
  round: z.number().int().min(0),
});
export type AlignmentProgress = z.infer<typeof AlignmentProgressSchema>;

export const RalphProgressSchema = z.object({
  iteration: z.number().int().min(0),
  // Last gate that ran (0..5). 5 = alignment check; ralph_complete sets
  // current_phase to "ralph_complete" without bumping last_gate.
  last_gate: z.number().int().min(0).max(5),
});
export type RalphProgress = z.infer<typeof RalphProgressSchema>;

export const StateSchema = z
  .object({
    version: z.literal(1),
    current_phase: PhaseSchema,
    alignment: AlignmentProgressSchema.optional(),
    ralph: RalphProgressSchema.optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();
export type State = z.infer<typeof StateSchema>;

export function newState(now: Date = new Date()): State {
  const ts = now.toISOString();
  return {
    version: 1,
    current_phase: "no_session",
    created_at: ts,
    updated_at: ts,
  };
}
