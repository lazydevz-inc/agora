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
import { appendEvent } from "../../shared/events.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraSession } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runBracketCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  if (!(await hasAgoraSession(cwd))) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: "No Agora session in this directory. Run `agora new <name>` first.",
        },
      }),
    );
  }

  // Stage 6-A.29: --skip-bracket short-circuits the Husserl interview
  // by writing a minimal "bracketing skipped" DefendedFrame and
  // advancing state. Useful for CI/agent flows where the user has
  // explicitly opted out. Intent is still required (positional).
  const args = parseBracketArgs(positional);
  if (!args.ok) return args;
  const { skip, intentFromArgs } = args.value;

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

  if (skip) {
    if (intentFromArgs.length === 0) {
      return err(
        buildAgoraError("user.aborted", {
          context: {
            detail:
              '--skip-bracket requires intent as positional: `agora bracket --skip-bracket "my intent"`.',
          },
        }),
      );
    }
    return await skipBracket(cwd, state, intentFromArgs);
  }

  // Stage 6-A.29: refuse JSON mode for the interactive path. The
  // Husserl interview involves dynamic LLM-driven questions and
  // multi-turn defenses — there's no clean way to surface those over
  // a one-shot JSON envelope. Users in CI/agent contexts must opt in
  // via --skip-bracket.
  if (flags.json) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            'agora bracket is interactive in TTY mode. For --json, pass --skip-bracket "<intent>" to record an opted-out frame.',
        },
      }),
    );
  }

  const intent = intentFromArgs.length > 0 ? intentFromArgs : null;
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
  await appendEvent(cwd, {
    type: "bracket.captured",
    command: "agora bracket",
    data: {
      raw_intent_chars: frame.raw_intent.length,
      brackets_count: 3,
      surprising_findings_count: frame.surprising_findings.length,
      skipped: false,
    },
  });

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

interface BracketArgs {
  readonly skip: boolean;
  readonly intentFromArgs: string;
}

function parseBracketArgs(positional: readonly string[]): Result<BracketArgs, AgoraErrorThrown> {
  let skip = false;
  const intentParts: string[] = [];
  for (const arg of positional) {
    if (arg === "--skip-bracket") {
      skip = true;
      continue;
    }
    if (arg.startsWith("--")) {
      return err(
        buildAgoraError("user.forbidden-flag-combo", {
          context: {
            detail: `Unknown bracket argument: ${arg}. Supported: --skip-bracket; intent is positional.`,
          },
        }),
      );
    }
    intentParts.push(arg);
  }
  return ok({ skip, intentFromArgs: intentParts.join(" ") });
}

async function skipBracket(
  cwd: string,
  state: import("../../state/types.js").State,
  rawIntent: string,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  // Build a minimal frame marking that the user opted out. The chosen
  // form is the raw intent verbatim; defenses are empty placeholders
  // so downstream consumers can still parse the schema.
  const skippedDefense = {
    considered_alternative: "(skipped via --skip-bracket)",
    defense: "(no defense — user opted out of Husserl interview)",
    defense_followup_triggered: false,
  };
  const frame: import("../../philosophers/husserl.js").DefendedFrame = {
    raw_intent: rawIntent,
    chosen_form: rawIntent,
    brackets_considered: {
      software_bracket: skippedDefense,
      form_bracket: skippedDefense,
      audience_bracket: skippedDefense,
    },
    surprising_findings: [],
    invocation: "explicit_bracket",
    created_at: new Date().toISOString(),
  };
  await writeJsonAtomic(join(cwd, ".agora", "defended_frame.json"), frame);
  await appendEvent(cwd, {
    type: "bracket.captured",
    command: "agora bracket --skip-bracket",
    data: {
      raw_intent_chars: rawIntent.length,
      brackets_count: 0,
      surprising_findings_count: 0,
      skipped: true,
    },
  });
  const advanced = await saveState(
    cwd,
    {
      ...state,
      alignment: { phase: -1, round: state.alignment?.round ?? 0 },
    },
    "agora bracket --skip-bracket",
  );
  if (!advanced.ok) return advanced;
  return ok(buildEnvelope(frame));
}

function buildEnvelope(
  frame: import("../../philosophers/husserl.js").DefendedFrame,
): CommandEnvelope {
  return {
    command: "agora bracket",
    version: agoraVersion(),
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
