// SPEC: docs/infra/probes.md (Stage 4-A.4 R3-A + R5-A).

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createLimit, executeProbes, PER_PROBE_TIMEOUT_MS } from "@/probes/runner.js";
import type { Probe } from "@/probes/types.js";
import { EventSchema, eventsFilePath } from "@/shared/events.js";

function makeNoOpCache() {
  const map = new Map<string, ReturnType<typeof JSON.parse>>();
  return {
    get: (id: string) => map.get(id),
    set: (id: string, r: unknown) => map.set(id, r),
    age_seconds: () => 0,
    flush: async () => {},
  };
}

const fakeOk: Probe = {
  id: "fake-ok",
  tier: 1,
  description: "always ok",
  detect_shape: { kind: "always" },
  async check() {
    return { ok: true, detail: "all good" };
  },
};

const fakeFail: Probe = {
  id: "fake-fail",
  tier: 1,
  description: "always fails",
  detect_shape: { kind: "always" },
  async check() {
    return { ok: false, detail: "bad", fix: "fix me" };
  },
};

const fakeThrow: Probe = {
  id: "fake-throw",
  tier: 1,
  description: "throws",
  detect_shape: { kind: "always" },
  async check() {
    throw new Error("kaboom");
  },
};

const fakeHang: Probe = {
  id: "fake-hang",
  tier: 1,
  description: "hangs forever",
  detect_shape: { kind: "always" },
  async check() {
    await new Promise(() => {}); // never resolves
    return { ok: true, detail: "unreachable" };
  },
};

describe("executeProbes", () => {
  test("returns success result for healthy probe", async () => {
    const cache = makeNoOpCache() as never;
    const runs = await executeProbes([fakeOk], { cache, cwd: process.cwd() });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.result.ok).toBe(true);
    expect(runs[0]?.result.detail).toBe("all good");
    expect(runs[0]?.from_cache).toBe(false);
  });

  test("returns failure result for failing probe", async () => {
    const cache = makeNoOpCache() as never;
    const runs = await executeProbes([fakeFail], { cache, cwd: process.cwd() });
    expect(runs[0]?.result.ok).toBe(false);
    expect(runs[0]?.result.fix).toBe("fix me");
  });

  test("contains crash inside probe via internal_error", async () => {
    const cache = makeNoOpCache() as never;
    const runs = await executeProbes([fakeThrow, fakeOk], { cache, cwd: process.cwd() });
    expect(runs).toHaveLength(2);
    const thrown = runs.find((r) => r.probe.id === "fake-throw");
    expect(thrown?.result.ok).toBe(false);
    expect(thrown?.result.detail.startsWith("internal_error:")).toBe(true);
    // Sibling probe still completed.
    const okRun = runs.find((r) => r.probe.id === "fake-ok");
    expect(okRun?.result.ok).toBe(true);
  });

  test(
    "times out hung probe within ~5s",
    async () => {
      const cache = makeNoOpCache() as never;
      const start = Date.now();
      const runs = await executeProbes([fakeHang], { cache, cwd: process.cwd() });
      const elapsed = Date.now() - start;
      expect(runs[0]?.result.ok).toBe(false);
      expect(runs[0]?.result.detail).toContain("timed out");
      expect(elapsed).toBeGreaterThanOrEqual(PER_PROBE_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(PER_PROBE_TIMEOUT_MS + 1500);
    },
    PER_PROBE_TIMEOUT_MS + 3000,
  );
});

describe("executeProbes — probe.result event emission (Stage 6-A.27)", () => {
  let tmpCwd: string;

  beforeEach(async () => {
    tmpCwd = await mkdtemp(join(tmpdir(), "agora-probe-events-"));
    await mkdir(join(tmpCwd, ".agora"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpCwd, { recursive: true, force: true });
  });

  test("emits one probe.result event per probe (success + failure)", async () => {
    const cache = makeNoOpCache() as never;
    await executeProbes([fakeOk, fakeFail], { cache, cwd: tmpCwd });
    const text = await readFile(eventsFilePath(tmpCwd), "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const events = lines.map((l) => EventSchema.parse(JSON.parse(l)));
    expect(events.every((e) => e.type === "probe.result")).toBe(true);
    const ids = new Set(events.map((e) => e.data.probe_id));
    expect(ids.has("fake-ok")).toBe(true);
    expect(ids.has("fake-fail")).toBe(true);
  });

  test("emits with from_cache=true on cache hit", async () => {
    const cache = makeNoOpCache() as never;
    await executeProbes([fakeOk], { cache, cwd: tmpCwd });
    await executeProbes([fakeOk], { cache, cwd: tmpCwd });
    const text = await readFile(eventsFilePath(tmpCwd), "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const events = lines.map((l) => EventSchema.parse(JSON.parse(l)));
    expect(events[0]?.data.from_cache).toBe(false);
    expect(events[1]?.data.from_cache).toBe(true);
  });

  test("crash inside probe still emits probe.result with internal_error", async () => {
    const cache = makeNoOpCache() as never;
    await executeProbes([fakeThrow], { cache, cwd: tmpCwd });
    const text = await readFile(eventsFilePath(tmpCwd), "utf8");
    const events = text
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => EventSchema.parse(JSON.parse(l)));
    expect(events).toHaveLength(1);
    expect(events[0]?.data.ok).toBe(false);
    expect(String(events[0]?.data.detail)).toContain("internal_error");
  });
});

describe("createLimit", () => {
  test("bounds concurrency", async () => {
    const limit = createLimit(2);
    let active = 0;
    let peak = 0;
    const work = (ms: number) =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
      });
    await Promise.all([work(20), work(20), work(20), work(20), work(20)]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
