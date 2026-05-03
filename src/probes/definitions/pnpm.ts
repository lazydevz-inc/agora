// SPEC: docs/loops/ralph-loop.md Stage 2-B.1
//
// pnpm probe — Tier 1, always-true detect. Required for Agora dev (ADR-0001).
// End users may not have pnpm; degrade to a `~ pnpm not detected` line in
// `agora doctor` rather than failing — handled by the runner's ok=false +
// fix instruction.

import type { Probe } from "../types.js";

const REQUIRED_MAJOR = 10;

export const pnpmProbe: Probe = {
  id: "pnpm",
  tier: 1,
  description: "pnpm >= 10 (Agora's package manager)",
  detect_shape: { kind: "always" },
  async check(ctx) {
    const r = await ctx.shellExec("pnpm", ["--version"], { timeoutMs: 1_500 });
    if (r.exit_code !== 0) {
      return {
        ok: false,
        detail: `pnpm CLI not available (exit ${r.exit_code})`,
        fix: "npm install -g pnpm",
      };
    }
    const version = r.stdout.trim();
    const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
    if (Number.isFinite(major) && major >= REQUIRED_MAJOR) {
      return { ok: true, detail: version };
    }
    return {
      ok: false,
      detail: `${version} below required ${REQUIRED_MAJOR}`,
      fix: "npm install -g pnpm@latest",
    };
  },
};
