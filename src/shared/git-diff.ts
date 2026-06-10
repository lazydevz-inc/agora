// SPEC: docs/loops/ralph-loop.md Gate 5 (alignment check) — diff is the
//       primary signal for Gate 5's LLM-side judgment of "did this leaf
//       implementation actually serve telos?"
//
// LAYER 0 helper. Tries the working tree (staged + unstaged vs HEAD, PLUS
// untracked files rendered via `git diff --no-index`) FIRST — that is the
// current Ralph iteration's implementation work, which the host edits
// before calling agora_ralph_step. Only when the working tree is clean
// (the host committed the leaf) does it fall back to the last commit
// (`git show`, which also handles a root commit with no parent).
//
// `.agora/**` is excluded from every diff: Agora's own state + audit log
// (events.jsonl, ralph_state.json, mcp_pending.json) mutate on every gate
// run, so without the exclusion the working tree is never clean and Gate 5
// ends up judging Agora's bookkeeping noise instead of the user's
// implementation. Bounds output at MAX_DIFF_BYTES so we don't blow the
// LLM token budget on huge diffs.

import { spawnExec } from "./spawn.js";

const MAX_DIFF_BYTES = 10_000;
const GIT_TIMEOUT_MS = 10_000;
// Pathspec magic, cwd-relative: scope to the project subtree and drop
// Agora's own state directory plus generated lockfiles from the judged
// diff. Lockfiles are implementation noise that otherwise eats the whole
// MAX_DIFF_BYTES budget and pushes the real src/ changes past truncation.
const EXCLUDED_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
] as const;
const PATHSPEC = [".", ":(exclude).agora", ...EXCLUDED_FILES.map((f) => `:(exclude)${f}`)] as const;
const MAX_UNTRACKED_FILES = 20;

export interface GitDiffResult {
  readonly diff: string;
  readonly source: "head_minus_one_to_head" | "unstaged" | "no_git" | "no_changes" | "error";
  readonly truncated: boolean;
}

export async function getRecentDiff(cwd: string): Promise<GitDiffResult> {
  const repo = await spawnExec("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (repo.exit_code !== 0 || repo.timed_out) {
    // git missing (127) or not a repository (128) — either way there is no
    // repo to diff. Gate 5's rule 6 treats this as the uncertainty case.
    return { diff: "", source: "no_git", truncated: false };
  }

  // First try: uncommitted working-tree changes (staged + unstaged vs HEAD),
  // plus untracked files — a greenfield leaf is often 100% new files, which
  // `git diff HEAD` alone would silently omit.
  // Note: `git diff HEAD` fails in a repo with no commits yet; untracked
  // collection below still works there, so we don't bail on its failure.
  const working = await spawnExec("git", ["diff", "HEAD", "--", ...PATHSPEC], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  let workingDiff = working.exit_code === 0 ? working.stdout : "";
  const untracked = await collectUntrackedDiff(cwd);
  workingDiff += untracked.diff;
  if (workingDiff.trim().length > 0) {
    return finalize(workingDiff, "unstaged");
  }

  // Fallback: the most recent commit (host committed the leaf before
  // gating, leaving a clean working tree). `git show` also handles a root
  // commit, which `git diff HEAD~1..HEAD` cannot.
  const recent = await spawnExec(
    "git",
    ["show", "--format=", "--patch", "HEAD", "--", ...PATHSPEC],
    { cwd, timeoutMs: GIT_TIMEOUT_MS },
  );
  if (recent.exit_code === 0 && recent.stdout.trim().length > 0) {
    return finalize(recent.stdout, "head_minus_one_to_head");
  }

  if (working.exit_code === 0 || untracked.listed || recent.exit_code === 0) {
    // Repo is readable; there is just nothing to judge (clean tree and an
    // empty/.agora-only last commit, or a fresh repo with no commits and
    // nothing untracked).
    return { diff: "", source: "no_changes", truncated: false };
  }
  return { diff: "", source: "error", truncated: false };
}

// Render untracked files as unified diffs against /dev/null so brand-new
// implementation files are visible to Gate 5. Respects .gitignore
// (--exclude-standard) and skips .agora/**.
async function collectUntrackedDiff(cwd: string): Promise<{ diff: string; listed: boolean }> {
  const ls = await spawnExec("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (ls.exit_code !== 0 || ls.timed_out) return { diff: "", listed: false };
  const files = ls.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(
      (f) =>
        f.length > 0 &&
        !f.startsWith(".agora/") &&
        !(EXCLUDED_FILES as readonly string[]).includes(f),
    )
    .slice(0, MAX_UNTRACKED_FILES);
  let out = "";
  for (const file of files) {
    if (Buffer.byteLength(out, "utf8") > MAX_DIFF_BYTES * 2) break; // finalize() truncates anyway
    // Exit code 1 just means "files differ" for --no-index; not an error.
    const d = await spawnExec("git", ["diff", "--no-index", "--", "/dev/null", file], {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    if (!d.timed_out && d.stdout.trim().length > 0) out += d.stdout;
  }
  return { diff: out, listed: true };
}

// Extract the changed file paths from a unified diff (the `b/` side of
// each `diff --git` header; `/dev/null` for deletions is dropped). Used to
// feed critic-selection triggers (file_pattern) with real signals.
export function parseChangedFiles(diff: string): string[] {
  const out = new Set<string>();
  const re = /^diff --git (?:a\/(.+?)|\/dev\/null) (?:b\/(.+)|\/dev\/null)$/gm;
  for (const m of diff.matchAll(re)) {
    const path = m[2] ?? m[1];
    if (path !== undefined && path.length > 0) out.add(path);
  }
  return [...out];
}

function finalize(diff: string, source: GitDiffResult["source"]): GitDiffResult {
  if (Buffer.byteLength(diff, "utf8") <= MAX_DIFF_BYTES) {
    return { diff, source, truncated: false };
  }
  // Truncate at MAX_DIFF_BYTES boundary, UTF-8-safe.
  const buf = Buffer.from(diff, "utf8");
  let cut = MAX_DIFF_BYTES;
  while (cut > 0) {
    const byte = buf[cut];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) break;
    cut -= 1;
  }
  const truncated = `${buf.subarray(0, cut).toString("utf8")}\n…[diff truncated to ${String(MAX_DIFF_BYTES)} bytes]`;
  return { diff: truncated, source, truncated: true };
}
