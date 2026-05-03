// SPEC: docs/loops/ralph-loop.md Stage 2-B.1
//
// node probe — Tier 1, always-true detect. Requires Node >= 22 per ADR-0001.

import type { Probe } from "../types.js";

const REQUIRED_MAJOR = 22;

export const nodeProbe: Probe = {
  id: "node",
  tier: 1,
  description: "Node.js >= 22",
  detect_shape: { kind: "always" },
  async check(ctx) {
    const r = await ctx.shellExec("node", ["--version"], { timeoutMs: 1_500 });
    if (r.exit_code !== 0) {
      return {
        ok: false,
        detail: `node CLI failed (exit ${r.exit_code})`,
        fix: "Install Node 22+: nvm install 22 / volta install node@22",
      };
    }
    const version = r.stdout.trim().replace(/^v/, "");
    const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
    if (Number.isFinite(major) && major >= REQUIRED_MAJOR) {
      return { ok: true, detail: `v${version} (>= ${REQUIRED_MAJOR} OK)` };
    }
    return {
      ok: false,
      detail: `v${version} below required ${REQUIRED_MAJOR}`,
      fix: "Upgrade Node: nvm install 22 / volta install node@22",
    };
  },
};
