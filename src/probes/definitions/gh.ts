// SPEC: docs/loops/ralph-loop.md Stage 2-B.1
//
// gh probe — Tier 1, marker detect (.github/ OR git remote contains github.com).

import { buildMarkerHelpers } from "../markers.js";
import type { Probe } from "../types.js";

export const ghProbe: Probe = {
  id: "gh",
  tier: 1,
  description: "GitHub CLI authenticated",
  detect_shape: {
    kind: "marker",
    detect: async (ctx) => {
      const m = buildMarkerHelpers(ctx);
      if (await m.fileExists(".github")) return true;
      const remote = await m.gitRemoteUrl();
      return remote?.includes("github.com") ?? false;
    },
  },
  async check(ctx) {
    const r = await ctx.shellExec("gh", ["auth", "status"], { timeoutMs: 3_000 });
    if (r.exit_code === 0) {
      // gh auth status writes to stderr; usually contains "Logged in to github.com as <user>"
      const output = `${r.stdout}\n${r.stderr}`;
      const userMatch = output.match(/(?:as|account)\s+([a-zA-Z0-9-]+)/);
      const user = userMatch?.[1];
      return {
        ok: true,
        detail: user !== undefined ? `authenticated as ${user}` : "authenticated",
      };
    }
    return {
      ok: false,
      detail: "not authenticated",
      fix: "gh auth login",
    };
  },
};
