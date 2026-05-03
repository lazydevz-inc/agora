// SPEC: docs/infra/probes.md (Stage 4-A.4 R1-A)
//
// Probe interface — 1:1 with SPEC. Discriminated detect_shape; ProbeContext
// injects shellExec for centralized timeout/sandboxing/test-mocking.

export type ProbeTier = 1 | 2 | 3;

export type DetectShape =
  | { kind: "always" }
  | { kind: "marker"; detect: (ctx: ProbeContext) => Promise<boolean> };

export interface ProbeResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly fix?: string;
  readonly duration_ms: number;
}

export interface Probe {
  readonly id: string;
  readonly tier: ProbeTier;
  readonly description: string;
  readonly detect_shape: DetectShape;
  // Probes return outcomes WITHOUT duration_ms — runner measures + injects
  // for consistency. Cleaner than every probe calling performance.now().
  check(ctx: ProbeContext): Promise<Omit<ProbeResult, "duration_ms">>;
}

export interface ProbeContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  // Probes call shellExec via context — never spawn children directly.
  // Centralizes timeout + sandboxing + test mocking.
  shellExec(cmd: string, args: readonly string[], opts?: ShellExecOptions): Promise<ShellResult>;
}

export interface ShellExecOptions {
  readonly stdin?: string;
  readonly timeoutMs?: number; // defaults below per-probe timeout to allow graceful return
}

export interface ShellResult {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timed_out: boolean;
}

export class ProbeTimeoutError extends Error {
  constructor(
    public readonly probe_id: string,
    public readonly timeout_ms: number,
  ) {
    super(`Probe '${probe_id}' exceeded ${timeout_ms}ms timeout`);
    this.name = "ProbeTimeoutError";
  }
}
