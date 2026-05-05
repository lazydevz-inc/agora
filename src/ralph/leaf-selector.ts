// SPEC: docs/loops/handoff.md Stage 2-C.2 R3-B (DFS leftmost-first;
//       no manual skip/reorder).
//
// Pure functions over an ac_tree. selectNextLeaf walks the tree
// depth-first, left-to-right, and returns the first atomic leaf whose
// id is NOT in the completed set. Returns null when all atomic leaves
// have been completed.
//
// LAYER 2 — depends on handoff/dihairesis types only.

import type { ACNode } from "../handoff/dihairesis.js";

export function selectNextLeaf(
  acTree: readonly ACNode[],
  completed: ReadonlySet<string>,
): string | null {
  for (const root of acTree) {
    const found = walkForLeaf(root, completed);
    if (found !== null) return found;
  }
  return null;
}

function walkForLeaf(node: ACNode, completed: ReadonlySet<string>): string | null {
  if (node.atomic && node.children.length === 0) {
    return completed.has(node.id) ? null : node.id;
  }
  for (const child of node.children) {
    const found = walkForLeaf(child, completed);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Total atomic leaves in a tree. For UX progress display
 * ("3 / 12 leaves complete").
 */
export function countAtomicLeaves(acTree: readonly ACNode[]): number {
  let count = 0;
  for (const root of acTree) {
    count += walkCountAtomic(root);
  }
  return count;
}

function walkCountAtomic(node: ACNode): number {
  let count = 0;
  if (node.atomic && node.children.length === 0) count += 1;
  for (const child of node.children) {
    count += walkCountAtomic(child);
  }
  return count;
}
