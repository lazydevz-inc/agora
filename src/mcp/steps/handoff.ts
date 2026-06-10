// SPEC: ADR-0010 (host-reasoning stepped MCP tools) +
//       docs/philosophers/runbooks/plato.md §3.2 (Dihairesis) +
//       docs/loops/handoff.md — handoff state machine.
//
// Drives Plato Dihairesis (DH) + user-confirm review through the
// stepped contract:
//
//   handoff.dh_decompose  — host reasons about ONE node's decompose
//                           (1 LLM call). Repeated until the DH queue is
//                           empty. Single-node-per-step keeps the host's
//                           reasoning surface flat; the orchestrator
//                           tracks the partial tree in scratch.
//   handoff.confirm       — once the tree is complete, host asks the
//                           user to review (yes/no).
//   complete              — orchestrator persists ac_tree.json, builds
//                           seed.json, advances state to ready_for_ralph.
//                           Declined → ac_tree.json kept for review,
//                           seed.json NOT written, state unchanged.
//
// LAYER 2.

import { z } from "zod";

import { AcceptanceCriterionSchema } from "../../alignment/acceptance-criteria.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import {
  type ACNode,
  ACNodeSchema,
  buildDhUserPrompt,
  DH_DEFENSE_FLOOR,
  type DhDecomposeResponse,
  DhDecomposeResponseSchema,
  MAX_DH_DEPTH,
  PLATO_DH_SYSTEM,
  renderTreeForReview,
} from "../../handoff/dihairesis.js";
import { localized } from "../../i18n/index.js";
import { err, ok, type Result } from "../../result/index.js";
import type { McpPending } from "../pending.js";
import type {
  ErrorEnvelope,
  NeedsReasoningEnvelope,
  NeedsUserInputEnvelope,
  StepArgs,
  StepPrompt,
  StepQuestion,
} from "../step.js";
import { envError, envNeedsReasoning, envNeedsUserInput } from "../step.js";

// ─── Scratch ───

const NodeRefSchema = z.object({
  id: z.string().regex(/^ac(?:_\d{3})(?:\.\d+)*$/),
  content: z.string().min(1),
  depth: z.number().int().min(0).max(MAX_DH_DEPTH),
});
type NodeRef = z.infer<typeof NodeRefSchema>;

const HandoffScratchSchema = z.object({
  telos_statement: z.string().min(1),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1),
  ac_tree: z.array(ACNodeSchema),
  pending_queue: z.array(NodeRefSchema),
  current_node: NodeRefSchema.optional(),
  undivided_acs: z.array(z.string()),
  total_llm_calls: z.number().int().min(0),
  max_depth_reached: z.number().int().min(0).max(MAX_DH_DEPTH),
  dh_complete: z.boolean(),
});
type HandoffScratch = z.infer<typeof HandoffScratchSchema>;

// ─── Outcome ADT ───

export interface HandoffStepCompleteData {
  readonly ac_tree: ACNode[];
  readonly undivided_acs: string[];
  readonly max_depth_reached: number;
  readonly total_llm_calls: number;
  readonly user_confirmed: boolean;
}

export type HandoffStepOutcome =
  | {
      type: "issue";
      envelope: NeedsUserInputEnvelope | NeedsReasoningEnvelope;
      pending: McpPending;
    }
  | { type: "complete"; data: HandoffStepCompleteData }
  | { type: "error"; envelope: ErrorEnvelope };

export interface HandoffStepInput {
  readonly telos_statement: string;
  readonly acceptance_criteria: readonly z.input<typeof AcceptanceCriterionSchema>[];
  // A previously-decomposed tree (preserved from a declined confirm, or
  // surviving a Z2 re-alignment). When its roots match the current ACs the
  // orchestrator skips Dihairesis and goes straight to the confirm step —
  // a declined "no" must not cost the host the whole decomposition again.
  readonly preserved?: {
    readonly ac_tree: readonly unknown[];
    readonly undivided_acs: readonly string[];
    readonly max_depth_reached: number;
    readonly total_llm_calls: number;
  };
}

export function beginHandoff(input: HandoffStepInput): HandoffStepOutcome {
  const acs = input.acceptance_criteria.map((a) => AcceptanceCriterionSchema.parse(a));
  if (acs.length === 0) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "handoff: no acceptance criteria to decompose",
      ),
    };
  }
  // Preserved-tree fast path: validate shape + root-id match, then jump to
  // confirm. Any mismatch falls through to a fresh decomposition.
  if (input.preserved !== undefined) {
    const parsedTree = z.array(ACNodeSchema).safeParse(input.preserved.ac_tree);
    const rootIds = parsedTree.success ? parsedTree.data.map((n) => n.id).sort() : [];
    const acIds = acs.map((a) => a.id).sort();
    if (
      parsedTree.success &&
      rootIds.length === acIds.length &&
      rootIds.every((id, i) => id === acIds[i])
    ) {
      const scratch: HandoffScratch = {
        telos_statement: input.telos_statement,
        acceptance_criteria: acs,
        ac_tree: parsedTree.data,
        pending_queue: [],
        undivided_acs: [...input.preserved.undivided_acs],
        total_llm_calls: input.preserved.total_llm_calls,
        max_depth_reached: Math.min(input.preserved.max_depth_reached, MAX_DH_DEPTH),
        dh_complete: true,
      };
      return advanceCursor(scratch);
    }
  }
  const tree: ACNode[] = acs.map((ac) => ({
    id: ac.id,
    content: ac.content,
    depth: 0,
    atomic: false,
    children: [],
  }));
  const queue: NodeRef[] = tree.map((n) => ({ id: n.id, content: n.content, depth: n.depth }));
  const scratch: HandoffScratch = {
    telos_statement: input.telos_statement,
    acceptance_criteria: acs,
    ac_tree: tree,
    pending_queue: queue,
    undivided_acs: [],
    total_llm_calls: 0,
    max_depth_reached: 0,
    dh_complete: false,
  };
  return advanceCursor(scratch);
}

export function advanceHandoff(pending: McpPending, args: StepArgs): HandoffStepOutcome {
  const parsed = HandoffScratchSchema.safeParse(pending.scratch);
  if (!parsed.success) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "state.corrupt",
        `handoff scratch invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    };
  }
  const scratch = parsed.data;
  switch (pending.step) {
    case "handoff.dh_decompose":
      return handleDhApply(scratch, args);
    case "handoff.confirm":
      return handleConfirmApply(scratch, args);
    default:
      return {
        type: "error",
        envelope: envError(
          "align",
          "internal.invariant-violation",
          `Unknown handoff step: ${pending.step}`,
        ),
      };
  }
}

// ─── Issuers ───

function issueDhStep(scratch: HandoffScratch): HandoffStepOutcome {
  const head = scratch.pending_queue[0];
  if (head === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "handoff.dh_decompose: pending_queue empty",
      ),
    };
  }
  // Build a stand-in ACNode to feed the prompt builder (depth + content
  // + id are all it needs).
  const node: ACNode = {
    id: head.id,
    content: head.content,
    depth: head.depth,
    atomic: false,
    children: [],
  };
  const prompts: StepPrompt[] = [
    {
      id: "decompose",
      system: PLATO_DH_SYSTEM,
      user: buildDhUserPrompt(node, scratch.telos_statement, MAX_DH_DEPTH),
      expect: "json",
      schema_hint:
        "{ binary, alternatives_considered: [], defense, defense_score: 0-1, children: [{content, atomic}] }",
    },
  ];
  return {
    type: "issue",
    envelope: envNeedsReasoning("align", "handoff.dh_decompose", prompts),
    pending: {
      version: 1,
      owner: "align",
      step: "handoff.dh_decompose",
      expects: "llm_responses",
      issued_prompts: prompts,
      scratch: serializeScratch({ ...scratch, current_node: head }),
      issued_at: new Date().toISOString(),
    },
  };
}

function issueConfirmStep(scratch: HandoffScratch): HandoffStepOutcome {
  const rendered = renderTreeForReview(scratch.ac_tree);
  const question: StepQuestion = {
    id: "q_confirm",
    prompt: `Review the proposed ac_tree. Answer "yes" to lock the seed (state advances to ready_for_ralph) or "no" to keep ac_tree.json for review and leave the session in alignment_complete.\n\n${rendered}`,
    hint: 'reply "yes" or "no"',
    philosopher: "plato",
    purpose_label: localized("cli.handoff.purpose_q_confirm"),
  };
  return {
    type: "issue",
    envelope: envNeedsUserInput("align", "handoff.confirm", [question]),
    pending: {
      version: 1,
      owner: "align",
      step: "handoff.confirm",
      expects: "user_answers",
      issued_questions: [question],
      scratch: serializeScratch(scratch),
      issued_at: new Date().toISOString(),
    },
  };
}

// ─── Appliers ───

function handleDhApply(scratch: HandoffScratch, args: StepArgs): HandoffStepOutcome {
  const current = scratch.current_node;
  if (current === undefined) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "internal.invariant-violation",
        "handoff.dh_decompose: current_node missing in scratch",
      ),
    };
  }
  const parsed = parseDhResponse(args);
  if (!parsed.ok) {
    return {
      type: "error",
      envelope: envError("align", parsed.error.code, parsed.error.message),
    };
  }
  const decision = parsed.value;

  // Apply decision to tree + queue.
  const treeAfter = applyDecomposition(scratch.ac_tree, current, decision);
  if (!treeAfter.ok) {
    return {
      type: "error",
      envelope: envError("align", treeAfter.error.code, treeAfter.error.message),
    };
  }
  const update = treeAfter.value;

  const undivided = [...scratch.undivided_acs, ...update.newly_undivided];
  // New non-atomic children pushed at the front of the queue (DFS).
  const queueRest = scratch.pending_queue.slice(1);
  const newPending = update.new_children
    .filter((c) => !c.atomic)
    .map<NodeRef>((c) => ({ id: c.id, content: c.content, depth: c.depth }));
  const nextScratch: HandoffScratch = {
    ...scratch,
    ac_tree: update.tree,
    pending_queue: [...newPending, ...queueRest],
    undivided_acs: undivided,
    total_llm_calls: scratch.total_llm_calls + 1,
    max_depth_reached: Math.max(
      scratch.max_depth_reached,
      ...update.new_children.map((c) => c.depth),
    ),
  };
  delete (nextScratch as Partial<HandoffScratch>).current_node;
  return advanceCursor(nextScratch);
}

function handleConfirmApply(scratch: HandoffScratch, args: StepArgs): HandoffStepOutcome {
  const raw = (args.user_answers?.q_confirm ?? "").trim().toLowerCase();
  if (raw.length === 0) {
    return {
      type: "error",
      envelope: envError("align", "user.aborted", "handoff.confirm: q_confirm is empty."),
    };
  }
  const yes = raw === "yes" || raw === "y" || raw === "true";
  const no = raw === "no" || raw === "n" || raw === "false";
  if (!yes && !no) {
    return {
      type: "error",
      envelope: envError(
        "align",
        "user.aborted",
        `handoff.confirm: expected "yes" or "no", got "${raw}".`,
      ),
    };
  }
  return {
    type: "complete",
    data: {
      ac_tree: scratch.ac_tree,
      undivided_acs: scratch.undivided_acs,
      max_depth_reached: scratch.max_depth_reached,
      total_llm_calls: scratch.total_llm_calls,
      user_confirmed: yes,
    },
  };
}

// ─── Cursor: dispatch next step ───

function advanceCursor(scratch: HandoffScratch): HandoffStepOutcome {
  if (scratch.pending_queue.length === 0) {
    return issueConfirmStep({ ...scratch, dh_complete: true });
  }
  return issueDhStep(scratch);
}

// ─── Tree update helper ───

interface DecompositionUpdate {
  tree: ACNode[];
  new_children: ACNode[];
  newly_undivided: string[];
}

function applyDecomposition(
  tree: readonly ACNode[],
  target: NodeRef,
  decision: DhDecomposeResponse,
): Result<DecompositionUpdate, { code: string; message: string }> {
  // Recursive map: find node by id and mutate.
  let touched = false;
  const newChildren: ACNode[] = [];
  const newlyUndivided: string[] = [];

  function mapNode(node: ACNode): ACNode {
    if (node.id !== target.id) {
      if (node.children.length === 0) return node;
      return { ...node, children: node.children.map(mapNode) };
    }
    touched = true;
    // defense floor: keep undivided.
    if (decision.defense_score < DH_DEFENSE_FLOOR || decision.children.length === 0) {
      newlyUndivided.push(node.id);
      return {
        ...node,
        atomic: true,
        defense_score: decision.defense_score,
      };
    }
    const children: ACNode[] = decision.children.map((c, i) => {
      const childId = `${node.id}.${String(i + 1)}`;
      const child: ACNode = {
        id: childId,
        content: c.content,
        depth: node.depth + 1,
        atomic: c.atomic || node.depth + 1 >= MAX_DH_DEPTH,
        children: [],
      };
      newChildren.push(child);
      return child;
    });
    return {
      ...node,
      atomic: false,
      split_principle: decision.binary,
      split_defense: decision.defense,
      defense_score: decision.defense_score,
      children,
    };
  }

  const updated = tree.map(mapNode);
  if (!touched) {
    return err({
      code: "internal.invariant-violation",
      message: `handoff.dh_decompose: target node ${target.id} not found in tree`,
    });
  }
  return ok({ tree: updated, new_children: newChildren, newly_undivided: newlyUndivided });
}

// ─── Helpers ───

function parseDhResponse(args: StepArgs): Result<DhDecomposeResponse, AgoraErrorThrown> {
  const responses = args.llm_responses;
  if (responses === undefined || responses.length === 0) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "handoff.dh_decompose: llm_responses missing." },
      }),
    );
  }
  const found = responses.find((r) => r.id === "decompose");
  if (found === undefined) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: 'handoff.dh_decompose: no llm_response with id="decompose".' },
      }),
    );
  }
  const obj =
    typeof found.content === "string" ? safeJsonParse(found.content) : (found.content as unknown);
  if (obj === null || typeof obj !== "object") {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "handoff.dh_decompose: content is not a JSON object." },
      }),
    );
  }
  const parsed = DhDecomposeResponseSchema.safeParse(obj);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: {
          detail: `handoff.dh_decompose: ${parsed.error.issues[0]?.message ?? "schema fail"}`,
        },
      }),
    );
  }
  return ok(parsed.data);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serializeScratch(scratch: HandoffScratch): Record<string, unknown> {
  return HandoffScratchSchema.parse(scratch) as unknown as Record<string, unknown>;
}
