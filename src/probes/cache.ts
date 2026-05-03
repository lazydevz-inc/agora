// SPEC: docs/infra/probes.md (Stage 4-A.4 R5-A) +
//       docs/loops/ralph-loop.md Stage 2-B.1 R3-A (5-min TTL).
//
// .agora/cache/gate0_results.json — file-backed probe cache.
// Cache deterministic outcomes only. NEVER cache timeouts or
// internal_error: prefixes (transient — recovery must not require --refresh).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ProbeResult } from "./types.js";

export const CACHE_TTL_SECONDS = 300;
const CACHE_FILE_VERSION = 1;

interface CacheFile {
  version: number;
  cached_at: string;
  ttl_seconds: number;
  results: CacheEntry[];
}

interface CacheEntry {
  probe_id: string;
  cached_at: string; // per-entry timestamp (entries can age individually)
  result: ProbeResult;
}

export interface ProbeCache {
  get(probe_id: string): ProbeResult | undefined;
  set(probe_id: string, result: ProbeResult): void;
  age_seconds(probe_id: string): number;
  flush(): Promise<void>;
}

export async function loadProbeCache(cwd: string): Promise<ProbeCache> {
  const path = cacheFilePath(cwd);
  const entries = await readCacheFile(path);
  const map = new Map<string, CacheEntry>();
  for (const entry of entries) {
    if (isFresh(entry)) {
      map.set(entry.probe_id, entry);
    }
  }
  return makeCache(path, map);
}

function makeCache(path: string, map: Map<string, CacheEntry>): ProbeCache {
  let dirty = false;
  return {
    get(probe_id) {
      const entry = map.get(probe_id);
      return entry !== undefined && isFresh(entry) ? entry.result : undefined;
    },
    set(probe_id, result) {
      // Per Stage 4-A.4 R5-A: never cache transient outcomes.
      if (isTransient(result)) return;
      map.set(probe_id, {
        probe_id,
        cached_at: new Date().toISOString(),
        result,
      });
      dirty = true;
    },
    age_seconds(probe_id) {
      const entry = map.get(probe_id);
      if (entry === undefined) return Infinity;
      return (Date.now() - new Date(entry.cached_at).getTime()) / 1000;
    },
    async flush() {
      if (!dirty) return;
      const file: CacheFile = {
        version: CACHE_FILE_VERSION,
        cached_at: new Date().toISOString(),
        ttl_seconds: CACHE_TTL_SECONDS,
        results: [...map.values()],
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(file, null, 2), "utf8");
      dirty = false;
    },
  };
}

function isFresh(entry: CacheEntry): boolean {
  const ageMs = Date.now() - new Date(entry.cached_at).getTime();
  return ageMs < CACHE_TTL_SECONDS * 1000;
}

function isTransient(result: ProbeResult): boolean {
  return result.detail.startsWith("timed out") || result.detail.startsWith("internal_error:");
}

function cacheFilePath(cwd: string): string {
  return join(cwd, ".agora", "cache", "gate0_results.json");
}

async function readCacheFile(path: string): Promise<CacheEntry[]> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Partial<CacheFile>;
    if (parsed.version !== CACHE_FILE_VERSION) return [];
    return parsed.results ?? [];
  } catch {
    return [];
  }
}
