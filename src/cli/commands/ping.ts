// SPEC: Stage 6-A.3 R4-A — debug command exercising ClaudeRunner end-to-end.
//
// `agora ping [prompt]` — invokes ClaudeRunner.call() with a small prompt
// and prints the response. Always skips cache (each invocation = real LLM
// call) so users can verify LLM access. May be absorbed into
// `agora doctor --check-llm` before v1 release.

import pc from "picocolors";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { selectRuntime } from "../../llm/selection.js";
import { err, ok, type Result } from "../../result/index.js";
import { findProjectRoot } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

const DEFAULT_PROMPT = "Reply with exactly the word: pong";

export async function runPingCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const promptArg = positional.length > 0 ? positional.join(" ") : DEFAULT_PROMPT;
  const cwd = findProjectRoot(process.cwd());

  let runtime: Awaited<ReturnType<typeof selectRuntime>>;
  try {
    runtime = await selectRuntime(cwd);
  } catch (e) {
    return err(
      buildAgoraError("llm.no-runner-available", {
        context: { detail: e instanceof Error ? e.message : String(e) },
      }),
    );
  }

  const response = await runtime.runner.call({
    prompt: promptArg,
    format: "text",
    timeout_ms: 30_000,
  });

  // Flush cache so any side effects persist (none expected — ping doesn't set cache_key).
  await runtime.cache.flush();

  if (!response.ok) {
    const code = response.error?.code ?? "internal_error";
    const errorCode = mapLLMErrorCode(code);
    return err(
      buildAgoraError(errorCode, {
        context: {
          detail: response.error?.detail ?? "unknown",
          attempts: response.attempts,
          duration_ms: Math.round(response.total_duration_ms),
        },
      }),
    );
  }

  if (!flags.json) {
    const text =
      typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    console.log(pc.green("✓ pong"));
    console.log(pc.dim("─────"));
    console.log(text);
    console.log(
      pc.dim(
        `─────\n${response.attempts} attempt(s) · ${Math.round(response.total_duration_ms)}ms · source: ${response.source}`,
      ),
    );
  }

  return ok({
    command: "agora ping",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        prompt: promptArg,
        response: response.content,
        attempts: response.attempts,
        total_duration_ms: Math.round(response.total_duration_ms),
        source: response.source,
      },
    },
    next: [],
    warnings: [],
    errors: [],
    exit_code: 0,
  });
}

function mapLLMErrorCode(code: string): import("../../errors/codes.js").ErrorCode {
  switch (code) {
    case "auth_failed":
      return "llm.auth-failed";
    case "rate_limited":
      return "llm.rate-limited";
    case "timeout":
      return "llm.timeout";
    case "invalid_response":
      return "llm.invalid-response";
    case "no_runner_available":
      return "llm.no-runner-available";
    default:
      return "llm.internal-error";
  }
}
