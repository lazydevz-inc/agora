// SPEC: docs/cli/spec.md + docs/loops/alignment-loop.md (Phase −1 wiring).
//
// `agora bracket [intent]` — runs Husserl Phase −1 Epoché.
// - Reads .agora/scan.json (created by `agora new`)
// - Asks for raw_intent (positional or interactive)
// - Asks for raw_experience (interactive — Husserl-specific)
// - Calls runHusserlPhaseMinusOne with real ClaudeRunner + @clack/prompts adapter
// - Saves DefendedFrame to .agora/defended_frame.json
// - Updates state.json: alignment.phase → -1 (bracket complete; ready for Phase 1)

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { type Phase0Output, runPhase0Scan } from "../../alignment/phase-0-scan.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import { type HusserlUi, runHusserlPhaseMinusOne } from "../../philosophers/husserl.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runBracketCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  if (!(await hasAgoraDir(cwd))) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: "No Agora session in this directory. Run `agora new <name>` first.",
        },
      }),
    );
  }

  // Phase 0 scan: prefer cached scan.json, else re-run.
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

  const intent = positional.length > 0 ? positional.join(" ") : null;
  intro(pc.bold(localized("cli.bracket.intro")));

  const rawIntent = intent ?? (await askText(localized("cli.bracket.ask_intent"), "I want to..."));
  if (rawIntent.trim().length === 0) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "Empty intent — bracketing skipped." },
      }),
    );
  }

  const rawExperience = await askText(
    localized("cli.bracket.ask_experience"),
    "What were you doing/feeling/needing right before reaching for a tool?",
  );

  log.message(localized("cli.bracket.constructing"));

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

  const ui: HusserlUi = {
    askDefense: async ({ bracketLabel, alternative, questionText }) => {
      log.info(`${pc.bold(`${bracketLabel} bracket`)} — alternative: ${pc.cyan(alternative)}`);
      return askText(questionText, "Why isn't that what you actually want?");
    },
    askFollowupOnShortDefense: async ({ defense }) => {
      log.warn(`${pc.dim(`Defense was brief (${defense.length} chars).`)}`);
      return askText(
        "That was quick — what made the alternative obviously wrong?",
        "More specific reasoning here",
      );
    },
    askSurprisingFindings: () =>
      askText(
        localized("cli.bracket.ask_surprising"),
        "Was there a moment where you noticed an assumption you didn't know you had?",
      ),
  };

  const husserlInput = {
    raw_intent: rawIntent,
    cwd_signal: scan,
    invocation: "explicit_bracket" as const,
    locale: flags.locale,
    ...(rawExperience.trim().length > 0 ? { raw_experience: rawExperience } : {}),
  };
  const husserlResult = await runHusserlPhaseMinusOne(husserlInput, runtime.runner, ui);
  await runtime.cache.flush();
  if (!husserlResult.ok) return husserlResult;
  const frame = husserlResult.value;

  // Persist DefendedFrame.
  await writeJsonAtomic(join(cwd, ".agora", "defended_frame.json"), frame);

  // Advance state: bracket done → alignment.phase: -1 (Husserl complete; Phase 0
  // scan was already done in `agora new`, so next step is Phase 1 intake).
  const advanced = await saveState(
    cwd,
    {
      ...state,
      alignment: { phase: -1, round: state.alignment?.round ?? 0 },
    },
    "agora bracket",
  );
  if (!advanced.ok) return advanced;

  outro(pc.green("✓ Bracketing complete. .agora/defended_frame.json written."));

  return ok(buildEnvelope(frame));
}

async function askText(question: string, placeholder: string): Promise<string> {
  const response = await text({ message: question, placeholder });
  if (typeof response !== "string") return "";
  return response;
}

function buildEnvelope(
  frame: import("../../philosophers/husserl.js").DefendedFrame,
): CommandEnvelope {
  return {
    command: "agora bracket",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { defended_frame: frame },
    },
    next: [
      {
        id: "phase_1_intake",
        description: "Continue to Phase 1 open intake",
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
