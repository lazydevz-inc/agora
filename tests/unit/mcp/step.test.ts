// SPEC: ADR-0010 §"Tool surface" — envelope schemas + input validation.

import { describe, expect, test } from "vitest";

import {
  envAdvanced,
  envDone,
  envError,
  envNeedsReasoning,
  envNeedsUserInput,
  StepArgsSchema,
  StepEnvelopeSchema,
} from "@/mcp/step.js";

describe("StepArgsSchema (tool boundary validation)", () => {
  test("empty object is valid", () => {
    const r = StepArgsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("user_answers as Record<string,string> is valid", () => {
    const r = StepArgsSchema.safeParse({ user_answers: { a: "b", c: "d" } });
    expect(r.success).toBe(true);
  });

  test("user_answers with non-string value rejected", () => {
    const r = StepArgsSchema.safeParse({ user_answers: { a: 42 } });
    expect(r.success).toBe(false);
  });

  test("llm_responses with object content is valid", () => {
    const r = StepArgsSchema.safeParse({
      llm_responses: [{ id: "x", content: { foo: "bar" } }],
    });
    expect(r.success).toBe(true);
  });

  test("llm_responses with string content is valid", () => {
    const r = StepArgsSchema.safeParse({
      llm_responses: [{ id: "x", content: "raw text" }],
    });
    expect(r.success).toBe(true);
  });

  test("llm_responses missing id rejected", () => {
    const r = StepArgsSchema.safeParse({ llm_responses: [{ content: "x" }] });
    expect(r.success).toBe(false);
  });

  test("extra top-level keys rejected (strict mode)", () => {
    const r = StepArgsSchema.safeParse({ foo: "bar" });
    expect(r.success).toBe(false);
  });
});

describe("envelope builders + schema discrimination", () => {
  test("envDone parses as done variant", () => {
    const e = envDone("align", "all done");
    const r = StepEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe("done");
  });

  test("envAdvanced parses as advanced variant; optional state_after", () => {
    const e = envAdvanced("ralph", "gate_5.pass", "leaf complete", { iteration: 3 });
    const r = StepEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === "advanced") {
      expect(r.data.state_after).toEqual({ iteration: 3 });
    }
  });

  test("envNeedsUserInput requires ≥1 question", () => {
    const ok = envNeedsUserInput("align", "x", [{ id: "q", prompt: "P" }]);
    expect(StepEnvelopeSchema.safeParse(ok).success).toBe(true);
    const bad = { ...ok, questions: [] };
    expect(StepEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  test("envNeedsReasoning requires ≥1 prompt with expect:json|text", () => {
    const ok = envNeedsReasoning("align", "telos.extract", [
      { id: "p", system: "S", user: "U", expect: "json" },
    ]);
    expect(StepEnvelopeSchema.safeParse(ok).success).toBe(true);
    const bad = { ...ok, prompts: [{ id: "p", system: "S", user: "U", expect: "yaml" }] };
    expect(StepEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  test("envError parses as error variant", () => {
    const e = envError("align", "user.aborted", "nope");
    const r = StepEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe("error");
  });

  test("envelope with unknown loop rejected", () => {
    const bad = { kind: "done", loop: "neither", summary: "x" };
    expect(StepEnvelopeSchema.safeParse(bad).success).toBe(false);
  });
});
