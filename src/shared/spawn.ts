// SPEC: docs/architecture/module-graph.md (Stage 5-A.1) — LAYER 0 helper.
//
// Generic spawn-with-timeout-and-SIGTERM/SIGKILL-escalation helper. Used by
// probes/runner (Gate 0 shellExec) and llm/cli-runner (claude --print).
// Any subprocess that needs bounded duration goes through here.

import { type ChildProcess, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface SpawnOptions {
  readonly cwd?: string;
  readonly stdin?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number; // default: caller-driven; null disables timeout
  readonly killGraceMs?: number; // default 5_000ms grace before SIGKILL
}

export interface SpawnResult {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timed_out: boolean;
  readonly duration_ms: number;
}

const DEFAULT_KILL_GRACE_MS = 5_000;

export function spawnExec(
  cmd: string,
  args: readonly string[],
  opts?: SpawnOptions,
): Promise<SpawnResult> {
  const start = performance.now();
  return new Promise<SpawnResult>((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: opts?.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (opts?.stdin !== undefined) {
      proc.stdin?.end(opts.stdin);
    } else {
      proc.stdin?.end();
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    let timer: NodeJS.Timeout | undefined;
    if (opts?.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        escalateKill(proc, opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
      }, opts.timeoutMs);
    }

    proc.on("error", () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        exit_code: -1,
        stdout,
        stderr,
        timed_out: timedOut,
        duration_ms: performance.now() - start,
      });
    });
    proc.on("close", (code) => {
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        exit_code: code ?? -1,
        stdout,
        stderr,
        timed_out: timedOut,
        duration_ms: performance.now() - start,
      });
    });
  });
}

function escalateKill(proc: ChildProcess, graceMs: number): void {
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill("SIGKILL");
    }
  }, graceMs);
}
