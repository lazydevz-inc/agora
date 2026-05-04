// SPEC: docs/cli/spec.md Stage 3-B.5 — `agora resume` end-to-end.
//
// Coverage: 8-phase dispatch, alignment.phase sub-variations, corrupt
// state (exit 20), no-session (exit 1), ko locale, deferred phases
// produce informative envelope (not silent override per F-Aquinas-4).

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-resume-"));
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

async function seedState(phase: string, alignmentPhase?: number): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  const state: Record<string, unknown> = {
    version: 1,
    current_phase: phase,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (alignmentPhase !== undefined) {
    state["alignment"] = { phase: alignmentPhase, round: 0 };
  }
  await writeFile(join(cwd, ".agora", "state.json"), JSON.stringify(state), "utf8");
}

describe("agora resume — no session", () => {
  test("TUI prints 'nothing to resume' + suggests agora new", () => {
    const { output, status } = run("resume");
    expect(status).toBe(1);
    expect(output).toContain("Nothing to resume");
    expect(output).toContain("agora new");
  });

  test("JSON envelope: handler=no_session + 2 next suggestions", () => {
    const { output, status } = run("resume --json");
    expect(status).toBe(1);
    const parsed = JSON.parse(output) as {
      command: string;
      result: { ok: boolean; data: { handler: string } };
      next: { id: string; command: string }[];
      exit_code: number;
    };
    expect(parsed.command).toBe("agora resume");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.data.handler).toBe("no_session");
    expect(parsed.next).toHaveLength(2);
    expect(parsed.next[0]?.id).toBe("start_new");
    expect(parsed.next[1]?.id).toBe("doctor");
    expect(parsed.exit_code).toBe(1);
  });
});

describe("agora resume — in_alignment handler", () => {
  test("phase 0 → bracket + intake suggestions", async () => {
    await seedState("in_alignment", 0);
    const { output, status } = run("resume --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { handler: string; alignment_phase: number } };
      next: { id: string }[];
    };
    expect(parsed.result.data.handler).toBe("in_alignment");
    expect(parsed.result.data.alignment_phase).toBe(0);
    expect(parsed.next.map((n) => n.id)).toEqual(["bracket", "intake_pending"]);
  });

  test("phase -1 → bracket_done line + intake only", async () => {
    await seedState("in_alignment", -1);
    const { output, status } = run("resume");
    expect(status).toBe(0);
    expect(output).toContain("Husserl Phase −1 already complete");
    expect(output).toContain("agora intake");

    const json = run("resume --json");
    const parsed = JSON.parse(json.output) as { next: { id: string }[] };
    expect(parsed.next.map((n) => n.id)).toEqual(["intake_pending"]);
  });

  test("phase 1 → telos hint (intake done, Phase 2 round 1 next)", async () => {
    await seedState("in_alignment", 1);
    const { output, status } = run("resume --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      next: { id: string; command: string }[];
    };
    expect(parsed.next.map((n) => n.id)).toEqual(["telos"]);
    expect(parsed.next[0]?.command).toBe("agora round");
  });

  test("phase 2 → runtime_pending message", async () => {
    await seedState("in_alignment", 2);
    const { output, status } = run("resume");
    expect(status).toBe(0);
    expect(output).toContain("Phase 2 runtime is not yet implemented");
  });

  test("in_alignment_paused dispatches to same handler", async () => {
    await seedState("in_alignment_paused", 0);
    const { output, status } = run("resume --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { handler: string; previous_phase: string } };
    };
    expect(parsed.result.data.handler).toBe("in_alignment");
    expect(parsed.result.data.previous_phase).toBe("in_alignment_paused");
  });
});

describe("agora resume — deferred phases (R3-A)", () => {
  test("alignment_complete → deferred (handoff_not_implemented)", async () => {
    await seedState("alignment_complete");
    const { output, status } = run("resume --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { handler: string; deferred_reason: string } };
    };
    expect(parsed.result.data.handler).toBe("deferred");
    expect(parsed.result.data.deferred_reason).toBe("handoff_not_implemented");
  });

  test("ralph_complete → deferred with explicit reason", async () => {
    await seedState("ralph_complete");
    const { output, status } = run("resume --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { handler: string; deferred_reason: string } };
    };
    expect(parsed.result.data.handler).toBe("deferred");
    expect(parsed.result.data.deferred_reason).toBe("ralph_complete_dialog_not_implemented");
  });

  test("ready_for_ralph → deferred (ralph_not_implemented)", async () => {
    await seedState("ready_for_ralph");
    const { output } = run("resume --json");
    const parsed = JSON.parse(output) as {
      result: { data: { deferred_reason: string } };
    };
    expect(parsed.result.data.deferred_reason).toBe("ralph_not_implemented");
  });
});

describe("agora resume — corrupt state (R3-A → exit 20)", () => {
  test("invalid phase enum → state.corrupt error envelope, exit 20", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: "bogus_phase",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
    const { output, status } = run("resume --json");
    expect(status).toBe(20);
    const parsed = JSON.parse(output) as {
      result: { ok: boolean };
      errors: { code: string; category: string }[];
    };
    expect(parsed.result.ok).toBe(false);
    expect(parsed.errors[0]?.code).toBe("state.corrupt");
    expect(parsed.errors[0]?.category).toBe("state");
  });
});

describe("agora resume — locale", () => {
  test("ko locale uses Korean no-session message", () => {
    const { output } = run("resume --locale=ko");
    expect(output).toContain("이어서 진행할 작업이 없습니다");
  });
});
