// SPEC: docs/infra/probes.md (Stage 4-A.4 R4-A)
//
// Shared detection helpers. Per-process, per-cwd memoization so all probes
// share a single package.json read / git remote query / file existence check
// during one Gate 0 execution.

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";

import type { ProbeContext } from "./types.js";

const cache = new Map<string, unknown>();

function cacheKey(cwd: string, op: string): string {
  return `${cwd}::${op}`;
}

export interface MarkerHelpers {
  fileExists(relativePath: string): Promise<boolean>;
  packageJsonDeps(): Promise<Set<string>>;
  gitRemoteUrl(): Promise<string | null>;
  envVarPresent(name: string): boolean;
  envVarMatches(name: string, regex: RegExp): boolean;
}

export function buildMarkerHelpers(ctx: ProbeContext): MarkerHelpers {
  return {
    fileExists: (relativePath: string) => fileExists(ctx.cwd, relativePath),
    packageJsonDeps: () => packageJsonDeps(ctx.cwd),
    gitRemoteUrl: () => gitRemoteUrl(ctx.cwd),
    envVarPresent: (name: string) => envVarPresent(ctx.env, name),
    envVarMatches: (name: string, regex: RegExp) => envVarMatches(ctx.env, name, regex),
  };
}

async function fileExists(cwd: string, relativePath: string): Promise<boolean> {
  const key = cacheKey(cwd, `file:${relativePath}`);
  if (cache.has(key)) return cache.get(key) as boolean;
  const path = relativePath.startsWith("/") ? relativePath : join(cwd, relativePath);
  try {
    await access(path);
    cache.set(key, true);
    return true;
  } catch {
    cache.set(key, false);
    return false;
  }
}

async function packageJsonDeps(cwd: string): Promise<Set<string>> {
  const key = cacheKey(cwd, "package.json:deps");
  if (cache.has(key)) return cache.get(key) as Set<string>;
  try {
    const path = join(cwd, "package.json");
    const text = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    const parsed = JSON.parse(text) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const deps = new Set<string>([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.peerDependencies ?? {}),
    ]);
    cache.set(key, deps);
    return deps;
  } catch {
    const empty = new Set<string>();
    cache.set(key, empty);
    return empty;
  }
}

async function gitRemoteUrl(cwd: string): Promise<string | null> {
  const key = cacheKey(cwd, "git:remote.origin.url");
  if (cache.has(key)) return cache.get(key) as string | null;
  return new Promise<string | null>((resolve) => {
    const proc = spawn("git", ["config", "--get", "remote.origin.url"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", () => {
      cache.set(key, null);
      resolve(null);
    });
    proc.on("close", (code) => {
      const url = code === 0 ? stdout.trim() : null;
      cache.set(key, url);
      resolve(url);
    });
  });
}

function envVarPresent(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  return typeof value === "string" && value.length > 0;
}

function envVarMatches(env: NodeJS.ProcessEnv, name: string, regex: RegExp): boolean {
  const value = env[name];
  return typeof value === "string" && regex.test(value);
}

/**
 * Test-only helper: clear the marker cache between tests.
 */
export function _resetMarkerCacheForTests(): void {
  cache.clear();
}
