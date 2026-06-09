// SPEC: docs/loops/ralph-loop.md Gate 5 (alignment check) — diff is the
//       primary signal for Gate 5's LLM-side judgment of "did this leaf
//       implementation actually serve telos?"
//
// LAYER 0 helper. Tries `git diff HEAD` (uncommitted working-tree changes)
// FIRST — that is the current Ralph iteration's implementation work, which
// the host edits before calling agora_ralph_step. Only when the working
// tree is clean (the host committed the leaf) does it fall back to
// `git diff HEAD~1..HEAD` (the most recent commit). Earlier this order was
// inverted, so an uncommitted implementation was invisible to Gate 5 — it
// judged the prior commit instead. Bounds output at MAX_DIFF_BYTES so we
// don't blow the LLM token budget on huge diffs.

import { spawnExec } from "./spawn.js";

const MAX_DIFF_BYTES = 10_000;
const GIT_TIMEOUT_MS = 10_000;

export interface GitDiffResult {
  readonly diff: string;
  readonly source: "head_minus_one_to_head" | "unstaged" | "no_git" | "no_changes" | "error";
  readonly truncated: boolean;
}

export async function getRecentDiff(cwd: string): Promise<GitDiffResult> {
  // First try: uncommitted working-tree changes (staged + unstaged vs HEAD).
  // This is the iteration's in-progress implementation — what the host just
  // wrote before re-calling agora_ralph_step.
  const working = await spawnExec("git", ["diff", "HEAD"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (working.exit_code === 0 && working.stdout.trim().length > 0) {
    return finalize(working.stdout, "unstaged");
  }

  // Fallback: the most recent commit's diff (host committed the leaf before
  // gating, leaving a clean working tree).
  const recent = await spawnExec("git", ["diff", "HEAD~1..HEAD"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (recent.exit_code === 0 && recent.stdout.trim().length > 0) {
    return finalize(recent.stdout, "head_minus_one_to_head");
  }

  // No diff from either source. Distinguish the cases.
  if (working.exit_code === 127 || recent.exit_code === 127) {
    // git not installed.
    return { diff: "", source: "no_git", truncated: false };
  }
  if (working.exit_code === 0) {
    // Working tree readable but clean, and no (or empty) prior commit diff.
    return { diff: "", source: "no_changes", truncated: false };
  }
  // `git diff HEAD` failed for another reason (e.g. not a repo / no commits).
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
