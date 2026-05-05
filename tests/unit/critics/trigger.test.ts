// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 — trigger model.
// Schema-level + future-trigger-shape coverage (registry.test.ts covers
// always-trigger evaluation; this file targets schema validity for
// future ac_field/file_pattern/tech_stack triggers that aren't wired
// to a critic def yet).

import { describe, expect, test } from "vitest";

import { CriticTriggerSchema } from "@/critics/types.js";

describe("CriticTriggerSchema — discriminator enforcement", () => {
  test("always:true valid", () => {
    expect(CriticTriggerSchema.safeParse({ always: true }).success).toBe(true);
  });
  test("ac_field array valid", () => {
    expect(CriticTriggerSchema.safeParse({ ac_field: ["telos.statement"] }).success).toBe(true);
  });
  test("file_pattern array valid", () => {
    expect(CriticTriggerSchema.safeParse({ file_pattern: ["**/*.tsx"] }).success).toBe(true);
  });
  test("tech_stack array valid", () => {
    expect(CriticTriggerSchema.safeParse({ tech_stack: ["react"] }).success).toBe(true);
  });
  test("two discriminators active → invalid", () => {
    expect(
      CriticTriggerSchema.safeParse({
        always: true,
        ac_field: ["x"],
      }).success,
    ).toBe(false);
  });
  test("zero discriminators → invalid", () => {
    expect(CriticTriggerSchema.safeParse({}).success).toBe(false);
  });
});
