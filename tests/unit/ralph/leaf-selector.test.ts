// SPEC: docs/loops/handoff.md Stage 2-C.2 R3-B (DFS leftmost-first).

import { describe, expect, test } from "vitest";

import type { ACNode } from "@/handoff/dihairesis.js";
import { countAtomicLeaves, selectNextLeaf } from "@/ralph/leaf-selector.js";

function leaf(id: string): ACNode {
  return { id, content: `${id} content`, depth: 1, atomic: true, children: [] };
}

function branch(id: string, children: ACNode[]): ACNode {
  return { id, content: `${id} content`, depth: 0, atomic: false, children };
}

const sampleTree: ACNode[] = [
  branch("ac_001", [leaf("ac_001.1"), leaf("ac_001.2")]),
  branch("ac_002", [
    branch("ac_002.1", [leaf("ac_002.1.1"), leaf("ac_002.1.2")]),
    leaf("ac_002.2"),
  ]),
  leaf("ac_003"),
];

describe("selectNextLeaf — DFS leftmost-first", () => {
  test("empty tree → null", () => {
    expect(selectNextLeaf([], new Set())).toBeNull();
  });

  test("nothing completed → first leftmost atomic leaf", () => {
    expect(selectNextLeaf(sampleTree, new Set())).toBe("ac_001.1");
  });

  test("first leaf completed → next leftmost", () => {
    expect(selectNextLeaf(sampleTree, new Set(["ac_001.1"]))).toBe("ac_001.2");
  });

  test("ac_001 subtree complete → first leaf of ac_002 subtree", () => {
    expect(selectNextLeaf(sampleTree, new Set(["ac_001.1", "ac_001.2"]))).toBe("ac_002.1.1");
  });

  test("walks deeper subtree before sibling", () => {
    expect(selectNextLeaf(sampleTree, new Set(["ac_001.1", "ac_001.2", "ac_002.1.1"]))).toBe(
      "ac_002.1.2",
    );
  });

  test("after ac_002.1.* both done → ac_002.2 (sibling)", () => {
    expect(
      selectNextLeaf(sampleTree, new Set(["ac_001.1", "ac_001.2", "ac_002.1.1", "ac_002.1.2"])),
    ).toBe("ac_002.2");
  });

  test("walks to top-level leaf when all subtree leaves done", () => {
    expect(
      selectNextLeaf(
        sampleTree,
        new Set(["ac_001.1", "ac_001.2", "ac_002.1.1", "ac_002.1.2", "ac_002.2"]),
      ),
    ).toBe("ac_003");
  });

  test("all leaves complete → null", () => {
    expect(
      selectNextLeaf(
        sampleTree,
        new Set(["ac_001.1", "ac_001.2", "ac_002.1.1", "ac_002.1.2", "ac_002.2", "ac_003"]),
      ),
    ).toBeNull();
  });

  test("single atomic root → returns it", () => {
    expect(selectNextLeaf([leaf("ac_001")], new Set())).toBe("ac_001");
  });

  test("non-atomic root with no atomic descendants → null (degenerate)", () => {
    const onlyBranches: ACNode[] = [
      { id: "ac_001", content: "x", depth: 0, atomic: false, children: [] },
    ];
    expect(selectNextLeaf(onlyBranches, new Set())).toBeNull();
  });
});

describe("countAtomicLeaves", () => {
  test("counts only atomic leaves (not branches)", () => {
    expect(countAtomicLeaves(sampleTree)).toBe(6);
    // ac_001.1, ac_001.2, ac_002.1.1, ac_002.1.2, ac_002.2, ac_003
  });

  test("empty tree → 0", () => {
    expect(countAtomicLeaves([])).toBe(0);
  });
});
