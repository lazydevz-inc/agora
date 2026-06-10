// SPEC: docs/cli/spec.md Stage 3-B.2 — `agora status` end-to-end.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-status-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(args: string): { output: string; status: number } {
  try {
    const output = execSync(`${TSX} ${CLI_ABS} ${args}`, {
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

describe("agora status — next-step guidance (guided flow)", () => {
  async function seedState(phase: string): Promise<void> {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: phase,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
  }

  function nextOf(output: string): { id: string; command: string }[] {
    return (JSON.parse(output) as { next: { id: string; command: string }[] }).next;
  }

  test("in_alignment session → suggests resume (never empty)", async () => {
    await seedState("in_alignment");
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const next = nextOf(output);
    expect(next.length).toBeGreaterThan(0);
    expect(next[0]?.id).toBe("resume");
    expect(next[0]?.command).toBe("agora resume");
  });

  test("ready_for_ralph session → suggests starting Ralph", async () => {
    await seedState("ready_for_ralph");
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const next = nextOf(output);
    expect(next[0]?.id).toBe("ralph");
    expect(next[0]?.command).toBe("agora ralph");
  });

  test("in_ralph session → suggests the next Ralph iteration", async () => {
    await seedState("in_ralph");
    const { output } = run("status --json");
    expect(nextOf(output)[0]?.id).toBe("ralph");
  });
});

describe("agora status (Ralph trend — Stage 6-A.24)", () => {
  async function seedRalphSession(opts: {
    phase: "in_ralph" | "in_ralph_paused" | "ralph_complete";
    ralphState?: Record<string, unknown> | null;
  }): Promise<void> {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: opts.phase,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
    if (opts.ralphState !== undefined && opts.ralphState !== null) {
      await writeFile(
        join(cwd, ".agora", "ralph_state.json"),
        JSON.stringify(opts.ralphState),
        "utf8",
      );
    }
  }

  function ralphStateFixture(): Record<string, unknown> {
    const ts = "2026-05-06T00:00:00.000Z";
    return {
      version: 1,
      current_leaf_id: "ac_002",
      completed_leaves: ["ac_001.1", "ac_001.2"],
      per_leaf_attempts: { "ac_001.1": 1, "ac_001.2": 2, ac_002: 1 },
      session_total_attempts: 4,
      iteration_cap_per_leaf: 10,
      session_cap_total: 25,
      gate_5_history: [
        {
          leaf_id: "ac_001.1",
          drift_score: 0.05,
          action: "PASS",
          rationale: "ok",
          diff_source: "head_minus_one_to_head",
          diff_truncated: false,
          ran_at: ts,
        },
        {
          leaf_id: "ac_001.2",
          drift_score: 0.2,
          action: "SOFT_WARN",
          rationale: "ok",
          diff_source: "head_minus_one_to_head",
          diff_truncated: false,
          ran_at: ts,
        },
      ],
      disputatio_history: [
        {
          leaf_id: "ac_001.1",
          videtur: [],
          sed_contra: "x",
          respondeo: { verdict: "approved", reasoning: "ok" },
          ad_singula: [],
          action_items: [],
          all_objections_count: 0,
          critical_objections_count: 0,
          ran_at: ts,
        },
      ],
      z1_directives: [],
      started_at: ts,
      updated_at: ts,
      ac_tree_snapshot: [
        { id: "ac_002", content: "ac_002 content", depth: 1, atomic: true, children: [] },
      ],
    };
  }

  test("in_ralph + valid ralph_state → JSON envelope includes ralph_trend", async () => {
    await seedRalphSession({ phase: "in_ralph", ralphState: ralphStateFixture() });
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: {
        data: { ralph_trend?: { gate_5: { count: number }; disputatio: { count: number } } };
      };
      warnings: { code: string; message: string }[];
    };
    expect(parsed.result.data.ralph_trend).toBeDefined();
    expect(parsed.result.data.ralph_trend?.gate_5.count).toBe(2);
    expect(parsed.result.data.ralph_trend?.disputatio.count).toBe(1);
    expect(parsed.warnings).toHaveLength(0);
  });

  test("in_ralph + valid ralph_state → TUI prints trend section with sparkline", async () => {
    await seedRalphSession({ phase: "in_ralph", ralphState: ralphStateFixture() });
    const { output, status } = run("status");
    expect(status).toBe(0);
    expect(output).toContain("Ralph trend:");
    expect(output).toContain("Gate 5 (2):");
    expect(output).toContain("Disputatio (1):");
    expect(output).toContain("approved 1");
  });

  test("ralph_complete + missing ralph_state.json → warning, no error, no trend", async () => {
    await seedRalphSession({ phase: "ralph_complete", ralphState: null });
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { ralph_trend?: unknown } };
      warnings: { code: string; message: string }[];
    };
    expect(parsed.result.data.ralph_trend).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]?.message).toContain("ralph_state.json not found");
  });

  test("in_ralph + corrupt ralph_state → warning, no error, exit 0", async () => {
    await seedRalphSession({
      phase: "in_ralph",
      ralphState: { version: 1, current_leaf_id: 42 } as unknown as Record<string, unknown>,
    });
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { ralph_trend?: unknown } };
      warnings: { code: string; message: string }[];
    };
    expect(parsed.result.data.ralph_trend).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]?.message).toContain("ralph_state.json corrupt");
  });

  test("in_alignment phase does NOT load ralph_state (R3-A gate)", async () => {
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
    // Even with a junk ralph_state.json present, in_alignment phase
    // skips trend-loading entirely.
    await writeFile(join(cwd, ".agora", "ralph_state.json"), "not even json", "utf8");
    const { output, status } = run("status --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { ralph_trend?: unknown } };
      warnings: { code: string; message: string }[];
    };
    expect(parsed.result.data.ralph_trend).toBeUndefined();
    expect(parsed.warnings).toHaveLength(0);
  });

  test("ko locale renders Ralph trend header in Korean", async () => {
    await seedRalphSession({ phase: "in_ralph", ralphState: ralphStateFixture() });
    const { output, status } = run("status --locale=ko");
    expect(status).toBe(0);
    expect(output).toContain("Ralph 추세:");
    expect(output).toContain("승인 1");
  });
});
