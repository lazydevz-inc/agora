// SPEC: docs/infra/llm-integration.md (Stage 4-A.2 R4-A)
//
// LLMCache — file-backed (.agora/cache/llm_responses.json) per-project cache.
// Soft limit 100 entries; LRU eviction 20% on overflow. TTL passive expiry.
//
// Same atomic-write pattern as probes/cache.ts.

import { join } from "node:path";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import type { ClaudeResponse } from "./runner.js";

const CACHE_FILE_VERSION = 1;
const SOFT_LIMIT = 100;
const EVICTION_FRACTION = 0.2;

interface CacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
}

interface CacheEntry {
  cached_at: string;
  ttl_seconds: number;
  response: ClaudeResponse;
  last_access: string; // for LRU
}

export interface LLMCache {
  get(cache_key: string, ttl_seconds: number): ClaudeResponse | undefined;
  set(cache_key: string, response: ClaudeResponse, ttl_seconds: number): void;
  invalidate(cache_key: string): void;
  flush(): Promise<void>;
}

export async function loadLLMCache(cwd: string): Promise<LLMCache> {
  const path = cacheFilePath(cwd);
  const file = await readJsonOrNull<CacheFile>(path);
  const entries = new Map<string, CacheEntry>();
  if (file?.version === CACHE_FILE_VERSION) {
    for (const [key, entry] of Object.entries(file.entries)) {
      if (isFresh(entry)) entries.set(key, entry);
    }
  }
  return makeCache(path, entries);
}

function makeCache(path: string, entries: Map<string, CacheEntry>): LLMCache {
  let dirty = false;
  return {
    get(cache_key, ttl_seconds) {
      const entry = entries.get(cache_key);
      if (entry === undefined) return undefined;
      if (!isFresh(entry, ttl_seconds)) {
        entries.delete(cache_key);
        dirty = true;
        return undefined;
      }
      entry.last_access = new Date().toISOString();
      dirty = true;
      // Substitute source: "cache" so callers can distinguish.
      return { ...entry.response, source: "cache" as const };
    },
    set(cache_key, response, ttl_seconds) {
      // Never cache error responses.
      if (!response.ok) return;
      const now = new Date().toISOString();
      entries.set(cache_key, {
        cached_at: now,
        ttl_seconds,
        response,
        last_access: now,
      });
      if (entries.size > SOFT_LIMIT) evictLRU(entries);
      dirty = true;
    },
    invalidate(cache_key) {
      if (entries.delete(cache_key)) dirty = true;
    },
    async flush() {
      if (!dirty) return;
      const file: CacheFile = {
        version: CACHE_FILE_VERSION,
        entries: Object.fromEntries(entries),
      };
      await writeJsonAtomic(path, file);
      dirty = false;
    },
  };
}

function isFresh(entry: CacheEntry, ttlOverride?: number): boolean {
  const ttl = ttlOverride ?? entry.ttl_seconds;
  if (ttl <= 0) return false;
  const ageMs = Date.now() - new Date(entry.cached_at).getTime();
  return ageMs < ttl * 1000;
}

function evictLRU(entries: Map<string, CacheEntry>): void {
  const target = Math.ceil(SOFT_LIMIT * EVICTION_FRACTION);
  // Sort by last_access ascending (oldest first); evict the oldest `target`.
  const sorted = [...entries.entries()].sort(
    (a, b) => new Date(a[1].last_access).getTime() - new Date(b[1].last_access).getTime(),
  );
  for (let i = 0; i < target && i < sorted.length; i++) {
    const key = sorted[i]?.[0];
    if (key !== undefined) entries.delete(key);
  }
}

function cacheFilePath(cwd: string): string {
  return join(cwd, ".agora", "cache", "llm_responses.json");
}
