// SPEC: docs/loops/ralph-loop.md Gate 2 (Functional QA) +
//       README two-loop diagram (Gate 2: Playwright tests green).
//
// Gate 2 is the functional-QA gate. Like Gate 1, Agora does NOT bundle a
// test runner — it shells out to the PROJECT's Playwright (the same way
// Gate 1 shells out to the project's lint/test/build). No Playwright
// dependency is added to Agora; the browser binaries are the user
// project's concern.
//
// Detection-gated: if the project has no Playwright config, Gate 2 SKIPS
// (passes vacuously — there are no browser tests to run). Only when a
// playwright.config.{ts,js,mjs,cjs} exists does it run
// `npx playwright test` and gate on the exit code.

import { access } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { spawnExec } from "../shared/spawn.js";

export const Gate2ResultSchema = z.object({
  skipped: z.boolean(), // true when no Playwright config detected
  detected_config: z.string().nullable(), // config filename, or null when skipped
  exit_code: z.number().int().nullable(), // null when skipped
  passed: z.boolean(), // true when skipped OR exit 0
  timed_out: z.boolean(),
  duration_ms: z.number().int().min(0),
  stdout_tail: z.string(),
  stderr_tail: z.string(),
  ran_at: z.string().datetime(),
});
export type Gate2Result = z.infer<typeof Gate2ResultSchema>;

const PLAYWRIGHT_CONFIG_NAMES = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
];
const GATE_2_DEFAULT_TIMEOUT_MS = 300_000; // browser tests are slower than unit tests
const TAIL_BYTES = 2_000;

export interface Gate2RunOptions {
  readonly cwd: string;
  // Test seam: override the config filename detected (skip fs probe) and
  // the command run, so the spawn path is exercisable without Playwright.
  readonly configOverride?: string | null;
  readonly command?: { cmd: string; args: readonly string[] };
  readonly timeoutMs?: number;
}

export async function runGate2(opts: Gate2RunOptions): Promise<Gate2Result> {
  const start = Date.now();
  const config =
    opts.configOverride !== undefined
      ? opts.configOverride
      : await detectPlaywrightConfig(opts.cwd);

  if (config === null) {
    // No Playwright config → no browser tests → vacuous pass.
    return Gate2ResultSchema.parse({
      skipped: true,
      detected_config: null,
      exit_code: null,
      passed: true,
      timed_out: false,
      duration_ms: Date.now() - start,
      stdout_tail: "",
      stderr_tail: "",
      ran_at: new Date().toISOString(),
    });
  }

  const cmd = opts.command ?? { cmd: "npx", args: ["playwright", "test"] };
  const r = await spawnExec(cmd.cmd, [...cmd.args], {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? GATE_2_DEFAULT_TIMEOUT_MS,
  });
  return Gate2ResultSchema.parse({
    skipped: false,
    detected_config: config,
    exit_code: r.exit_code,
    passed: r.exit_code === 0 && !r.timed_out,
    timed_out: r.timed_out,
    duration_ms: Math.round(r.duration_ms),
    stdout_tail: tail(r.stdout),
    stderr_tail: tail(r.stderr),
    ran_at: new Date().toISOString(),
  });
}

export async function detectPlaywrightConfig(cwd: string): Promise<string | null> {
  for (const name of PLAYWRIGHT_CONFIG_NAMES) {
    try {
      await access(join(cwd, name));
      return name;
    } catch {
      // not present; try next
    }
  }
  return null;
}

function tail(s: string): string {
  if (s.length <= TAIL_BYTES) return s;
  return `…[${String(s.length - TAIL_BYTES)} bytes truncated]…\n${s.slice(-TAIL_BYTES)}`;
}
