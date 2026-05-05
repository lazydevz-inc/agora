// SPEC: docs/cli/spec.md (no per-command anchor — `maturity` joins the
//       philosopher shortcut family; Y2 prerequisite per
//       docs/loops/alignment-loop.md L1500-1550) +
//       docs/philosophers/runbooks/plato.md §4.1 (DL).
//
// `agora maturity` — interactive Plato Divided Line maturity tagging
// for all 4 captured Aristotle causes. Runs the Noesis test on each
// cause's primary claim; tags maturity; updates four_causes.json with
// new maturity values + rejected_alternatives where Noesis was achieved.
//
// State transitions:
//   - All 4 pass required floors → state.current_phase: in_alignment
//     → alignment_complete (Y2 termination ready). state.alignment.round
//     advances to 5 (maturity round done).
//   - Any fail → state stays in_alignment. failing_causes recorded in
//     .agora/maturity.json. User re-runs the failing cause's command.

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import {
  type EfficientClaim,
  type FormClaim,
  type FourCauses,
  FourCausesSchema,
  type MaterialClaim,
  type TelosClaim,
} from "../../philosophers/aristotle.js";
import {
  type CauseField,
  type PlatoMaturityResult,
  type PlatoUi,
  REQUIRED_FLOORS,
  runPlatoMaturityForAllCauses,
} from "../../philosophers/plato.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runMaturityCommand(
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

  const fourCausesPath = join(cwd, ".agora", "four_causes.json");
  const existingCauses = await readJsonOrNull<FourCauses>(fourCausesPath);
  if (
    existingCauses === null ||
    existingCauses.telos === undefined ||
    existingCauses.form === undefined ||
    existingCauses.material === undefined ||
    existingCauses.efficient === undefined
  ) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "Maturity tagging requires all 4 Aristotle causes captured first. Run `agora telos`, `agora form`, `agora material`, `agora efficient`.",
        },
      }),
    );
  }

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
  const currentRound = state.alignment?.round ?? 0;
  if (currentRound < 4) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Maturity tagging requires alignment.round >= 4 (all 4 causes done). Currently ${String(currentRound)}.`,
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.maturity.intro")));
  log.message(localized("cli.maturity.context_summary"));

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
  const maturityResult = await runPlatoMaturityForAllCauses(
    {
      causes: [
        { field_path: "telos", claim_content: existingCauses.telos.statement },
        { field_path: "form", claim_content: existingCauses.form.essential_structure },
        {
          field_path: "material",
          claim_content: `tech_stack=[${existingCauses.material.tech_stack.join(", ")}], data_shape=${existingCauses.material.data_shape}`,
        },
        {
          field_path: "efficient",
          claim_content: `who=${existingCauses.efficient.who}, when=${existingCauses.efficient.when}, how=${existingCauses.efficient.how}`,
        },
      ],
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!maturityResult.ok) return maturityResult;
  const result = maturityResult.value;

  // Apply tagged maturity back to FourCauses.
  const updatedCauses: FourCauses = FourCausesSchema.parse({
    telos: applyTelosMaturity(existingCauses.telos, result),
    form: applyFormMaturity(existingCauses.form, result),
    material: applyMaterialMaturity(existingCauses.material, result),
    efficient: applyEfficientMaturity(existingCauses.efficient, result),
    created_at: existingCauses.created_at,
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(fourCausesPath, updatedCauses);
  await writeJsonAtomic(join(cwd, ".agora", "maturity.json"), result);

  // State transition: all-pass → alignment_complete (Y2 termination ready).
  // Otherwise stay in_alignment, record failing causes for next agora resume.
  const newPhase = result.all_passed ? ("alignment_complete" as const) : state.current_phase;
  const advanced = await saveState(
    cwd,
    {
      ...state,
      current_phase: newPhase,
      alignment: { phase: 2, round: 5 },
    },
    "agora maturity",
  );
  if (!advanced.ok) return advanced;

  if (result.all_passed) {
    outro(
      pc.green(
        "✓ All 4 causes pass maturity floors. Y2 termination ready. Phase → alignment_complete.",
      ),
    );
  } else {
    outro(
      pc.yellow(
        `⚠ ${String(result.failing_causes.length)} cause(s) below floor: ${result.failing_causes.join(", ")}. Re-run those causes to refine.`,
      ),
    );
  }

  return ok(buildEnvelope(result));
}

function applyTelosMaturity(telos: TelosClaim, result: PlatoMaturityResult): TelosClaim {
  const tagged = result.per_cause.find((c) => c.field_path === "telos");
  if (tagged === undefined) return telos;
  return { ...telos, maturity: tagged.tagged_maturity };
}
function applyFormMaturity(form: FormClaim, result: PlatoMaturityResult): FormClaim {
  const tagged = result.per_cause.find((c) => c.field_path === "form");
  if (tagged === undefined) return form;
  return { ...form, maturity: tagged.tagged_maturity };
}
function applyMaterialMaturity(
  material: MaterialClaim,
  result: PlatoMaturityResult,
): MaterialClaim {
  const tagged = result.per_cause.find((c) => c.field_path === "material");
  if (tagged === undefined) return material;
  return { ...material, maturity: tagged.tagged_maturity };
}
function applyEfficientMaturity(
  efficient: EfficientClaim,
  result: PlatoMaturityResult,
): EfficientClaim {
  const tagged = result.per_cause.find((c) => c.field_path === "efficient");
  if (tagged === undefined) return efficient;
  return { ...efficient, maturity: tagged.tagged_maturity };
}

function buildClackUi(): PlatoUi {
  return {
    askNoesisTest: ({ field_path, claim_content, required_floor }) =>
      askText(
        localized("cli.maturity.q_noesis_test", {
          field_path,
          claim_content,
          required_floor,
        }),
        "alternative considered + why rejected",
      ),
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(result: PlatoMaturityResult): CommandEnvelope {
  const nextSuggestions = result.all_passed
    ? [
        {
          id: "handoff_pending",
          description: "Y2 ready; handoff (Plato Dihairesis) not yet implemented",
          command: "agora resume",
        },
      ]
    : result.failing_causes.map((cf: CauseField) => ({
        id: `reloop_${cf}`,
        description: `Re-run ${cf} to refine (current floor: ${REQUIRED_FLOORS[cf]})`,
        command: `agora ${cf}`,
      }));
  return {
    command: "agora maturity",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data: { maturity: result } },
    next: nextSuggestions,
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}

function getAgoraVersion(): string {
  try {
    const url = new URL("../../../package.json", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
