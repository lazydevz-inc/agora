// SPEC: docs/philosophers/runbooks/husserl.md (Stage 5-A.3 Rev 2).

import { describe, expect, test } from "vitest";
import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type DefendedFrame,
  type HusserlInput,
  type HusserlUi,
  runHusserlPhaseMinusOne,
} from "@/philosophers/husserl.js";

class StubRunner implements ClaudeRunner {
  constructor(public readonly response: ClaudeResponse) {}
  async call(_opts: ClaudeCallOptions): Promise<ClaudeResponse> {
    return this.response;
  }
}

function okAlts(): ClaudeResponse {
  return {
    ok: true,
    content: {
      software_alternative: "physical notebook + index cards",
      form_alternative: "private Discord with reading-notes channel",
      audience_alternative: "small group of accountability buddies",
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

function makeInput(overrides: Partial<HusserlInput> = {}): HusserlInput {
  return {
    raw_intent: "I want to build a personal task tracker",
    raw_experience: "I keep losing track of small commitments to myself",
    cwd_signal: {
      project_name: "test",
      is_brownfield: false,
      is_greenfield: true,
      detected_stack: [],
      detected_patterns: [],
      git_remote: null,
      scan_duration_ms: 0,
    },
    invocation: "explicit_bracket",
    locale: "en",
    ...overrides,
  };
}

function makeUi(defenses: { software: string; form: string; audience: string }): HusserlUi {
  let calls = 0;
  return {
    askDefense: async ({ bracketLabel }) => {
      calls++;
      if (bracketLabel === "Software") return defenses.software;
      if (bracketLabel === "Form") return defenses.form;
      if (bracketLabel === "Audience") return defenses.audience;
      throw new Error(`unexpected bracket: ${bracketLabel}`);
    },
    askFollowupOnShortDefense: async () => "Following up: more reasoning here.",
    askSurprisingFindings: async () => "I had assumed software was the answer.",
  };
}

describe("runHusserlPhaseMinusOne", () => {
  test("happy path: 3 long defenses → DefendedFrame with no follow-ups", async () => {
    const longDefense =
      "This alternative is genuinely impractical because the friction of writing it down kills the habit before it forms.";
    const ui = makeUi({ software: longDefense, form: longDefense, audience: longDefense });
    const result = await runHusserlPhaseMinusOne(makeInput(), new StubRunner(okAlts()), ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const frame: DefendedFrame = result.value;
    expect(frame.invocation).toBe("explicit_bracket");
    expect(frame.brackets_considered.software_bracket.defense).toBe(longDefense);
    expect(frame.brackets_considered.software_bracket.defense_followup_triggered).toBe(false);
    expect(frame.brackets_considered.form_bracket.defense_followup_triggered).toBe(false);
    expect(frame.brackets_considered.audience_bracket.defense_followup_triggered).toBe(false);
    expect(frame.surprising_findings).toEqual(["I had assumed software was the answer."]);
  });

  test("F-Husserl-1: short defense triggers follow-up + merged into defense", async () => {
    const ui = makeUi({ software: "no", form: "no", audience: "no" });
    const result = await runHusserlPhaseMinusOne(makeInput(), new StubRunner(okAlts()), ui);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sw = result.value.brackets_considered.software_bracket;
    expect(sw.defense_followup_triggered).toBe(true);
    expect(sw.defense).toContain("no");
    expect(sw.defense).toContain("Following up");
  });

  test("LLM error → invalid-response surfaced as Result.err", async () => {
    const failResponse: ClaudeResponse = {
      ok: false,
      error: { code: "auth_failed", detail: "no creds" },
      attempts: 1,
      total_duration_ms: 50,
      source: "subprocess",
    };
    const ui = makeUi({ software: "x", form: "x", audience: "x" });
    const result = await runHusserlPhaseMinusOne(makeInput(), new StubRunner(failResponse), ui);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("llm.internal-error");
  });

  test("LLM returns malformed JSON shape → invalid-response", async () => {
    const malformed: ClaudeResponse = {
      ok: true,
      content: { wrong_key: "oops" },
      attempts: 1,
      total_duration_ms: 100,
      source: "subprocess",
    };
    const ui = makeUi({ software: "x", form: "x", audience: "x" });
    const result = await runHusserlPhaseMinusOne(makeInput(), new StubRunner(malformed), ui);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("llm.invalid-response");
  });

  test("brackets_considered all three populated with the LLM-supplied alternatives", async () => {
    const longDefense = "specific concrete reasoning that is sufficiently long to pass threshold";
    const ui = makeUi({ software: longDefense, form: longDefense, audience: longDefense });
    const result = await runHusserlPhaseMinusOne(makeInput(), new StubRunner(okAlts()), ui);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.brackets_considered.software_bracket.considered_alternative).toBe(
      "physical notebook + index cards",
    );
    expect(result.value.brackets_considered.form_bracket.considered_alternative).toContain(
      "Discord",
    );
    expect(result.value.brackets_considered.audience_bracket.considered_alternative).toContain(
      "accountability",
    );
  });
});
