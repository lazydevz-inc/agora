// SPEC: docs/loops/alignment-loop.md (Phase 1 §"Editor escape contract").

import { describe, expect, test } from "vitest";

import { stripCommentLines } from "@/shared/editor.js";

describe("stripCommentLines", () => {
  test("removes single-line comments", () => {
    const input = "<!-- comment -->\nreal content\n<!-- another -->";
    expect(stripCommentLines(input)).toBe("real content");
  });

  test("removes multi-line block comment", () => {
    const input =
      "<!--\n  Type your intake below.\n  - Lines starting with <!-- are ignored.\n-->\n\nreal content here";
    expect(stripCommentLines(input)).toBe("real content here");
  });

  test("preserves blank lines + trims surrounding whitespace", () => {
    const input = "\n\n  body line\n\n";
    expect(stripCommentLines(input)).toBe("body line");
  });

  test("returns empty string when only comments present", () => {
    const input = "<!--\n  empty intake placeholder\n-->";
    expect(stripCommentLines(input)).toBe("");
  });

  test("preserves real content when no comments", () => {
    const input = "Plain markdown\n\nWith multiple paragraphs.";
    expect(stripCommentLines(input)).toBe("Plain markdown\n\nWith multiple paragraphs.");
  });
});
