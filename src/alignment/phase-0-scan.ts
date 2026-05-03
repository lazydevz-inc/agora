// SPEC: docs/loops/alignment-loop.md (Stage 2-A) — Phase 0 auto-scan.
//
// Detects brownfield/greenfield + project signals. Reuses src/probes/markers
// helpers (LAYER 1 → LAYER 2 import is allowed). No LLM call; pure FS
// inspection. Output feeds Phase 1 intake + (later) philosopher rounds.

import { basename } from "node:path";
import { performance } from "node:perf_hooks";

import { buildMarkerHelpers, type MarkerHelpers } from "../probes/markers.js";
import type { ProbeContext } from "../probes/types.js";

export interface Phase0Output {
  readonly project_name: string;
  readonly is_brownfield: boolean;
  readonly is_greenfield: boolean;
  readonly detected_stack: readonly string[]; // top dep names
  readonly detected_patterns: readonly string[]; // capability flags
  readonly git_remote: string | null;
  readonly scan_duration_ms: number;
}

const TOP_DEPS_LIMIT = 10;

export async function runPhase0Scan(cwd: string, projectName?: string): Promise<Phase0Output> {
  const start = performance.now();
  const markers = buildMarkerHelpers(makeStubContext(cwd));

  const [
    hasGit,
    hasPackageJson,
    hasSrcDir,
    hasTestsDir,
    hasNodeModules,
    hasPnpmLock,
    hasNpmLock,
    hasBunLock,
    hasBunLockBinary,
    hasTsconfig,
  ] = await Promise.all([
    markers.fileExists(".git"),
    markers.fileExists("package.json"),
    markers.fileExists("src"),
    markers.fileExists("tests"),
    markers.fileExists("node_modules"),
    markers.fileExists("pnpm-lock.yaml"),
    markers.fileExists("package-lock.json"),
    markers.fileExists("bun.lock"),
    markers.fileExists("bun.lockb"),
    markers.fileExists("tsconfig.json"),
  ]);

  const deps = hasPackageJson ? await markers.packageJsonDeps() : new Set<string>();
  const detected_stack = pickTopDeps(deps);
  const git_remote = hasGit ? await markers.gitRemoteUrl() : null;

  const detected_patterns = collectPatterns({
    hasGit,
    hasSrcDir,
    hasTestsDir,
    hasNodeModules,
    hasPnpmLock,
    hasNpmLock,
    hasBunLock: hasBunLock || hasBunLockBinary,
    hasTsconfig,
    deps,
  });

  // Brownfield = git repo OR meaningful project structure exists.
  // Greenfield = otherwise (truly empty or near-empty directory).
  const is_brownfield = hasGit || (hasPackageJson && hasNodeModules) || hasSrcDir;
  const is_greenfield = !is_brownfield;

  const resolvedName = projectName ?? deriveName(deps, cwd);

  return {
    project_name: resolvedName,
    is_brownfield,
    is_greenfield,
    detected_stack,
    detected_patterns,
    git_remote,
    scan_duration_ms: Math.round(performance.now() - start),
  };
}

interface PatternSignals {
  hasGit: boolean;
  hasSrcDir: boolean;
  hasTestsDir: boolean;
  hasNodeModules: boolean;
  hasPnpmLock: boolean;
  hasNpmLock: boolean;
  hasBunLock: boolean;
  hasTsconfig: boolean;
  deps: Set<string>;
}

function collectPatterns(s: PatternSignals): string[] {
  const out: string[] = [];
  if (s.hasGit) out.push("uses_git");
  if (s.hasSrcDir) out.push("has_src_dir");
  if (s.hasTestsDir) out.push("has_tests_dir");
  if (s.hasNodeModules) out.push("has_node_modules");
  if (s.hasPnpmLock) out.push("uses_pnpm");
  if (s.hasNpmLock) out.push("uses_npm");
  if (s.hasBunLock) out.push("uses_bun");
  if (s.hasTsconfig) out.push("uses_typescript");
  // Framework hints from deps.
  if (s.deps.has("react") || s.deps.has("next")) out.push("uses_react");
  if (s.deps.has("vue")) out.push("uses_vue");
  if (s.deps.has("vitest") || s.deps.has("jest")) out.push("has_test_runner");
  if ([...s.deps].some((d) => d.startsWith("@anthropic-ai/"))) out.push("uses_anthropic_sdk");
  return out;
}

function pickTopDeps(deps: Set<string>): string[] {
  // No popularity ranking yet; sort alphabetically + take top N for stable output.
  return [...deps].sort().slice(0, TOP_DEPS_LIMIT);
}

function deriveName(deps: Set<string>, cwd: string): string {
  // Heuristic: package.json `name` field when available; else basename(cwd).
  // We don't re-read package.json here — markers cached it as deps only.
  // Fall back to basename.
  void deps;
  const base = basename(cwd);
  return base.length > 0 ? base : "unnamed-project";
}

function makeStubContext(cwd: string): ProbeContext {
  return {
    cwd,
    env: process.env,
    shellExec: () => {
      throw new Error("shellExec not available during Phase 0 scan");
    },
  } as unknown as ProbeContext;
}

// Re-export for downstream (orchestrator may need to inspect detected stuff).
export type { MarkerHelpers };
