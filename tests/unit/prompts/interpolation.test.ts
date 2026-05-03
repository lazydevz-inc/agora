// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 §interpolation.ts).

import { describe, expect, test } from "vitest";

import { interpolate } from "@/prompts/interpolation.js";

describe("interpolate", () => {
  test("substitutes single placeholder", () => {
    const out = interpolate("hello {name}", { name: "Sang" }, ["name"]);
    expect(out).toBe("hello Sang");
  });

  test("substitutes multiple placeholders", () => {
    const out = interpolate(
      "{greeting}, {name}! Round {round}.",
      { greeting: "안녕", name: "Sang", round: "3" },
      ["greeting", "name", "round"],
    );
    expect(out).toBe("안녕, Sang! Round 3.");
  });

  test("preserves text without placeholders", () => {
    const out = interpolate("plain text", {}, []);
    expect(out).toBe("plain text");
  });

  test("repeats same placeholder", () => {
    const out = interpolate("{x} and {x}", { x: "Y" }, ["x"]);
    expect(out).toBe("Y and Y");
  });

  test("throws when declared placeholder is missing from context", () => {
    expect(() => interpolate("hi {missing}", {}, ["missing"])).toThrow();
  });

  test("leaves undeclared template placeholder untouched (illustrative {} survives)", () => {
    // Runbook authors use {} for illustrative JSON shapes; only declared
    // placeholders are substituted. Undeclared {} stays literal.
    const out = interpolate("hi {undeclared}", { undeclared: "x" }, []);
    expect(out).toBe("hi {undeclared}");
  });

  test("does NOT substitute placeholder that doesn't match the regex (e.g. uppercase)", () => {
    // Placeholder regex requires [a-z_][a-z0-9_]*
    const out = interpolate("hi {NAME}", { NAME: "x" }, []);
    expect(out).toBe("hi {NAME}");
  });
});
