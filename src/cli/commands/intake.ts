// SPEC: docs/cli/spec.md (no per-command anchor — `intake` is a power-user
//       shortcut analogous to 6-A.6 `agora bracket`) +
//       docs/loops/alignment-loop.md (Phase 1 Open Intake).
//
// `agora intake` — interactive Phase 1 open intake. Reads scan.json +
// state.json from .agora/, drives the @clack/prompts dialogue, and
// persists Phase1Result to .agora/intake.json with state advanced to
// alignment.phase = 1. Refuses if .agora/ is missing OR alignment is
// already past Phase 1 (no over-intake).

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";
import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import {
  type IntakeUi,
  type Phase1Result,
  runPhase1Intake,
} from "../../alignment/phase-1-intake.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { err, ok, type Result } from "../../result/index.js";
import { openEditorAndRead } from "../../shared/editor.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { ensureAgoraDir, findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runIntakeCommand(
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

  // Load Phase 0 scan (cached or re-run).
  const scanPath = join(cwd, ".agora", "scan.json");
  let scan = await readJsonOrNull<Phase0Output>(scanPath);
  if (scan === null) {
    scan = await runPhase0Scan(cwd);
    await writeJsonAtomic(scanPath, scan);
  }

  // Load state — must exist with current_phase = "in_alignment".
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
  if (currentAlignmentPhase >= 1) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Phase 1 intake already complete (alignment.phase=${String(currentAlignmentPhase)}). Re-running would overwrite intake.json. Remove .agora/intake.json or run \`agora resume\` to continue from Phase 2.`,
        },
      }),
    );
  }

  // Compose locale-aware brownfield/greenfield prompt.
  const promptText = composeIntakePrompt(scan);
  const repromptText = localized("cli.intake.empty_reprompt");

  intro(pc.bold(localized("cli.intake.intro")));

  const ui = buildClackUi(cwd);
  const intakeResult = await runPhase1Intake(
    {
      promptText,
      emptyRepromptText: repromptText,
      classification: scan.is_brownfield ? "brownfield" : "greenfield",
    },
    ui,
  );
  if (!intakeResult.ok) return intakeResult;
  const phase1 = intakeResult.value;

  // Persist intake.json.
  await ensureAgoraDir(cwd);
  await writeJsonAtomic(join(cwd, ".agora", "intake.json"), phase1);

  // Advance state: alignment.phase: 0|-1 → 1.
  const advanced = await saveState(cwd, {
    ...state,
    alignment: { phase: 1, round: state.alignment?.round ?? 0 },
  });
  if (!advanced.ok) return advanced;

  outro(pc.green("✓ Phase 1 intake captured. .agora/intake.json written."));

  return ok(buildEnvelope(phase1));
}

function composeIntakePrompt(scan: Phase0Output): string {
  if (scan.is_brownfield) {
    const docHints: string[] = [];
    if (scan.detected_patterns.includes("uses_git")) docHints.push(".git");
    if (scan.detected_stack.length > 0) {
      docHints.push(`${String(scan.detected_stack.length)} deps`);
    }
    if (scan.detected_patterns.includes("has_src_dir")) docHints.push("src/");
    const docList = docHints.length > 0 ? docHints.join(", ") : "the project files";
    return localized("cli.intake.prompt_brownfield", { ingested_doc_list: docList });
  }
  return localized("cli.intake.prompt_greenfield");
}

function buildClackUi(cwd: string): IntakeUi {
  return {
    askInline: async (promptText: string) => {
      const response = await text({
        message: promptText,
        placeholder: "Press Enter alone to open $EDITOR",
      });
      if (typeof response !== "string") return "";
      return response;
    },
    openEditor: async () => {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const cachePath = join(cwd, ".agora", "cache", `intake-${ts}.md`);
      // ensureAgoraDir is called by command body; cache/ subdir on demand:
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(cwd, ".agora", "cache"), { recursive: true });
      const header = `<!--\n  Type your intake below. Save and exit when done.\n  - Lines starting with <!-- are ignored.\n  - Save empty to abort Phase 1.\n  - Press : (vim) or Ctrl-X (nano) to exit your editor.\n-->\n\n`;
      log.info(localized("cli.intake.editor_opening"));
      try {
        return await openEditorAndRead({ filePath: cachePath, initialContent: header });
      } catch {
        // editor unavailable or exited non-zero → treat as empty content;
        // orchestrator will trigger re-prompt path. This keeps UX fluid
        // even when editor invocation fails.
        return "";
      }
    },
    askReprompt: async (noticeText: string) => {
      log.warn(noticeText);
      const response = await text({
        message: localized("cli.intake.reprompt_short"),
        placeholder: "At least one sentence",
      });
      if (typeof response !== "string") return "";
      return response;
    },
    displaySoftCap: (byteSize: number) => {
      log.warn(localized("cli.intake.soft_cap_warning", { bytes: String(byteSize) }));
    },
    displayHardCap: (originalByteSize: number) => {
      log.warn(localized("cli.intake.hard_cap_truncated", { bytes: String(originalByteSize) }));
    },
    displayEcho: ({ wordCount, method, estimatedRounds }) => {
      log.success(
        localized("cli.intake.echo", {
          word_count: String(wordCount),
          method,
          estimated_rounds: estimatedRounds,
        }),
      );
    },
  };
}

function buildEnvelope(phase1: Phase1Result): CommandEnvelope {
  return {
    command: "agora intake",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { phase1_result: phase1 },
    },
    next: [
      {
        id: "phase_2_pending",
        description: "Phase 2 philosopher rounds — not yet implemented",
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
