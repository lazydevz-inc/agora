// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 R4-A.

import { describe, expect, test } from "vitest";

import { ALL_CRITICS, findCriticById, selectCritics } from "@/critics/registry.js";
import { CriticDefSchema } from "@/critics/types.js";

describe("ALL_CRITICS — registry contents (Stage 6-A.20 batch)", () => {
  test("contains 3 critics this slice", () => {
    expect(ALL_CRITICS.length).toBe(3);
  });
  test("each critic validates against CriticDefSchema", () => {
    for (const c of ALL_CRITICS) {
      const r = CriticDefSchema.safeParse(c);
      if (!r.success) {
        throw new Error(`${c.id}: ${r.error.issues.map((i) => i.message).join("; ")}`);
      }
    }
  });
  test("includes universal-telos-alignment + tech-solid + tech-error-handling", () => {
    const ids = ALL_CRITICS.map((c) => c.id).sort();
    expect(ids).toEqual(["tech-error-handling", "tech-solid", "universal-telos-alignment"]);
  });
});

describe("findCriticById", () => {
  test("returns def for known id", () => {
    const c = findCriticById("tech-solid");
    expect(c).toBeDefined();
    expect(c?.namespace).toBe("tech");
  });
  test("returns undefined for unknown id", () => {
    expect(findCriticById("does-not-exist")).toBeUndefined();
  });
});

describe("selectCritics — trigger evaluation", () => {
  test("empty context (no namespace filter) → all always-triggers fire", () => {
    const matched = selectCritics({});
    expect(matched.length).toBe(3); // all 3 slice critics are always-triggered
  });

  test("namespace_filter='tech' → only tech-namespaced critics", () => {
    const matched = selectCritics({ namespace_filter: "tech" });
    const ids = matched.map((c) => c.id).sort();
    expect(ids).toEqual(["tech-error-handling", "tech-solid"]);
  });

  test("namespace_filter='universal' → only universal critics", () => {
    const matched = selectCritics({ namespace_filter: "universal" });
    expect(matched.length).toBe(1);
    expect(matched[0]?.id).toBe("universal-telos-alignment");
  });

  test("namespace_filter='ui' → empty (no UI critics in this batch)", () => {
    const matched = selectCritics({ namespace_filter: "ui" });
    expect(matched.length).toBe(0);
  });
});
