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

import pc from "picocolors";

import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { ok, type Result } from "../../result/index.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import type { Phase, State } from "../../state/types.js";
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
      return buildDeferredOutcome(
        state.current_phase,
        "handoff_not_implemented",
        "agora handoff (TBD: Stage 2-C handoff slice)",
      );
    case "in_handoff":
      return buildDeferredOutcome(
        state.current_phase,
        "handoff_not_implemented",
        "agora handoff (TBD: Stage 2-C handoff slice)",
      );
    case "ready_for_ralph":
      return buildDeferredOutcome(
        state.current_phase,
        "ralph_not_implemented",
        "agora ralph (TBD: Stage 2-B Ralph slice)",
      );
    case "in_ralph":
    case "in_ralph_paused":
      return buildDeferredOutcome(
        state.current_phase,
        "ralph_not_implemented",
        "agora ralph (TBD: Stage 2-B Ralph slice)",
      );
    case "ralph_complete":
      return buildDeferredOutcome(
        state.current_phase,
        "ralph_complete_dialog_not_implemented",
        "agora ralph (TBD: ralph_complete dialog per Stage 2-C.2 R4-A)",
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
      command: "agora telos",
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
        command: "agora form",
      });
    } else {
      // round >= 2 — material/efficient + Plato termination gate not yet
      // implemented.
      lines.push(localized("cli.resume.form_done"));
      lines.push(localized("cli.resume.alignment_runtime_pending", { phase: String(ap) }));
      next.push({
        id: "alignment_runtime_pending",
        description: localized("cli.resume.next_alignment_runtime_desc"),
        command: `agora resume (TBD: Phase ${String(ap)} round ${String(round)} runtime)`,
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
