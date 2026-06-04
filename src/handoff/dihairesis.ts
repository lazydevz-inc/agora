// SPEC: docs/philosophers/runbooks/plato.md §3.2 (DH) + §4.2
//       (plato:dihairesis-decompose) + docs/loops/handoff.md
//       (Stage 2-C.1 R1-A — atomicity criteria, defense floor 0.6,
//       max depth 5, mandatory user review).
//
// Plato Dihairesis (DH) — recursive decomposition of acceptance
// criteria into ac_tree at natural joints. Each cut: LLM proposes ONE
// binary distinction + lists 2-3 alternative binaries it considered +
// defends chosen as more fundamental + self-rates defense_score.
// defense_score < 0.6 → AC stays undivided ("better undivided than
// badly divided" per concept doc). defense_score >= 0.6 → split into
// 2 children + recurse on each. atomicity per Stage 2-C.1 R1-A: when
// LLM marks atomic OR depth == max_depth → leaf.
//
// LAYER 2 — depends on LAYER 0 (errors / result) + LAYER 1 nothing
// (LLM runner is injected). Pure logic + recursion + Zod.
//
// Simplification: atomicity is LLM self-judgment (no file_touches /
// conjunction_count enforcement at this layer; those are Ralph
// concerns). Per slice 6-A.17 R2-A.

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const MAX_DH_DEPTH = 5;
export const DH_DEFENSE_FLOOR = 0.6;

// Recursive ac-tree node. Zod requires .lazy() for self-reference.
export interface ACNode {
  id: string;
  content: string;
  depth: number;
  atomic: boolean;
  split_principle?: string | undefined;
  split_defense?: string | undefined;
  defense_score?: number | undefined;
  children: ACNode[];
}

export const ACNodeSchema: z.ZodType<ACNode> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^ac(?:_\d{3})(?:\.\d+)*$/, "id must match ac_NNN[.K]*"),
      content: z.string().min(1),
      depth: z.number().int().min(0).max(MAX_DH_DEPTH),
      atomic: z.boolean(),
      split_principle: z.string().optional(),
      split_defense: z.string().optional(),
      defense_score: z.number().min(0).max(1).optional(),
      children: z.array(ACNodeSchema).default([]),
    })
    .strict(),
);

export const DihairesisResultSchema = z.object({
  ac_tree: z.array(ACNodeSchema).min(1),
  undivided_acs: z.array(z.string()),
  max_depth_reached: z.number().int().min(0).max(MAX_DH_DEPTH),
  total_atomic_leaves: z.number().int().min(0),
  total_llm_calls: z.number().int().min(0),
  created_at: z.string().datetime(),
});
export type DihairesisResult = z.infer<typeof DihairesisResultSchema>;

export interface DihairesisInputAc {
  readonly id: string; // ac_NNN
  readonly content: string;
}

export interface DihairesisInput {
  readonly acceptance_criteria: readonly DihairesisInputAc[];
  readonly telos_statement: string;
}

// LLM-side decision shape per single decompose call.
// Exported for the ADR-0010 stepped path (`src/mcp/steps/handoff.ts`):
// each DH node decompose is one LLM call there; the host returns a
// JSON object matching this shape, and the orchestrator builds the tree
// incrementally.
export const DhDecomposeResponseSchema = z.object({
  binary: z.string().min(1),
  alternatives_considered: z.array(z.string()).default([]),
  defense: z.string().min(1),
  defense_score: z.number().min(0).max(1),
  children: z
    .array(
      z.object({
        content: z.string().min(1),
        atomic: z.boolean(),
      }),
    )
    .default([]),
});
export type DhDecomposeResponse = z.infer<typeof DhDecomposeResponseSchema>;

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

export const PLATO_DH_SYSTEM = `You are decomposing an acceptance criterion into a tree of children using
Dihairesis (natural-joint division). The justification IS the work product.

Hard rules:
1. Propose ONE binary distinction at this level. NOT "split into 2-5
   children" — find THE binary that divides this AC most fundamentally.
2. List 2-3 ALTERNATIVE binaries you considered.
3. Defend your chosen binary as more fundamental than alternatives.
   Self-rate defense_score 0.0-1.0.
4. If defense_score < 0.6, return children=[] and the orchestrator will
   keep this AC undivided. Better undivided than badly divided.
5. The chosen binary should be one a senior dev could grok. Forbidden:
   jargon binaries that obscure rather than reveal.
6. After cutting, mark each child atomic=true if it represents a single
   change-shape executable in one Claude session. Otherwise atomic=false
   and the orchestrator recurses on it.
7. For atomic=true children, content should be a single concrete leaf
   (not a category — e.g. "password-based login" not "authentication
   methods").

Return EXACTLY this JSON shape, no extra keys, no commentary outside JSON:
{
  "binary": "<the chosen binary distinction>",
  "alternatives_considered": ["<alt 1>", "<alt 2>"],
  "defense": "<why this binary > alternatives>",
  "defense_score": <0.0-1.0>,
  "children": [
    { "content": "<child A content>", "atomic": <bool> },
    { "content": "<child B content>", "atomic": <bool> }
  ]
}`;

export function buildDhUserPrompt(node: ACNode, telosStatement: string, maxDepth: number): string {
  return `Acceptance criterion to decompose:
- id: ${node.id}
- content: "${node.content}"
- depth: ${String(node.depth)} of max ${String(maxDepth)}

Settled telos (context only — do not re-decompose into telos-aligned
sub-nodes unless they are natural cuts):
"${telosStatement}"

Propose the binary. Defend it. If defense_score >= ${String(DH_DEFENSE_FLOOR)},
include two children (each marked atomic=true if single-change-shape,
atomic=false if needs further decomposition). If defense_score <
${String(DH_DEFENSE_FLOOR)}, return children=[].`;
}

// ─── Orchestrator ───

export async function runDihairesis(
  input: DihairesisInput,
  runner: ClaudeRunner,
): Promise<Result<DihairesisResult, AgoraErrorThrown>> {
  const ac_tree: ACNode[] = [];
  const undivided_acs: string[] = [];
  let max_depth_reached = 0;
  let total_llm_calls = 0;

  for (const ac of input.acceptance_criteria) {
    const root: ACNode = {
      id: ac.id,
      content: ac.content,
      depth: 0,
      atomic: false,
      children: [],
    };
    const decomposed = await decomposeRecursive(
      root,
      input.telos_statement,
      runner,
      undivided_acs,
      (calls) => {
        total_llm_calls += calls;
      },
    );
    if (!decomposed.ok) return decomposed;
    const subtree = decomposed.value;
    max_depth_reached = Math.max(max_depth_reached, deepestDepth(subtree));
    ac_tree.push(subtree);
  }

  const result: DihairesisResult = {
    ac_tree,
    undivided_acs,
    max_depth_reached,
    total_atomic_leaves: countAtomicLeaves(ac_tree),
    total_llm_calls,
    created_at: new Date().toISOString(),
  };

  const validated = DihairesisResultSchema.safeParse(result);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "DH result schema fail" },
      }),
    );
  }
  return ok(validated.data);
}

async function decomposeRecursive(
  node: ACNode,
  telosStatement: string,
  runner: ClaudeRunner,
  undivided: string[],
  bumpCalls: (n: number) => void,
): Promise<Result<ACNode, AgoraErrorThrown>> {
  // Stop conditions: max depth OR already atomic.
  if (node.depth >= MAX_DH_DEPTH) {
    return ok({ ...node, atomic: true });
  }

  const callResult = await callDhDecompose(node, telosStatement, runner);
  bumpCalls(1);
  if (!callResult.ok) return callResult;
  const decision = callResult.value;

  // Defense floor: keep undivided.
  if (decision.defense_score < DH_DEFENSE_FLOOR || decision.children.length === 0) {
    undivided.push(node.id);
    return ok({
      ...node,
      atomic: true,
      defense_score: decision.defense_score,
    });
  }

  // Build children + recurse on non-atomic ones.
  const children: ACNode[] = [];
  for (let i = 0; i < decision.children.length; i += 1) {
    const childRaw = decision.children[i];
    if (childRaw === undefined) continue;
    const childId = `${node.id}.${String(i + 1)}`;
    const childNode: ACNode = {
      id: childId,
      content: childRaw.content,
      depth: node.depth + 1,
      atomic: childRaw.atomic,
      children: [],
    };
    if (childRaw.atomic) {
      children.push(childNode);
    } else {
      const recursed = await decomposeRecursive(
        childNode,
        telosStatement,
        runner,
        undivided,
        bumpCalls,
      );
      if (!recursed.ok) return recursed;
      children.push(recursed.value);
    }
  }

  return ok({
    ...node,
    atomic: false,
    split_principle: decision.binary,
    split_defense: decision.defense,
    defense_score: decision.defense_score,
    children,
  });
}

async function callDhDecompose(
  node: ACNode,
  telosStatement: string,
  runner: ClaudeRunner,
): Promise<Result<DhDecomposeResponse, AgoraErrorThrown>> {
  const response = await runner.call({
    system: PLATO_DH_SYSTEM,
    prompt: buildDhUserPrompt(node, telosStatement, MAX_DH_DEPTH),
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: response.error?.detail ?? "no response" },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Plato DH prompt did not return a JSON object" },
      }),
    );
  }
  const parsed = DhDecomposeResponseSchema.safeParse(content);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parsed.error.issues[0]?.message ?? "DH decision schema fail" },
      }),
    );
  }
  return ok(parsed.data);
}

function deepestDepth(node: ACNode): number {
  if (node.children.length === 0) return node.depth;
  return Math.max(...node.children.map(deepestDepth));
}

function countAtomicLeaves(tree: readonly ACNode[]): number {
  let count = 0;
  for (const node of tree) {
    if (node.atomic) count += 1;
    count += countAtomicLeaves(node.children);
  }
  return count;
}

/**
 * Render an ac_tree for human review. Indented bullets, max 80-col.
 * Used by `agora handoff` user-confirm dialog (Stage 6-A.17 R5-A).
 */
export function renderTreeForReview(tree: readonly ACNode[]): string {
  const lines: string[] = [];
  for (const root of tree) {
    appendNode(root, lines, 0);
  }
  return lines.join("\n");
}

function appendNode(node: ACNode, lines: string[], indent: number): void {
  const pad = "  ".repeat(indent);
  const marker = node.atomic ? "•" : "▸";
  const tag = node.atomic ? " (atomic)" : "";
  lines.push(`${pad}${marker} ${node.id}: ${node.content}${tag}`);
  for (const child of node.children) {
    appendNode(child, lines, indent + 1);
  }
}
