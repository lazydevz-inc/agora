// SPEC: docs/philosophers/runbooks/socrates.md (Stage 5-A.3 Rev 2) §4-§8.

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type CwdSignal,
  categorizeResponse,
  type ElenchusOutcome,
  isSycophantic,
  type PriorClaim,
  runSocratesElenchus,
  type SocratesClaim,
  type SocratesInput,
  type SocratesUi,
} from "@/philosophers/socrates.js";

class QueueRunner implements ClaudeRunner {
  private idx = 0;
  constructor(public readonly responses: ClaudeResponse[]) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    const r = this.responses[this.idx];
    this.idx += 1;
    if (r === undefined) throw new Error(`QueueRunner exhausted at ${String(this.idx)}`);
    return r;
  }
}

function caseResponse(opts: {
  grounding: "cwd_file" | "cwd_pattern" | "real_world" | "hypothetical";
  grounding_ref?: string;
  quoted_prior_id?: string;
  question?: string;
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      case: "Picture this: 6 months from now you search 'attention' and get 3 irrelevant hits.",
      grounding: opts.grounding,
      ...(opts.grounding_ref !== undefined ? { grounding_ref: opts.grounding_ref } : {}),
      ...(opts.quoted_prior_id !== undefined ? { quoted_prior_id: opts.quoted_prior_id } : {}),
      question: opts.question ?? "Was the telos satisfied in that case?",
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

interface RecordedUi extends SocratesUi {
  asked: string[];
}
function makeUi(response: string): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askElenchusResponse: async ({ question }) => {
      ui.asked.push(question);
      return response;
    },
  };
  return ui;
}

const greenfield: CwdSignal = { is_brownfield: false, detected_files: [], detected_patterns: [] };
const brownfield: CwdSignal = {
  is_brownfield: true,
  detected_files: ["src/orders/router.ts", "src/auth/jwt.ts"],
  detected_patterns: ["uses_jwt_auth"],
};

function claim(overrides: Partial<SocratesClaim> = {}): SocratesClaim {
  return {
    id: "telos_001",
    content: "I want notes to be searchable",
    cause: "telos",
    load_bearing: true,
    prior_aporia_count: 0,
    ...overrides,
  };
}

function input(overrides: Partial<SocratesInput> = {}): SocratesInput {
  return {
    claim: claim(),
    cwd_signal: greenfield,
    prior_round_history: [],
    locale: "en",
    ...overrides,
  };
}

describe("categorizeResponse — markers, not sentiment (runbook §10)", () => {
  test("aporia markers → aporia_then_refined (en)", () => {
    expect(
      categorizeResponse(
        "No — actually that's the real problem, let me say it more carefully",
        "en",
      ),
    ).toBe("aporia_then_refined");
    expect(categorizeResponse("oh — I hadn't thought of that", "en")).toBe("aporia_then_refined");
  });
  test("exception markers → refined_with_addition (en)", () => {
    expect(categorizeResponse("Yes, but only if the user is logged in", "en")).toBe(
      "refined_with_addition",
    );
  });
  test("plain agreement → confirmed", () => {
    expect(categorizeResponse("Yes, exactly right.", "en")).toBe("confirmed");
  });
  test("ko aporia markers", () => {
    expect(categorizeResponse("아 — 그건 생각 못 했네. 다시 말하면...", "ko")).toBe(
      "aporia_then_refined",
    );
  });
  test("ko exception markers", () => {
    expect(categorizeResponse("맞아, 근데 로그인한 경우엔 달라", "ko")).toBe(
      "refined_with_addition",
    );
  });
});

describe("isSycophantic (F-Socrates-1)", () => {
  test("detects sycophantic paraphrase", () => {
    expect(isSycophantic("So what you're really saying is that search matters?")).toBe(true);
    expect(isSycophantic("If I understand correctly, you want X?")).toBe(true);
  });
  test("passes a genuine case-probing question", () => {
    expect(
      isSycophantic("In src/orders/router.ts you do X. Would your claim survive case Y?"),
    ).toBe(false);
  });
});

describe("runSocratesElenchus — skip path (F-Socrates-2)", () => {
  test("load_bearing=false → no LLM call, load_bearing_pass=false, case_probed null", async () => {
    const runner = new QueueRunner([]); // must NOT be called
    const ui = makeUi("anything");
    const r = await runSocratesElenchus(
      input({ claim: claim({ load_bearing: false }) }),
      runner,
      ui,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.elenched_claim.load_bearing_pass).toBe(false);
    expect(r.value.elenched_claim.case_probed).toBeNull();
    expect(ui.asked).toHaveLength(0);
  });
});

describe("runSocratesElenchus — happy path", () => {
  test("confirmed outcome: no refined_content, aporia_count unchanged", async () => {
    const runner = new QueueRunner([
      caseResponse({ grounding: "real_world", grounding_ref: "note-taking apps" }),
    ]);
    const ui = makeUi("Yes, that's exactly what I want.");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ec = r.value.elenched_claim;
    expect(ec.outcome).toBe("confirmed");
    expect(ec.refined_content).toBeUndefined();
    expect(ec.aporia_count).toBe(0);
    expect(ec.load_bearing_pass).toBe(true);
    expect(ec.case_probed?.grounding).toBe("real_world");
    expect(ui.asked).toHaveLength(1);
  });

  test("aporia outcome: refined_content = user reply, aporia_count incremented", async () => {
    const runner = new QueueRunner([caseResponse({ grounding: "real_world" })]);
    const ui = makeUi("No — let me say it more carefully: discoverable from adjacent context.");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ec = r.value.elenched_claim;
    expect(ec.outcome).toBe("aporia_then_refined");
    expect(ec.refined_content).toContain("discoverable from adjacent context");
    expect(ec.aporia_count).toBe(1);
  });

  test("prior_aporia_count carries forward (+1 on new aporia)", async () => {
    const runner = new QueueRunner([caseResponse({ grounding: "real_world" })]);
    const ui = makeUi("wait, that's not quite what I meant");
    const r = await runSocratesElenchus(
      input({ claim: claim({ prior_aporia_count: 2 }) }),
      runner,
      ui,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.elenched_claim.aporia_count).toBe(3);
  });
});

describe("runSocratesElenchus — F-Socrates-3 (brownfield grounding regen)", () => {
  test("hypothetical grounding on brownfield-with-files → regenerates demanding cwd grounding", async () => {
    // First response: hypothetical (rejected). Second: cwd_file.
    const runner = new QueueRunner([
      caseResponse({ grounding: "hypothetical" }),
      caseResponse({ grounding: "cwd_file", grounding_ref: "src/orders/router.ts" }),
    ]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input({ cwd_signal: brownfield }), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.elenched_claim.case_probed?.grounding).toBe("cwd_file");
    expect(r.value.elenched_claim.case_probed?.grounding_ref).toBe("src/orders/router.ts");
  });

  test("hypothetical grounding on greenfield → accepted (no files to ground in)", async () => {
    const runner = new QueueRunner([caseResponse({ grounding: "hypothetical" })]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input({ cwd_signal: greenfield }), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.elenched_claim.case_probed?.grounding).toBe("hypothetical");
  });
});

describe("runSocratesElenchus — F-Socrates-1 (sycophantic regen)", () => {
  test("sycophantic question → regenerates once", async () => {
    const runner = new QueueRunner([
      caseResponse({
        grounding: "real_world",
        question: "So what you're really saying is search matters?",
      }),
      caseResponse({
        grounding: "real_world",
        question: "If the thought is wordless, does keyword search find it?",
      }),
    ]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The non-sycophantic question is what reached the user.
    expect(ui.asked[0]).toContain("wordless");
  });
});

describe("runSocratesElenchus — error paths", () => {
  test("empty user response → user.aborted", async () => {
    const runner = new QueueRunner([caseResponse({ grounding: "real_world" })]);
    const ui = makeUi("   ");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("user.aborted");
  });

  test("LLM error → llm.internal-error", async () => {
    const runner = new QueueRunner([
      {
        ok: false,
        error: { code: "timeout", detail: "slow" },
        attempts: 1,
        total_duration_ms: 1,
        source: "subprocess",
      },
    ]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("llm.internal-error");
  });

  test("non-object LLM content → llm.invalid-response", async () => {
    const runner = new QueueRunner([
      { ok: true, content: "not json", attempts: 1, total_duration_ms: 1, source: "subprocess" },
    ]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input(), runner, ui);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("llm.invalid-response");
  });
});

describe("prior history is passed to the prompt", () => {
  test("quoted_prior_id surfaces in case_probed when LLM returns it", async () => {
    const priors: PriorClaim[] = [
      { id: "exp_001", content: "Half-formed thoughts evaporate", outcome: "confirmed" },
    ];
    const runner = new QueueRunner([
      caseResponse({ grounding: "real_world", quoted_prior_id: "exp_001" }),
    ]);
    const ui = makeUi("Yes.");
    const r = await runSocratesElenchus(input({ prior_round_history: priors }), runner, ui);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.elenched_claim.case_probed?.quoted_prior_id).toBe("exp_001");
  });
});

// Exhaustiveness guard — outcome union stays in sync with the type.
const _outcomes: ElenchusOutcome[] = ["confirmed", "refined_with_addition", "aporia_then_refined"];
test("outcome union has exactly 3 members", () => {
  expect(_outcomes).toHaveLength(3);
});
