// SPEC: docs/loops/ralph-loop.md Gate 5 — getRecentDiff source preference.
//
// Regression guard for the Ralph diff-source fix: the current iteration's
// UNCOMMITTED working-tree changes must be judged by Gate 5, not the prior
// commit. Earlier the order was inverted (HEAD~1..HEAD first), so an
// uncommitted implementation was invisible to the alignment gate.

import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { getRecentDiff } from "@/shared/git-diff.js";

let cwd: string;

function git(args: string): void {
  execSync(`git ${args}`, { cwd, stdio: "pipe" });
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-gitdiff-"));
  git("init -q");
  git("config user.email t@example.com");
  git("config user.name tester");
  git("commit -q --allow-empty -m init");
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("getRecentDiff — working tree preferred over last commit", () => {
  test("uncommitted working-tree change → source 'unstaged' (even when a prior commit exists)", async () => {
    await writeFile(join(cwd, "a.txt"), "v1\n", "utf8");
    git("add -A");
    git("commit -q -m c1"); // non-empty HEAD~1..HEAD exists
    await writeFile(join(cwd, "a.txt"), "v2-working\n", "utf8"); // the iteration's work

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("unstaged");
    expect(r.diff).toContain("v2-working");
  });

  test("clean working tree → falls back to the last commit", async () => {
    await writeFile(join(cwd, "a.txt"), "committed\n", "utf8");
    git("add -A");
    git("commit -q -m c1");

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("head_minus_one_to_head");
    expect(r.diff).toContain("committed");
  });

  test("clean tree with only the initial commit → no_changes", async () => {
    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("no_changes");
  });

  test("not a git repo → no_git or error, never throws", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "agora-nogit-"));
    try {
      const r = await getRecentDiff(nonRepo);
      expect(["no_git", "error"]).toContain(r.source);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });
});
