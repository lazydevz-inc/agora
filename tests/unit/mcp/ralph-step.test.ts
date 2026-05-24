// SPEC: ADR-0010 Slice D — integration tests for agora_ralph_step.
//
// Gate 1 / Gate 2 actually shell out to the project's pnpm scripts +
// Playwright, so the "run gates from a fresh call" path is environment-
// dependent and slow. We exercise it indirectly by seeding pending
// records that match what the orchestrator would have written, so the
// Gate 5 / Z2 apply paths can be tested in isolation.

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { writePending } from "@/mcp/pending.js";
import { runRalphStep } from "@/mcp/ralph-step.js";
import { newRalphState } from "@/ralph/state.js";
import { writeJsonAtomic } from "@/shared/io.js";
import { newState } from "@/state/types.js";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), "agora-ralph-step-"));
  process.chdir(cwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(cwd, { recursive: true, force: true });
});

const NOW = "2026-05-24T10:00:00.000Z";

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
      efficient: {
        who: "solo",
        when: "evenings",
        how: "vitest",
        maturity: "pistis",
      },
      created_at: NOW,
      updated_at: NOW,
    },
    acceptance_criteria: {
      criteria: [{ id: "ac_001", content: "user completes alignment in one session" }],
      raw_input: "user completes alignment in one session",
      created_at: NOW,
    },
    ac_tree: [
      {
        id: "ac_001",
        content: "user completes alignment in one session",
        depth: 0,
        atomic: true,
        children: [],
      },
    ],
  };
}

async function seedReadyForRalph() {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
    ...newState(),
    current_phase: "ready_for_ralph",
  });
  await writeJsonAtomic(join(cwd, ".agora", "seed.json"), seedJson());
}

async function seedInRalphWithPendingGate5() {
  await seedReadyForRalph();
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
    ...newState(),
    current_phase: "in_ralph",
  });
  const seed = seedJson() as { ac_tree: { id: string; content: string }[] };
  const ralphState = newRalphState({
    ac_tree: seed.ac_tree as never,
    initial_leaf_id: "ac_001",
  });
  await writeJsonAtomic(join(cwd, ".agora", "ralph_state.json"), ralphState);
  await writePending(cwd, {
    version: 1,
    owner: "ralph",
    step: "ralph.gate_5",
    expects: "llm_responses",
    issued_prompts: [
      {
        id: "gate_5",
        system: "S",
        user: "U",
        expect: "json",
      },
    ],
    scratch: { leaf_id: "ac_001", attempts_before: 0 },
    issued_at: NOW,
  });
}

async function seedInRalphWithPendingZ2() {
  await seedReadyForRalph();
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
    ...newState(),
    current_phase: "in_ralph",
  });
  const seed = seedJson() as { ac_tree: { id: string; content: string }[] };
  const ralphState = newRalphState({
    ac_tree: seed.ac_tree as never,
    initial_leaf_id: "ac_001",
  });
  await writeJsonAtomic(join(cwd, ".agora", "ralph_state.json"), ralphState);
  await writePending(cwd, {
    version: 1,
    owner: "ralph",
    step: "ralph.confirm_z2",
    expects: "user_answers",
    issued_questions: [{ id: "q_confirm_z2", prompt: "P" }],
    scratch: { leaf_id: "ac_001" },
    issued_at: NOW,
  });
}

// ─── Refusal paths ───

describe("runRalphStep — refusal paths", () => {
  test("no .agora → error envelope (user.aborted)", async () => {
    const r = await runRalphStep({});
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.code).toBe("user.aborted");
  });

  test("state.current_phase not in {ready_for_ralph, in_ralph} → error", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
      ...newState(),
      current_phase: "in_alignment",
    });
    const r = await runRalphStep({});
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.message).toMatch(/ready_for_ralph|in_ralph/);
  });

  test("seed.json missing → error (state.corrupt)", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
      ...newState(),
      current_phase: "ready_for_ralph",
    });
    const r = await runRalphStep({});
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.code).toBe("state.corrupt");
  });
});

// ─── Init ───

describe("runRalphStep — init (first call)", () => {
  test("ready_for_ralph + no ralph_state → init: state in_ralph + ralph_state.json written", async () => {
    await seedReadyForRalph();
    const r = await runRalphStep({});
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.initialized");

    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("in_ralph");

    const ralphState = JSON.parse(
      await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8"),
    ) as { current_leaf_id: string };
    expect(ralphState.current_leaf_id).toBe("ac_001");
  });
});

// ─── Gate 5 apply (seeded pending) ───

describe("runRalphStep — Gate 5 apply (pending pre-seeded)", () => {
  test('PASS (drift<0.15) → leaf advance + state ralph_complete (single-leaf tree)', async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: { drift_score: 0.1, rationale: "well-aligned" },
        },
      ],
    });
    if (!r.ok || r.value.kind !== "advanced") {
      throw new Error(`expected advanced, got ${r.ok ? r.value.kind : "err"}`);
    }
    expect(r.value.step).toBe("ralph.complete");

    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("ralph_complete");
  });

  test('SOFT_WARN (0.15-0.30) → leaf advance + state ralph_complete', async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: { drift_score: 0.2, rationale: "minor scope creep" },
        },
      ],
    });
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.complete");
  });

  test('Z1 (0.30-0.60) → stay on leaf + record directive', async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: {
            drift_score: 0.45,
            rationale: "partial address",
            z1_directive: "focus on X next",
          },
        },
      ],
    });
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.gate_5_z1");
    const ralphState = JSON.parse(
      await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8"),
    ) as { z1_directives: string[]; current_leaf_id: string };
    expect(ralphState.current_leaf_id).toBe("ac_001"); // stays
    expect(ralphState.z1_directives).toContain("focus on X next");
  });

  test('Z2 (>=0.60) → issue needs_user_input (ralph.confirm_z2)', async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: { drift_score: 0.8, rationale: "totally drifted" },
        },
      ],
    });
    if (!r.ok || r.value.kind !== "needs_user_input") throw new Error("expected confirm_z2");
    expect(r.value.step).toBe("ralph.confirm_z2");
  });
});

// ─── Z2 apply ───

describe("runRalphStep — Z2 apply", () => {
  test('q_confirm_z2:"yes" → state in_alignment + alignment.round=0', async () => {
    await seedInRalphWithPendingZ2();
    const r = await runRalphStep({ user_answers: { q_confirm_z2: "yes" } });
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.z2_accepted");
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
      alignment: { phase: number; round: number };
    };
    expect(state.current_phase).toBe("in_alignment");
    expect(state.alignment.round).toBe(0);
  });

  test('q_confirm_z2:"no" → declined; state stays in_ralph', async () => {
    await seedInRalphWithPendingZ2();
    const r = await runRalphStep({ user_answers: { q_confirm_z2: "no" } });
    if (!r.ok || r.value.kind !== "advanced") throw new Error("expected advanced");
    expect(r.value.step).toBe("ralph.z2_declined");
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("in_ralph");
  });
});
