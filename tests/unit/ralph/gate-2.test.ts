// SPEC: src/ralph/gate-2.ts — functional-QA gate (detection-gated
// Playwright shell-out). No Playwright dependency in Agora; tests use a
// command override to exercise the spawn path without browsers.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { detectPlaywrightConfig, runGate2 } from "@/ralph/gate-2.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-gate2-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("detectPlaywrightConfig", () => {
  test("returns null when no config present", async () => {
    expect(await detectPlaywrightConfig(cwd)).toBeNull();
  });

  test("detects playwright.config.ts", async () => {
    await writeFile(join(cwd, "playwright.config.ts"), "export default {};", "utf8");
    expect(await detectPlaywrightConfig(cwd)).toBe("playwright.config.ts");
  });

  test("detects playwright.config.mjs", async () => {
    await writeFile(join(cwd, "playwright.config.mjs"), "export default {};", "utf8");
    expect(await detectPlaywrightConfig(cwd)).toBe("playwright.config.mjs");
  });
});

describe("runGate2 — skip path (no config)", () => {
  test("no playwright config → skipped, passed=true, no spawn", async () => {
    const r = await runGate2({ cwd });
    expect(r.skipped).toBe(true);
    expect(r.passed).toBe(true);
    expect(r.detected_config).toBeNull();
    expect(r.exit_code).toBeNull();
  });

  test("configOverride=null forces skip even if a config file exists", async () => {
    await writeFile(join(cwd, "playwright.config.ts"), "export default {};", "utf8");
    const r = await runGate2({ cwd, configOverride: null });
    expect(r.skipped).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe("runGate2 — spawn path (config present)", () => {
  test("command exits 0 → passed=true, not skipped", async () => {
    const r = await runGate2({
      cwd,
      configOverride: "playwright.config.ts",
      command: { cmd: "true", args: [] }, // shell `true` exits 0
    });
    expect(r.skipped).toBe(false);
    expect(r.detected_config).toBe("playwright.config.ts");
    expect(r.passed).toBe(true);
    expect(r.exit_code).toBe(0);
  });

  test("command exits non-zero → passed=false", async () => {
    const r = await runGate2({
      cwd,
      configOverride: "playwright.config.ts",
      command: { cmd: "false", args: [] }, // shell `false` exits 1
    });
    expect(r.skipped).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.exit_code).not.toBe(0);
  });
});
