// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R1-A composition).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { loadLLMCache } from "@/llm/cache.js";
import { CachedRunner } from "@/llm/cached-runner.js";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-cached-runner-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

class CountingRunner implements ClaudeRunner {
  callCount = 0;
  constructor(private readonly response: ClaudeResponse) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    this.callCount++;
    return this.response;
  }
}

const okResponse: ClaudeResponse = {
  ok: true,
  content: "pong",
  attempts: 1,
  total_duration_ms: 100,
  source: "subprocess",
};

describe("CachedRunner", () => {
  test("delegates when no cache_key", async () => {
    const inner = new CountingRunner(okResponse);
    const cache = await loadLLMCache(cwd);
    const cached = new CachedRunner(inner, cache, cwd);
    await cached.call({ prompt: "hi" });
    await cached.call({ prompt: "hi" });
    expect(inner.callCount).toBe(2);
  });

  test("caches when cache_key + ttl set; second call hits cache", async () => {
    const inner = new CountingRunner(okResponse);
    const cache = await loadLLMCache(cwd);
    const cached = new CachedRunner(inner, cache, cwd);
    const first = await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 60 });
    const second = await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 60 });
    expect(inner.callCount).toBe(1);
    expect(first.source).toBe("subprocess");
    expect(second.source).toBe("cache");
    expect(second.content).toBe("pong");
  });

  test("does not cache when ttl=0", async () => {
    const inner = new CountingRunner(okResponse);
    const cache = await loadLLMCache(cwd);
    const cached = new CachedRunner(inner, cache, cwd);
    await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 0 });
    await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 0 });
    expect(inner.callCount).toBe(2);
  });

  test("does not cache failed responses", async () => {
    const failResponse: ClaudeResponse = {
      ok: false,
      error: { code: "timeout", detail: "slow" },
      attempts: 1,
      total_duration_ms: 60_000,
      source: "subprocess",
    };
    const inner = new CountingRunner(failResponse);
    const cache = await loadLLMCache(cwd);
    const cached = new CachedRunner(inner, cache, cwd);
    await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 60 });
    await cached.call({ prompt: "hi", cache_key: "k1", cache_ttl_seconds: 60 });
    expect(inner.callCount).toBe(2);
  });
});
