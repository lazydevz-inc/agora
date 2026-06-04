// SPEC: docs/cli/spec.md (no per-command anchor — `form` joins the
//       bracket / intake / telos shortcut family) +
//       docs/loops/alignment-loop.md Phase 2 + docs/philosophers/runbooks/
//       aristotle.md §4.2.
//
// `agora form` — interactive Aristotle form round (Phase 2, round 2).
// Runs after telos. Reads scan + state + intake + four_causes.json
// (telos must be present), drives 2-question + optional refinement
// dialogue, persists FourCauses.form to .agora/four_causes.json, and
// advances state.alignment to { phase: 2, round: 2 }.
//
// Refusal guards (4):
//   - no .agora/ → user.aborted (exit 2)
//   - no four_causes.json OR telos missing → user.aborted (exit 2 — run
//     `agora telos` first)
//   - alignment.phase < 2 → user.aborted (exit 2 — telos slice didn't
//     advance state correctly)
//   - four_causes.json already has form populated → user.confirmation-
//     required (exit 2 — over-form guard; remove four_causes.json or
//     run `agora resume` to continue from material)

import { join } from "node:path";
import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";
import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import {
  type AristotleFormUi,
  type FormClaim,
  type FourCauses,
  FourCausesSchema,
  runAristotleFormRound,
} from "../../philosophers/aristotle.js";
import type { DefendedFrame } from "../../philosophers/husserl.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runFormCommand(
  flags: GlobalFlags,
  _positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  if (!(await hasAgoraDir(cwd))) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "No Agora session in this directory. Run `agora new <name>` first." },
      }),
    );
  }

  // Load FourCauses — telos must be settled.
  const fourCausesPath = join(cwd, ".agora", "four_causes.json");
  const existingCauses = await readJsonOrNull<FourCauses>(fourCausesPath);
  if (existingCauses === null || existingCauses.telos === undefined) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: "Form round requires telos first. Run `agora telos` to capture the telos.",
        },
      }),
    );
  }
  if (existingCauses.form !== undefined) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Form already captured (four_causes.json present with form populated). Remove .agora/four_causes.json to re-run, or run \`agora resume\` to continue from material.`,
        },
      }),
    );
  }

  // Load Phase 0 + optional defended frame for richer context.
  const scanPath = join(cwd, ".agora", "scan.json");
  let scan = await readJsonOrNull<Phase0Output>(scanPath);
  if (scan === null) {
    scan = await runPhase0Scan(cwd);
    await writeJsonAtomic(scanPath, scan);
  }
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );

  // Load state.
  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  if (stateResult.value === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: join(cwd, ".agora", "state.json"),
          detail: "state.json missing despite .agora/ existing",
        },
      }),
    );
  }
  const state = stateResult.value;
  const currentAlignmentPhase = state.alignment?.phase ?? 0;
  if (currentAlignmentPhase < 2) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Form round requires alignment.phase >= 2 (telos completed). Currently ${String(currentAlignmentPhase)}.`,
        },
      }),
    );
  }

  // Stage 6-A.31: refuse --json mode (clack TUI bytes garble JSON).
  if (flags.json) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "agora form is interactive (Aristotle interview). --json driver pending; provide pre-built four_causes.json directly to skip.",
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.form.intro")));
  log.message(localized("cli.form.context_summary", { telos: existingCauses.telos.statement }));

  let runtime: Awaited<ReturnType<typeof selectRuntime>>;
  try {
    runtime = await selectRuntime(cwd);
  } catch (e) {
    return err(
      buildAgoraError("llm.no-runner-available", {
        context: { detail: e instanceof Error ? e.message : String(e) },
      }),
    );
  }

  const ui = buildClackUi();
  const formResult = await runAristotleFormRound(
    {
      telos_statement: existingCauses.telos.statement,
      ...(defendedFrame !== null && defendedFrame.chosen_form.length > 0
        ? { defended_frame_chosen_form: defendedFrame.chosen_form }
        : {}),
      current_round: (state.alignment?.round ?? 0) + 1,
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!formResult.ok) return formResult;
  const form = formResult.value;

  // Persist FourCauses (telos preserved + form added).
  const now = new Date().toISOString();
  const causes: FourCauses = FourCausesSchema.parse({
    telos: existingCauses.telos,
    form,
    created_at: existingCauses.created_at,
    updated_at: now,
  });
  await writeJsonAtomic(fourCausesPath, causes);

  // Advance state: alignment.phase stays at 2; round 1 → 2 (form just done).
  const advanced = await saveState(
    cwd,
    {
      ...state,
      alignment: { phase: 2, round: 2 },
    },
    "agora form",
  );
  if (!advanced.ok) return advanced;

  outro(pc.green("✓ Form captured. .agora/four_causes.json updated."));

  return ok(buildEnvelope(form));
}

function buildClackUi(): AristotleFormUi {
  return {
    askEssentialStructure: ({ telos_statement }) =>
      askText(
        localized("cli.form.q_essential_structure", { telos: telos_statement }),
        "single-page CRUD with offline sync / CLI with subcommand-per-cause / ...",
      ),
    askIrreduciblePartsList: () =>
      askText(localized("cli.form.q_irreducible_parts"), "comma-separated list"),
    askFeatureListRefinement: async ({ detected, reason }) => {
      log.warn(localized("cli.form.feature_list_warning", { detected, reason }));
      return askText(
        localized("cli.form.q_feature_list_refinement"),
        "What's the structural shape, not the catalog?",
      );
    },
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(form: FormClaim): CommandEnvelope {
  return {
    command: "agora form",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data: { form } },
    next: [
      {
        id: "phase_2_material_pending",
        description: "Continue Phase 2 — material round (Aristotle) — not yet implemented",
        command: "agora resume",
      },
    ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}
