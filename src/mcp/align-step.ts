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

import type { AcceptanceCriteriaResult } from "../alignment/acceptance-criteria.js";
import type { Phase0Output } from "../alignment/phase-0-scan.js";
import { runPhase0Scan } from "../alignment/phase-0-scan.js";
import type { Phase1Result } from "../alignment/phase-1-intake.js";
import type { ElenchusFile } from "../cli/commands/socrates.js";
import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { buildSeed } from "../handoff/seed-builder.js";
import type {
  EfficientClaim,
  FormClaim,
  FourCauses,
  MaterialClaim,
} from "../philosophers/aristotle.js";
import { FourCausesSchema } from "../philosophers/aristotle.js";
import type { DefendedFrame } from "../philosophers/husserl.js";
import type { PlatoDLPerCauseOutput, PlatoMaturityResult } from "../philosophers/plato.js";
import type { ElenchedClaim, SocratesClaim } from "../philosophers/socrates.js";
import { err, ok, type Result } from "../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { findProjectRoot, hasAgoraSession } from "../shared/path.js";
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
import { type AcStepOutcome, advanceAc, beginAc } from "./steps/ac.js";
import { advanceEfficient, beginEfficient, type EfficientStepOutcome } from "./steps/efficient.js";
import { advanceForm, beginForm, type FormStepOutcome } from "./steps/form.js";
import { advanceHandoff, beginHandoff, type HandoffStepOutcome } from "./steps/handoff.js";
import { advanceMaterial, beginMaterial, type MaterialStepOutcome } from "./steps/material.js";
import { advanceMaturity, beginMaturity, type MaturityStepOutcome } from "./steps/maturity.js";
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

  if (!(await hasAgoraSession(cwd))) {
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
    case "maturity":
      return await applyMaturityOutcome(cwd, state, advanceMaturity(pending, args));
    case "ac":
      return await applyAcOutcome(cwd, state, advanceAc(pending, args));
    case "handoff":
      return await applyHandoffOutcome(cwd, state, advanceHandoff(pending, args));
    default:
      return ok(
        envError("align", "internal.invariant-violation", `Unknown pending step prefix: ${prefix}`),
      );
  }
}

// ─── Branch: no pending — pick next target ───

type AlignTarget =
  | "telos"
  | "form"
  | "material"
  | "efficient"
  | "socrates"
  | "maturity"
  | "ac"
  | "handoff"
  | "done";

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
  const maturity = await readJsonOrNull<PlatoMaturityResult>(maturityPath(cwd));
  const acs = await readJsonOrNull<AcceptanceCriteriaResult>(acsPath(cwd));
  const seedExists = (await readJsonOrNull<unknown>(seedPath(cwd))) !== null;
  const target = pickAlignTarget(causes, elenchus, maturity, acs, seedExists);
  if (target === "done") {
    // Every alignment artifact exists. If state still says in_alignment
    // (e.g. after a manually-arranged re-entry that invalidated nothing),
    // declaring "done" while leaving the phase behind would deadlock the
    // loop: agora_ralph_step refuses in_alignment, and this branch would
    // keep saying done forever. Reconcile the phase for real.
    if (state.current_phase === "in_alignment" || state.current_phase === "in_alignment_paused") {
      const advanced = await saveState(
        cwd,
        { ...state, current_phase: "ready_for_ralph" },
        "agora_align_step",
      );
      if (!advanced.ok) return advanced;
      return ok(
        envAdvanced(
          "align",
          "align.reconciled",
          "All alignment artifacts already exist (seed.json locked); state reconciled to ready_for_ralph. Run agora_ralph_step to continue the Ralph loop.",
          { phase: "ready_for_ralph" as const },
        ),
      );
    }
    return ok(
      envDone(
        "align",
        "Alignment complete. seed.json is locked. Run agora_ralph_step to enter the Ralph loop.",
      ),
    );
  }
  return await beginAlignTarget(cwd, state, target);
}

export function pickAlignTarget(
  causes: FourCauses | null,
  elenchus: ElenchusFile | null,
  maturity: PlatoMaturityResult | null,
  acs: AcceptanceCriteriaResult | null,
  seedExists: boolean,
): AlignTarget {
  if (causes === null || causes.telos === undefined) return "telos";
  if (causes.form === undefined) return "form";
  if (causes.material === undefined) return "material";
  if (causes.efficient === undefined) return "efficient";
  if (elenchus === null) return "socrates";
  if (maturity === null || !maturity.all_passed) return "maturity";
  if (acs === null) return "ac";
  if (!seedExists) return "handoff";
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
    case "maturity":
      return await beginMaturityRound(cwd, state);
    case "ac":
      return await beginAcRound(cwd, state);
    case "handoff":
      return await beginHandoffRound(cwd, state);
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
    // Store the refinement in `elenchus_refinement`, NOT by overwriting the
    // clean `statement` / `essential_structure`. The raw elenchus response is
    // a multi-sentence conversational answer ("Fair hit. You're right…") that
    // would violate the telos extractor's own "single verb-phrase, not
    // editorialized" rule and pollute the Gate 5 drift anchor.
    if (e.claim_id.startsWith("telos") && updated.telos !== undefined) {
      updated = { ...updated, telos: { ...updated.telos, elenchus_refinement: e.refined_content } };
      touched = true;
    } else if (e.claim_id.startsWith("form") && updated.form !== undefined) {
      updated = {
        ...updated,
        form: { ...updated.form, elenchus_refinement: e.refined_content },
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

// ─── Maturity: 4-cause Noesis test ───

async function beginMaturityRound(
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
    return ok(envError("align", "state.corrupt", "maturity needs all 4 causes captured"));
  }
  const outcome = beginMaturity({
    causes: [
      { field_path: "telos", claim_content: causes.telos.statement },
      { field_path: "form", claim_content: causes.form.essential_structure },
      { field_path: "material", claim_content: causes.material.tech_stack.join(", ") },
      {
        field_path: "efficient",
        claim_content: `${causes.efficient.who}; ${causes.efficient.when}; ${causes.efficient.how}`,
      },
    ],
  });
  return await applyMaturityOutcome(cwd, state, outcome);
}

async function applyMaturityOutcome(
  cwd: string,
  state: State,
  outcome: MaturityStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistMaturity(cwd, state, outcome.result);
    case "error":
      return ok(outcome.envelope);
  }
}

async function persistMaturity(
  cwd: string,
  state: State,
  result: PlatoMaturityResult,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  await writeJsonAtomic(maturityPath(cwd), result);
  // Fold tagged maturity back into four_causes.
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes !== null) {
    const updated = applyMaturityToCauses(causes, result.per_cause);
    await writeJsonAtomic(
      causesPath(cwd),
      FourCausesSchema.parse({ ...updated, updated_at: new Date().toISOString() }),
    );
  }
  await clearPending(cwd);
  if (!result.all_passed) {
    return ok(
      envAdvanced(
        "align",
        "maturity.failed",
        `Maturity failed: ${result.failing_causes.join(", ")}. Edit four_causes.json (e.g. drop the failing cause + re-run agora_align_step) to refine + retry.`,
        { phase: 2, round: 4, failing_causes: result.failing_causes },
      ),
    );
  }
  // All passed → advance state to alignment_complete.
  const advanced = await saveState(
    cwd,
    { ...state, current_phase: "alignment_complete", alignment: { phase: 2, round: 4 } },
    "agora_align_step",
  );
  if (!advanced.ok) return advanced;
  return ok(
    envAdvanced(
      "align",
      "maturity.complete",
      "All 4 causes passed Plato's Divided Line. state advanced to alignment_complete.",
      { phase: 2, round: 4 },
    ),
  );
}

function applyMaturityToCauses(
  causes: FourCauses,
  perCause: readonly PlatoDLPerCauseOutput[],
): Omit<FourCauses, "created_at" | "updated_at"> & { created_at: string } {
  let next: FourCauses = { ...causes };
  for (const pc of perCause) {
    if (pc.field_path === "telos" && next.telos !== undefined) {
      next = { ...next, telos: { ...next.telos, maturity: pc.tagged_maturity } };
    } else if (pc.field_path === "form" && next.form !== undefined) {
      next = { ...next, form: { ...next.form, maturity: pc.tagged_maturity } };
    } else if (pc.field_path === "material" && next.material !== undefined) {
      next = { ...next, material: { ...next.material, maturity: pc.tagged_maturity } };
    } else if (pc.field_path === "efficient" && next.efficient !== undefined) {
      next = { ...next, efficient: { ...next.efficient, maturity: pc.tagged_maturity } };
    }
  }
  return next;
}

// ─── Acceptance Criteria ───

async function beginAcRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  if (causes?.telos === undefined || causes.form === undefined) {
    return ok(envError("align", "state.corrupt", "ac needs settled telos + form"));
  }
  const outcome = beginAc({
    telos_statement: causes.telos.statement,
    form_essential_structure: causes.form.essential_structure,
  });
  return await applyAcOutcome(cwd, state, outcome);
}

async function applyAcOutcome(
  cwd: string,
  state: State,
  outcome: AcStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      await writeJsonAtomic(acsPath(cwd), outcome.result);
      await clearPending(cwd);
      void state;
      return ok(
        envAdvanced(
          "align",
          "ac.complete",
          `Acceptance criteria captured (${String(outcome.result.criteria.length)} criteria). .agora/acceptance_criteria.json written.`,
        ),
      );
    case "error":
      return ok(outcome.envelope);
  }
}

// ─── Handoff: Dihairesis + user confirm + seed lock ───

async function beginHandoffRound(
  cwd: string,
  state: State,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  if (state.current_phase !== "alignment_complete") {
    return ok(
      envError(
        "align",
        "user.aborted",
        `handoff requires state.current_phase=alignment_complete (got ${state.current_phase}). Run maturity first.`,
      ),
    );
  }
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  const acs = await readJsonOrNull<AcceptanceCriteriaResult>(acsPath(cwd));
  if (causes?.telos === undefined || acs === null) {
    return ok(envError("align", "state.corrupt", "handoff needs telos + acceptance_criteria.json"));
  }
  // Reuse a preserved decomposition (declined confirm / Z2 re-alignment):
  // beginHandoff validates root-id match and falls back to fresh DH.
  const preservedRecord = await readJsonOrNull<{
    ac_tree?: unknown[];
    undivided_acs?: string[];
    max_depth_reached?: number;
    total_llm_calls?: number;
  }>(acTreePath(cwd));
  const preserved =
    preservedRecord !== null && Array.isArray(preservedRecord.ac_tree)
      ? {
          preserved: {
            ac_tree: preservedRecord.ac_tree,
            undivided_acs: preservedRecord.undivided_acs ?? [],
            max_depth_reached: preservedRecord.max_depth_reached ?? 0,
            total_llm_calls: preservedRecord.total_llm_calls ?? 0,
          },
        }
      : {};
  const outcome = beginHandoff({
    telos_statement: causes.telos.statement,
    acceptance_criteria: acs.criteria,
    ...preserved,
  });
  return await applyHandoffOutcome(cwd, state, outcome);
}

async function applyHandoffOutcome(
  cwd: string,
  state: State,
  outcome: HandoffStepOutcome,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await persistHandoff(cwd, state, outcome.data);
    case "error":
      return ok(outcome.envelope);
  }
}

async function persistHandoff(
  cwd: string,
  state: State,
  data: {
    ac_tree: import("../handoff/dihairesis.js").ACNode[];
    undivided_acs: string[];
    max_depth_reached: number;
    total_llm_calls: number;
    user_confirmed: boolean;
  },
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  // Always write ac_tree.json (audit trail, parallel to handoff cli).
  const acTreeRecord = {
    ac_tree: data.ac_tree,
    undivided_acs: data.undivided_acs,
    max_depth_reached: data.max_depth_reached,
    total_atomic_leaves: countAtomicLeaves(data.ac_tree),
    total_llm_calls: data.total_llm_calls,
    created_at: new Date().toISOString(),
  };
  await writeJsonAtomic(acTreePath(cwd), acTreeRecord);

  await clearPending(cwd);

  if (!data.user_confirmed) {
    return ok(
      envAdvanced(
        "align",
        "handoff.declined",
        "User declined to lock seed; ac_tree.json preserved for review. Re-run agora_align_step to retry handoff.",
      ),
    );
  }

  // Confirmed: assemble seed.json and advance state.
  const sources = await readSeedSources(cwd);
  if (!sources.ok) return sources;
  const seed = buildSeed({
    defended_frame: sources.value.defended_frame,
    intake: sources.value.intake,
    four_causes: sources.value.four_causes,
    acceptance_criteria: sources.value.acceptance_criteria,
    ac_tree: data.ac_tree,
  });
  await writeJsonAtomic(seedPath(cwd), seed);
  const advanced = await saveState(
    cwd,
    { ...state, current_phase: "ready_for_ralph" },
    "agora_align_step",
  );
  if (!advanced.ok) return advanced;
  return ok(
    envAdvanced(
      "align",
      "handoff.complete",
      `seed.json locked (${String(seed.ac_tree.length)} root AC(s), ${String(acTreeRecord.total_atomic_leaves)} atomic leaves). state advanced to ready_for_ralph.`,
      { phase: "ready_for_ralph" as const },
    ),
  );
}

interface SeedSources {
  defended_frame: DefendedFrame | null;
  intake: Phase1Result;
  four_causes: FourCauses;
  acceptance_criteria: AcceptanceCriteriaResult;
}

async function readSeedSources(cwd: string): Promise<Result<SeedSources, AgoraErrorThrown>> {
  const intake = await readJsonOrNull<Phase1Result>(join(cwd, ".agora", "intake.json"));
  const causes = await readJsonOrNull<FourCauses>(causesPath(cwd));
  const acs = await readJsonOrNull<AcceptanceCriteriaResult>(acsPath(cwd));
  if (intake === null || causes === null || acs === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          detail: "handoff: missing intake / four_causes / acceptance_criteria for seed assembly",
        },
      }),
    );
  }
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );
  return ok({
    defended_frame: defendedFrame,
    intake,
    four_causes: causes,
    acceptance_criteria: acs,
  });
}

function countAtomicLeaves(tree: readonly import("../handoff/dihairesis.js").ACNode[]): number {
  let count = 0;
  for (const node of tree) {
    if (node.atomic) count += 1;
    count += countAtomicLeaves(node.children);
  }
  return count;
}

// ─── Path + scan helpers ───

function causesPath(cwd: string): string {
  return join(cwd, ".agora", "four_causes.json");
}

function elenchusPath(cwd: string): string {
  return join(cwd, ".agora", "elenchus.json");
}

function maturityPath(cwd: string): string {
  return join(cwd, ".agora", "maturity.json");
}

function acsPath(cwd: string): string {
  return join(cwd, ".agora", "acceptance_criteria.json");
}

function seedPath(cwd: string): string {
  return join(cwd, ".agora", "seed.json");
}

function acTreePath(cwd: string): string {
  return join(cwd, ".agora", "ac_tree.json");
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
