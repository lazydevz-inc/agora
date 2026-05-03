// SPEC: docs/cli/spec.md Stage 3-B.2 — `agora status` end-to-end.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-status-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(args: string): { output: string; status: number } {
  try {
    const output = execSync(`tsx ${CLI_ABS} ${args}`, {
      stdio: "pipe",
      cwd,
    }).toString();
    return { output, status: 0 };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const stdout = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    return { output: stdout, status };
  }
}

describe("agora status (no session)", () => {
  test("TUI prints suggestion to run agora new", () => {
    const { output, status } = run("status");
    expect(status).toBe(0);
    expect(output).toContain("No active Agora session");
    expect(output).toContain("agora new");
  });

  test("JSON envelope shows session_present: false + next suggests new", () => {
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      command: string;
      result: { ok: boolean; data: { session_present: boolean } };
      next: { id: string; command: string }[];
    };
    expect(parsed.command).toBe("agora status");
    expect(parsed.result.data.session_present).toBe(false);
    expect(parsed.next).toHaveLength(1);
    expect(parsed.next[0]?.id).toBe("start_new");
  });
});

describe("agora status (with session)", () => {
  test("TUI prints phase + alignment progress", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: "in_alignment",
        alignment: { phase: 2, round: 3 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
    const { output, status } = run("status");
    expect(status).toBe(0);
    expect(output).toContain("Phase: in_alignment");
    expect(output).toContain("phase 2, round 3");
  });

  test("JSON envelope includes state object", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const state = {
      version: 1,
      current_phase: "ralph_complete",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await writeFile(join(cwd, ".agora", "state.json"), JSON.stringify(state), "utf8");
    const { output } = run("status --json");
    const parsed = JSON.parse(output) as {
      result: {
        data: {
          session_present: boolean;
          state?: { current_phase: string; version: number };
        };
      };
    };
    expect(parsed.result.data.session_present).toBe(true);
    expect(parsed.result.data.state?.current_phase).toBe("ralph_complete");
  });

  test("ko locale uses Korean labels", () => {
    const { output } = run("status --locale=ko");
    expect(output).toContain("활성 Agora 세션이 없습니다");
  });
});
