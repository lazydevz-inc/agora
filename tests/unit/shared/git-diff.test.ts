// SPEC: docs/loops/ralph-loop.md Gate 5 — getRecentDiff source preference.
//
// Regression guard for the Ralph diff-source fix: the current iteration's
// UNCOMMITTED working-tree changes must be judged by Gate 5, not the prior
// commit. Earlier the order was inverted (HEAD~1..HEAD first), so an
// uncommitted implementation was invisible to the alignment gate.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("not a git repo → no_git (host can be told to git init), never throws", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "agora-nogit-"));
    try {
      const r = await getRecentDiff(nonRepo);
      expect(r.source).toBe("no_git");
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });
});

describe("getRecentDiff — .agora noise exclusion (Gate 5 must judge the implementation)", () => {
  test(".agora/** changes alone do NOT count as a working-tree diff", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(join(cwd, ".agora", "events.jsonl"), "{}\n", "utf8");
    git("add -A");
    git("commit -q -m with-agora");
    // Mutate ONLY Agora's own state — the situation every gate run creates.
    await writeFile(join(cwd, ".agora", "events.jsonl"), "{}\n{}\n", "utf8");

    // Working tree is "dirty" only with Agora bookkeeping and the last
    // commit touches only .agora → nothing implementation-related to judge.
    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("no_changes");
    expect(r.diff).not.toContain("events.jsonl");
  });

  test("implementation change wins; .agora delta is filtered out of the diff text", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(join(cwd, ".agora", "state.json"), "{}\n", "utf8");
    await writeFile(join(cwd, "impl.ts"), "v1\n", "utf8");
    git("add -A");
    git("commit -q -m c1");
    await writeFile(join(cwd, ".agora", "state.json"), '{"x":1}\n', "utf8");
    await writeFile(join(cwd, "impl.ts"), "v2\n", "utf8");

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("unstaged");
    expect(r.diff).toContain("impl.ts");
    expect(r.diff).not.toContain("state.json");
  });
});

describe("getRecentDiff — untracked files are part of the iteration's work", () => {
  test("brand-new untracked file shows up as a /dev/null diff", async () => {
    await writeFile(join(cwd, "fresh.ts"), "export const fresh = true;\n", "utf8");

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("unstaged");
    expect(r.diff).toContain("fresh.ts");
    expect(r.diff).toContain("export const fresh = true;");
  });

  test("untracked .agora/** files stay invisible", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(join(cwd, ".agora", "seed.json"), "{}\n", "utf8");

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("no_changes");
  });
});

describe("getRecentDiff — lockfiles are excluded noise", () => {
  test("lockfile churn never reaches the judged diff (tracked or untracked)", async () => {
    await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(join(cwd, "impl.ts"), "real work\n", "utf8");

    const r = await getRecentDiff(cwd);
    expect(r.source).toBe("unstaged");
    expect(r.diff).toContain("impl.ts");
    expect(r.diff).not.toContain("pnpm-lock.yaml");

    // Same once committed: the last-commit window excludes it too.
    git("add -A");
    git("commit -q -m c1");
    const committed = await getRecentDiff(cwd);
    expect(committed.source).toBe("head_minus_one_to_head");
    expect(committed.diff).toContain("impl.ts");
    expect(committed.diff).not.toContain("pnpm-lock.yaml");
  });
});

describe("getRecentDiff — root commit fallback (single-commit repo)", () => {
  test("clean tree whose only commit is the implementation → that commit's patch", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "agora-rootcommit-"));
    try {
      execSync("git init -q", { cwd: fresh, stdio: "pipe" });
      execSync("git config user.email t@example.com", { cwd: fresh, stdio: "pipe" });
      execSync("git config user.name tester", { cwd: fresh, stdio: "pipe" });
      await writeFile(join(fresh, "root-impl.ts"), "root work\n", "utf8");
      execSync("git add -A && git commit -q -m root", { cwd: fresh, stdio: "pipe" });

      const r = await getRecentDiff(fresh);
      expect(r.source).toBe("head_minus_one_to_head");
      expect(r.diff).toContain("root-impl.ts");
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });

  test("repo with no commits yet but untracked work → unstaged", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "agora-nocommit-"));
    try {
      execSync("git init -q", { cwd: fresh, stdio: "pipe" });
      await writeFile(join(fresh, "first.ts"), "first\n", "utf8");

      const r = await getRecentDiff(fresh);
      expect(r.source).toBe("unstaged");
      expect(r.diff).toContain("first.ts");
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});
