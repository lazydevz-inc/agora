// SPEC: ADR-0010 Slice B — integration tests for the form / material /
// efficient / socrates cause state machines through the runAlignStep
// orchestrator. One happy-path per cause; refusal/error variants are
// covered indirectly by the cause-specific scratch validation in each
// step machine.

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
  cwd = await mkdtemp(join(tmpdir(), "agora-align-causes-"));
  process.chdir(cwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(cwd, { recursive: true, force: true });
});

async function seedSession() {
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
}

const TELOS_CLAIM = {
  statement: "Help users align thinking with AI",
  served_good: "Clarity",
  failure_signal: "User abandons after first session",
  maturity: "dianoia",
  noun_phrase_refinement_triggered: false,
};

const FORM_CLAIM = {
  essential_structure: "CLI with subcommand-per-cause",
  irreducible_parts: ["alignment loop", "ralph loop"],
  feature_list_warning_triggered: false,
  maturity: "dianoia",
};

const MATERIAL_CLAIM = {
  tech_stack: ["TypeScript", "Node 22"],
  data_shape: "JSON files under .agora/",
  infrastructure: "local CLI; no server",
  brownfield_auto_filled: false,
  maturity: "pistis",
};

const EFFICIENT_CLAIM = {
  who: "solo: Sang",
  when: "evenings, 30 min sessions",
  how: "TDD with vitest; commit per slice",
  maturity: "pistis",
};

async function seedTelosOnly() {
  await seedSession();
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
    telos: TELOS_CLAIM,
    created_at: now,
    updated_at: now,
  });
}

async function seedThroughForm() {
  await seedSession();
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
    telos: TELOS_CLAIM,
    form: FORM_CLAIM,
    created_at: now,
    updated_at: now,
  });
}

async function seedThroughMaterial() {
  await seedSession();
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
    telos: TELOS_CLAIM,
    form: FORM_CLAIM,
    material: MATERIAL_CLAIM,
    created_at: now,
    updated_at: now,
  });
}

async function seedThroughEfficient() {
  await seedSession();
  const now = new Date().toISOString();
  await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
    telos: TELOS_CLAIM,
    form: FORM_CLAIM,
    material: MATERIAL_CLAIM,
    efficient: EFFICIENT_CLAIM,
    created_at: now,
    updated_at: now,
  });
}

// ─── Form ───

describe("runAlignStep — form round (happy path, no feature-list warning)", () => {
  test("seeded telos → form.questions → form.extract → advanced + form persisted", async () => {
    await seedTelosOnly();

    const open = await runAlignStep({});
    expect(open.ok).toBe(true);
    if (!open.ok || open.value.kind !== "needs_user_input") {
      throw new Error(`expected form.questions, got ${open.ok ? open.value.kind : "err"}`);
    }
    expect(open.value.step).toBe("form.questions");
    expect(open.value.questions.map((q) => q.id)).toEqual([
      "q_essential_structure",
      "q_irreducible_parts",
    ]);

    const reasoning = await runAlignStep({
      user_answers: {
        q_essential_structure: "CLI with subcommand-per-cause",
        q_irreducible_parts: "alignment loop, ralph loop",
      },
    });
    expect(reasoning.ok).toBe(true);
    if (!reasoning.ok || reasoning.value.kind !== "needs_reasoning") {
      throw new Error("expected form.extract reasoning");
    }
    expect(reasoning.value.step).toBe("form.extract");

    const done = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            essential_structure: "CLI with subcommand-per-cause",
            irreducible_parts: ["alignment loop", "ralph loop"],
            feature_list_warning: false,
          },
        },
      ],
    });
    expect(done.ok).toBe(true);
    if (!done.ok || done.value.kind !== "advanced") throw new Error("expected advanced");
    expect(done.value.step).toBe("form.complete");

    const causes = JSON.parse(await readFile(join(cwd, ".agora", "four_causes.json"), "utf8")) as {
      form: { essential_structure: string; irreducible_parts: string[] };
    };
    expect(causes.form.essential_structure).toBe("CLI with subcommand-per-cause");
    expect(causes.form.irreducible_parts).toEqual(["alignment loop", "ralph loop"]);
  });
});

// ─── Material ───

describe("runAlignStep — material round (greenfield happy path)", () => {
  test("through form → material.questions → material.extract → advanced", async () => {
    await seedThroughForm();

    const open = await runAlignStep({});
    expect(open.ok).toBe(true);
    if (!open.ok || open.value.kind !== "needs_user_input") {
      throw new Error("expected material.questions");
    }
    expect(open.value.step).toBe("material.questions");
    expect(open.value.questions.map((q) => q.id)).toEqual([
      "q_stack",
      "q_data_shape",
      "q_infrastructure",
    ]);

    const reasoning = await runAlignStep({
      user_answers: {
        q_stack: "TypeScript, Node 22",
        q_data_shape: "JSON files under .agora/",
        q_infrastructure: "local CLI; no server",
      },
    });
    expect(reasoning.ok).toBe(true);
    if (!reasoning.ok || reasoning.value.kind !== "needs_reasoning") {
      throw new Error("expected material.extract reasoning");
    }
    expect(reasoning.value.step).toBe("material.extract");

    const done = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            tech_stack: ["TypeScript", "Node 22"],
            data_shape: "JSON files under .agora/",
            infrastructure: "local CLI; no server",
          },
        },
      ],
    });
    expect(done.ok).toBe(true);
    if (!done.ok || done.value.kind !== "advanced") throw new Error("expected advanced");
    expect(done.value.step).toBe("material.complete");
  });
});

// ─── Efficient ───

describe("runAlignStep — efficient round (happy path)", () => {
  test("through material → efficient.questions → efficient.extract → advanced", async () => {
    await seedThroughMaterial();

    const open = await runAlignStep({});
    expect(open.ok).toBe(true);
    if (!open.ok || open.value.kind !== "needs_user_input") {
      throw new Error("expected efficient.questions");
    }
    expect(open.value.step).toBe("efficient.questions");
    expect(open.value.questions.map((q) => q.id)).toEqual(["q_who", "q_when", "q_how"]);

    const reasoning = await runAlignStep({
      user_answers: {
        q_who: "solo: Sang",
        q_when: "evenings, 30 min sessions",
        q_how: "TDD with vitest; commit per slice",
      },
    });
    if (!reasoning.ok || reasoning.value.kind !== "needs_reasoning") {
      throw new Error("expected efficient.extract reasoning");
    }
    expect(reasoning.value.step).toBe("efficient.extract");

    const done = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            who: "solo: Sang",
            when: "evenings, 30 min sessions",
            how: "TDD with vitest; commit per slice",
          },
        },
      ],
    });
    if (!done.ok || done.value.kind !== "advanced") throw new Error("expected advanced");
    expect(done.value.step).toBe("efficient.complete");
  });
});

// ─── Socrates (2-claim sequential, both confirmed) ───

describe("runAlignStep — socrates elenchus (2-claim sequential)", () => {
  test("through efficient → construct[telos] → respond[telos] → construct[form] → respond[form] → complete", async () => {
    await seedThroughEfficient();

    // claim 1 (telos): construct
    const s1 = await runAlignStep({});
    expect(s1.ok).toBe(true);
    if (!s1.ok || s1.value.kind !== "needs_reasoning") {
      throw new Error("expected socrates.construct[telos]");
    }
    expect(s1.value.step).toBe("socrates.construct");
    expect(s1.value.prompts[0]?.id).toBe("construct");

    const s2 = await runAlignStep({
      llm_responses: [
        {
          id: "construct",
          content: {
            case: "Suppose a new user opens it for the first time.",
            grounding: "real_world",
            grounding_ref: "first-touch UX",
            question: "What signal tells you they understood it in 30 seconds?",
          },
        },
      ],
    });
    if (!s2.ok || s2.value.kind !== "needs_user_input") {
      throw new Error("expected socrates.respond[telos]");
    }
    expect(s2.value.step).toBe("socrates.respond");

    const s3 = await runAlignStep({
      user_answers: { q_response: "They name a goal they had not articulated before." },
    });
    if (!s3.ok || s3.value.kind !== "needs_reasoning") {
      throw new Error("expected socrates.construct[form]");
    }
    expect(s3.value.step).toBe("socrates.construct");

    const s4 = await runAlignStep({
      llm_responses: [
        {
          id: "construct",
          content: {
            case: "Imagine the structure has a 6th cause module to support.",
            grounding: "real_world",
            grounding_ref: "extensibility",
            question: "Does the irreducible parts list still hold?",
          },
        },
      ],
    });
    if (!s4.ok || s4.value.kind !== "needs_user_input") {
      throw new Error("expected socrates.respond[form]");
    }
    expect(s4.value.step).toBe("socrates.respond");

    const s5 = await runAlignStep({
      user_answers: { q_response: "Yes — adding a cause is additive, structure unchanged." },
    });
    expect(s5.ok).toBe(true);
    if (!s5.ok || s5.value.kind !== "advanced") {
      throw new Error(`expected advanced, got ${s5.ok ? s5.value.kind : "err"}`);
    }
    expect(s5.value.step).toBe("socrates.complete");

    const elenchus = JSON.parse(await readFile(join(cwd, ".agora", "elenchus.json"), "utf8")) as {
      elenched: { claim_id: string; outcome: string }[];
    };
    expect(elenchus.elenched).toHaveLength(2);
    expect(elenchus.elenched[0]?.claim_id).toBe("telos_001");
    expect(elenchus.elenched[1]?.claim_id).toBe("form_001");
    // Both "confirmed" — no marker words → categorizeResponse returns confirmed
    expect(elenchus.elenched.every((e) => e.outcome === "confirmed")).toBe(true);
  });
});
