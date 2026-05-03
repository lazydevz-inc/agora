// SPEC: docs/cli/spec.md Stage 3-B.1 + docs/infra/probes.md Stage 4-A.4 +
//       docs/loops/ralph-loop.md Stage 2-B.1.
//
// `agora doctor` command. Runs the active probe set, prints a categorized
// summary in TUI mode, structured envelope in JSON mode.

import pc from "picocolors";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { loadProbeCache } from "../../probes/cache.js";
import { ALL_PROBES } from "../../probes/registry.js";
import { executeProbes, type ProbeRun } from "../../probes/runner.js";
import type { Probe } from "../../probes/types.js";
import { ok, type Result } from "../../result/index.js";
import { findProjectRoot } from "../../shared/path.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runDoctorCommand(
  flags: GlobalFlags,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  const cache = await loadProbeCache(cwd);
  const activeProbes = await computeActiveProbes(cwd, flags);
  const runs = await executeProbes(activeProbes, {
    cache,
    cwd,
    forceRefresh: flags.refresh,
  });
  await cache.flush();

  const summary = summarize(runs);
  const exit_code: 0 | 4 = summary.failures === 0 ? 0 : 4;

  if (flags.json) {
    return ok(buildJsonEnvelope(runs, summary, exit_code));
  }
  emitTui(runs, summary);
  return ok(buildTuiEnvelope(runs, summary, exit_code));
}

async function computeActiveProbes(_cwd: string, _flags: GlobalFlags): Promise<readonly Probe[]> {
  // First slice: no config-driven disable list yet (config loader lands in
  // 6-A.3 or later). Activate every Probe whose detect_shape says "always"
  // OR whose marker detect returns true.
  const out: Probe[] = [];
  for (const probe of ALL_PROBES) {
    if (probe.detect_shape.kind === "always") {
      out.push(probe);
      continue;
    }
    // Build a minimal context for marker detection (no shellExec needed
    // by the markers helper).
    const detectCtx = {
      cwd: _cwd,
      env: process.env,
      shellExec: () => {
        throw new Error("shellExec not available during marker detection");
      },
    } as unknown as Parameters<typeof probe.detect_shape.detect>[0];
    const active = await probe.detect_shape.detect(detectCtx);
    if (active) out.push(probe);
  }
  return out;
}

interface DoctorSummary {
  available: number;
  failures: number;
  disabled: number;
}

function summarize(runs: readonly ProbeRun[]): DoctorSummary {
  return {
    available: runs.length,
    failures: runs.filter((r) => !r.result.ok).length,
    disabled: 0, // Stage 6-A.3+ when config-driven disable lands.
  };
}

function emitTui(runs: readonly ProbeRun[], summary: DoctorSummary): void {
  const universal = runs.filter((r) => r.probe.detect_shape.kind === "always");
  const project = runs.filter((r) => r.probe.detect_shape.kind === "marker");
  if (universal.length > 0) {
    console.log(localized("cli.doctor.section_universal"));
    for (const run of universal) emitProbeLine(run);
  }
  if (project.length > 0) {
    console.log("");
    console.log(localized("cli.doctor.section_project"));
    for (const run of project) emitProbeLine(run);
  }
  console.log("");
  console.log(
    localized("cli.doctor.summary_format", {
      available: String(summary.available),
      failures: String(summary.failures),
      disabled: String(summary.disabled),
    }),
  );
}

function emitProbeLine(run: ProbeRun): void {
  const symbol = run.result.ok ? pc.green("  ✓") : pc.red("  ✗");
  const id = pc.bold(run.probe.id.padEnd(16, " "));
  console.log(`${symbol} ${id} ${run.result.detail}`);
  if (!run.result.ok && run.result.fix !== undefined) {
    console.log(`    ${pc.dim("Fix:")} ${run.result.fix}`);
  }
}

function buildJsonEnvelope(
  runs: readonly ProbeRun[],
  summary: DoctorSummary,
  exit_code: 0 | 4,
): CommandEnvelope {
  return {
    command: "agora doctor",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: exit_code === 0,
      data: {
        summary,
        probes: runs.map((r) => ({
          id: r.probe.id,
          tier: r.probe.tier,
          description: r.probe.description,
          detect_shape: r.probe.detect_shape.kind,
          ok: r.result.ok,
          detail: r.result.detail,
          ...(r.result.fix !== undefined ? { fix: r.result.fix } : {}),
          duration_ms: Math.round(r.result.duration_ms),
          from_cache: r.from_cache,
        })),
      },
    },
    next:
      exit_code === 0
        ? []
        : [
            {
              id: "fix_failing_probes",
              description: "Address failing probe fixes then re-run",
              command: "agora doctor --refresh",
            },
          ],
    warnings: [],
    errors: [],
    exit_code,
  };
}

function buildTuiEnvelope(
  runs: readonly ProbeRun[],
  summary: DoctorSummary,
  exit_code: 0 | 4,
): CommandEnvelope {
  // TUI envelope mirrors JSON shape so emit() in render.ts has uniform input;
  // TUI renderer just doesn't print it (already printed via emitTui above).
  return buildJsonEnvelope(runs, summary, exit_code);
}

function getAgoraVersion(): string {
  // Read package.json version. Resolved relative to compiled location.
  // Mirror of the helper in commands/version.ts; consider extracting to
  // shared/ if a third caller appears.
  try {
    const url = new URL("../../../package.json", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
