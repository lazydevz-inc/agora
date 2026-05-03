// SPEC: docs/loops/ralph-loop.md Stage 2-B.1
//
// git probe — Tier 1, marker detect (.git/ exists). Verifies repo is in a
// readable state (git status --porcelain succeeds).

import { buildMarkerHelpers } from "../markers.js";
import type { Probe } from "../types.js";

export const gitProbe: Probe = {
  id: "git",
  tier: 1,
  description: "Git repository in clean readable state",
  detect_shape: {
    kind: "marker",
    detect: async (ctx) => buildMarkerHelpers(ctx).fileExists(".git"),
  },
  async check(ctx) {
    const r = await ctx.shellExec("git", ["status", "--porcelain"], { timeoutMs: 2_000 });
    if (r.exit_code === 0) {
      const lines = r.stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      const summary =
        lines.length === 0 ? "clean working tree" : `${lines.length} uncommitted change(s)`;
      return { ok: true, detail: summary };
    }
    return {
      ok: false,
      detail: `git status failed (exit ${r.exit_code})`,
      fix: "Resolve git error in this directory (run `git status` for details)",
    };
  },
};
