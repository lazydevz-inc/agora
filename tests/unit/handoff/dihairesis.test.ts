// SPEC: docs/philosophers/runbooks/plato.md §3.2 + §4.2 (DH).

import { describe, expect, test } from "vitest";

import {
  ACNodeSchema,
  DH_DEFENSE_FLOOR,
  DihairesisResultSchema,
  MAX_DH_DEPTH,
  renderTreeForReview,
  runDihairesis,
} from "@/handoff/dihairesis.js";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const r = this.responses[this.idx];
    this.idx += 1;
    if (r === undefined) throw new Error(`QueueRunner exhausted at ${String(this.idx)}`);
    return r;
  }
  get callCount(): number {
    return this.idx;
  }
}

function dhResponse(opts: {
  binary?: string;
  defense_score?: number;
  defense?: string;
  alternatives?: string[];
  children?: { content: string; atomic: boolean }[];
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      binary: opts.binary ?? "verification vs management",
      alternatives_considered: opts.alternatives ?? ["form vs registration"],
      defense: opts.defense ?? "natural cut",
      defense_score: opts.defense_score ?? 0.8,
      children: opts.children ?? [
        { content: "child A", atomic: true },
        { content: "child B", atomic: true },
      ],
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

const baseInput = {
  acceptance_criteria: [{ id: "ac_001", content: "Users can authenticate" }],
  telos_statement: "help me X",
};

describe("runDihairesis — happy path", () => {
  test("single AC, defense >= 0.6, 2 atomic children → 1 LLM call + tree", async () => {
    const runner = new QueueRunner([
      dhResponse({
        binary: "identity verification vs session management",
        children: [
          { content: "verify identity (password/oauth)", atomic: true },
          { content: "manage session (cookie/JWT)", atomic: true },
        ],
      }),
    ]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.callCount).toBe(1);
    expect(result.value.ac_tree.length).toBe(1);
    expect(result.value.ac_tree[0]?.children.length).toBe(2);
    expect(result.value.ac_tree[0]?.atomic).toBe(false);
    expect(result.value.ac_tree[0]?.split_principle).toContain("verification");
    expect(result.value.total_atomic_leaves).toBe(2);
  });

  test("output validates against DihairesisResultSchema", async () => {
    const runner = new QueueRunner([dhResponse({})]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DihairesisResultSchema.safeParse(result.value).success).toBe(true);
  });

  test("each ACNode validates against ACNodeSchema (recursive)", async () => {
    const runner = new QueueRunner([dhResponse({})]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const root of result.value.ac_tree) {
      expect(ACNodeSchema.safeParse(root).success).toBe(true);
    }
  });
});

describe("runDihairesis — defense floor (R2-A 'better undivided than badly divided')", () => {
  test("defense_score < 0.6 → AC stays undivided + recorded in undivided_acs", async () => {
    const runner = new QueueRunner([dhResponse({ defense_score: 0.4, children: [] })]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ac_tree[0]?.atomic).toBe(true);
    expect(result.value.ac_tree[0]?.children.length).toBe(0);
    expect(result.value.undivided_acs).toContain("ac_001");
  });

  test("DH_DEFENSE_FLOOR is 0.6 (constant)", () => {
    expect(DH_DEFENSE_FLOOR).toBe(0.6);
  });
});

describe("runDihairesis — recursion + max depth", () => {
  test("non-atomic child triggers recursion (2 LLM calls for 1 AC, 2 levels)", async () => {
    const runner = new QueueRunner([
      // root cut: produces 1 atomic + 1 non-atomic child
      dhResponse({
        children: [
          { content: "atomic A", atomic: true },
          { content: "needs split", atomic: false },
        ],
      }),
      // recursion on non-atomic child: produces 2 atomic
      dhResponse({
        children: [
          { content: "leaf B", atomic: true },
          { content: "leaf C", atomic: true },
        ],
      }),
    ]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.callCount).toBe(2);
    expect(result.value.max_depth_reached).toBe(2);
    expect(result.value.total_atomic_leaves).toBe(3); // A + B + C
  });

  test("MAX_DH_DEPTH is 5 (constant)", () => {
    expect(MAX_DH_DEPTH).toBe(5);
  });
});

describe("runDihairesis — multi-AC + LLM call count", () => {
  test("2 ACs, each fully decomposed at root → 2 LLM calls", async () => {
    const runner = new QueueRunner([dhResponse({}), dhResponse({})]);
    const input = {
      acceptance_criteria: [
        { id: "ac_001", content: "AC one" },
        { id: "ac_002", content: "AC two" },
      ],
      telos_statement: "help me X",
    };
    const result = await runDihairesis(input, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.callCount).toBe(2);
    expect(result.value.total_llm_calls).toBe(2);
    expect(result.value.ac_tree.length).toBe(2);
  });
});

describe("runDihairesis — error paths", () => {
  test("LLM error → llm.internal-error", async () => {
    const runner = new QueueRunner([
      {
        ok: false,
        error: { code: "internal_error", detail: "test" },
        attempts: 1,
        total_duration_ms: 0,
        source: "subprocess",
      },
    ]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.internal-error");
  });

  test("malformed schema → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      {
        ok: true,
        content: { wrong: "shape" },
        attempts: 1,
        total_duration_ms: 100,
        source: "subprocess",
      },
    ]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});

describe("renderTreeForReview", () => {
  test("renders indented bullets with atomic markers", async () => {
    const runner = new QueueRunner([
      dhResponse({
        binary: "verify vs session",
        children: [
          { content: "verify (atomic)", atomic: true },
          { content: "session (atomic)", atomic: true },
        ],
      }),
    ]);
    const result = await runDihairesis(baseInput, runner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = renderTreeForReview(result.value.ac_tree);
    expect(rendered).toContain("ac_001:");
    expect(rendered).toContain("ac_001.1:");
    expect(rendered).toContain("ac_001.2:");
    expect(rendered).toContain("(atomic)");
  });
});
