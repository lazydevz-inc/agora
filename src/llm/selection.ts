// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 — Runtime Selection)
//       + ADR-0009/0010 — Mode 2 cost warning (Slice H).
//
// Runtime selection algorithm: try claude CLI first; if absent or unresponsive,
// fall back to SDK (DEFERRED in Stage 6-A.3); else throw no_runner_available.
//
// Per Stage 6-A.3 R2-A: SDK fallback path NOT implemented this slice.
//
// Slice H: when selectRuntime returns a subprocess runner, emit a one-line
// stderr warning once per process explaining the 2026-06-15 metered Agent-SDK
// billing change + pointing at MCP plugin mode (Mode 3) as the no-billing
// alternative. agora_align_step / agora_ralph_step never call selectRuntime,
// so MCP mode is naturally silent. AGORA_NO_COST_WARNING=1 (or AGORA_QUIET=1)
// suppresses.

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
let costWarningEmitted = false;

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
    runner: new CachedRunner(baseRunner, cache, cwd),
    kind: "subprocess",
    cache,
  };
  maybeEmitMode2CostWarning();
  return cached;
}

/**
 * Test-only helper to reset the cached selection.
 */
export function _resetSelectionForTests(): void {
  cached = undefined;
  costWarningEmitted = false;
}

async function checkClaudeLive(): Promise<boolean> {
  try {
    const result = await spawnExec("claude", ["--version"], { timeoutMs: 3_000 });
    return result.exit_code === 0 && !result.timed_out;
  } catch {
    return false;
  }
}

/**
 * Emit a one-line cost warning to stderr when the subprocess runner is
 * activated outside MCP plugin mode. Idempotent per process. Skipped when
 * AGORA_NO_COST_WARNING / AGORA_QUIET is set.
 *
 * Exported for testability.
 */
export function maybeEmitMode2CostWarning(): void {
  if (costWarningEmitted) return;
  if (shouldSuppressCostWarning()) {
    costWarningEmitted = true;
    return;
  }
  process.stderr.write(`${buildCostWarningMessage(detectLocale())}\n`);
  costWarningEmitted = true;
}

export function shouldSuppressCostWarning(): boolean {
  return process.env["AGORA_NO_COST_WARNING"] === "1" || process.env["AGORA_QUIET"] === "1";
}

export function buildCostWarningMessage(locale: "en" | "ko"): string {
  if (locale === "ko") {
    return [
      "⚠️  agora가 Mode 2 (`claude --print` subprocess)로 실행 중입니다.",
      "    2026-06-15부터 이 경로는 Anthropic의 종량 Agent-SDK 크레딧 풀($20~$200/월)을 차감합니다.",
      "    Claude Code 안에서 MCP 플러그인 (agora_align_step / agora_ralph_step)으로 쓰면 호스트 세션의 구독 풀을 사용 — 추가 과금 없음.",
      "    설정: ADR-0009 / ADR-0010 참조 · 경고 비활성화: AGORA_NO_COST_WARNING=1",
    ].join("\n");
  }
  return [
    "⚠️  agora is running in Mode 2 (`claude --print` subprocess).",
    "    From 2026-06-15 this path draws Anthropic's metered Agent-SDK credit pool ($20–$200/mo, API rates).",
    "    Run agora as an MCP plugin inside Claude Code (agora_align_step / agora_ralph_step) to use the host session's interactive subscription — no extra billing.",
    "    Setup: see ADR-0009 / ADR-0010 · Silence: AGORA_NO_COST_WARNING=1",
  ].join("\n");
}

function detectLocale(): "en" | "ko" {
  const raw = (process.env["AGORA_LOCALE"] ?? process.env["LANG"] ?? "en").toLowerCase();
  return raw.startsWith("ko") ? "ko" : "en";
}
