// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — slice A
//       integration test for the agora_align_step orchestrator.
//
// Each scenario drives runAlignStep through a real .agora/ on a temp
// dir, simulating what the host Claude Code session would do across
// multiple MCP tool calls.

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { runAlignStep } from "@/mcp/align-step.js";
import { readPending } from "@/mcp/pending.js";
import { writeJsonAtomic } from "@/shared/io.js";
import { newState } from "@/state/types.js";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), "agora-align-step-"));
  process.chdir(cwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(cwd, { recursive: true, force: true });
});

async function seedSession() {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeJsonAtomic(join(cwd, ".agora", "state.json"), newState());
  await writeJsonAtomic(join(cwd, ".agora", "intake.json"), {
    raw_intake:
      "I want to build a tool that helps users align their thinking with AI coding agents.",
    intake_method: "inline",
    intake_word_count: 14,
    intake_byte_size: 100,
    intake_truncated: false,
    intake_duration_ms: 10,
    estimated_rounds: "3-5 rounds",
    classification: "greenfield",
    created_at: new Date().toISOString(),
  });
}

describe("runAlignStep — refusal paths", () => {
  test("no .agora → error envelope (user.aborted)", async () => {
    const r = await runAlignStep({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("error");
    if (r.value.kind === "error") {
      expect(r.value.code).toBe("user.aborted");
      expect(r.value.message).toMatch(/agora new/);
    }
  });

  test(".agora but no intake.json → error envelope (user.aborted)", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeJsonAtomic(join(cwd, ".agora", "state.json"), newState());
    const r = await runAlignStep({});
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error envelope");
    expect(r.value.message).toMatch(/intake/);
  });

  test("malformed args → error envelope (boundary validation)", async () => {
    await seedSession();
    const r = await runAlignStep({ user_answers: "not-an-object" });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error envelope");
    expect(r.value.code).toBe("user.forbidden-flag-combo");
  });
});

describe("runAlignStep — fresh telos round, happy path (no noun-phrase)", () => {
  beforeEach(seedSession);

  test("first call → needs_user_input (telos.questions) + pending written", async () => {
    const r = await runAlignStep({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("needs_user_input");
    if (r.value.kind !== "needs_user_input") return;
    expect(r.value.step).toBe("telos.questions");
    expect(r.value.questions).toHaveLength(3);
    expect(r.value.questions.map((q) => q.id)).toEqual([
      "q_why_exists",
      "q_served_good",
      "q_failure_signal",
    ]);

    const pendingR = await readPending(cwd);
    expect(pendingR.ok).toBe(true);
    if (!pendingR.ok || pendingR.value === null) throw new Error("pending not written");
    expect(pendingR.value.step).toBe("telos.questions");
    expect(pendingR.value.expects).toBe("user_answers");
    expect(pendingR.value.owner).toBe("align");
  });

  test("user_answers → needs_reasoning (telos.extract)", async () => {
    await runAlignStep({});
    const r = await runAlignStep({
      user_answers: {
        q_why_exists: "To help users align their thinking with AI",
        q_served_good: "Clear, intentional collaboration with AI",
        q_failure_signal: "User abandons after the first session",
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "needs_reasoning") {
      throw new Error(`expected needs_reasoning, got ${r.ok ? r.value.kind : "err"}`);
    }
    expect(r.value.step).toBe("telos.extract");
    expect(r.value.prompts).toHaveLength(1);
    expect(r.value.prompts[0]?.id).toBe("extract");
    expect(r.value.prompts[0]?.expect).toBe("json");
    expect(r.value.prompts[0]?.system).toMatch(/Aristotle/);
  });

  test("llm_response noun_phrase=false → advanced + four_causes written + state advanced", async () => {
    await runAlignStep({});
    await runAlignStep({
      user_answers: {
        q_why_exists: "To help users align their thinking with AI",
        q_served_good: "Clear thinking",
        q_failure_signal: "abandonment",
      },
    });
    const r = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            statement: "Help users align their thinking with AI",
            served_good: "Clear, intentional collaboration",
            failure_signal: "User abandons after the first session",
            noun_phrase_telos: false,
          },
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "advanced") {
      throw new Error(`expected advanced, got ${r.ok ? r.value.kind : "err"}`);
    }
    expect(r.value.step).toBe("telos.complete");

    const causes = JSON.parse(
      await readFile(join(cwd, ".agora", "four_causes.json"), "utf8"),
    ) as {
      telos: { statement: string; maturity: string; noun_phrase_refinement_triggered: boolean };
    };
    expect(causes.telos.statement).toBe("Help users align their thinking with AI");
    expect(causes.telos.maturity).toBe("dianoia");
    expect(causes.telos.noun_phrase_refinement_triggered).toBe(false);

    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      alignment: { phase: number; round: number };
    };
    expect(state.alignment).toEqual({ phase: 2, round: 1 });

    const pendingAfter = await readPending(cwd);
    expect(pendingAfter.ok && pendingAfter.value).toBe(null);
  });
});

describe("runAlignStep — noun-phrase refinement loop", () => {
  beforeEach(seedSession);

  test("noun_phrase=true → refinement question → re_extract → complete", async () => {
    await runAlignStep({});
    await runAlignStep({
      user_answers: {
        q_why_exists: "A notes app",
        q_served_good: "easy notes",
        q_failure_signal: "users don't return",
      },
    });
    const refStep = await runAlignStep({
      llm_responses: [
        {
          id: "extract",
          content: {
            statement: "build a notes app",
            served_good: "note-taking",
            failure_signal: "no return",
            noun_phrase_telos: true,
            noun_phrase_reason: "telos is a noun-phrase artifact (notes app)",
          },
        },
      ],
    });
    expect(refStep.ok).toBe(true);
    if (!refStep.ok || refStep.value.kind !== "needs_user_input") {
      throw new Error("expected refinement question");
    }
    expect(refStep.value.step).toBe("telos.refinement");
    expect(refStep.value.questions).toHaveLength(1);
    expect(refStep.value.questions[0]?.id).toBe("q_refinement");

    const reExtract = await runAlignStep({
      user_answers: { q_refinement: "to help me recall what I read months ago" },
    });
    expect(reExtract.ok).toBe(true);
    if (!reExtract.ok || reExtract.value.kind !== "needs_reasoning") {
      throw new Error("expected re-extract reasoning step");
    }
    expect(reExtract.value.step).toBe("telos.re_extract");
    expect(reExtract.value.prompts[0]?.id).toBe("re_extract");

    const final = await runAlignStep({
      llm_responses: [
        {
          id: "re_extract",
          content: {
            statement: "Help users recall what they read months ago",
            served_good: "Memory of reading across time",
            failure_signal: "user forgets a key insight",
            noun_phrase_telos: false,
          },
        },
      ],
    });
    expect(final.ok).toBe(true);
    if (!final.ok || final.value.kind !== "advanced") throw new Error("expected advanced");
    expect(final.value.step).toBe("telos.complete");

    const causes = JSON.parse(
      await readFile(join(cwd, ".agora", "four_causes.json"), "utf8"),
    ) as { telos: { noun_phrase_refinement_triggered: boolean } };
    expect(causes.telos.noun_phrase_refinement_triggered).toBe(true);
  });
});

describe("runAlignStep — terminal & error cases", () => {
  test("telos already captured → done envelope", async () => {
    await seedSession();
    await writeJsonAtomic(join(cwd, ".agora", "four_causes.json"), {
      telos: {
        statement: "x",
        served_good: "y",
        failure_signal: "z",
        maturity: "dianoia",
        noun_phrase_refinement_triggered: false,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const r = await runAlignStep({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("done");
  });

  test("pending expects user_answers; sending llm_responses → error", async () => {
    await seedSession();
    await runAlignStep({}); // opens telos.questions
    const r = await runAlignStep({
      llm_responses: [{ id: "x", content: "y" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.message).toMatch(/user_answers/);
  });

  test("no pending but args sent → error", async () => {
    await seedSession();
    const r = await runAlignStep({ user_answers: { q_x: "y" } });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.message).toMatch(/no pending/);
  });

  test("llm_response with wrong schema → error envelope (host can retry)", async () => {
    await seedSession();
    await runAlignStep({});
    await runAlignStep({
      user_answers: {
        q_why_exists: "wx",
        q_served_good: "sg",
        q_failure_signal: "fs",
      },
    });
    const r = await runAlignStep({
      llm_responses: [{ id: "extract", content: { wrong_field: "nope" } }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "error") throw new Error("expected error");
    expect(r.value.code).toBe("llm.invalid-response");
    // Pending must remain so the host can correct + retry.
    const pendingAfter = await readPending(cwd);
    expect(pendingAfter.ok && pendingAfter.value !== null).toBe(true);
  });
});
