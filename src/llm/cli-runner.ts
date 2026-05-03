// SPEC: docs/infra/llm-integration.md (Stage 4-A.2)
//
// ClaudeCliRunner — subprocess primary. `claude --print --output-format json`.
// Uses Max plan (no API billing) per ADR-0005.
//
// Retry policy (Stage 4-A.2 R2-A): 3 attempts, exponential 1s/4s, rate-limit
// special case 10s/30s, transient classification (timeout / rate_limited /
// invalid_response / network errors), non-transient bubble immediately.
//
// Timeout (R3-A): 60s default; SIGTERM → 5s grace → SIGKILL via shared/spawn.

import { performance } from "node:perf_hooks";

import { type SpawnResult, spawnExec } from "../shared/spawn.js";
import {
  CLAUDE_DEFAULT_MAX_TOKENS,
  CLAUDE_DEFAULT_RETRIES,
  CLAUDE_DEFAULT_TIMEOUT_MS,
  type ClaudeCallOptions,
  type ClaudeError,
  type ClaudeResponse,
  type ClaudeRunner,
} from "./runner.js";

const STDIN_THRESHOLD = 1024;
const RETRY_BASE_MS = 1_000;
const RATE_LIMIT_BACKOFF_MS = [10_000, 30_000];

export class ClaudeCliRunner implements ClaudeRunner {
  async call(opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const start = performance.now();
    const timeoutMs = opts.timeout_ms ?? CLAUDE_DEFAULT_TIMEOUT_MS;
    const maxAttempts = (opts.retries ?? CLAUDE_DEFAULT_RETRIES) + 1;
    const format = opts.format ?? "text";
    const maxTokens = opts.max_tokens ?? CLAUDE_DEFAULT_MAX_TOKENS;

    let lastError: ClaudeError = { code: "internal_error", detail: "no attempt made" };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStart = performance.now();
      const result = await this.invokeOnce({
        ...opts,
        format,
        max_tokens: maxTokens,
        timeout_ms: timeoutMs,
      });
      if (result.ok) {
        return {
          ...result,
          attempts: attempt,
          total_duration_ms: performance.now() - start,
          source: "subprocess",
        };
      }
      lastError = result.error ?? { code: "internal_error", detail: "unknown" };
      if (!isTransient(lastError)) {
        return {
          ok: false,
          error: lastError,
          attempts: attempt,
          total_duration_ms: performance.now() - start,
          source: "subprocess",
        };
      }
      if (attempt < maxAttempts) {
        await sleep(backoffFor(attempt, lastError));
      }
      // Avoid lint warning about unused start var
      void attemptStart;
    }
    return {
      ok: false,
      error: lastError,
      attempts: maxAttempts,
      total_duration_ms: performance.now() - start,
      source: "subprocess",
    };
  }

  private async invokeOnce(opts: ClaudeCallOptions): Promise<{
    ok: boolean;
    content?: string | object;
    error?: ClaudeError;
    attempts: 0;
    total_duration_ms: 0;
    source: "subprocess";
  }> {
    const args = buildArgs(opts);
    const useStdin = opts.prompt.length > STDIN_THRESHOLD || opts.prompt.includes("\n");
    const finalArgs = useStdin ? args : [...args, opts.prompt];
    const spawnOpts: Parameters<typeof spawnExec>[2] = {
      ...(opts.timeout_ms !== undefined ? { timeoutMs: opts.timeout_ms } : {}),
      ...(useStdin ? { stdin: opts.prompt } : {}),
    };
    const result = await spawnExec("claude", finalArgs, spawnOpts);
    return interpret(result, opts);
  }
}

function buildArgs(opts: ClaudeCallOptions): string[] {
  // Note: claude CLI does NOT support --max-tokens (uses --effort / --max-budget-usd
  // for token budget control). max_tokens in ClaudeCallOptions is therefore
  // informational; Stage 4-A.2 SPEC anticipated a flag that doesn't exist.
  // Future slice may map max_tokens → --effort heuristic.
  const args = ["--print", "--output-format", "json"];
  if (opts.system !== undefined && opts.system.length > 0) {
    args.push("--append-system-prompt", opts.system);
  }
  return args;
}

interface ResultEvent {
  type: "result";
  subtype: "success" | string;
  is_error: boolean;
  result?: string;
  duration_ms?: number;
}

function interpret(
  result: SpawnResult,
  opts: ClaudeCallOptions,
): {
  ok: boolean;
  content?: string | object;
  error?: ClaudeError;
  attempts: 0;
  total_duration_ms: 0;
  source: "subprocess";
} {
  if (result.timed_out) {
    return errReturn({ code: "timeout", detail: `claude --print exceeded ${opts.timeout_ms}ms` });
  }
  if (result.exit_code !== 0) {
    return errReturn(classifyExitError(result));
  }
  // claude --output-format json emits a JSON ARRAY of streaming events
  // (system/assistant/result/...). Final result event holds the response.
  let events: unknown;
  try {
    events = JSON.parse(result.stdout);
  } catch {
    return errReturn({
      code: "invalid_response",
      detail: "claude stdout was not JSON",
      raw_response: result.stdout.slice(0, 500),
    });
  }
  if (!Array.isArray(events)) {
    return errReturn({
      code: "invalid_response",
      detail: "claude --output-format json did not emit an array",
      raw_response: result.stdout.slice(0, 500),
    });
  }
  const finalEvent = [...events]
    .reverse()
    .find((e): e is ResultEvent => (e as { type?: unknown }).type === "result");
  if (finalEvent === undefined) {
    return errReturn({
      code: "invalid_response",
      detail: "claude stream had no result event",
      raw_response: JSON.stringify(events.slice(-2)).slice(0, 500),
    });
  }
  if (finalEvent.is_error) {
    return errReturn({
      code: "internal_error",
      detail: `claude reported is_error=true (subtype: ${finalEvent.subtype})`,
    });
  }
  const inner = finalEvent.result;
  if (typeof inner !== "string") {
    return errReturn({
      code: "invalid_response",
      detail: "result event missing 'result' string field",
      raw_response: JSON.stringify(finalEvent).slice(0, 500),
    });
  }
  if (opts.format === "json") {
    try {
      const content = JSON.parse(inner);
      return okReturn(content);
    } catch {
      return errReturn({
        code: "invalid_response",
        detail: "claude result content was not JSON",
        raw_response: inner.slice(0, 500),
      });
    }
  }
  return okReturn(inner);
}

function classifyExitError(result: SpawnResult): ClaudeError {
  const stderr = result.stderr.toLowerCase();
  if (stderr.includes("not authenticated") || stderr.includes("login")) {
    return {
      code: "auth_failed",
      detail: result.stderr.slice(0, 500),
      fix_command: "claude login",
    };
  }
  if (stderr.includes("rate") && stderr.includes("limit")) {
    return { code: "rate_limited", detail: result.stderr.slice(0, 500) };
  }
  return {
    code: "internal_error",
    detail: `claude exit ${result.exit_code}: ${result.stderr.slice(0, 500)}`,
  };
}

function isTransient(error: ClaudeError): boolean {
  return (
    error.code === "timeout" || error.code === "rate_limited" || error.code === "invalid_response"
  );
}

function backoffFor(attempt: number, error: ClaudeError): number {
  if (error.code === "rate_limited") {
    if (error.retry_after_ms !== undefined) return error.retry_after_ms;
    const idx = Math.min(attempt - 1, RATE_LIMIT_BACKOFF_MS.length - 1);
    return (
      RATE_LIMIT_BACKOFF_MS[idx] ??
      RATE_LIMIT_BACKOFF_MS[RATE_LIMIT_BACKOFF_MS.length - 1] ??
      30_000
    );
  }
  // Exponential 1s, 4s, 16s, ... for general transient errors.
  return RETRY_BASE_MS * 4 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function okReturn(content: string | object) {
  return {
    ok: true,
    content,
    attempts: 0 as const,
    total_duration_ms: 0 as const,
    source: "subprocess" as const,
  };
}

function errReturn(error: ClaudeError) {
  return {
    ok: false,
    error,
    attempts: 0 as const,
    total_duration_ms: 0 as const,
    source: "subprocess" as const,
  };
}
