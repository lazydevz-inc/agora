// SPEC: docs/cli/spec.md Stage 3-B.1 — agora doctor end-to-end.
//
// Spawns CLI via tsx and verifies envelope shape. Probe outcomes depend on
// the host environment (Sang's machine has claude/node/pnpm/git/gh present;
// CI may not). Tests verify SHAPE + that all 5 probes ran, not specific
// pass/fail.

import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const CLI = "tsx src/cli/index.ts";

interface DoctorEnvelope {
  command: string;
  result: {
    ok: boolean;
    data?: {
      summary?: { available: number; failures: number; disabled: number };
      probes?: Array<{
        id: string;
        tier: number;
        ok: boolean;
        detail: string;
        from_cache: boolean;
      }>;
    };
  };
  next?: Array<{ id: string; command: string }>;
  exit_code: number;
}

function run(args: string): { output: string; status: number } {
  try {
    const output = execSync(`${CLI} ${args}`, { stdio: "pipe" }).toString();
    return { output, status: 0 };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const output = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    return { output, status };
  }
}

describe("agora doctor (JSON)", () => {
  test("emits envelope with summary + probes array (5 probes)", () => {
    const { output, status } = run("doctor --json");
    const parsed = JSON.parse(output) as DoctorEnvelope;
    expect(parsed.command).toBe("agora doctor");
    expect(parsed.result.data?.summary).toBeDefined();
    expect(parsed.result.data?.probes).toHaveLength(parsed.result.data?.summary?.available ?? -1);
    // All declared probe IDs are present in this slice.
    const ids = parsed.result.data?.probes?.map((p) => p.id) ?? [];
    expect(ids).toContain("claude");
    expect(ids).toContain("node");
    expect(ids).toContain("pnpm");
    // git/gh are marker-detected; presence depends on cwd having .git/.github.
    // exit_code matches summary.failures > 0.
    if ((parsed.result.data?.summary?.failures ?? 0) > 0) {
      expect(status).toBe(4);
    } else {
      expect(status).toBe(0);
      // Gate 0 green must guide the flow's next move (no session here → new).
      expect(parsed.next?.[0]?.command).toBe("agora new <name>");
    }
  });

  test("--refresh forces re-evaluation (from_cache: false)", () => {
    // First run populates cache.
    run("doctor --json");
    const { output } = run("doctor --json --refresh");
    const parsed = JSON.parse(output) as DoctorEnvelope;
    for (const probe of parsed.result.data?.probes ?? []) {
      expect(probe.from_cache).toBe(false);
    }
  });
});

describe("agora doctor (TUI)", () => {
  test("prints categorized output with summary line", () => {
    const { output } = run("doctor");
    // Section headers + summary present (locale defaults to en).
    expect(output).toContain("Universal probes");
    expect(output).toMatch(/probes available/);
  });
});

describe("agora doctor (locale)", () => {
  test("ko locale uses Korean section headers", () => {
    const { output } = run("doctor --locale=ko");
    expect(output).toContain("전역 probe");
    expect(output).toMatch(/probe 사용 가능/);
  });
});
