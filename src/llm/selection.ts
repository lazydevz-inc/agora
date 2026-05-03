// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 — Runtime Selection)
//
// Runtime selection algorithm: try claude CLI first; if absent or unresponsive,
// fall back to SDK (DEFERRED in Stage 6-A.3); else throw no_runner_available.
//
// Per Stage 6-A.3 R2-A: SDK fallback path NOT implemented this slice.

import { spawnExec } from "../shared/spawn.js";
import { type LLMCache, loadLLMCache } from "./cache.js";
import { CachedRunner } from "./cached-runner.js";
import { ClaudeCliRunner } from "./cli-runner.js";
import type { ClaudeRunner } from "./runner.js";

export type RuntimeKind = "subprocess" | "sdk";

export interface SelectedRuntime {
  readonly runner: ClaudeRunner;
  readonly kind: RuntimeKind;
  readonly cache: LLMCache;
}

let cached: SelectedRuntime | undefined;

/**
 * Select runtime once per process. Subsequent calls return the cached runner.
 * Re-detection requires process restart (per Stage 4-A.2 — keeps state simple).
 */
export async function selectRuntime(cwd: string): Promise<SelectedRuntime> {
  if (cached !== undefined) return cached;
  const livenessOk = await checkClaudeLive();
  const cache = await loadLLMCache(cwd);
  if (!livenessOk) {
    throw new Error(
      "no_runner_available: claude CLI not detected or unresponsive. " +
        "Install Claude Code (https://claude.com/claude-code) — SDK fallback " +
        "(ANTHROPIC_API_KEY) is not implemented in this slice.",
    );
  }
  const baseRunner = new ClaudeCliRunner();
  cached = {
    runner: new CachedRunner(baseRunner, cache),
    kind: "subprocess",
    cache,
  };
  return cached;
}

/**
 * Test-only helper to reset the cached selection.
 */
export function _resetSelectionForTests(): void {
  cached = undefined;
}

async function checkClaudeLive(): Promise<boolean> {
  try {
    const result = await spawnExec("claude", ["--version"], { timeoutMs: 3_000 });
    return result.exit_code === 0 && !result.timed_out;
  } catch {
    return false;
  }
}
