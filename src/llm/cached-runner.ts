// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R1-A composition)
//
// CachedRunner — wraps any ClaudeRunner with cache lookup. When opts.cache_key
// + opts.cache_ttl_seconds are set, checks LLMCache first. Cache miss or
// no key → delegate to inner runner; cache successful response.

import type { LLMCache } from "./cache.js";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "./runner.js";

export class CachedRunner implements ClaudeRunner {
  constructor(
    private readonly inner: ClaudeRunner,
    private readonly cache: LLMCache,
  ) {}

  async call(opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const ttl = opts.cache_ttl_seconds ?? 0;
    if (opts.cache_key !== undefined && ttl > 0) {
      const hit = this.cache.get(opts.cache_key, ttl);
      if (hit !== undefined) return hit;
    }
    const response = await this.inner.call(opts);
    if (opts.cache_key !== undefined && ttl > 0 && response.ok) {
      this.cache.set(opts.cache_key, response, ttl);
    }
    return response;
  }
}
