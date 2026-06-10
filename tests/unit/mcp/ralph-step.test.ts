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

    // No git repo in the tmp fixture → init must warn (Gate 5 judges a git
    // diff; without a repo every iteration parks at drift 0.50 / Z1).
    expect(r.value.state_after?.git_repo).toBe(false);
    expect(r.value.message).toContain("no git repository detected");
  });
});

// ─── Gate 5 apply (seeded pending) ───

describe("runRalphStep — Gate 5 apply (pending pre-seeded)", () => {
  test("PASS (drift<0.15) → kickoff Disputatio (needs_reasoning disputatio.videtur)", async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: { drift_score: 0.1, rationale: "well-aligned" },
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "needs_reasoning") {
      throw new Error(`expected needs_reasoning, got ${r.ok ? r.value.kind : "err"}`);
    }
    expect(r.value.step).toBe("disputatio.videtur");
    expect(r.value.prompts.length).toBeGreaterThan(0);
  });

  test("SOFT_WARN (0.15-0.30) → kickoff Disputatio", async () => {
    await seedInRalphWithPendingGate5();
    const r = await runRalphStep({
      llm_responses: [
        {
          id: "gate_5",
          content: { drift_score: 0.2, rationale: "minor scope creep" },
        },
      ],
    });
    if (!r.ok || r.value.kind !== "needs_reasoning") {
      throw new Error("expected needs_reasoning disputatio.videtur");
    }
    expect(r.value.step).toBe("disputatio.videtur");
  });

  test("Z1 (0.30-0.60) → stay on leaf + record directive", async () => {
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

  test("Z2 (>=0.60) → issue needs_user_input (ralph.confirm_z2)", async () => {
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
    // Loop-policy question: no philosopher owns it, but the purpose still shows.
    expect(r.value.questions[0]?.philosopher).toBeUndefined();
    expect(r.value.questions[0]?.purpose_label).toBeTruthy();
  });

  test("Z2 then declined → the spike drift is recorded in gate_5_history (B5)", async () => {
    await seedInRalphWithPendingGate5();
    await runRalphStep({
      llm_responses: [
        { id: "gate_5", content: { drift_score: 0.8, rationale: "totally drifted" } },
      ],
    });
    const declined = await runRalphStep({ user_answers: { q_confirm_z2: "no" } });
    if (!declined.ok || declined.value.kind !== "advanced") throw new Error("expected z2_declined");
    expect(declined.value.step).toBe("ralph.z2_declined");
    // The catastrophic 0.8 drift must survive in the trend even though Z2 was
    // declined — otherwise spike-and-recover is invisible.
    const ralph = JSON.parse(await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8")) as {
      gate_5_history: { drift_score: number; action: string }[];
    };
    expect(ralph.gate_5_history).toHaveLength(1);
    expect(ralph.gate_5_history[0]?.drift_score).toBe(0.8);
    expect(ralph.gate_5_history[0]?.action).toBe("Z2");
  });
});

// ─── Disputatio chain end-to-end ───

describe("runRalphStep — Disputatio chain (Slice E)", () => {
  test("PASS → videtur (1 critic, 0 objections) → respondeo approved (sed_contra skipped) → leaf complete", async () => {
    await seedInRalphWithPendingGate5();
    // PASS triggers Disputatio kickoff.
    const v = await runRalphStep({
      llm_responses: [{ id: "gate_5", content: { drift_score: 0.1, rationale: "well-aligned" } }],
    });
    if (!v.ok || v.value.kind !== "needs_reasoning") throw new Error("expected videtur");
    expect(v.value.step).toBe("disputatio.videtur");
    // All 3 starter critics are always-trigger; expect a prompt per critic.
    expect(v.value.prompts).toHaveLength(3);
    expect(v.value.prompts.map((p) => p.id).sort()).toEqual([
      "tech-error-handling",
      "tech-solid",
      "universal-telos-alignment",
    ]);

    // Zero objections → Sed contra is vacuous and SKIPPED; respondeo is next.
    const re = await runRalphStep({
      llm_responses: [
        { id: "universal-telos-alignment", content: { objections: [] } },
        { id: "tech-solid", content: { objections: [] } },
        { id: "tech-error-handling", content: { objections: [] } },
      ],
    });
    if (!re.ok || re.value.kind !== "needs_reasoning") throw new Error("expected respondeo");
    expect(re.value.step).toBe("disputatio.respondeo");

    // verdict=approved + 0 objections → skip ad_singula → leaf complete
    const done = await runRalphStep({
      llm_responses: [
        {
          id: "respondeo",
          content: {
            verdict: "approved",
            reasoning: "Independent: the change serves telos directly.",
          },
        },
      ],
    });
    if (!done.ok || done.value.kind !== "advanced") {
      throw new Error(`expected advanced, got ${done.ok ? done.value.kind : "err"}`);
    }
    expect(done.value.step).toBe("ralph.complete");
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("ralph_complete");
    // B5: the passing drift is recorded EXACTLY once — applyGate5 appends to
    // gate_5_history and advanceLeaf must not re-append (a reference-equality
    // dedup across the RalphStateSchema.parse clone boundary used to double it).
    const ralph = JSON.parse(await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8")) as {
      gate_5_history: { drift_score: number }[];
    };
    expect(ralph.gate_5_history).toHaveLength(1);
    expect(ralph.gate_5_history[0]?.drift_score).toBe(0.1);
  });

  test("verdict=rejected + objections → ad_singula → stayOnLeafAfterReject", async () => {
    await seedInRalphWithPendingGate5();
    await runRalphStep({
      llm_responses: [{ id: "gate_5", content: { drift_score: 0.1, rationale: "ok" } }],
    });
    // videtur: 3 critics (only universal raises an objection).
    await runRalphStep({
      llm_responses: [
        {
          id: "universal-telos-alignment",
          content: {
            objections: [
              {
                id: "obj_1",
                claim: "leaf does not serve telos",
                evidence: "diff adds unrelated module",
                severity: "critical",
              },
            ],
          },
        },
        { id: "tech-solid", content: { objections: [] } },
        { id: "tech-error-handling", content: { objections: [] } },
      ],
    });
    await runRalphStep({
      llm_responses: [{ id: "sed_contra", content: { sed_contra: "case for despite" } }],
    });
    await runRalphStep({
      llm_responses: [
        {
          id: "respondeo",
          content: { verdict: "rejected", reasoning: "Independent: telos not served." },
        },
      ],
    });
    const rejected = await runRalphStep({
      llm_responses: [
        {
          id: "ad_singula",
          content: {
            rulings: [
              {
                // Objection ids are namespaced per critic by the orchestrator.
                objection_id: "universal-telos-alignment:obj_1",
                ruling: "concedo",
                action_or_reason: "remove unrelated module + refocus on telos",
              },
            ],
          },
        },
      ],
    });
    if (!rejected.ok || rejected.value.kind !== "advanced") {
      throw new Error(`expected advanced, got ${rejected.ok ? rejected.value.kind : "err"}`);
    }
    expect(rejected.value.step).toBe("ralph.disputatio_rejected");
    const ralphState = JSON.parse(
      await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8"),
    ) as { z1_directives: string[]; current_leaf_id: string };
    expect(ralphState.current_leaf_id).toBe("ac_001"); // stays
    expect(ralphState.z1_directives).toContain("remove unrelated module + refocus on telos");
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

    // Z2-yes must actually OPEN the re-alignment: maturity tags + seed lock
    // invalidated (else align_step sees every artifact, says "done", and
    // ralph_step refuses in_alignment — deadlock; dogfood QA 2026-06-10).
    await expect(readFile(join(cwd, ".agora", "seed.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(cwd, ".agora", "maturity.json"), "utf8")).rejects.toThrow();
    // ralph_state survives so Ralph resumes the same leaf after re-lock.
    const ralphState = JSON.parse(
      await readFile(join(cwd, ".agora", "ralph_state.json"), "utf8"),
    ) as { current_leaf_id: string };
    expect(ralphState.current_leaf_id).toBe("ac_001");
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
