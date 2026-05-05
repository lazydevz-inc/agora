// SPEC: docs/loops/ralph-loop.md Gate 1 (deterministic) +
//       docs/infra/probes.md (shared spawn semantics).
//
// Gate 1 is the deterministic gate: typecheck → lint → test → build.
// All four must pass for a Ralph iteration to advance. Sequential
// execution per Stage 6-A.18 R3-B rejected (parallel would interleave
// outputs + provide marginal speedup since these are CPU-bound).
//
// Each command runs via shared/spawn with a per-command timeout. test
// gets a longer timeout (vitest can be slow on cold caches); the
// others are typically <30s.
//
// Output: Gate1Result with per-command sub-results + overall_passed.
// stdout/stderr tails (last 2KB each) preserved for caller display.

import { spawnExec } from "../shared/spawn.js";
import { type Gate1CommandResult, type Gate1Result, Gate1ResultSchema } from "./state.js";

export interface Gate1Spec {
  readonly name: Gate1CommandResult["name"];
  readonly cmd: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export const GATE_1_DEFAULT_COMMANDS: readonly Gate1Spec[] = [
  { name: "typecheck", cmd: "pnpm", args: ["typecheck"], timeoutMs: 60_000 },
  { name: "lint", cmd: "pnpm", args: ["lint"], timeoutMs: 60_000 },
  { name: "test", cmd: "pnpm", args: ["test"], timeoutMs: 180_000 },
  { name: "build", cmd: "pnpm", args: ["build"], timeoutMs: 60_000 },
];

const TAIL_BYTES = 2_000;

export interface Gate1RunOptions {
  readonly cwd: string;
  readonly commands?: readonly Gate1Spec[];
}

export async function runGate1(opts: Gate1RunOptions): Promise<Gate1Result> {
  const specs = opts.commands ?? GATE_1_DEFAULT_COMMANDS;
  const start = Date.now();
  const results: Gate1CommandResult[] = [];
  for (const spec of specs) {
    const r = await spawnExec(spec.cmd, spec.args, {
      cwd: opts.cwd,
      timeoutMs: spec.timeoutMs,
    });
    results.push({
      name: spec.name,
      exit_code: r.exit_code,
      duration_ms: Math.round(r.duration_ms),
      passed: r.exit_code === 0 && !r.timed_out,
      timed_out: r.timed_out,
      stdout_tail: tail(r.stdout),
      stderr_tail: tail(r.stderr),
    });
  }
  const overall_passed = results.every((c) => c.passed);
  const gateResult: Gate1Result = {
    commands: results,
    overall_passed,
    total_duration_ms: Date.now() - start,
    ran_at: new Date().toISOString(),
  };
  // Validate before returning so any future schema drift is caught at
  // the boundary.
  return Gate1ResultSchema.parse(gateResult);
}

function tail(s: string): string {
  if (s.length <= TAIL_BYTES) return s;
  return `…[${String(s.length - TAIL_BYTES)} bytes truncated]…\n${s.slice(-TAIL_BYTES)}`;
}
