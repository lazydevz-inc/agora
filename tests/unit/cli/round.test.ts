// SPEC: docs/cli/spec.md (orchestrator slice 6-A.15).
// Tests pickNextRound dispatch logic in isolation. Full integration
// (actual dispatch to runTelosCommand etc.) is exercised in the
// per-cause integration tests; this file just verifies the routing
// table for FourCauses → next-round target.

import { describe, expect, test } from "vitest";

import { pickNextRound } from "@/cli/commands/round.js";
import type { FourCauses } from "@/philosophers/aristotle.js";

const baseTimestamps = {
  created_at: "2026-05-04T03:00:00.000Z",
  updated_at: "2026-05-04T03:00:00.000Z",
};

const telos = {
  statement: "help me X",
  served_good: "Y",
  failure_signal: "Z",
  maturity: "dianoia" as const,
  noun_phrase_refinement_triggered: false,
};
const form = {
  essential_structure: "single-page CRUD",
  irreducible_parts: ["sync engine"],
  feature_list_warning_triggered: false,
  maturity: "dianoia" as const,
};
const material = {
  tech_stack: ["typescript"],
  data_shape: "JSON",
  infrastructure: "local",
  brownfield_auto_filled: false,
  maturity: "pistis" as const,
};
const efficient = {
  who: "solo",
  when: "evenings",
  how: "TDD",
  maturity: "pistis" as const,
};

describe("pickNextRound", () => {
  test("null four_causes → telos", () => {
    expect(pickNextRound(null)).toBe("telos");
  });

  test("empty four_causes (no telos) → telos", () => {
    const causes: FourCauses = { ...baseTimestamps };
    expect(pickNextRound(causes)).toBe("telos");
  });

  test("only telos → form", () => {
    const causes: FourCauses = { telos, ...baseTimestamps };
    expect(pickNextRound(causes)).toBe("form");
  });

  test("telos + form → material", () => {
    const causes: FourCauses = { telos, form, ...baseTimestamps };
    expect(pickNextRound(causes)).toBe("material");
  });

  test("telos + form + material → efficient", () => {
    const causes: FourCauses = { telos, form, material, ...baseTimestamps };
    expect(pickNextRound(causes)).toBe("efficient");
  });

  test("all 4 causes, telos.maturity=dianoia (Plato hasn't run) → maturity", () => {
    const causes: FourCauses = { telos, form, material, efficient, ...baseTimestamps };
    expect(pickNextRound(causes)).toBe("maturity");
  });

  test("all 4 causes, telos.maturity=noesis (Plato done) → complete", () => {
    const causes: FourCauses = {
      telos: { ...telos, maturity: "noesis" },
      form,
      material,
      efficient,
      ...baseTimestamps,
    };
    expect(pickNextRound(causes)).toBe("complete");
  });

  test("all 4 causes, telos.maturity=pistis (failed maturity) → maturity (re-run)", () => {
    const causes: FourCauses = {
      telos: { ...telos, maturity: "pistis" },
      form,
      material,
      efficient,
      ...baseTimestamps,
    };
    expect(pickNextRound(causes)).toBe("maturity");
  });
});
