// SPEC: docs/cli/spec.md (no per-command anchor — `telos` is a power-user
//       shortcut analogous to bracket / intake) +
//       docs/loops/alignment-loop.md Phase 2 + Stage 2-A.5 telos-first.
//
// `agora telos` — interactive Aristotle telos round (Phase 2, round 1).
// Reads scan + state + intake.json (and optional defended_frame.json),
// drives the @clack/prompts dialogue (3 telos questions + optional
// noun-phrase refinement), persists FourCauses (telos populated only)
// to .agora/four_causes.json, and advances state.alignment to
// { phase: 2, round: 1 }.
//
// Refuses if:
//   - no .agora/ (run agora new)
//   - no .agora/intake.json (run agora intake first; telos needs intake
//     as Aristotle's input per runbook §4.1 user prompt template)
//   - alignment.phase >= 2 AND telos already in four_causes.json (no
//     over-telos; user re-runs intake or removes four_causes.json to
//     repeat)

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import type { Phase1Result } from "../../alignment/phase-1-intake.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import {
  type AristotleUi,
  type FourCauses,
  FourCausesSchema,
  runAristotleTelosRound,
  type TelosClaim,
} from "../../philosophers/aristotle.js";
import type { DefendedFrame } from "../../philosophers/husserl.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runTelosCommand(
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

  // Phase 1 intake is required input.
  const intakePath = join(cwd, ".agora", "intake.json");
  const intake = await readJsonOrNull<Phase1Result>(intakePath);
  if (intake === null) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "Phase 1 intake required for telos round. Run `agora intake` first to capture raw context.",
        },
      }),
    );
  }

  // Load Phase 0 scan (for cwd_signal context) and optional bracket frame.
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

  // Telos round runs once per session; re-running requires explicit reset.
  const fourCausesPath = join(cwd, ".agora", "four_causes.json");
  const existingCauses = await readJsonOrNull<FourCauses>(fourCausesPath);
  if (existingCauses?.telos !== undefined) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Telos already captured (four_causes.json present with telos populated). Remove .agora/four_causes.json to re-run, or run \`agora resume\` to continue from the next cause.`,
        },
      }),
    );
  }
  if (currentAlignmentPhase < 1) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Telos round requires Phase 1 intake first (alignment.phase=${String(currentAlignmentPhase)} < 1). Run \`agora intake\`.`,
        },
      }),
    );
  }

  intro(pc.bold(localized("cli.telos.intro")));
  log.message(
    localized("cli.telos.context_summary", { word_count: String(intake.intake_word_count) }),
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
  const telosResult = await runAristotleTelosRound(
    {
      raw_intake: intake.raw_intake,
      ...(defendedFrame !== null && defendedFrame.chosen_form.length > 0
        ? { defended_frame_chosen_form: defendedFrame.chosen_form }
        : {}),
      current_round: (state.alignment?.round ?? 0) + 1,
    },
    runtime.runner,
    ui,
  );
  await runtime.cache.flush();
  if (!telosResult.ok) return telosResult;
  const telos = telosResult.value;

  // Persist FourCauses (telos populated; other causes future slices).
  const now = new Date().toISOString();
  const causes: FourCauses = FourCausesSchema.parse({
    telos,
    created_at: existingCauses?.created_at ?? now,
    updated_at: now,
  });
  await writeJsonAtomic(fourCausesPath, causes);

  // Advance state: alignment.phase → 2 (Phase 2 active), round = 1
  // (first telos round just completed).
  const advanced = await saveState(
    cwd,
    {
      ...state,
      alignment: { phase: 2, round: 1 },
    },
    "agora telos",
  );
  if (!advanced.ok) return advanced;

  outro(pc.green("✓ Telos captured. .agora/four_causes.json written."));

  return ok(buildEnvelope(telos));
}

function buildClackUi(): AristotleUi {
  return {
    askWhyExists: () => askText(localized("cli.telos.q_why_exists"), "Because I want to..."),
    askServedGood: () =>
      askText(localized("cli.telos.q_served_good"), "Name the goodness, not the activity"),
    askFailureSignal: () =>
      askText(localized("cli.telos.q_failure_signal"), "After N months, I notice..."),
    askNounPhraseRefinement: async ({ detected, reason }) => {
      log.warn(localized("cli.telos.noun_phrase_warning", { detected, reason }));
      return askText(
        localized("cli.telos.q_noun_phrase_refinement"),
        "What good does {detected} serve?".replace("{detected}", detected),
      );
    },
  };
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(telos: TelosClaim): CommandEnvelope {
  return {
    command: "agora telos",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { telos },
    },
    next: [
      {
        id: "phase_2_form_pending",
        description: "Continue Phase 2 — form round (Aristotle) — not yet implemented",
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
