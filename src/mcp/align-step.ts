// SPEC: ADR-0010 (host-reasoning stepped MCP tools) —
//       agora_align_step orchestrator.
//
// Reads state + pending + alignment artifacts, dispatches to per-cause
// state machines, persists results, returns the next StepEnvelope.
//
// Slice A scope: telos. Slice B scope: + form / material / efficient /
// socrates. Slice C will add maturity / ac / handoff.
//
// LAYER 3 — depends on state, pending, step, philosophers, alignment
// artifacts.

import { join } from "node:path";

import type { Phase0Output } from "../alignment/phase-0-scan.js";
import { runPhase0Scan } from "../alignment/phase-0-scan.js";
import type { Phase1Result } from "../alignment/phase-1-intake.js";
import type { ElenchusFile } from "../cli/commands/socrates.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type {
  EfficientClaim,
  FormClaim,
  FourCauses,
  MaterialClaim,
} from "../philosophers/aristotle.js";
import { FourCausesSchema } from "../philosophers/aristotle.js";
import type { DefendedFrame } from "../philosophers/husserl.js";
import type { ElenchedClaim, SocratesClaim } from "../philosophers/socrates.js";
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
import { advanceEfficient, beginEfficient, type EfficientStepOutcome } from "./steps/efficient.js";
import { advanceForm, beginForm, type FormStepOutcome } from "./steps/form.js";
import { advanceMaterial, beginMaterial, type MaterialStepOutcome } from "./steps/material.js";
import { advanceSocrates, beginSocrates, type SocratesStepOutcome } from "./steps/socrates.js";
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
  const prefix = pending.step.split(".")[0] ?? "";
  switch (prefix) {
    case "telos":
      return await applyTelosOutcome(cwd, state, advanceTelos(pending, args));
    case "form":
      return await applyFormOutcome(cwd, state, advanceForm(pending, args));
    case "material":
      return await applyMaterialOutcome(cwd, state, advanceMaterial(pending, args));
    case "efficient":
      return await applyEfficientOutcome(cwd, state, advanceEfficient(pending, args));
    case "socrates":
      return await applySocratesOutcome(cwd, state, advanceSocrates(pending, args));
    default:
      return ok(
        envError("align", "internal.invariant-violation", `Unknown pending step prefix: ${prefix}`),
      );
  }
}

// ─── Branch: no pending — pick next target ───

type AlignTarget = "telos" | "form" | "material" | "efficient" | "socrates" | "done";

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
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  const elenchus = await readJsonOrNull<ElenchusFile>(elenchusPath(cwd));
  const target = pickAlignTarget(causes, elenchus);
  if (target === "done") {
    return ok(
      envDone(
        "align",
        "All Slice B causes captured (telos + form + material + efficient + socrates). Next: maturity / ac / handoff land in Slice C of ADR-0010.",
      ),
    );
  }
  return await beginAlignTarget(cwd, state, target);
}

export function pickAlignTarget(
  causes: FourCauses | null,
  elenchus: ElenchusFile | null,
): AlignTarget {
  if (causes === null || causes.telos === undefined) return "telos";
  if (causes.form === undefined) return "form";
  if (causes.material === undefined) return "material";
  if (causes.efficient === undefined) return "efficient";
  if (elenchus === null) return "socrates";
  return "done";
}

async function beginAlignTarget(
  cwd: string,
  state: State,
  target: Exclude<AlignTarget, "done">,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (target) {
    case "telos":
      return await beginTelosRound(cwd, state);
    case "form":
      return await beginFormRound(cwd, state);
    case "material":
      return await beginMaterialRound(cwd, state);
    case "efficient":
      return await beginEfficientRound(cwd, state);
    case "socrates":
      return await beginSocratesRound(cwd, state);
  }
}

// ─── Telos: round opener + persistence ───

async function beginTelosRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
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
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );
  await ensureScan(cwd);
  const outcome = beginTelos({
    raw_intake: intake.raw_intake,
    ...(defendedFrame !== null && defendedFrame.chosen_form.length > 0
      ? { defended_frame_chosen_form: defendedFrame.chosen_form }
      : {}),
    current_round: (state.alignment?.round ?? 0) + 1,
  });
  return await applyTelosOutcome(cwd, state, outcome);
}

async function applyTelosOutcome(
  cwd: string,
  state: State,
  outcome: TelosStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistCauseUpdate(cwd, state, "telos.complete", 1, (c) => ({
        telos: outcome.claim,
        ...(c.form !== undefined ? { form: c.form } : {}),
        ...(c.material !== undefined ? { material: c.material } : {}),
        ...(c.efficient !== undefined ? { efficient: c.efficient } : {}),
      }));
    case "error":
      return ok(outcome.envelope);
  }
}

// ─── Form ───

async function beginFormRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes?.telos === undefined) {
    return ok(envError("align", "state.corrupt", "form round needs settled telos"));
  }
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );
  const outcome = beginForm({
    telos_statement: causes.telos.statement,
    ...(defendedFrame !== null && defendedFrame.chosen_form.length > 0
      ? { defended_frame_chosen_form: defendedFrame.chosen_form }
      : {}),
    current_round: 2,
  });
  return await applyFormOutcome(cwd, state, outcome);
}

async function applyFormOutcome(
  cwd: string,
  state: State,
  outcome: FormStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistCauseUpdate(cwd, state, "form.complete", 2, (c) =>
        addCause(c, "form", outcome.claim as FormClaim),
      );
    case "error":
      return ok(outcome.envelope);
  }
}

// ─── Material ───

async function beginMaterialRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes?.telos === undefined) {
    return ok(envError("align", "state.corrupt", "material round needs settled telos"));
  }
  const scan = await ensureScan(cwd);
  const outcome = beginMaterial({
    telos_statement: causes.telos.statement,
    detected_stack: scan.detected_stack,
    is_brownfield: scan.is_brownfield,
    current_round: 3,
    ...(causes.form?.essential_structure !== undefined
      ? { form_essential_structure: causes.form.essential_structure }
      : {}),
  });
  return await applyMaterialOutcome(cwd, state, outcome);
}

async function applyMaterialOutcome(
  cwd: string,
  state: State,
  outcome: MaterialStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistCauseUpdate(cwd, state, "material.complete", 3, (c) =>
        addCause(c, "material", outcome.claim as MaterialClaim),
      );
    case "error":
      return ok(outcome.envelope);
  }
}

// ─── Efficient ───

async function beginEfficientRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes?.telos === undefined) {
    return ok(envError("align", "state.corrupt", "efficient round needs settled telos"));
  }
  const scan = await ensureScan(cwd);
  const outcome = beginEfficient({
    telos_statement: causes.telos.statement,
    detected_patterns: scan.detected_patterns,
    current_round: 4,
    ...(causes.form?.essential_structure !== undefined
      ? { form_essential_structure: causes.form.essential_structure }
      : {}),
    ...(causes.material?.tech_stack !== undefined
      ? { material_tech_stack: causes.material.tech_stack }
      : {}),
  });
  return await applyEfficientOutcome(cwd, state, outcome);
}

async function applyEfficientOutcome(
  cwd: string,
  state: State,
  outcome: EfficientStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistCauseUpdate(cwd, state, "efficient.complete", 4, (c) =>
        addCause(c, "efficient", outcome.claim as EfficientClaim),
      );
    case "error":
      return ok(outcome.envelope);
  }
}

// ─── Socrates: multi-claim sequential ───

async function beginSocratesRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (
    causes?.telos === undefined ||
    causes.form === undefined ||
    causes.material === undefined ||
    causes.efficient === undefined
  ) {
    return ok(envError("align", "state.corrupt", "socrates needs all 4 causes captured"));
  }
  const scan = await ensureScan(cwd);
  const claims: SocratesClaim[] = [
    {
      id: "telos_001",
      content: causes.telos.statement,
      cause: "telos",
      load_bearing: true,
      prior_aporia_count: 0,
    },
    {
      id: "form_001",
      content: causes.form.essential_structure,
      cause: "form",
      load_bearing: true,
      prior_aporia_count: 0,
    },
  ];
  const outcome = beginSocrates({
    claims,
    cwd_signal: {
      is_brownfield: scan.is_brownfield,
      detected_files: [],
      detected_patterns: [...scan.detected_patterns],
    },
    locale: socratesLocale(),
  });
  return await applySocratesOutcome(cwd, state, outcome);
}

async function applySocratesOutcome(
  cwd: string,
  state: State,
  outcome: SocratesStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistSocratesComplete(cwd, state, outcome.elenched);
    case "error":
      return ok(outcome.envelope);
  }
}

async function persistSocratesComplete(
  cwd: string,
  state: State,
  elenched: readonly ElenchedClaim[],
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const now = new Date().toISOString();
  const file: ElenchusFile = {
    version: 1,
    elenched: [...elenched],
    created_at: now,
  };
  await writeJsonAtomic(elenchusPath(cwd), file);
  await foldSocratesRefinements(cwd, elenched, now);
  await clearPending(cwd);
  return ok(
    envAdvanced(
      "align",
      "socrates.complete",
      `Elenchus complete (${String(elenched.length)} claim(s) probed). .agora/elenchus.json written.`,
      { phase: state.alignment?.phase ?? 2, round: state.alignment?.round ?? 4 },
    ),
  );
}

async function foldSocratesRefinements(
  cwd: string,
  elenched: readonly ElenchedClaim[],
  now: string,
): Promise<void> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes === null) return;
  let touched = false;
  let updated: FourCauses = { ...causes };
  for (const e of elenched) {
    if (e.outcome === "confirmed" || e.refined_content === undefined) continue;
    if (e.claim_id.startsWith("telos") && updated.telos !== undefined) {
      updated = { ...updated, telos: { ...updated.telos, statement: e.refined_content } };
      touched = true;
    } else if (e.claim_id.startsWith("form") && updated.form !== undefined) {
      updated = {
        ...updated,
        form: { ...updated.form, essential_structure: e.refined_content },
      };
      touched = true;
    }
  }
  if (touched) {
    const next = FourCausesSchema.parse({ ...updated, updated_at: now });
    await writeJsonAtomic(causesPath(cwd), next);
  }
}

// ─── Shared persistence helper for the 4 Aristotle causes ───

async function persistCauseUpdate(
  cwd: string,
  state: State,
  stepName: string,
  newRound: 1 | 2 | 3 | 4,
  mutate: (current: FourCauses) => Omit<FourCauses, "created_at" | "updated_at">,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const now = new Date().toISOString();
  const existing = await readJsonOrNull<FourCauses>(causesPath(cwd));
  const baseCreated = existing?.created_at ?? now;
  const mutated = mutate(existing ?? { created_at: baseCreated, updated_at: now });
  const causes = FourCausesSchema.parse({ ...mutated, created_at: baseCreated, updated_at: now });
  await writeJsonAtomic(causesPath(cwd), causes);
  const advanced = await saveState(
    cwd,
    { ...state, alignment: { phase: 2, round: newRound } },
    "agora_align_step",
  );
  if (!advanced.ok) return advanced;
  await clearPending(cwd);
  return ok(
    envAdvanced(
      "align",
      stepName,
      `${stepName.split(".")[0] ?? "cause"} captured; alignment.round=${String(newRound)}.`,
      { phase: 2, round: newRound },
    ),
  );
}

function addCause<K extends "form" | "material" | "efficient">(
  causes: FourCauses,
  key: K,
  claim: K extends "form" ? FormClaim : K extends "material" ? MaterialClaim : EfficientClaim,
): Omit<FourCauses, "created_at" | "updated_at"> {
  return {
    ...(causes.telos !== undefined ? { telos: causes.telos } : {}),
    ...(causes.form !== undefined ? { form: causes.form } : {}),
    ...(causes.material !== undefined ? { material: causes.material } : {}),
    ...(causes.efficient !== undefined ? { efficient: causes.efficient } : {}),
    [key]: claim,
  };
}

// ─── Path + scan helpers ───

function causesPath(cwd: string): string {
  return join(cwd, ".agora", "four_causes.json");
}

function elenchusPath(cwd: string): string {
  return join(cwd, ".agora", "elenchus.json");
}

async function ensureScan(cwd: string): Promise<Phase0Output> {
  const path = join(cwd, ".agora", "scan.json");
  const existing = await readJsonOrNull<Phase0Output>(path);
  if (existing !== null) return existing;
  const scan = await runPhase0Scan(cwd);
  await writeJsonAtomic(path, scan);
  return scan;
}

function socratesLocale(): "en" | "ko" {
  const raw = (process.env["AGORA_LOCALE"] ?? process.env["LANG"] ?? "en").toLowerCase();
  return raw.startsWith("ko") ? "ko" : "en";
}

// ─── Expects matcher ───

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
