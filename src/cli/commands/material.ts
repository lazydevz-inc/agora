// SPEC: docs/cli/spec.md (no per-command anchor — `material` joins the
//       bracket / intake / telos / form shortcut family) +
//       docs/loops/alignment-loop.md Phase 2 + docs/philosophers/runbooks/
//       aristotle.md §4.3.
//
// `agora material` — interactive Aristotle material round (Phase 2,
// round 3). Runs after telos + form. Reads scan + state + four_causes
// + optional defended_frame, drives 3-question dialogue (brownfield
// auto-fill from scan.detected_stack per runbook §4.3 R3-A), persists
// FourCauses.material to .agora/four_causes.json, and advances state.
// alignment to { phase: 2, round: 3 }.

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import {
  type AristotleMaterialUi,
  type FourCauses,
  FourCausesSchema,
  type MaterialClaim,
  runAristotleMaterialRound,
} from "../../philosophers/aristotle.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runMaterialCommand(
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
    existingCauses.form === undefined
  ) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "Material round requires telos + form first. Run `agora telos` and `agora form` to capture them.",
        },
      }),
    );
  }
  if (existingCauses.material !== undefined) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Material already captured (four_causes.json present with material populated). Remove .agora/four_causes.json to re-run, or run \`agora resume\` to continue from efficient.`,
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
        context: {
          file: join(cwd, ".agora", "state.json"),
          detail: "state.json missing despite .agora/ existing",
        },
      }),
    );
  }
  const state = stateResult.value;
  const currentAlignmentPhase = state.alignment?.phase ?? 0;
  const currentRound = state.alignment?.round ?? 0;
  if (currentAlignmentPhase < 2 || currentRound < 2) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Material round requires alignment.phase >= 2 and round >= 2 (form completed). Currently phase=${String(currentAlignmentPhase)} round=${String(currentRound)}.`,
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
            "agora material is interactive (Aristotle interview). --json driver pending; provide pre-built four_causes.json directly to skip.",
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.material.intro")));
  log.message(
    localized("cli.material.context_summary", {
      stack_count: String(scan.detected_stack.length),
      project_type: scan.is_brownfield ? "brownfield" : "greenfield",
    }),
  );

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
  const materialResult = await runAristotleMaterialRound(
    {
      telos_statement: existingCauses.telos.statement,
      ...(existingCauses.form.essential_structure.length > 0
        ? { form_essential_structure: existingCauses.form.essential_structure }
        : {}),
      detected_stack: scan.detected_stack,
      is_brownfield: scan.is_brownfield,
      current_round: currentRound + 1,
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!materialResult.ok) return materialResult;
  const material = materialResult.value;

  const now = new Date().toISOString();
  const causes: FourCauses = FourCausesSchema.parse({
    telos: existingCauses.telos,
    form: existingCauses.form,
    material,
    created_at: existingCauses.created_at,
    updated_at: now,
  });
  await writeJsonAtomic(fourCausesPath, causes);

  const advanced = await saveState(
    cwd,
    {
      ...state,
      alignment: { phase: 2, round: 3 },
    },
    "agora material",
  );
  if (!advanced.ok) return advanced;

  outro(pc.green("✓ Material captured. .agora/four_causes.json updated."));

  return ok(buildEnvelope(material));
}

function buildClackUi(): AristotleMaterialUi {
  return {
    askConfirmDetectedStack: ({ detected }) =>
      askText(
        localized("cli.material.q_confirm_stack", {
          detected: detected.slice(0, 10).join(", "),
        }),
        "type 'ok' to accept, or list additions/removals",
      ),
    askTechStackFromScratch: () =>
      askText(
        localized("cli.material.q_tech_stack_fresh"),
        "language, framework, key libs (comma-separated)",
      ),
    askDataShape: () => askText(localized("cli.material.q_data_shape"), "one paragraph"),
    askInfrastructure: () => askText(localized("cli.material.q_infrastructure"), "where it runs"),
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(material: MaterialClaim): CommandEnvelope {
  return {
    command: "agora material",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data: { material } },
    next: [
      {
        id: "phase_2_efficient_pending",
        description: "Continue Phase 2 — efficient round (Aristotle) — not yet implemented",
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
