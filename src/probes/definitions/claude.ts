// SPEC: docs/loops/ralph-loop.md Stage 2-B.1 + docs/infra/llm-integration.md
//       (Stage 4-A.2 — runtime selection uses `claude --print "ping"` for
//       full liveness; this probe uses `claude --version` for cheap install
//       check that fits the 5s hard timeout. Full LLM liveness check moves
//       to ClaudeRunner runtime-selection slice.)
//
// claude probe — Tier 1, always-true detect.

import type { Probe } from "../types.js";

export const claudeProbe: Probe = {
  id: "claude",
  tier: 1,
  description: "Claude CLI installed (full auth check via runtime selection)",
  detect_shape: { kind: "always" },
  async check(ctx) {
    const r = await ctx.shellExec("claude", ["--version"], { timeoutMs: 2_000 });
    if (r.exit_code === 0) {
      const version = r.stdout.trim();
      return { ok: true, detail: version.length > 0 ? version : "claude CLI present" };
    }
    return {
      ok: false,
      detail: `claude CLI not available (exit ${r.exit_code})`,
      fix: "Install Claude Code (https://claude.com/claude-code) OR set ANTHROPIC_API_KEY",
    };
  },
};
