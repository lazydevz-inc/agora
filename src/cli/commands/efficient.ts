// SPEC: docs/cli/spec.md (no per-command anchor — `efficient` joins the
//       bracket / intake / telos / form / material shortcut family) +
//       docs/loops/alignment-loop.md Phase 2 + docs/philosophers/runbooks/
//       aristotle.md §4.4.
//
// `agora efficient` — interactive Aristotle efficient round (Phase 2,
// round 4 — final Aristotle cause). Captures who/when/how. Lightest
// of the four causes; pistis is the floor. Completes Aristotle's Phase
// 2 contribution. After this slice, all 4 causes exist; Plato (future
// slice) tags maturity for Y2 termination.

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import {
  type AristotleEfficientUi,
  type EfficientClaim,
  type FourCauses,
  FourCausesSchema,
  runAristotleEfficientRound,
} from "../../philosophers/aristotle.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runEfficientCommand(
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
    existingCauses.material === undefined
  ) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "Efficient round requires telos + form + material first. Run `agora telos`, `agora form`, then `agora material`.",
        },
      }),
    );
  }
  if (existingCauses.efficient !== undefined) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Efficient already captured (four_causes.json present with all 4 causes). Remove .agora/four_causes.json to re-run, or run \`agora resume\` for next phase.`,
        },
      }),
    );
  }

  const scanPath = join(cwd, ".agora", "scan.json");
  let scan = await readJsonOrNull<Phase0Output>(scanPath);
  if (scan === null) {
    scan = await runPhase0Scan(cwd);
    await writeJsonAtomic(scanPath, scan);
  }

  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  if (stateResult.value === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: { detail: "state.json missing despite .agora/ existing" },
      }),
    );
  }
  const state = stateResult.value;
  const currentAlignmentPhase = state.alignment?.phase ?? 0;
  const currentRound = state.alignment?.round ?? 0;
  if (currentAlignmentPhase < 2 || currentRound < 3) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Efficient round requires alignment.phase >= 2 and round >= 3 (material completed). Currently phase=${String(currentAlignmentPhase)} round=${String(currentRound)}.`,
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.efficient.intro")));

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
  const efficientResult = await runAristotleEfficientRound(
    {
      telos_statement: existingCauses.telos.statement,
      ...(existingCauses.form.essential_structure.length > 0
        ? { form_essential_structure: existingCauses.form.essential_structure }
        : {}),
      ...(existingCauses.material.tech_stack.length > 0
        ? { material_tech_stack: existingCauses.material.tech_stack }
        : {}),
      detected_patterns: scan.detected_patterns,
      current_round: currentRound + 1,
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!efficientResult.ok) return efficientResult;
  const efficient = efficientResult.value;

  const now = new Date().toISOString();
  const causes: FourCauses = FourCausesSchema.parse({
    telos: existingCauses.telos,
    form: existingCauses.form,
    material: existingCauses.material,
    efficient,
    created_at: existingCauses.created_at,
    updated_at: now,
  });
  await writeJsonAtomic(fourCausesPath, causes);

  // alignment.phase stays at 2; round 3 → 4 (all 4 Aristotle causes done).
  const advanced = await saveState(cwd, {
    ...state,
    alignment: { phase: 2, round: 4 },
  });
  if (!advanced.ok) return advanced;

  outro(
    pc.green(
      "✓ Efficient captured. All 4 Aristotle causes complete. .agora/four_causes.json updated.",
    ),
  );

  return ok(buildEnvelope(efficient));
}

function buildClackUi(): AristotleEfficientUi {
  return {
    askWho: () => askText(localized("cli.efficient.q_who"), "solo / team of N / Sang + 1 reviewer"),
    askWhen: () =>
      askText(
        localized("cli.efficient.q_when"),
        "evenings, 30 min sessions / full-time, 2-week sprints",
      ),
    askHow: () =>
      askText(
        localized("cli.efficient.q_how"),
        "TDD with vitest, deploy on push / Linear tickets, branches per cause",
      ),
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(efficient: EfficientClaim): CommandEnvelope {
  return {
    command: "agora efficient",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data: { efficient } },
    next: [
      {
        id: "phase_2_complete_pending_plato",
        description:
          "All 4 Aristotle causes complete; Plato Y2 maturity tagging next (not yet implemented)",
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
