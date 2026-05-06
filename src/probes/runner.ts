// SPEC: docs/infra/probes.md (Stage 4-A.4 R3-A + R5-A)
//
// executeProbes — bounded parallel runner with per-probe Promise.race timeout
// (5s hard, ADR-0006), crash containment (no probe failure aborts gate),
// and shellExec injection via ProbeContext. Uses shared/spawn (LAYER 0)
// for actual subprocess execution + SIGTERM/SIGKILL escalation.

import { performance } from "node:perf_hooks";

import { appendEvent } from "../shared/events.js";
import { spawnExec } from "../shared/spawn.js";
import type { ProbeCache } from "./cache.js";
import {
  type Probe,
  type ProbeContext,
  type ProbeResult,
  ProbeTimeoutError,
  type ShellExecOptions,
  type ShellResult,
} from "./types.js";

export const PER_PROBE_TIMEOUT_MS = 5_000;
export const PROBE_CONCURRENCY = 5;
const SHELL_DEFAULT_TIMEOUT_MS = 4_500; // under PER_PROBE_TIMEOUT_MS for graceful return

export interface ExecuteOptions {
  readonly cache: ProbeCache;
  readonly cwd: string;
  readonly forceRefresh?: boolean;
}

export interface ProbeRun {
  readonly probe: Probe;
  readonly result: ProbeResult;
  readonly from_cache: boolean;
}

export async function executeProbes(
  probes: readonly Probe[],
  opts: ExecuteOptions,
): Promise<ProbeRun[]> {
  const limit = createLimit(PROBE_CONCURRENCY);
  return Promise.all(probes.map((p) => limit(() => runOne(p, opts))));
}

async function runOne(probe: Probe, opts: ExecuteOptions): Promise<ProbeRun> {
  if (opts.forceRefresh !== true) {
    const cached = opts.cache.get(probe.id);
    if (cached !== undefined) {
      const run = { probe, result: cached, from_cache: true };
      await emitProbeEvent(opts.cwd, run);
      return run;
    }
  }
  const ctx = buildContext(opts);
  const start = performance.now();
  let outcome: Omit<ProbeResult, "duration_ms">;
  try {
    outcome = await Promise.race([probe.check(ctx), timeoutAfter(PER_PROBE_TIMEOUT_MS, probe.id)]);
  } catch (e) {
    const duration_ms = performance.now() - start;
    if (e instanceof ProbeTimeoutError) {
      const result: ProbeResult = {
        ok: false,
        detail: `timed out after ${PER_PROBE_TIMEOUT_MS}ms`,
        fix: "Probe hung — check network or run `agora doctor --refresh`.",
        duration_ms,
      };
      const run = { probe, result, from_cache: false };
      await emitProbeEvent(opts.cwd, run);
      return run;
    }
    const result: ProbeResult = {
      ok: false,
      detail: `internal_error: ${e instanceof Error ? e.message : String(e)}`,
      fix: "Probe code bug — please report at github.com/lazydevz-inc/agora/issues",
      duration_ms,
    };
    const run = { probe, result, from_cache: false };
    await emitProbeEvent(opts.cwd, run);
    return run;
  }
  const duration_ms = performance.now() - start;
  const result: ProbeResult = { ...outcome, duration_ms };
  opts.cache.set(probe.id, result);
  const run = { probe, result, from_cache: false };
  await emitProbeEvent(opts.cwd, run);
  return run;
}

async function emitProbeEvent(cwd: string, run: ProbeRun): Promise<void> {
  // Stage 6-A.27 — audit log entry per probe completion. Fail-soft;
  // appendEvent itself swallows .agora/-missing + I/O errors.
  await appendEvent(cwd, {
    type: "probe.result",
    command: process.env["AGORA_COMMAND"] ?? "agora",
    data: {
      probe_id: run.probe.id,
      ok: run.result.ok,
      duration_ms: run.result.duration_ms,
      from_cache: run.from_cache,
      detail: run.result.detail,
    },
  });
}

function timeoutAfter(ms: number, probe_id: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new ProbeTimeoutError(probe_id, ms)), ms);
  });
}

function buildContext(opts: ExecuteOptions): ProbeContext {
  return {
    cwd: opts.cwd,
    env: process.env,
    shellExec: (cmd, args, sopts) => probeShellExec(cmd, args, opts.cwd, sopts),
  };
}

async function probeShellExec(
  cmd: string,
  args: readonly string[],
  cwd: string,
  opts: ShellExecOptions | undefined,
): Promise<ShellResult> {
  const timeoutMs = opts?.timeoutMs ?? SHELL_DEFAULT_TIMEOUT_MS;
  const result = await spawnExec(cmd, args, {
    cwd,
    timeoutMs,
    ...(opts?.stdin !== undefined ? { stdin: opts.stdin } : {}),
  });
  return {
    exit_code: result.exit_code,
    stdout: result.stdout,
    stderr: result.stderr,
    timed_out: result.timed_out,
  };
}

// Inline bounded-concurrency limit (~30 LOC; no new dep per ADR-0001).
export function createLimit(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      if (active < n) run();
      else queue.push(run);
    });
}
