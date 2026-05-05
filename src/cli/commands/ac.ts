// SPEC: docs/cli/spec.md (no per-command anchor — `ac` joins the
//       philosopher / phase shortcut family) +
//       docs/loops/alignment-loop.md (seed.acceptance_criteria) +
//       docs/philosophers/runbooks/plato.md §5 (DH input shape).
//
// `agora ac` — interactive Acceptance Criteria capture. Runs ONLY
// after maturity tagging passes (state.current_phase ===
// "alignment_complete"). Reads telos + form for context, asks the
// user for free-text AC list, LLM extracts structured
// AcceptanceCriterion[] (split compounds, dedup, normalize), persists
// .agora/acceptance_criteria.json, leaves state.current_phase as
// "alignment_complete" (handoff slice owns the in_handoff transition),
// advances state.alignment.round 5 → 6.
//
// Refusal guards (4):
//   - no .agora/ → user.aborted (exit 2)
//   - state.current_phase !== "alignment_complete" → user.aborted
//     (run agora maturity first; all 4 causes must pass floors)
//   - missing telos/form in four_causes.json → user.aborted (state
//     should be self-consistent at alignment_complete; this is a
//     defensive check)
//   - acceptance_criteria.json already present → user.confirmation-
//     required (over-AC guard; user removes file or runs handoff)

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import {
  type AcCaptureUi,
  type AcceptanceCriteriaResult,
  runAcCapture,
} from "../../alignment/acceptance-criteria.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import type { FourCauses } from "../../philosophers/aristotle.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runAcCommand(
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
  if (state.current_phase !== "alignment_complete") {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `AC capture requires maturity-pass first (current_phase=${state.current_phase}, expected alignment_complete). Run \`agora maturity\` until all 4 causes pass floors.`,
        },
      }),
    );
  }

  const fourCausesPath = join(cwd, ".agora", "four_causes.json");
  const causes = await readJsonOrNull<FourCauses>(fourCausesPath);
  if (causes === null || causes.telos === undefined || causes.form === undefined) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: fourCausesPath,
          detail:
            "alignment_complete state but four_causes.json missing telos+form (defensive check).",
        },
      }),
    );
  }

  const acsPath = join(cwd, ".agora", "acceptance_criteria.json");
  const existingAcs = await readJsonOrNull<AcceptanceCriteriaResult>(acsPath);
  if (existingAcs !== null) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Acceptance criteria already captured (acceptance_criteria.json present). Remove .agora/acceptance_criteria.json to re-run, or run \`agora resume\` for handoff.`,
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.ac.intro")));
  log.message(localized("cli.ac.context_summary"));

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
  const acResult = await runAcCapture(
    {
      telos_statement: causes.telos.statement,
      form_essential_structure: causes.form.essential_structure,
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!acResult.ok) return acResult;
  const result = acResult.value;

  await writeJsonAtomic(acsPath, result);

  // State: alignment.phase stays at 2 (alignment phase); round 5 → 6
  // (AC capture done). current_phase remains alignment_complete; handoff
  // slice owns the in_handoff transition.
  const advanced = await saveState(cwd, {
    ...state,
    alignment: { phase: 2, round: 6 },
  });
  if (!advanced.ok) return advanced;

  outro(
    pc.green(
      `✓ ${String(result.criteria.length)} acceptance criteria captured. .agora/acceptance_criteria.json written. Ready for handoff (Plato Dihairesis).`,
    ),
  );

  return ok(buildEnvelope(result));
}

function buildClackUi(): AcCaptureUi {
  return {
    askAcsList: ({ telos, form }) =>
      askText(
        localized("cli.ac.q_acs_list", { telos, form }),
        "List ACs (one per line, or comma-separated)",
      ),
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(result: AcceptanceCriteriaResult): CommandEnvelope {
  return {
    command: "agora ac",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data: { acceptance_criteria: result } },
    next: [
      {
        id: "handoff_pending",
        description: "AC captured; handoff (Plato Dihairesis + ac_tree) not yet implemented",
        command: "agora resume",
      },
    ],
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
