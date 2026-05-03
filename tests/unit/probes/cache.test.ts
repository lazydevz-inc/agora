// SPEC: docs/infra/probes.md (Stage 4-A.4 R5-A) cache policy.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { CACHE_TTL_SECONDS, loadProbeCache } from "@/probes/cache.js";
import type { ProbeResult } from "@/probes/types.js";

const okResult: ProbeResult = {
  ok: true,
  detail: "fine",
  duration_ms: 10,
};

const timedOut: ProbeResult = {
  ok: false,
  detail: "timed out after 5000ms",
  duration_ms: 5000,
};

const internalErr: ProbeResult = {
  ok: false,
  detail: "internal_error: boom",
  duration_ms: 5,
};

const failOk: ProbeResult = {
  ok: false,
  detail: "auth missing",
  fix: "run gh auth login",
  duration_ms: 50,
};

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-cache-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("ProbeCache", () => {
  test("set/get returns cached value within TTL", async () => {
    const cache = await loadProbeCache(cwd);
    cache.set("foo", okResult);
    expect(cache.get("foo")).toEqual(okResult);
    expect(cache.age_seconds("foo")).toBeLessThan(1);
  });

  test("does NOT cache timeout result (transient)", async () => {
    const cache = await loadProbeCache(cwd);
    cache.set("foo", timedOut);
    expect(cache.get("foo")).toBeUndefined();
  });

  test("does NOT cache internal_error result (transient)", async () => {
    const cache = await loadProbeCache(cwd);
    cache.set("foo", internalErr);
    expect(cache.get("foo")).toBeUndefined();
  });

  test("DOES cache deterministic failure", async () => {
    const cache = await loadProbeCache(cwd);
    cache.set("foo", failOk);
    expect(cache.get("foo")).toEqual(failOk);
  });

  test("flush writes file with TTL+entries; reload sees them", async () => {
    const cache = await loadProbeCache(cwd);
    cache.set("foo", okResult);
    cache.set("bar", failOk);
    await cache.flush();
    const path = join(cwd, ".agora", "cache", "gate0_results.json");
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as { ttl_seconds: number; results: { probe_id: string }[] };
    expect(parsed.ttl_seconds).toBe(CACHE_TTL_SECONDS);
    expect(parsed.results.map((r) => r.probe_id).sort()).toEqual(["bar", "foo"]);
    const reloaded = await loadProbeCache(cwd);
    expect(reloaded.get("foo")).toMatchObject({ ok: true, detail: "fine" });
  });

  test("flush is no-op when cache untouched", async () => {
    const cache = await loadProbeCache(cwd);
    await cache.flush();
    // No file should exist.
    await expect(
      readFile(join(cwd, ".agora", "cache", "gate0_results.json"), "utf8"),
    ).rejects.toThrow();
  });
});
