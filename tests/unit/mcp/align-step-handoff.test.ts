// SPEC: ADR-0010 Slice C — integration tests for maturity / ac /
// handoff through runAlignStep. Each test seeds the prior artifacts so
// the orchestrator dispatches directly to the cause under test.

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { runAlignStep } from "@/mcp/align-step.js";
import { writeJsonAtomic } from "@/shared/io.js";
import { newState } from "@/state/types.js";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), "agora-align-handoff-"));
  process.chdir(cwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(cwd, { recursive: true, force: true });
});

const TELOS = {
  statement: "Help users align thinking with AI",
  served_good: "Clarity",
  failure_signal: "abandonment",
  maturity: "dianoia",
  noun_phrase_refinement_triggered: false,
};
const FORM = {
  essential_structure: "CLI with subcommand-per-cause",
  irreducible_parts: ["alignment loop"],
  feature_list_warning_triggered: false,
  maturity: "dianoia",
};
const MATERIAL = {
  tech_stack: ["TypeScript"],
  data_shape: "JSON files",
  infrastructure: "local CLI",
  brownfield_auto_filled: false,
  maturity: "pistis",
};
const EFFICIENT = {
  who: "solo",
  when: "evenings",
  how: "vitest",
  maturity: "pistis",
};

async function seedThroughElenchus() {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), newState());
  await writeJsonAtomic(join(cwd, ".agora", "intake.json"), {
    raw_intake: "Build a tool that helps users align thinking with AI.",
    intake_method: "inline",
    intake_word_count: 10,
    intake_byte_size: 80,
    intake_truncated: false,
    intake_duration_ms: 5,
    estimated_rounds: "3-5 rounds",
    classification: "greenfield",
    created_at: new Date().toISOString(),
  });
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
    telos: TELOS,
    form: FORM,
    material: MATERIAL,
    efficient: EFFICIENT,
    created_at: now,
    updated_at: now,
  });
  await writeJsonAtomic(join(cwd, ".agora", "elenchus.json"), {
    version: 1,
    elenched: [],
    created_at: now,
  });
}

async function seedThroughMaturityPassed() {
  await seedThroughElenchus();
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "maturity.json"), {
    per_cause: [
      {
        field_path: "telos",
        tagged_maturity: "noesis",
        required_floor: "noesis",
        passed: true,
        rejected_alternatives: [{ alternative: "X", why_rejected: "Y because Z" }],
      },
      {
        field_path: "form",
        tagged_maturity: "dianoia",
        required_floor: "dianoia",
        passed: true,
        rejected_alternatives: [],
      },
      {
        field_path: "material",
        tagged_maturity: "pistis",
        required_floor: "pistis",
        passed: true,
        rejected_alternatives: [],
      },
      {
        field_path: "efficient",
        tagged_maturity: "pistis",
        required_floor: "pistis",
        passed: true,
        rejected_alternatives: [],
      },
    ],
    all_passed: true,
    failing_causes: [],
    created_at: now,
  });
  // state advances to alignment_complete
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
    ...newState(),
    current_phase: "alignment_complete",
    alignment: { phase: 2, round: 4 },
  });
}

async function seedThroughAcs() {
  await seedThroughMaturityPassed();
  await writeJsonAtomic(join(cwd, ".agora", "acceptance_criteria.json"), {
    criteria: [{ id: "ac_001", content: "User completes alignment in one session" }],
    raw_input: "User completes alignment in one session",
    created_at: new Date().toISOString(),
  });
}

// ─── Maturity (4-cause sequential, all pass) ───

describe("runAlignStep — maturity round (4 causes sequential, all pass)", () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: End-to-end stepped-flow test intentionally preserves the visible sequence.
  test("seeded through elenchus → 4 ask/extract cycles → alignment_complete", async () => {
    await seedThroughElenchus();
    const ask1 = await runAlignStep({});
    if (!ask1.ok || ask1.value.kind !== "needs_user_input") {
      throw new Error("expected maturity.ask for telos");
    }
    expect(ask1.value.step).toBe("maturity.ask");
    expect(ask1.value.questions[0]?.id).toBe("q_noesis");
    expect(ask1.value.questions[0]?.open_question).toBe(true);

    // Cycle: ask → extract → ask → extract → ... for 4 causes.
    const causes = ["telos", "form", "material", "efficient"] as const;
    for (let i = 0; i < causes.length; i += 1) {
      const required =
        causes[i] === "telos" ? "noesis" : causes[i] === "form" ? "dianoia" : "pistis";
      const ans = await runAlignStep({
        user_answers: {
          q_noesis: "I considered X but rejected because Y. Then Z made W the right choice.",
        },
      });
      if (!ans.ok || ans.value.kind !== "needs_reasoning") {
        throw new Error(`expected maturity.extract for cause #${String(i)}`);
      }
      expect(ans.value.step).toBe("maturity.extract");

      const ext = await runAlignStep({
        llm_responses: [
          {
            id: "tag",
            content: {
              tagged_maturity: required,
              rejected_alternatives:
                required === "noesis" ? [{ alternative: "alt", why_rejected: "reason" }] : [],
            },
          },
        ],
      });
      // Next cycle (or maturity.complete after last).
      if (i < causes.length - 1) {
        if (!ext.ok || ext.value.kind !== "needs_user_input") {
          throw new Error(`expected next maturity.ask after cause #${String(i)}`);
        }
        expect(ext.value.step).toBe("maturity.ask");
      } else {
        if (!ext.ok || ext.value.kind !== "advanced") {
          throw new Error(`expected maturity.complete, got ${ext.ok ? ext.value.kind : "err"}`);
        }
        expect(ext.value.step).toBe("maturity.complete");
      }
    }

    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("alignment_complete");
    const matResult = JSON.parse(await readFile(join(cwd, ".agora", "maturity.json"), "utf8")) as {
      all_passed: boolean;
    };
    expect(matResult.all_passed).toBe(true);
  });
});

// ─── AC capture ───

describe("runAlignStep — acceptance criteria capture", () => {
  test("seeded through maturity → ac.ask → ac.extract → ac.complete", async () => {
    await seedThroughMaturityPassed();
    const open = await runAlignStep({});
    if (!open.ok || open.value.kind !== "needs_user_input") {
      throw new Error(`expected ac.ask, got ${open.ok ? open.value.kind : "err"}`);
    }
    expect(open.value.step).toBe("ac.ask");

    const reasoning = await runAlignStep({
      user_answers: {
        q_acs_list: "User completes alignment in one session\nAll Phase 2 causes captured",
      },
    });
    if (!reasoning.ok || reasoning.value.kind !== "needs_reasoning") {
      throw new Error("expected ac.extract");
    }
    expect(reasoning.value.step).toBe("ac.extract");

    const done = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            criteria: [
              { content: "User completes alignment in one session" },
              { content: "All Phase 2 causes captured" },
            ],
          },
        },
      ],
    });
    if (!done.ok || done.value.kind !== "advanced") throw new Error("expected ac.complete");
    expect(done.value.step).toBe("ac.complete");

    const acsFile = JSON.parse(
      await readFile(join(cwd, ".agora", "acceptance_criteria.json"), "utf8"),
    ) as { criteria: { id: string }[] };
    expect(acsFile.criteria).toHaveLength(2);
    expect(acsFile.criteria[0]?.id).toBe("ac_001");
    expect(acsFile.criteria[1]?.id).toBe("ac_002");
  });
});

// ─── Handoff: DH (1 atomic) + confirm yes ───

describe("runAlignStep — handoff (DH + confirm yes → seed lock)", () => {
  test("seeded through acs → dh_decompose (1 node, defense<floor) → confirm yes → ready_for_ralph", async () => {
    await seedThroughAcs();
    const dh = await runAlignStep({});
    if (!dh.ok || dh.value.kind !== "needs_reasoning") {
      throw new Error(`expected handoff.dh_decompose, got ${dh.ok ? dh.value.kind : "err"}`);
    }
    expect(dh.value.step).toBe("handoff.dh_decompose");
    expect(dh.value.prompts[0]?.id).toBe("decompose");

    // Defense score below floor (0.6) → undivided/atomic → queue drains → confirm.
    const confirmStep = await runAlignStep({
      llm_responses: [
        {
          id: "decompose",
          content: {
            binary: "irrelevant",
            alternatives_considered: ["a", "b"],
            defense: "low confidence",
            defense_score: 0.4,
            children: [],
          },
        },
      ],
    });
    if (!confirmStep.ok || confirmStep.value.kind !== "needs_user_input") {
      throw new Error("expected handoff.confirm");
    }
    expect(confirmStep.value.step).toBe("handoff.confirm");

    const done = await runAlignStep({ user_answers: { q_confirm: "yes" } });
    if (!done.ok || done.value.kind !== "advanced") {
      throw new Error(`expected handoff.complete, got ${done.ok ? done.value.kind : "err"}`);
    }
    expect(done.value.step).toBe("handoff.complete");

    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("ready_for_ralph");

    const seed = JSON.parse(await readFile(join(cwd, ".agora", "seed.json"), "utf8")) as {
      ac_tree: { atomic: boolean }[];
    };
    expect(seed.ac_tree).toHaveLength(1);
    expect(seed.ac_tree[0]?.atomic).toBe(true);
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handoff refusal scenario is clearer as one full flow.
  test('q_confirm:"no" → handoff.declined; seed not written; state stays alignment_complete', async () => {
    await seedThroughAcs();
    await runAlignStep({}); // opens DH
    await runAlignStep({
      llm_responses: [
        {
          id: "decompose",
          content: {
            binary: "—",
            alternatives_considered: ["a"],
            defense: "—",
            defense_score: 0.3,
            children: [],
          },
        },
      ],
    });
    const declined = await runAlignStep({ user_answers: { q_confirm: "no" } });
    if (!declined.ok || declined.value.kind !== "advanced") {
      throw new Error(
        `expected handoff.declined, got ${declined.ok ? declined.value.kind : "err"}`,
      );
    }
    expect(declined.value.step).toBe("handoff.declined");
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("alignment_complete");
    // seed.json must NOT exist
    let seedExists = true;
    try {
      await readFile(join(cwd, ".agora", "seed.json"), "utf8");
    } catch {
      seedExists = false;
    }
    expect(seedExists).toBe(false);

    // Retry after decline: the preserved ac_tree.json must short-circuit
    // Dihairesis — next handoff round goes STRAIGHT to confirm (no
    // dh_decompose round-trips re-paid). (Dogfood QA 2026-06-10.)
    const retry = await runAlignStep({});
    if (!retry.ok || retry.value.kind !== "needs_user_input") {
      throw new Error(`expected immediate confirm, got ${retry.ok ? retry.value.kind : "err"}`);
    }
    expect(retry.value.step).toBe("handoff.confirm");
    const locked = await runAlignStep({ user_answers: { q_confirm: "yes" } });
    if (!locked.ok || locked.value.kind !== "advanced") throw new Error("expected complete");
    expect(locked.value.step).toBe("handoff.complete");
  });
});

describe("runAlignStep — deadlock reconcile (all artifacts exist, state in_alignment)", () => {
  test("in_alignment + locked seed → align.reconciled, state advances to ready_for_ralph", async () => {
    await seedThroughAcs();
    // Complete handoff for real.
    await runAlignStep({});
    await runAlignStep({
      llm_responses: [
        {
          id: "decompose",
          content: {
            binary: "—",
            alternatives_considered: ["a"],
            defense: "—",
            defense_score: 0.3,
            children: [],
          },
        },
      ],
    });
    await runAlignStep({ user_answers: { q_confirm: "yes" } });
    // Simulate a Z2-style re-entry that invalidated nothing: state back to
    // in_alignment while every artifact (incl. seed.json) still exists.
    const stateRaw = JSON.parse(
      await readFile(join(cwd, ".agora", "state.json"), "utf8"),
    ) as Record<string, unknown>;
    await writeJsonAtomic(join(cwd, ".agora", "state.json"), {
      ...stateRaw,
      current_phase: "in_alignment",
    });

    const r = await runAlignStep({});
    if (!r.ok || r.value.kind !== "advanced") {
      throw new Error(`expected align.reconciled, got ${r.ok ? r.value.kind : "err"}`);
    }
    expect(r.value.step).toBe("align.reconciled");
    const after = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(after.current_phase).toBe("ready_for_ralph");
  });
});
