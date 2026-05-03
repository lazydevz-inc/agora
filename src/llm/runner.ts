// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R1-A)
//
// ClaudeRunner interface — single entry point for every Agora subsystem
// reaching Claude. Composition pattern: CachedRunner wraps a base runner
// (CliRunner subprocess primary; SdkRunner deferred per Stage 6-A.3 R5-A).

export interface ClaudeRunner {
  call(opts: ClaudeCallOptions): Promise<ClaudeResponse>;
}

export interface ClaudeCallOptions {
  readonly prompt: string;
  readonly system?: string;
  readonly format?: "json" | "text"; // default "text"
  readonly cache_key?: string; // when set, response is cacheable
  readonly cache_ttl_seconds?: number; // default 0 (no cache)
  readonly timeout_ms?: number; // default 60_000
  readonly retries?: number; // default 2 (3 total attempts)
  readonly max_tokens?: number; // default 4096
}

export interface ClaudeResponse {
  readonly ok: boolean;
  readonly content?: string | object;
  readonly error?: ClaudeError;
  readonly attempts: number;
  readonly total_duration_ms: number;
  readonly source: "subprocess" | "sdk" | "cache";
}

export type ClaudeError =
  | { code: "auth_failed"; detail: string; fix_command?: string }
  | { code: "rate_limited"; detail: string; retry_after_ms?: number }
  | { code: "timeout"; detail: string }
  | { code: "invalid_response"; detail: string; raw_response?: string }
  | { code: "no_runner_available"; detail: string }
  | { code: "internal_error"; detail: string };

export const CLAUDE_DEFAULT_TIMEOUT_MS = 60_000;
export const CLAUDE_DEFAULT_RETRIES = 2;
export const CLAUDE_DEFAULT_MAX_TOKENS = 4096;
