// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R4-A) cache layer.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { loadLLMCache } from "@/llm/cache.js";
import type { ClaudeResponse } from "@/llm/runner.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-llm-cache-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const okResponse: ClaudeResponse = {
  ok: true,
  content: "pong",
  attempts: 1,
  total_duration_ms: 250,
  source: "subprocess",
};

const errResponse: ClaudeResponse = {
  ok: false,
  error: { code: "auth_failed", detail: "no creds" },
  attempts: 1,
  total_duration_ms: 100,
  source: "subprocess",
};

describe("LLMCache", () => {
  test("set/get returns within TTL with source: cache substituted", async () => {
    const cache = await loadLLMCache(cwd);
    cache.set("k1", okResponse, 60);
    const hit = cache.get("k1", 60);
    expect(hit).toBeDefined();
    expect(hit?.content).toBe("pong");
    expect(hit?.source).toBe("cache");
  });

  test("never caches error responses", async () => {
    const cache = await loadLLMCache(cwd);
    cache.set("err", errResponse, 60);
    expect(cache.get("err", 60)).toBeUndefined();
  });

  test("ttl_seconds=0 means no cache (per opt-in)", async () => {
    const cache = await loadLLMCache(cwd);
    cache.set("k1", okResponse, 0);
    expect(cache.get("k1", 0)).toBeUndefined();
  });

  test("invalidate removes entry", async () => {
    const cache = await loadLLMCache(cwd);
    cache.set("k1", okResponse, 60);
    cache.invalidate("k1");
    expect(cache.get("k1", 60)).toBeUndefined();
  });

  test("flush writes to disk; reload sees entries", async () => {
    const c1 = await loadLLMCache(cwd);
    c1.set("k1", okResponse, 60);
    c1.set("k2", okResponse, 60);
    await c1.flush();
    const path = join(cwd, ".agora", "cache", "llm_responses.json");
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as { entries: Record<string, unknown> };
    expect(Object.keys(parsed.entries).sort()).toEqual(["k1", "k2"]);
    const c2 = await loadLLMCache(cwd);
    expect(c2.get("k1", 60)?.content).toBe("pong");
  });

  test("expired entries are pruned on get", async () => {
    const cache = await loadLLMCache(cwd);
    cache.set("k1", okResponse, 1);
    // Manipulate cached_at to be in the past via re-load with short ttl.
    // Simpler: pass ttl_seconds=0 to get → returns undefined per ttl semantics.
    await new Promise((r) => setTimeout(r, 1100));
    expect(cache.get("k1", 1)).toBeUndefined();
  });
});
