// SPEC: docs/loops/ralph-loop.md Gate 1 — tree-fingerprint memoization.
//
// Gate 1 is deterministic: identical tree → identical verdict. The cache
// must (1) skip re-running on an unchanged tree, (2) invalidate when the
// tree changes, (3) never cache failures, (4) never cache outside a git
// repo, (5) ignore .agora churn (a gate run's own audit-log append must
// not bust the cache it just wrote).

import { execSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Gate1Spec } from "@/ralph/gate-1.js";
import { runGate1WithCache } from "@/ralph/gate-1-cache.js";

let cwd: string;
let logPath: string;

// Gate1ResultSchema pins exactly 4 commands (typecheck/lint/test/build);
// only "typecheck" appends to the log so runCount() counts gate executions.
const NAMES = ["typecheck", "lint", "test", "build"] as const;

function specs(opts: { fail?: boolean; logged?: string } = {}): Gate1Spec[] {
  const log = opts.logged ?? logPath;
  return NAMES.map((name) => ({
    name,
    cmd: "sh",
    args: [
      "-c",
      name === "typecheck" ? `echo ran >> ${log}${opts.fail ? "; exit 1" : ""}` : "true",
    ],
    timeoutMs: 10_000,
  }));
}

function passingSpecs(): Gate1Spec[] {
  return specs();
}

function failingSpecs(): Gate1Spec[] {
  return specs({ fail: true });
}

async function runCount(): Promise<number> {
  try {
    const content = await readFile(logPath, "utf8");
    return content.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-gate1cache-"));
  logPath = join(tmpdir(), `agora-gate1cache-log-${String(Date.now())}-${String(Math.random())}`);
  execSync("git init -q && git config user.email t@x.com && git config user.name t", {
    cwd,
    stdio: "pipe",
  });
  await writeFile(join(cwd, "src.ts"), "v1\n", "utf8");
  execSync("git add -A && git commit -qm init", { cwd, stdio: "pipe" });
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  await rm(logPath, { force: true });
});

describe("runGate1WithCache", () => {
  test("unchanged tree → second run is a cache hit (commands not re-executed)", async () => {
    const first = await runGate1WithCache({ cwd, commands: passingSpecs() });
    expect(first.from_cache).toBe(false);
    expect(first.result.overall_passed).toBe(true);
    expect(await runCount()).toBe(1);

    const second = await runGate1WithCache({ cwd, commands: passingSpecs() });
    expect(second.from_cache).toBe(true);
    expect(second.result.overall_passed).toBe(true);
    expect(await runCount()).toBe(1); // not re-executed
  });

  test("tree change invalidates the cache", async () => {
    await runGate1WithCache({ cwd, commands: passingSpecs() });
    await writeFile(join(cwd, "src.ts"), "v2 — changed\n", "utf8");
    const second = await runGate1WithCache({ cwd, commands: passingSpecs() });
    expect(second.from_cache).toBe(false);
    expect(await runCount()).toBe(2);
  });

  test(".agora churn does NOT invalidate (audit log appends between leaves)", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(join(cwd, ".agora", "events.jsonl"), "{}\n", "utf8");
    await runGate1WithCache({ cwd, commands: passingSpecs() });
    await appendFile(join(cwd, ".agora", "events.jsonl"), "{}\n", "utf8");
    const second = await runGate1WithCache({ cwd, commands: passingSpecs() });
    expect(second.from_cache).toBe(true);
    expect(await runCount()).toBe(1);
  });

  test("failures are never cached — every retry re-runs", async () => {
    const first = await runGate1WithCache({ cwd, commands: failingSpecs() });
    expect(first.result.overall_passed).toBe(false);
    const second = await runGate1WithCache({ cwd, commands: failingSpecs() });
    expect(second.from_cache).toBe(false);
    expect(await runCount()).toBe(2);
  });

  test("different command list misses the cache", async () => {
    await runGate1WithCache({ cwd, commands: passingSpecs() });
    const other = passingSpecs().map((s) =>
      s.name === "lint" ? { ...s, args: ["-c", "echo different-lint"] } : s,
    );
    const second = await runGate1WithCache({ cwd, commands: other });
    expect(second.from_cache).toBe(false);
    expect(await runCount()).toBe(2);
  });

  test("expired TTL re-runs", async () => {
    let t = 1_000_000;
    await runGate1WithCache({ cwd, commands: passingSpecs(), now: () => t, ttlMs: 60_000 });
    t += 61_000;
    const second = await runGate1WithCache({
      cwd,
      commands: passingSpecs(),
      now: () => t,
      ttlMs: 60_000,
    });
    expect(second.from_cache).toBe(false);
    expect(await runCount()).toBe(2);
  });

  test("no git repo → no caching, gates always run", async () => {
    const bare = await mkdtemp(join(tmpdir(), "agora-gate1nogit-"));
    try {
      const first = await runGate1WithCache({ cwd: bare, commands: passingSpecs() });
      expect(first.from_cache).toBe(false);
      const second = await runGate1WithCache({ cwd: bare, commands: passingSpecs() });
      expect(second.from_cache).toBe(false);
      expect(await runCount()).toBe(2);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});
