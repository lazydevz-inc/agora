// SPEC: ADR-0010 (host-reasoning stepped MCP tools) —
//       agora_align_step orchestrator.
//
// Reads state + pending + alignment artifacts, dispatches to per-cause
// state machines, persists results, returns the next StepEnvelope.
//
// Slice A scope: telos only. Future slices (B/C) extend the dispatch
// table with form / material / efficient / socrates / maturity / ac /
// handoff.
//
// LAYER 3 — depends on state, pending, step, philosophers,
// alignment artifacts.

import { join } from "node:path";

import type { Phase0Output } from "../alignment/phase-0-scan.js";
import { runPhase0Scan } from "../alignment/phase-0-scan.js";
import type { Phase1Result } from "../alignment/phase-1-intake.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { FourCauses } from "../philosophers/aristotle.js";
import { FourCausesSchema } from "../philosophers/aristotle.js";
import type { DefendedFrame } from "../philosophers/husserl.js";
import { err, ok, type Result } from "../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../shared/path.js";
import { loadState } from "../state/reader.js";
import type { State } from "../state/types.js";
import { saveState } from "../state/writer.js";
import { clearPending, type McpPending, readPending, writePending } from "./pending.js";
import {
  envAdvanced,
  envDone,
  envError,
  type StepArgs,
  StepArgsSchema,
  type StepEnvelope,
} from "./step.js";
import { advanceTelos, beginTelos, type TelosStepOutcome } from "./steps/telos.js";

export async function runAlignStep(
  rawArgs: unknown,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  const argsResult = StepArgsSchema.safeParse(rawArgs ?? {});
  if (!argsResult.success) {
    return ok(
      envError(
        "align",
        "user.forbidden-flag-combo",
        `agora_align_step args invalid: ${argsResult.error.issues[0]?.message ?? "validation failed"}`,
      ),
    );
  }
  const args = argsResult.data;

  if (!(await hasAgoraDir(cwd))) {
    return ok(
      envError(
        "align",
        "user.aborted",
        "No Agora session in this directory. Run `agora new <name>` first.",
      ),
    );
  }

  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  if (stateResult.value === null) {
    return ok(envError("align", "state.corrupt", "state.json missing despite .agora/ existing"));
  }
  const state = stateResult.value;

  const pendingResult = await readPending(cwd);
  if (!pendingResult.ok) return pendingResult;
  const pending = pendingResult.value;

  if (pending !== null) {
    return await dispatchPending(cwd, state, pending, args);
  }
  return await dispatchFresh(cwd, state, args);
}

// ─── Branch: pending step in flight ───

async function dispatchPending(
  cwd: string,
  state: State,
  pending: McpPending,
  args: StepArgs,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  if (pending.owner !== "align") {
    return ok(
      envError(
        "align",
        "user.aborted",
        `mcp_pending.json belongs to "${pending.owner}", not align. Use agora_${pending.owner}_step.`,
      ),
    );
  }
  const expectMatch = matchesExpects(pending.expects, args);
  if (!expectMatch.ok) {
    return ok(envError("align", expectMatch.error.code, expectMatch.error.message));
  }
  if (pending.step.startsWith("telos.")) {
    return await applyTelosOutcome(cwd, state, advanceTelos(pending, args));
  }
  return ok(
    envError(
      "align",
      "internal.invariant-violation",
      `Slice A only handles telos.*; pending.step=${pending.step}.`,
    ),
  );
}

// ─── Branch: no pending — decide next target ───

async function dispatchFresh(
  cwd: string,
  state: State,
  args: StepArgs,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  if (args.user_answers !== undefined || args.llm_responses !== undefined) {
    return ok(
      envError(
        "align",
        "user.aborted",
        "agora_align_step received user_answers / llm_responses but no pending step is in flight.",
      ),
    );
  }
  const causes = await readJsonOrNull<FourCauses>(join(cwd, ".agora", "four_causes.json"));
  if (causes?.telos !== undefined) {
    return ok(
      envDone(
        "align",
        "Telos already captured. Subsequent causes (form / material / efficient / socrates / maturity / ac / handoff) land in later slices of ADR-0010.",
      ),
    );
  }
  const intake = await readJsonOrNull<Phase1Result>(join(cwd, ".agora", "intake.json"));
  if (intake === null) {
    return ok(
      envError(
        "align",
        "user.aborted",
        "Telos round requires Phase 1 intake. Run `agora intake` first.",
      ),
    );
  }
  return await beginTelosRound(cwd, state, intake);
}

async function beginTelosRound(
  cwd: string,
  state: State,
  intake: Phase1Result,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );

  // Lazily ensure scan.json exists (the MCP entry point shouldn't
  // require the user to have run `agora new` mid-session).
  const scanPath = join(cwd, ".agora", "scan.json");
  const existingScan = await readJsonOrNull<Phase0Output>(scanPath);
  if (existingScan === null) {
    const scan = await runPhase0Scan(cwd);
    await writeJsonAtomic(scanPath, scan);
  }

  const outcome = beginTelos({
    raw_intake: intake.raw_intake,
    ...(defendedFrame !== null && defendedFrame.chosen_form.length > 0
      ? { defended_frame_chosen_form: defendedFrame.chosen_form }
      : {}),
    current_round: (state.alignment?.round ?? 0) + 1,
  });
  return await applyTelosOutcome(cwd, state, outcome);
}

// ─── Per-outcome persistence ───

async function applyTelosOutcome(
  cwd: string,
  state: State,
  outcome: TelosStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete": {
      const now = new Date().toISOString();
      const causesPath = join(cwd, ".agora", "four_causes.json");
      const existing = await readJsonOrNull<FourCauses>(causesPath);
      const causes = FourCausesSchema.parse({
        telos: outcome.claim,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
      await writeJsonAtomic(causesPath, causes);
      const advanced = await saveState(
        cwd,
        { ...state, alignment: { phase: 2, round: 1 } },
        "agora_align_step",
      );
      if (!advanced.ok) return advanced;
      await clearPending(cwd);
      return ok(
        envAdvanced(
          "align",
          "telos.complete",
          "Telos captured. .agora/four_causes.json written; alignment advanced to phase 2 round 1.",
          { phase: 2, round: 1 },
        ),
      );
    }
    case "error":
      // Surface the envelope; leave pending in place so the host can
      // retry the same step with corrected input.
      return ok(outcome.envelope);
  }
}

function matchesExpects(
  expects: "user_answers" | "llm_responses",
  args: StepArgs,
): Result<true, { code: string; message: string }> {
  if (expects === "user_answers") {
    if (args.user_answers === undefined) {
      return err({
        code: "user.aborted",
        message: "Pending step expects user_answers; none provided.",
      });
    }
    if (args.llm_responses !== undefined) {
      return err({
        code: "user.forbidden-flag-combo",
        message: "Pending step expects user_answers; llm_responses should not be sent.",
      });
    }
  } else {
    if (args.llm_responses === undefined) {
      return err({
        code: "user.aborted",
        message: "Pending step expects llm_responses; none provided.",
      });
    }
    if (args.user_answers !== undefined) {
      return err({
        code: "user.forbidden-flag-combo",
        message: "Pending step expects llm_responses; user_answers should not be sent.",
      });
    }
  }
  return ok(true);
}
