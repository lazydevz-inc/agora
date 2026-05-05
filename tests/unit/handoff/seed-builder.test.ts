// SPEC: docs/loops/handoff.md (Stage 2-C — seed.json contract).

import { describe, expect, test } from "vitest";

import { buildSeed, SeedSchema } from "@/handoff/seed-builder.js";

const intake = {
  raw_intake: "I want to capture insights from reading",
  intake_method: "inline" as const,
  intake_word_count: 7,
  intake_byte_size: 40,
  intake_truncated: false,
  intake_duration_ms: 1000,
  estimated_rounds: "5–8 rounds",
  classification: "greenfield" as const,
  created_at: "2026-05-05T00:00:00.000Z",
};

const fourCauses = {
  telos: {
    statement: "help me make connections across reading",
    served_good: "connection-making",
    failure_signal: "still searching memory",
    maturity: "noesis" as const,
    noun_phrase_refinement_triggered: false,
  },
  form: {
    essential_structure: "single-page CRUD",
    irreducible_parts: ["sync engine"],
    feature_list_warning_triggered: false,
    maturity: "noesis" as const,
  },
  material: {
    tech_stack: ["typescript"],
    data_shape: "JSON",
    infrastructure: "local",
    brownfield_auto_filled: false,
    maturity: "pistis" as const,
  },
  efficient: {
    who: "solo",
    when: "evenings",
    how: "TDD",
    maturity: "pistis" as const,
  },
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const acs = {
  criteria: [
    { id: "ac_001", content: "Users can capture a thought in 5 seconds" },
    { id: "ac_002", content: "Backlinks appear automatically when relevant" },
  ],
  raw_input: "raw input text",
  created_at: "2026-05-05T00:00:00.000Z",
};

const acTree = [
  {
    id: "ac_001",
    content: "Users can capture a thought in 5 seconds",
    depth: 0,
    atomic: true,
    children: [],
  },
  {
    id: "ac_002",
    content: "Backlinks appear automatically when relevant",
    depth: 0,
    atomic: true,
    children: [],
  },
];

describe("buildSeed", () => {
  test("happy path with defended_frame=null (greenfield-no-bracket)", () => {
    const seed = buildSeed({
      defended_frame: null,
      intake,
      four_causes: fourCauses,
      acceptance_criteria: acs,
      ac_tree: acTree,
    });
    expect(seed.version).toBe(1);
    expect(seed.defended_frame).toBeUndefined();
    expect(seed.intake.raw_intake).toContain("insights");
    expect(seed.four_causes.telos?.maturity).toBe("noesis");
    expect(seed.acceptance_criteria.criteria.length).toBe(2);
    expect(seed.ac_tree.length).toBe(2);
    expect(seed.locked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("happy path with defended_frame populated", () => {
    const defendedFrame = {
      raw_intent: "build a notes app",
      chosen_form: "personal note-taking software",
      brackets_considered: {
        software_bracket: {
          considered_alternative: "physical notebook",
          defense: "I want backlinks; physical can't compute relationships",
          defense_followup_triggered: false,
        },
        form_bracket: {
          considered_alternative: "Notion",
          defense: "Friction in capture step kills the habit",
          defense_followup_triggered: false,
        },
        audience_bracket: {
          considered_alternative: "small group",
          defense: "Public pressure self-edits away half-formed thoughts",
          defense_followup_triggered: false,
        },
      },
      surprising_findings: [],
      invocation: "explicit_bracket" as const,
      created_at: "2026-05-05T00:00:00.000Z",
    };
    const seed = buildSeed({
      defended_frame: defendedFrame,
      intake,
      four_causes: fourCauses,
      acceptance_criteria: acs,
      ac_tree: acTree,
    });
    expect(seed.defended_frame).toBeDefined();
    expect(seed.defended_frame?.chosen_form).toContain("note-taking");
  });

  test("output validates against SeedSchema", () => {
    const seed = buildSeed({
      defended_frame: null,
      intake,
      four_causes: fourCauses,
      acceptance_criteria: acs,
      ac_tree: acTree,
    });
    expect(SeedSchema.safeParse(seed).success).toBe(true);
  });

  test("rejects empty ac_tree (Zod min(1))", () => {
    expect(() =>
      buildSeed({
        defended_frame: null,
        intake,
        four_causes: fourCauses,
        acceptance_criteria: acs,
        ac_tree: [],
      }),
    ).toThrow();
  });
});
