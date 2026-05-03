// SPEC: docs/loops/alignment-loop.md (Stage 2-A — Phase 0).

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { runPhase0Scan } from "@/alignment/phase-0-scan.js";
import { _resetMarkerCacheForTests } from "@/probes/markers.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-phase0-"));
  _resetMarkerCacheForTests();
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("Phase 0 auto-scan", () => {
  test("greenfield: empty directory → is_greenfield true, no patterns", async () => {
    const out = await runPhase0Scan(cwd);
    expect(out.is_greenfield).toBe(true);
    expect(out.is_brownfield).toBe(false);
    expect(out.detected_patterns).toEqual([]);
    expect(out.detected_stack).toEqual([]);
    expect(out.git_remote).toBeNull();
  });

  test("brownfield: detects .git → uses_git pattern + brownfield", async () => {
    await mkdir(join(cwd, ".git"), { recursive: true });
    const out = await runPhase0Scan(cwd);
    expect(out.is_brownfield).toBe(true);
    expect(out.is_greenfield).toBe(false);
    expect(out.detected_patterns).toContain("uses_git");
  });

  test("detects pnpm + tsconfig + src/ patterns", async () => {
    await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");
    await writeFile(join(cwd, "tsconfig.json"), '{"compilerOptions":{}}');
    await mkdir(join(cwd, "src"));
    const out = await runPhase0Scan(cwd);
    expect(out.detected_patterns).toContain("uses_pnpm");
    expect(out.detected_patterns).toContain("uses_typescript");
    expect(out.detected_patterns).toContain("has_src_dir");
    expect(out.is_brownfield).toBe(true); // src/ presence flips it
  });

  test("detected_stack collects package.json deps (top alphabetically)", async () => {
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "fixture",
        dependencies: { react: "18", zod: "4" },
        devDependencies: { vitest: "3", typescript: "5" },
      }),
    );
    const out = await runPhase0Scan(cwd);
    expect(out.detected_stack).toEqual(["react", "typescript", "vitest", "zod"]);
    expect(out.detected_patterns).toContain("uses_react");
    expect(out.detected_patterns).toContain("has_test_runner");
  });

  test("project_name: uses positional arg when given", async () => {
    const out = await runPhase0Scan(cwd, "my-cool-project");
    expect(out.project_name).toBe("my-cool-project");
  });

  test("project_name: defaults to basename(cwd) when no arg", async () => {
    const out = await runPhase0Scan(cwd);
    expect(out.project_name).toBe(cwd.split("/").pop());
  });

  test("scan_duration_ms recorded", async () => {
    const out = await runPhase0Scan(cwd);
    expect(out.scan_duration_ms).toBeGreaterThanOrEqual(0);
    expect(out.scan_duration_ms).toBeLessThan(5_000);
  });
});
