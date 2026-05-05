// SPEC: docs/cli/spec.md Stage 3-B.5 — `agora resume` phase orchestrator.
//
// Single dispatcher keyed on state.current_phase per Stage 2-C.3 R1-A.
// 8-phase enum (in_alignment / in_alignment_paused / alignment_complete /
// in_handoff / ready_for_ralph / in_ralph / in_ralph_paused / ralph_complete).
//
// In Stage 6-A.7 only `in_alignment` (+ paused alias) has a real handler:
// it inspects state.alignment.phase (-1/0/1/2) and points the user to the
// next concrete command.  The 6 downstream phases (alignment_complete /
// in_handoff / ready_for_ralph / in_ralph / in_ralph_paused / ralph_complete)
// receive a "deferred dispatch" envelope per R3-A: the phase is recognized,
// the SPEC mockup is acknowledged, but the orchestrator/handoff/ralph
// runtime is not yet implemented and the user is told which slice will
// activate it.  exit_code stays 0 — silent override (F-Aquinas-4) is what
// we are guarding against, not informative defer.
//
// Non-interactive --auto-progress / --ralph-complete-action flags
// (Stage 3-B.5 R1-A non-TTY paths) are intentionally not added here:
// every actionable phase they would target is itself deferred, so adding
// the flags now would be dead surface area.  See NOTES Outstanding.

import { join } from "node:path";

import { intro, log, outro, select } from "@clack/prompts";
import pc from "picocolors";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { Seed } from "../../handoff/seed-builder.js";
import { localized } from "../../i18n/index.js";
import {
  aggregateRalphStats,
  type RalphSessionStats,
  renderStatsTable,
} from "../../ralph/end-state.js";
import { type RalphState, RalphStateSchema } from "../../ralph/state.js";
import { err, ok, type Result } from "../../result/index.js";
import { appendEvent } from "../../shared/events.js";
import { readJsonOrNull } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import type { Phase, State } from "../../state/types.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope, NextSuggestion } from "../render.js";

interface DispatchOutcome {
  readonly previous_phase: Phase | null;
  readonly new_phase: Phase | null;
  readonly handler: "no_session" | "in_alignment" | "deferred";
  readonly deferred_reason?: string;
  readonly alignment_phase?: number;
  readonly next: readonly NextSuggestion[];
  readonly tui_lines: readonly string[];
}

export async function runResumeCommand(
  flags: GlobalFlags,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  if (!(await hasAgoraDir(cwd))) {
    const outcome = buildNoSessionOutcome();
    if (!flags.json) emitTui(outcome);
    return ok(buildEnvelope(outcome, 1));
  }

  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult; // exit 20 via state.corrupt
  const state = stateResult.value;

  if (state === null) {
    const outcome = buildNoSessionOutcome();
    if (!flags.json) emitTui(outcome);
    return ok(buildEnvelope(outcome, 1));
  }

  // ralph_complete state has interactive dialog (Stage 2-C.2 R4-A) in
  // TUI mode. JSON mode falls through to deferred dispatch (envelope-
  // only; non-interactive driver per Outstanding).
  if (state.current_phase === "ralph_complete" && !flags.json) {
    return await handleRalphComplete(cwd, state);
  }

  const outcome = dispatch(state);
  if (!flags.json) emitTui(outcome);
  return ok(buildEnvelope(outcome, 0));
}

function dispatch(state: State): DispatchOutcome {
  switch (state.current_phase) {
    case "in_alignment":
    case "in_alignment_paused":
      return buildAlignmentOutcome(state);
    case "alignment_complete":
      // Y2 passed. Next step is AC capture (then handoff). agora round
      // routes to ac if not yet captured, or shows complete if it has been.
      return buildDeferredOutcome(
        state.current_phase,
        "ac_capture_or_handoff_pending",
        "agora round",
      );
    case "in_handoff":
      // in_handoff is currently unreachable (R4-A in 6-A.17 skipped this
      // intermediate phase); kept here for forward-compat. Hint at the
      // handoff command in case state was set externally.
      return buildDeferredOutcome(
        state.current_phase,
        "handoff_intermediate_unreachable_in_v1",
        "agora handoff",
      );
    case "ready_for_ralph":
    case "in_ralph":
    case "in_ralph_paused":
      // Ralph foundation is live (6-A.18). Direct routing to agora ralph.
      return buildDeferredOutcome(state.current_phase, "ralph_iteration_pending", "agora ralph");
    case "ralph_complete":
      // TUI mode handled by handleRalphComplete (interactive 3-option
      // dialog per Stage 2-C.2 R4-A). JSON mode falls here — non-
      // interactive ralph_complete actions (--accept-deferred /
      // --re-align) are future ergonomics.
      return buildDeferredOutcome(
        state.current_phase,
        "ralph_complete_json_mode_pending_non_interactive_flags",
        "agora resume (interactive TTY runs the dialog)",
      );
  }
}

function buildNoSessionOutcome(): DispatchOutcome {
  return {
    previous_phase: null,
    new_phase: null,
    handler: "no_session",
    next: [
      {
        id: "start_new",
        description: localized("cli.resume.next_start_new_desc"),
        command: "agora new <name>",
      },
      {
        id: "doctor",
        description: localized("cli.resume.next_doctor_desc"),
        command: "agora doctor",
      },
    ],
    tui_lines: [localized("cli.resume.no_session"), "", localized("cli.resume.suggest_new")],
  };
}

function buildAlignmentOutcome(state: State): DispatchOutcome {
  const ap = state.alignment?.phase ?? 0;
  const lines: string[] = [
    localized("cli.resume.resuming_alignment", { phase: state.current_phase }),
    localized("cli.resume.alignment_progress", {
      phase: String(ap),
      round: String(state.alignment?.round ?? 0),
    }),
    "",
  ];
  const next: NextSuggestion[] = [];

  if (ap === 0) {
    // Phase 0 just done by `agora new`; user has not yet bracketed.
    lines.push(localized("cli.resume.next_phase_minus_1"));
    lines.push(localized("cli.resume.next_phase_1_pending"));
    next.push({
      id: "bracket",
      description: localized("cli.resume.next_bracket_desc"),
      command: "agora bracket",
    });
    next.push({
      id: "intake_pending",
      description: localized("cli.resume.next_intake_desc"),
      command: "agora intake",
    });
  } else if (ap === -1) {
    // Husserl bracketed; intake is the next concrete step.
    lines.push(localized("cli.resume.bracket_done"));
    lines.push(localized("cli.resume.next_phase_1_pending"));
    next.push({
      id: "intake_pending",
      description: localized("cli.resume.next_intake_desc"),
      command: "agora intake",
    });
  } else if (ap === 1) {
    // Phase 1 intake done; telos round (Aristotle, Phase 2 round 1) is next.
    lines.push(localized("cli.resume.intake_done"));
    lines.push(localized("cli.resume.next_phase_2_telos"));
    next.push({
      id: "telos",
      description: localized("cli.resume.next_telos_desc"),
      command: "agora round",
    });
  } else if (ap === 2) {
    // Phase 2 in progress; round discriminates which Aristotle cause
    // to advance to next. round===1 = telos done → form. round===2 =
    // form done → material (pending). round>=3 = material/efficient
    // pending or seed nearly ready.
    const round = state.alignment?.round ?? 0;
    if (round === 1) {
      lines.push(localized("cli.resume.telos_done"));
      lines.push(localized("cli.resume.next_phase_2_form"));
      next.push({
        id: "form",
        description: localized("cli.resume.next_form_desc"),
        command: "agora round",
      });
    } else if (round === 2) {
      lines.push(localized("cli.resume.form_done"));
      lines.push(localized("cli.resume.next_phase_2_material"));
      next.push({
        id: "material",
        description: localized("cli.resume.next_material_desc"),
        command: "agora round",
      });
    } else if (round === 3) {
      lines.push(localized("cli.resume.material_done"));
      lines.push(localized("cli.resume.next_phase_2_efficient"));
      next.push({
        id: "efficient",
        description: localized("cli.resume.next_efficient_desc"),
        command: "agora round",
      });
    } else if (round === 4) {
      // All 4 Aristotle causes done; Plato Y2 maturity tagging next.
      lines.push(localized("cli.resume.efficient_done"));
      lines.push(localized("cli.resume.next_phase_2_maturity"));
      next.push({
        id: "maturity",
        description: localized("cli.resume.next_maturity_desc"),
        command: "agora round",
      });
    } else {
      // round >= 5 — Plato done. handoff (Dihairesis + ac_tree) next.
      lines.push(localized("cli.resume.maturity_done"));
      lines.push(localized("cli.resume.alignment_runtime_pending", { phase: String(ap) }));
      next.push({
        id: "alignment_runtime_pending",
        description: localized("cli.resume.next_alignment_runtime_desc"),
        command: `agora resume (TBD: Plato Dihairesis + handoff)`,
      });
    }
  } else {
    // ap > 2 — Plato termination gate / handoff not yet implemented.
    lines.push(localized("cli.resume.alignment_runtime_pending", { phase: String(ap) }));
    next.push({
      id: "alignment_runtime_pending",
      description: localized("cli.resume.next_alignment_runtime_desc"),
      command: `agora resume (TBD: Phase ${String(ap)} runtime)`,
    });
  }

  return {
    previous_phase: state.current_phase,
    new_phase: state.current_phase, // resume of in-progress alignment keeps phase
    handler: "in_alignment",
    alignment_phase: ap,
    next,
    tui_lines: lines,
  };
}

function buildDeferredOutcome(phase: Phase, reason: string, follow_up: string): DispatchOutcome {
  return {
    previous_phase: phase,
    new_phase: phase, // no transition: downstream not implemented
    handler: "deferred",
    deferred_reason: reason,
    next: [
      {
        id: "deferred_follow_up",
        description: localized("cli.resume.deferred_follow_up_desc", {
          phase,
        }),
        command: follow_up,
      },
    ],
    tui_lines: [localized("cli.resume.deferred_phase", { phase, follow_up })],
  };
}

function emitTui(outcome: DispatchOutcome): void {
  for (const line of outcome.tui_lines) {
    if (line === "") {
      console.log("");
      continue;
    }
    if (outcome.handler === "no_session" && outcome.tui_lines[0] === line) {
      console.log(pc.bold(line));
    } else {
      console.log(line);
    }
  }
}

function buildEnvelope(outcome: DispatchOutcome, exit_code: 0 | 1): CommandEnvelope {
  const data: Record<string, unknown> = {
    handler: outcome.handler,
    previous_phase: outcome.previous_phase,
    new_phase: outcome.new_phase,
    ...(outcome.deferred_reason !== undefined ? { deferred_reason: outcome.deferred_reason } : {}),
    ...(outcome.alignment_phase !== undefined ? { alignment_phase: outcome.alignment_phase } : {}),
  };
  return {
    command: "agora resume",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: { ok: true, data },
    next: outcome.next,
    warnings: [],
    errors: [],
    exit_code,
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

// ─── Ralph end-state interactive handler (Stage 6-A.22 R1-A) ───
//
// Invoked when state.current_phase === "ralph_complete" in TUI mode.
// Reads ralph_state + seed, aggregates stats, displays a 3-option
// dialog (re_align / accept_deferred / view_log) per Stage 2-C.2 R4-A.
// view_log loops back to the dialog. re_align transitions state to
// in_alignment + alignment.round=0 (preserves ralph_state.json so
// subsequent re-handoff + re-ralph can resume; user must clear
// .agora/seed.json + four_causes.json fields they want to re-align).
// accept_deferred prints final summary + leaves state at ralph_complete.

async function handleRalphComplete(
  cwd: string,
  state: State,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  // Load ralph_state.json — must exist if state is ralph_complete.
  const ralphStatePath = join(cwd, ".agora", "ralph_state.json");
  const ralphStateRaw = await readJsonOrNull<RalphState>(ralphStatePath);
  if (ralphStateRaw === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: ralphStatePath,
          detail: "current_phase=ralph_complete but ralph_state.json missing",
        },
      }),
    );
  }
  const parsedRalph = RalphStateSchema.safeParse(ralphStateRaw);
  if (!parsedRalph.success) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: ralphStatePath,
          detail: parsedRalph.error.issues[0]?.message ?? "ralph_state.json validation failed",
        },
      }),
    );
  }
  const ralphState = parsedRalph.data;

  // Load seed.json for ac_tree (defensive — should exist alongside ralph_state).
  const seedPath = join(cwd, ".agora", "seed.json");
  const seed = await readJsonOrNull<Seed>(seedPath);
  if (seed === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: seedPath,
          detail: "current_phase=ralph_complete but seed.json missing",
        },
      }),
    );
  }

  const stats = aggregateRalphStats(ralphState, seed.ac_tree);

  intro(pc.bold(localized("cli.resume.ralph_complete_intro")));
  log.message(
    localized("cli.resume.ralph_complete_summary", {
      completed: String(stats.completed_leaves),
      total: String(stats.total_leaves),
      iterations: String(stats.total_iterations),
    }),
  );

  // Loop until user picks re_align or accept_deferred.
  return await dialogLoop(cwd, state, stats);
}

async function dialogLoop(
  cwd: string,
  state: State,
  stats: RalphSessionStats,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  for (;;) {
    const choice = await select({
      message: localized("cli.resume.ralph_complete_dialog_message"),
      options: [
        {
          value: "accept_deferred" as const,
          label: localized("cli.resume.ralph_complete_option_accept"),
        },
        {
          value: "re_align" as const,
          label: localized("cli.resume.ralph_complete_option_realign"),
        },
        {
          value: "view_log" as const,
          label: localized("cli.resume.ralph_complete_option_view"),
        },
      ],
    });

    const choiceLabel =
      typeof choice === "string" ? choice : "cancelled_treated_as_accept_deferred";
    await appendEvent(cwd, {
      type: "dialog.choice",
      command: "agora resume",
      data: {
        dialog: "ralph_complete",
        choice: choiceLabel,
      },
    });

    if (choice === "view_log") {
      log.message(`\n${renderStatsTable(stats)}\n`);
      continue;
    }

    if (choice === "re_align") {
      const advanced = await saveState(
        cwd,
        {
          ...state,
          current_phase: "in_alignment",
          alignment: { phase: 2, round: 0 },
        },
        "agora resume",
      );
      if (!advanced.ok) return advanced;
      log.message(localized("cli.resume.ralph_complete_realign_instructions"));
      outro(pc.magenta(localized("cli.resume.ralph_complete_realign_outro")));
      return ok(buildRalphCompleteEnvelope("re_align", stats));
    }

    // accept_deferred (or clack cancel — treat cancel as accept).
    log.message(`\n${renderStatsTable(stats)}\n`);
    outro(pc.green(localized("cli.resume.ralph_complete_accept_outro")));
    return ok(buildRalphCompleteEnvelope("accept_deferred", stats));
  }
}

function buildRalphCompleteEnvelope(
  action: "re_align" | "accept_deferred",
  stats: RalphSessionStats,
): CommandEnvelope {
  return {
    command: "agora resume",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        handler: "ralph_complete_dialog",
        action,
        stats: stats as unknown as Record<string, unknown>,
      },
    },
    next:
      action === "re_align"
        ? [
            {
              id: "re_align_resume",
              description:
                "State reset to in_alignment. Edit/delete artifacts (four_causes.json, seed.json) to re-align, then run agora resume.",
              command: "agora resume",
            },
          ]
        : [
            {
              id: "session_complete",
              description: "Ralph session accepted. .agora/ retained as audit trail.",
              command: "agora status",
            },
          ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}
