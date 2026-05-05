// SPEC: docs/loops/ralph-loop.md Gate 5 (alignment check) — diff is the
//       primary signal for Gate 5's LLM-side judgment of "did this leaf
//       implementation actually serve telos?"
//
// LAYER 0 helper. Tries `git diff HEAD~1..HEAD` (most recent commit's
// changes) first; falls back to `git diff` (unstaged work) if HEAD~1
// doesn't exist (initial commit / no commits yet) or git itself is not
// available. Bounds output at MAX_DIFF_BYTES so we don't blow LLM token
// budget on huge diffs.

import { spawnExec } from "./spawn.js";

const MAX_DIFF_BYTES = 10_000;
const GIT_TIMEOUT_MS = 10_000;

export interface GitDiffResult {
  readonly diff: string;
  readonly source: "head_minus_one_to_head" | "unstaged" | "no_git" | "no_changes" | "error";
  readonly truncated: boolean;
}

export async function getRecentDiff(cwd: string): Promise<GitDiffResult> {
  // First try: HEAD~1..HEAD (the most recent commit's diff).
  const recent = await spawnExec("git", ["diff", "HEAD~1..HEAD"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (recent.exit_code === 0) {
    if (recent.stdout.trim().length > 0) {
      return finalize(recent.stdout, "head_minus_one_to_head");
    }
    // Empty diff (HEAD~1..HEAD identical) — fall through to unstaged.
  }

  // Fallback 1: unstaged + staged combined (current working state).
  const unstaged = await spawnExec("git", ["diff", "HEAD"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (unstaged.exit_code === 0) {
    if (unstaged.stdout.trim().length > 0) {
      return finalize(unstaged.stdout, "unstaged");
    }
    return { diff: "", source: "no_changes", truncated: false };
  }

  // Fallback 2: not a git repo or git not available.
  // unstaged.exit_code !== 0 here. Distinguish "not a git repo"
  // (typical exit_code 128) from "git not installed" (typical 127).
  if (unstaged.exit_code === 127) {
    return { diff: "", source: "no_git", truncated: false };
  }
  return { diff: "", source: "error", truncated: false };
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
