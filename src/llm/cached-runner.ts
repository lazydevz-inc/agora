// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R1-A composition)
//
// CachedRunner — wraps any ClaudeRunner with cache lookup. When opts.cache_key
// + opts.cache_ttl_seconds are set, checks LLMCache first. Cache miss or
// no key → delegate to inner runner; cache successful response.
//
// Per Stage 6-A.23 R5-A: emits llm.call event after every call (hit
// or miss). Records prompt/system character counts only — never the
// raw text — to keep events.jsonl auditable without leaking content.

import { appendEvent } from "../shared/events.js";
import type { LLMCache } from "./cache.js";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "./runner.js";

export class CachedRunner implements ClaudeRunner {
  constructor(
    private readonly inner: ClaudeRunner,
    private readonly cache: LLMCache,
    private readonly cwd: string,
  ) {}

  async call(opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const ttl = opts.cache_ttl_seconds ?? 0;
    if (opts.cache_key !== undefined && ttl > 0) {
      const hit = this.cache.get(opts.cache_key, ttl);
      if (hit !== undefined) {
        await this.recordEvent(opts, hit, true);
        return hit;
      }
    }
    const response = await this.inner.call(opts);
    if (opts.cache_key !== undefined && ttl > 0 && response.ok) {
      this.cache.set(opts.cache_key, response, ttl);
    }
    await this.recordEvent(opts, response, false);
    return response;
  }

  private async recordEvent(
    opts: ClaudeCallOptions,
    response: ClaudeResponse,
    cacheHit: boolean,
  ): Promise<void> {
    await appendEvent(this.cwd, {
      type: "llm.call",
      command: process.env.AGORA_COMMAND ?? "agora",
      data: {
        cache_key: opts.cache_key ?? null,
        cache_hit: cacheHit,
        prompt_chars: opts.prompt.length,
        system_chars: opts.system?.length ?? 0,
        format: opts.format ?? "text",
        ok: response.ok,
        error_code: response.error?.code ?? null,
        attempts: response.attempts,
        total_duration_ms: response.total_duration_ms,
        source: response.source,
      },
    });
  }
}
