// SPEC: docs/loops/ralph-loop.md Gate 1 (deterministic) + Stage 4-A.4 R5-A
//       (probe-cache precedent: deterministic results are memoizable with
//       a bounded TTL).
//
// Tree-fingerprint memoization around runGate1. Gate 1 is the
// deterministic gate; an unchanged working tree re-yields the same
// verdict, and a Ralph session re-gates the same tree once per leaf
// (dogfood QA 2026-06-10: 13 leaves × ~20s of identical
// typecheck/lint/test/build runs). PASSING results are cached keyed on
// (tree fingerprint + command list) with a TTL; failures always re-run
// (the host is actively editing toward a fix, and fresh output beats a
// stale tail). No git repo → no fingerprint → no caching.

import { join } from "node:path";

import { computeTreeFingerprint } from "../shared/fingerprint.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { GATE_1_DEFAULT_COMMANDS, type Gate1RunOptions, runGate1 } from "./gate-1.js";
import { type Gate1Result, Gate1ResultSchema } from "./state.js";

export const GATE_1_CACHE_TTL_MS = 10 * 60 * 1000;

interface Gate1CacheRecord {
  readonly fingerprint: string;
  readonly commands_key: string;
  readonly result: Gate1Result;
  readonly cached_at: string;
}

export interface Gate1CachedRun {
  readonly result: Gate1Result;
  readonly from_cache: boolean;
}

function cachePath(cwd: string): string {
  return join(cwd, ".agora", "cache", "gate1_cache.json");
}

function commandsKey(opts: Gate1RunOptions): string {
  const specs = opts.commands ?? GATE_1_DEFAULT_COMMANDS;
  return specs.map((s) => `${s.name}:${s.cmd} ${s.args.join(" ")}`).join("|");
}

export async function runGate1WithCache(
  opts: Gate1RunOptions & { readonly ttlMs?: number; readonly now?: () => number },
): Promise<Gate1CachedRun> {
  const ttl = opts.ttlMs ?? GATE_1_CACHE_TTL_MS;
  const now = opts.now ?? Date.now;
  const fingerprint = await computeTreeFingerprint(opts.cwd);
  const key = commandsKey(opts);

  if (fingerprint !== null) {
    const raw = await readJsonOrNull<Gate1CacheRecord>(cachePath(opts.cwd));
    if (
      raw !== null &&
      raw.fingerprint === fingerprint &&
      raw.commands_key === key &&
      now() - Date.parse(raw.cached_at) < ttl
    ) {
      const parsed = Gate1ResultSchema.safeParse(raw.result);
      if (parsed.success && parsed.data.overall_passed) {
        return { result: parsed.data, from_cache: true };
      }
    }
  }

  const result = await runGate1(opts);
  if (fingerprint !== null && result.overall_passed) {
    const record: Gate1CacheRecord = {
      fingerprint,
      commands_key: key,
      result,
      cached_at: new Date(now()).toISOString(),
    };
    await writeJsonAtomic(cachePath(opts.cwd), record);
  }
  return { result, from_cache: false };
}
