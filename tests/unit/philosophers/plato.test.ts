// SPEC: docs/philosophers/runbooks/plato.md (Stage 5-A.3 Rev 2) §4.1.

import { describe, expect, test } from "vitest";

import type { ClaudeCallOptions, ClaudeResponse, ClaudeRunner } from "@/llm/runner.js";
import {
  type PlatoUi,
  REQUIRED_FLOORS,
  runPlatoMaturityForAllCauses,
  runPlatoNoesisTest,
} from "@/philosophers/plato.js";

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

function okTag(opts: {
  maturity: "pistis" | "dianoia" | "noesis";
  alternatives?: { alternative: string; why_rejected: string }[];
}): ClaudeResponse {
  return {
    ok: true,
    content: {
      tagged_maturity: opts.maturity,
      rejected_alternatives: opts.alternatives ?? [],
    },
    attempts: 1,
    total_duration_ms: 100,
    source: "subprocess",
  };
}

interface RecordedUi extends PlatoUi {
  asked: { field_path: string; required_floor: string }[];
}

function makeUi(responses: Record<string, string>): RecordedUi {
  const ui: RecordedUi = {
    asked: [],
    askNoesisTest: async ({ field_path, required_floor }) => {
      ui.asked.push({ field_path, required_floor });
      return responses[field_path] ?? "I considered X but rejected because Y";
    },
  };
  return ui;
}

describe("REQUIRED_FLOORS", () => {
  test("telos floor is noesis (most load-bearing)", () => {
    expect(REQUIRED_FLOORS.telos).toBe("noesis");
  });
  test("form floor is dianoia", () => {
    expect(REQUIRED_FLOORS.form).toBe("dianoia");
  });
  test("material + efficient floors are pistis (lighter)", () => {
    expect(REQUIRED_FLOORS.material).toBe("pistis");
    expect(REQUIRED_FLOORS.efficient).toBe("pistis");
  });
});

describe("runPlatoNoesisTest — single cause", () => {
  test("noesis tagged + meets noesis floor → passed=true", async () => {
    const runner = new QueueRunner([
      okTag({
        maturity: "noesis",
        alternatives: [
          {
            alternative: "build for sharing",
            why_rejected: "Public audience pressures self-editing",
          },
        ],
      }),
    ]);
    const ui = makeUi({ telos: "I considered X. Rejected because Y." });
    const result = await runPlatoNoesisTest(
      { field_path: "telos", claim_content: "help me X", required_floor: "noesis" },
      runner,
      ui,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(true);
    expect(result.value.tagged_maturity).toBe("noesis");
    expect(result.value.rejected_alternatives.length).toBe(1);
    expect(result.value.reloop_directive_field).toBeUndefined();
  });

  test("dianoia tagged + noesis floor required → passed=false + reloop set", async () => {
    const runner = new QueueRunner([okTag({ maturity: "dianoia" })]);
    const ui = makeUi({ telos: "Just felt right." });
    const result = await runPlatoNoesisTest(
      { field_path: "telos", claim_content: "help me X", required_floor: "noesis" },
      runner,
      ui,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(false);
    expect(result.value.reloop_directive_field).toBe("telos");
  });

  test("pistis tagged + pistis floor → passed=true (lower floor)", async () => {
    const runner = new QueueRunner([okTag({ maturity: "pistis" })]);
    const ui = makeUi({ material: "I think this is what we need" });
    const result = await runPlatoNoesisTest(
      { field_path: "material", claim_content: "ts+vitest", required_floor: "pistis" },
      runner,
      ui,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(true);
  });

  test("empty user response → user.aborted", async () => {
    const runner = new QueueRunner([]);
    const ui = makeUi({ telos: "" });
    const result = await runPlatoNoesisTest(
      { field_path: "telos", claim_content: "x", required_floor: "noesis" },
      runner,
      ui,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("user.aborted");
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
    const ui = makeUi({ telos: "x" });
    const result = await runPlatoNoesisTest(
      { field_path: "telos", claim_content: "x", required_floor: "noesis" },
      runner,
      ui,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("llm.invalid-response");
  });
});

describe("runPlatoMaturityForAllCauses", () => {
  test("all 4 pass → all_passed=true, failing_causes=[]", async () => {
    const runner = new QueueRunner([
      okTag({ maturity: "noesis", alternatives: [{ alternative: "x", why_rejected: "y" }] }),
      okTag({ maturity: "dianoia" }),
      okTag({ maturity: "pistis" }),
      okTag({ maturity: "pistis" }),
    ]);
    const ui = makeUi({});
    const result = await runPlatoMaturityForAllCauses(
      {
        causes: [
          { field_path: "telos", claim_content: "t" },
          { field_path: "form", claim_content: "f" },
          { field_path: "material", claim_content: "m" },
          { field_path: "efficient", claim_content: "e" },
        ],
      },
      runner,
      ui,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.all_passed).toBe(true);
    expect(result.value.failing_causes).toEqual([]);
    expect(result.value.per_cause.length).toBe(4);
  });

  test("telos fails (dianoia tagged, noesis required) → all_passed=false, failing=[telos]", async () => {
    const runner = new QueueRunner([
      okTag({ maturity: "dianoia" }),
      okTag({ maturity: "dianoia" }),
      okTag({ maturity: "pistis" }),
      okTag({ maturity: "pistis" }),
    ]);
    const ui = makeUi({});
    const result = await runPlatoMaturityForAllCauses(
      {
        causes: [
          { field_path: "telos", claim_content: "t" },
          { field_path: "form", claim_content: "f" },
          { field_path: "material", claim_content: "m" },
          { field_path: "efficient", claim_content: "e" },
        ],
      },
      runner,
      ui,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.all_passed).toBe(false);
    expect(result.value.failing_causes).toEqual(["telos"]);
  });

  test("UI is asked once per cause in order", async () => {
    const runner = new QueueRunner([
      okTag({ maturity: "noesis", alternatives: [{ alternative: "x", why_rejected: "y" }] }),
      okTag({ maturity: "dianoia" }),
      okTag({ maturity: "pistis" }),
      okTag({ maturity: "pistis" }),
    ]);
    const ui = makeUi({});
    await runPlatoMaturityForAllCauses(
      {
        causes: [
          { field_path: "telos", claim_content: "t" },
          { field_path: "form", claim_content: "f" },
          { field_path: "material", claim_content: "m" },
          { field_path: "efficient", claim_content: "e" },
        ],
      },
      runner,
      ui,
    );
    expect(ui.asked.map((a) => a.field_path)).toEqual(["telos", "form", "material", "efficient"]);
  });
});
