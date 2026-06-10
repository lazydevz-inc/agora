// SPEC: ADR-0010 Slice D — gate failure envelopes must carry enough
// detail (exit codes + output tails) for the host to fix WITHOUT
// re-running the gate commands by hand. Gates are mocked at the module
// boundary; this file covers only the failure-envelope contract.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Gate2Result } from "@/ralph/gate-2.js";
import { type Gate1Result, newRalphState } from "@/ralph/state.js";
import { writeJsonAtomic } from "@/shared/io.js";
import { newState } from "@/state/types.js";

const NOW = "2026-06-10T10:00:00.000Z";

const gate1Mock = vi.hoisted(() => ({
  runGate1WithCache: vi.fn(),
}));
const gate2Mock = vi.hoisted(() => ({
  runGate2: vi.fn(),
}));
vi.mock("@/ralph/gate-1-cache.js", () => gate1Mock);
vi.mock("@/ralph/gate-2.js", () => gate2Mock);

import { runRalphStep } from "@/mcp/ralph-step.js";

let cwd: string;
let prevCwd: string;

function gate1Result(passed: boolean): Gate1Result {
  const cmd = (name: "typecheck" | "lint" | "test" | "build", ok: boolean) => ({
    name,
    exit_code: ok ? 0 : 1,
    duration_ms: 10,
    passed: ok,
    timed_out: false,
    stdout_tail: ok ? "" : "FAIL tests/x.test.ts > broken fixture",
    stderr_tail: ok ? "" : "ELIFECYCLE Command failed with exit code 1.",
  });
  return {
    commands: [cmd("typecheck", true), cmd("lint", true), cmd("test", passed), cmd("build", true)],
    overall_passed: passed,
    total_duration_ms: 40,
    ran_at: new Date().toISOString(),
  };
}

function gate2Result(passed: boolean): Gate2Result {
  return {
    skipped: false,
    detected_config: "playwright.config.ts",
    exit_code: passed ? 0 : 1,
    passed,
    timed_out: false,
    duration_ms: 1200,
    stdout_tail: passed ? "2 passed" : "1) tally.spec.ts:17 expected 3 rows, got 0",
    stderr_tail: "",
    ran_at: new Date().toISOString(),
  };
}

const AC_TREE = [{ id: "ac_001", content: "the leaf", depth: 0, atomic: true, children: [] }];

// Mirrors ralph-step.test.ts's canonical fixtures (Seed + RalphState must
// satisfy their Zod schemas or runRalphStep refuses before the gates).
function seedJson(): unknown {
  return {
    version: 1,
    locked_at: NOW,
    intake: {
      raw_intake: "x",
      intake_method: "inline",
      intake_word_count: 1,
      intake_byte_size: 1,
      intake_truncated: false,
      intake_duration_ms: 1,
      estimated_rounds: "x",
      classification: "greenfield",
      created_at: NOW,
    },
    four_causes: {
      telos: {
        statement: "help users align",
        served_good: "clarity",
        failure_signal: "abandonment",
        maturity: "noesis",
        noun_phrase_refinement_triggered: false,
      },
      form: {
        essential_structure: "CLI",
        irreducible_parts: ["loop"],
        feature_list_warning_triggered: false,
        maturity: "dianoia",
      },
      material: {
        tech_stack: ["TypeScript"],
        data_shape: "json",
        infrastructure: "local",
        brownfield_auto_filled: false,
        maturity: "pistis",
      },
      efficient: { who: "solo", when: "evenings", how: "vitest", maturity: "pistis" },
      created_at: NOW,
      updated_at: NOW,
    },
    acceptance_criteria: {
      criteria: [{ id: "ac_001", content: "the leaf" }],
      raw_input: "the leaf",
      created_at: NOW,
    },
    ac_tree: AC_TREE,
  };
}

async function seedInRalph(): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
    ...newState(),
    current_phase: "in_ralph",
  });
  await writeJsonAtomic(join(cwd, ".agora", "seed.json"), seedJson());
  await writeJsonAtomic(
    join(cwd, ".agora", "ralph_state.json"),
    newRalphState({ ac_tree: AC_TREE as never, initial_leaf_id: "ac_001" }),
  );
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-ralph-gates-"));
  prevCwd = process.cwd();
  process.chdir(cwd);
  vi.clearAllMocks();
});

afterEach(async () => {
  process.chdir(prevCwd);
  await rm(cwd, { recursive: true, force: true });
});

describe("gate_1_failed envelope — failed_detail contract", () => {
  test("carries name, exit_code, and output tails for each failing command", async () => {
    await seedInRalph();
    gate1Mock.runGate1WithCache.mockResolvedValue({
      result: gate1Result(false),
      from_cache: false,
    });

    const r = await runRalphStep({});
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.gate_1_failed");
    const detail = r.value.state_after?.["failed_detail"] as {
      name: string;
      exit_code: number;
      stdout_tail: string;
      stderr_tail: string;
    }[];
    expect(detail).toHaveLength(1);
    expect(detail[0]?.name).toBe("test");
    expect(detail[0]?.exit_code).toBe(1);
    expect(detail[0]?.stdout_tail).toContain("broken fixture");
    expect(detail[0]?.stderr_tail).toContain("ELIFECYCLE");
    expect(gate2Mock.runGate2).not.toHaveBeenCalled();
  });
});

describe("gate_2_failed envelope — failed_detail contract", () => {
  test("carries exit_code + tails when Playwright fails after Gate 1 passes", async () => {
    await seedInRalph();
    gate1Mock.runGate1WithCache.mockResolvedValue({
      result: gate1Result(true),
      from_cache: true,
    });
    gate2Mock.runGate2.mockResolvedValue(gate2Result(false));

    const r = await runRalphStep({});
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.gate_2_failed");
    const detail = r.value.state_after?.["failed_detail"] as {
      exit_code: number | null;
      stdout_tail: string;
    };
    expect(detail.exit_code).toBe(1);
    expect(detail.stdout_tail).toContain("expected 3 rows");
  });
});
