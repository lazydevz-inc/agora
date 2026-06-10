// SPEC: docs/cli/spec.md Stage 3-B.6 (agora ralph) +
//       docs/loops/ralph-loop.md (Stage 2-B) +
//       docs/loops/handoff.md Stage 2-C.2 R3-B (DFS leftmost selection).
//
// `agora ralph` — Ralph orchestrator. First invocation (state =
// ready_for_ralph): initializes ralph_state.json by selecting DFS
// leftmost atomic leaf from seed.ac_tree, transitions state to
// in_ralph. Subsequent invocations (state = in_ralph): runs Gate 1
// (deterministic: typecheck → lint → test → build) for the current
// leaf. Pass → mark complete + advance to next leaf (or transition
// to ralph_complete if all done). Fail → increment per-leaf attempts,
// stay on same leaf, surface failed sub-command for user to fix.
//
// Per Stage 6-A.18 R4-A: this slice does NOT auto-implement leaves.
// The user writes code; agora verifies via Gate 1. Ralph orchestration
// + Gates 2-5 (functional QA, Aquinas, alignment check) land in
// future slices.
//
// Per Stage 6-A.18 R5-A: per-leaf cap=10, session cap=25 (warn only;
// no auto-skip in v1).
//
// Refusal guards (3):
//   - no .agora/ → user.aborted
//   - state.current_phase not in {ready_for_ralph, in_ralph} →
//     user.aborted (run agora handoff first)
//   - state ready_for_ralph but seed.json missing → state.corrupt

import { join } from "node:path";
import { confirm, intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { ACNode } from "../../handoff/dihairesis.js";
import type { Seed } from "../../handoff/seed-builder.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import { type DisputatioResult, runDisputatio } from "../../ralph/disputatio.js";
import { runGate1WithCache } from "../../ralph/gate-1-cache.js";
import { runGate2 } from "../../ralph/gate-2.js";
import { type Gate5Result, runGate5 } from "../../ralph/gate-5.js";
import { countAtomicLeaves, selectNextLeaf } from "../../ralph/leaf-selector.js";
import {
  type Gate1Result,
  newRalphState,
  type RalphState,
  RalphStateSchema,
} from "../../ralph/state.js";
import { err, ok, type Result } from "../../result/index.js";
import { appendEvent } from "../../shared/events.js";
import { getRecentDiff } from "../../shared/git-diff.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraSession } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

// Per Stage 6-A.26: Z2 confirm (drift > 0.6) gains pre-selection
// flags so CI / agent contexts can run agora ralph without TTY.
// Mutually exclusive; passing both → user.forbidden-flag-combo.
type Z2Preselect = "accept" | "decline" | null;

export async function runRalphCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  const z2Result = parseZ2Preselect(positional);
  if (!z2Result.ok) return z2Result;
  const z2Preselect = z2Result.value;

  if (!(await hasAgoraSession(cwd))) {
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
  const sessionState = stateResult.value;
  const phase = sessionState.current_phase;
  if (phase !== "ready_for_ralph" && phase !== "in_ralph") {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `agora ralph requires state.current_phase in {ready_for_ralph, in_ralph} (current=${phase}). Run \`agora handoff\` to lock the seed first.`,
        },
      }),
    );
  }

  const seedPath = join(cwd, ".agora", "seed.json");
  const seed = await readJsonOrNull<Seed>(seedPath);
  if (seed === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: seedPath,
          detail: `state.current_phase=${phase} but seed.json missing.`,
        },
      }),
    );
  }

  const ralphStatePath = join(cwd, ".agora", "ralph_state.json");
  let ralphState = await readJsonOrNull<RalphState>(ralphStatePath);
  if (ralphState !== null) {
    const parsed = RalphStateSchema.safeParse(ralphState);
    if (!parsed.success) {
      return err(
        buildAgoraError("state.corrupt", {
          context: {
            file: ralphStatePath,
            detail: parsed.error.issues[0]?.message ?? "ralph_state.json validation failed",
          },
        }),
      );
    }
    ralphState = parsed.data;
  }

  intro(pc.bold(localized("cli.ralph.intro")));

  // First invocation: initialize ralph_state + transition phase.
  if (ralphState === null) {
    const firstLeaf = selectNextLeaf(seed.ac_tree, new Set());
    if (firstLeaf === null) {
      return err(
        buildAgoraError("internal.invariant-violation", {
          context: {
            detail: "seed.ac_tree has no atomic leaves — handoff produced an empty tree.",
          },
        }),
      );
    }
    const initial = newRalphState({
      ac_tree: seed.ac_tree as ACNode[],
      initial_leaf_id: firstLeaf,
    });
    await writeJsonAtomic(ralphStatePath, initial);
    const advanced = await saveState(
      cwd,
      { ...sessionState, current_phase: "in_ralph" },
      "agora ralph",
    );
    if (!advanced.ok) return advanced;

    log.message(
      localized("cli.ralph.initialized", {
        leaf_id: firstLeaf,
        total_leaves: String(countAtomicLeaves(seed.ac_tree as ACNode[])),
      }),
    );
    log.message(localized("cli.ralph.implement_then_rerun"));
    outro(
      pc.cyan(
        `Initialized. Current leaf: ${firstLeaf}. Implement, then re-run \`agora ralph\` to verify Gate 1.`,
      ),
    );
    return ok(
      buildEnvelope({
        action: "initialized",
        current_leaf_id: firstLeaf,
        completed_count: 0,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
      }),
    );
  }

  // Subsequent invocation: run Gate 1 for current leaf.
  if (ralphState.current_leaf_id === null) {
    // ralph_state thinks we're done; reconcile with state.current_phase.
    const advanced = await saveState(
      cwd,
      { ...sessionState, current_phase: "ralph_complete" },
      "agora ralph",
    );
    if (!advanced.ok) return advanced;
    outro(pc.green(localized("cli.ralph.all_complete")));
    return ok(
      buildEnvelope({
        action: "all_complete",
        completed_count: ralphState.completed_leaves.length,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
      }),
    );
  }

  const currentLeaf = ralphState.current_leaf_id;
  const attemptsBefore = ralphState.per_leaf_attempts[currentLeaf] ?? 0;

  log.message(
    localized("cli.ralph.gate_1_running", {
      leaf_id: currentLeaf,
      attempt: String(attemptsBefore + 1),
    }),
  );

  const gate1 = (await runGate1WithCache({ cwd })).result;
  await appendEvent(cwd, {
    type: "gate_1.result",
    command: "agora ralph",
    data: {
      leaf_id: currentLeaf,
      attempt: attemptsBefore + 1,
      overall_passed: gate1.overall_passed,
      total_duration_ms: gate1.total_duration_ms,
      failed_commands: gate1.commands.filter((c) => !c.passed).map((c) => c.name),
    },
  });

  // Gate 1 failure short-circuits — Gate 5 only runs after deterministic
  // checks pass (no point judging alignment if the code doesn't even
  // build).
  if (!gate1.overall_passed) {
    const newAttempts = attemptsBefore + 1;
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    return await emitGate1Failure(cwd, currentLeaf, newAttempts, updated, gate1);
  }

  // Gate 1 passed → Gate 2 functional QA (project's Playwright, if any).
  log.success(
    localized("cli.ralph.gate_1_passed", {
      leaf_id: currentLeaf,
      duration_s: (gate1.total_duration_ms / 1000).toFixed(1),
    }),
  );

  const gate2 = await runGate2({ cwd });
  await appendEvent(cwd, {
    type: "gate_2.result",
    command: "agora ralph",
    data: {
      leaf_id: currentLeaf,
      skipped: gate2.skipped,
      passed: gate2.passed,
      detected_config: gate2.detected_config,
      duration_ms: gate2.duration_ms,
    },
  });
  if (!gate2.passed) {
    const newAttempts = attemptsBefore + 1;
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    log.error(
      localized("cli.ralph.gate_2_failed", {
        leaf_id: currentLeaf,
        attempts: String(newAttempts),
      }),
    );
    emitCapWarnings(updated, currentLeaf, newAttempts);
    await emitCapWarningEvents(cwd, updated, currentLeaf, newAttempts);
    outro(
      pc.yellow("Gate 2 (functional QA) failed. Fix Playwright tests, then re-run `agora ralph`."),
    );
    return ok(
      buildEnvelope({
        action: "gate_2_failed",
        current_leaf_id: currentLeaf,
        attempts: newAttempts,
        cap: updated.iteration_cap_per_leaf,
        failed_commands: ["playwright"],
        last_gate_1_result: gate1,
      }),
    );
  }
  if (!gate2.skipped) {
    log.success(localized("cli.ralph.gate_2_passed", { leaf_id: currentLeaf }));
  }

  log.message(localized("cli.ralph.gate_5_running", { leaf_id: currentLeaf }));

  const leafContent = findLeafContent(ralphState.ac_tree_snapshot as ACNode[], currentLeaf);
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
  const diffResult = await getRecentDiff(cwd);
  const gate5R = await runGate5(
    {
      leaf_id: currentLeaf,
      leaf_content: leafContent ?? "(content missing from ac_tree_snapshot)",
      telos_statement: seed.four_causes.telos?.statement ?? "(telos missing)",
      telos_failure_signal: seed.four_causes.telos?.failure_signal ?? "(failure_signal missing)",
      all_acceptance_criteria: seed.acceptance_criteria.criteria,
      diff: diffResult.diff,
      diff_source: diffResult.source,
      diff_truncated: diffResult.truncated,
    },
    runtime.runner,
  );
  if (!gate5R.ok) {
    await runtime.cache.flush();
    return gate5R;
  }
  const gate5 = gate5R.value;
  await appendEvent(cwd, {
    type: "gate_5.result",
    command: "agora ralph",
    data: {
      leaf_id: currentLeaf,
      drift_score: gate5.drift_score,
      action: gate5.action,
      diff_source: gate5.diff_source,
      diff_truncated: gate5.diff_truncated,
    },
  });

  // Gate 5 PASS / SOFT_WARN → run Aquinas Disputatio (Gate 3+4) BEFORE
  // marking leaf complete. Verdict drives whether leaf actually advances.
  // Z1 / Z2 → skip Disputatio (Gate 5 already deferred this iteration).
  let disputatio: DisputatioResult | undefined;
  if (gate5.action === "PASS" || gate5.action === "SOFT_WARN") {
    log.message(localized("cli.ralph.disputatio_running", { leaf_id: currentLeaf }));
    const completedSummary =
      ralphState.completed_leaves.length === 0
        ? "(none — first leaf)"
        : ralphState.completed_leaves.map((id) => `- ${id}`).join("\n");
    const disputatioR = await runDisputatio(
      {
        leaf_id: currentLeaf,
        leaf_content: leafContent ?? "(content missing from ac_tree_snapshot)",
        telos_statement: seed.four_causes.telos?.statement ?? "(telos missing)",
        telos_failure_signal: seed.four_causes.telos?.failure_signal ?? "(failure_signal missing)",
        all_acceptance_criteria: seed.acceptance_criteria.criteria,
        completed_leaves_summary: completedSummary,
        diff: diffResult.diff,
        diff_source: diffResult.source,
        critic_context: {
          leaf_content: leafContent ?? "",
          changed_files: [],
        },
      },
      runtime.runner,
    );
    if (!disputatioR.ok) {
      await runtime.cache.flush();
      return disputatioR;
    }
    disputatio = disputatioR.value;
    await appendEvent(cwd, {
      type: "disputatio.verdict",
      command: "agora ralph",
      data: {
        leaf_id: currentLeaf,
        verdict: disputatio.respondeo.verdict,
        all_objections_count: disputatio.all_objections_count,
        critical_objections_count: disputatio.critical_objections_count,
        action_items_count: disputatio.action_items.length,
      },
    });
  }
  await runtime.cache.flush();

  return await applyGate5Outcome({
    cwd,
    sessionState,
    ralphState,
    ralphStatePath,
    seed,
    currentLeaf,
    attemptsBefore,
    gate1,
    gate5,
    z2Preselect,
    ...(disputatio !== undefined ? { disputatio } : {}),
  });
}

function parseZ2Preselect(positional: readonly string[]): Result<Z2Preselect, AgoraErrorThrown> {
  const seen: Z2Preselect[] = [];
  for (const arg of positional) {
    if (arg === "--accept-z2") {
      seen.push("accept");
      continue;
    }
    if (arg === "--decline-z2") {
      seen.push("decline");
      continue;
    }
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: {
          detail: `Unknown ralph argument: ${arg}. Supported: --accept-z2, --decline-z2.`,
        },
      }),
    );
  }
  if (seen.length === 0) return ok(null);
  if (seen.length > 1) {
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: { detail: `Cannot combine --accept-z2 and --decline-z2. Choose one.` },
      }),
    );
  }
  return ok(seen[0] ?? null);
}

interface ApplyGate5OutcomeArgs {
  cwd: string;
  sessionState: import("../../state/types.js").State;
  ralphState: RalphState;
  ralphStatePath: string;
  seed: Seed;
  currentLeaf: string;
  attemptsBefore: number;
  gate1: Gate1Result;
  gate5: Gate5Result;
  disputatio?: DisputatioResult; // present iff Gate 5 was PASS/SOFT_WARN
  z2Preselect: Z2Preselect; // null → run interactive confirm
}

async function applyGate5Outcome(
  args: ApplyGate5OutcomeArgs,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const {
    cwd,
    sessionState,
    ralphState,
    ralphStatePath,
    seed,
    currentLeaf,
    attemptsBefore,
    gate1,
    gate5,
    disputatio,
  } = args;
  const newAttempts = attemptsBefore + 1;
  const completed = new Set(ralphState.completed_leaves);
  const nextGate5History = [...ralphState.gate_5_history, gate5];
  const nextDisputatioHistory =
    disputatio !== undefined
      ? [...ralphState.disputatio_history, disputatio]
      : ralphState.disputatio_history;

  // Disputatio verdict overrides Gate 5 leaf-advance for rejected case.
  // PASS / SOFT_WARN + verdict in {approved, conditional} → advance.
  // PASS / SOFT_WARN + verdict=rejected → stay (Z1-equivalent).
  const willAdvance =
    (gate5.action === "PASS" || gate5.action === "SOFT_WARN") &&
    (disputatio === undefined || disputatio.respondeo.verdict !== "rejected");

  if (willAdvance) {
    completed.add(currentLeaf);
    const nextLeaf = selectNextLeaf(ralphState.ac_tree_snapshot as ACNode[], completed);
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      current_leaf_id: nextLeaf,
      completed_leaves: [...completed],
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      last_gate_5_result: gate5,
      ...(disputatio !== undefined ? { last_disputatio_result: disputatio } : {}),
      gate_5_history: nextGate5History,
      disputatio_history: nextDisputatioHistory,
      z1_directives: [], // cleared on leaf completion
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);

    if (gate5.action === "SOFT_WARN") {
      log.warn(
        localized("cli.ralph.gate_5_soft_warn", {
          leaf_id: currentLeaf,
          drift: gate5.drift_score.toFixed(2),
          rationale: gate5.rationale,
        }),
      );
    } else {
      log.success(
        localized("cli.ralph.gate_5_pass", {
          leaf_id: currentLeaf,
          drift: gate5.drift_score.toFixed(2),
        }),
      );
    }
    if (disputatio !== undefined) {
      const v = disputatio.respondeo.verdict;
      if (v === "approved") {
        log.success(
          localized("cli.ralph.disputatio_approved", {
            leaf_id: currentLeaf,
            objections_count: String(disputatio.all_objections_count),
          }),
        );
      } else {
        log.warn(
          localized("cli.ralph.disputatio_conditional", {
            leaf_id: currentLeaf,
            objections_count: String(disputatio.all_objections_count),
            critical_count: String(disputatio.critical_objections_count),
            actions:
              disputatio.action_items.length > 0
                ? disputatio.action_items.map((a) => `  - ${a}`).join("\n")
                : "(none)",
          }),
        );
      }
    }

    if (nextLeaf === null) {
      const advanced = await saveState(cwd, {
        ...sessionState,
        current_phase: "ralph_complete",
      });
      if (!advanced.ok) return advanced;
      outro(pc.green(localized("cli.ralph.all_complete")));
      return ok(
        buildEnvelope({
          action: "all_complete",
          completed_count: completed.size,
          total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
          last_gate_1_result: gate1,
          last_gate_5_result: gate5,
        }),
      );
    }
    log.message(
      localized("cli.ralph.next_leaf_pending", {
        next_leaf_id: nextLeaf,
        completed_count: String(completed.size),
        total_leaves: String(countAtomicLeaves(seed.ac_tree as ACNode[])),
      }),
    );
    outro(
      pc.cyan(`Leaf complete (drift ${gate5.drift_score.toFixed(2)}). Next leaf: ${nextLeaf}.`),
    );
    return ok(
      buildEnvelope({
        action: "leaf_passed",
        previous_leaf_id: currentLeaf,
        current_leaf_id: nextLeaf,
        completed_count: completed.size,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
        last_gate_1_result: gate1,
        last_gate_5_result: gate5,
      }),
    );
  }

  // Disputatio rejected verdict (Gate 5 PASS/SOFT_WARN but Aquinas
  // rejected): leaf NOT complete; treat as Z1-equivalent.
  if (disputatio !== undefined && disputatio.respondeo.verdict === "rejected") {
    const disputatioDirectives = [...ralphState.z1_directives, ...disputatio.action_items];
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      last_gate_5_result: gate5,
      last_disputatio_result: disputatio,
      gate_5_history: nextGate5History,
      disputatio_history: nextDisputatioHistory,
      z1_directives: disputatioDirectives,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    log.error(
      localized("cli.ralph.disputatio_rejected", {
        leaf_id: currentLeaf,
        objections_count: String(disputatio.all_objections_count),
        critical_count: String(disputatio.critical_objections_count),
        reasoning: disputatio.respondeo.reasoning,
      }),
    );
    if (disputatio.action_items.length > 0) {
      log.message(
        localized("cli.ralph.disputatio_action_items", {
          actions: disputatio.action_items.map((a) => `  - ${a}`).join("\n"),
        }),
      );
    }
    emitCapWarnings(updated, currentLeaf, newAttempts);
    await emitCapWarningEvents(cwd, updated, currentLeaf, newAttempts);
    outro(
      pc.yellow(
        `Aquinas rejected (${String(disputatio.all_objections_count)} objections). Address concedo rulings + re-run.`,
      ),
    );
    return ok(
      buildEnvelope({
        action: "disputatio_rejected",
        current_leaf_id: currentLeaf,
        attempts: newAttempts,
        cap: updated.iteration_cap_per_leaf,
        last_gate_1_result: gate1,
        last_gate_5_result: gate5,
        last_disputatio_result: disputatio,
      }),
    );
  }

  // Z1 / Z2 (Gate 5 itself escalated): leaf NOT complete.
  const z1Directives =
    gate5.z1_directive !== undefined
      ? [...ralphState.z1_directives, gate5.z1_directive]
      : ralphState.z1_directives;

  if (gate5.action === "Z1") {
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      last_gate_5_result: gate5,
      gate_5_history: nextGate5History,
      z1_directives: z1Directives,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    log.error(
      localized("cli.ralph.gate_5_z1", {
        leaf_id: currentLeaf,
        drift: gate5.drift_score.toFixed(2),
        rationale: gate5.rationale,
      }),
    );
    if (gate5.z1_directive !== undefined) {
      log.message(localized("cli.ralph.gate_5_z1_directive", { directive: gate5.z1_directive }));
    }
    emitCapWarnings(updated, currentLeaf, newAttempts);
    await emitCapWarningEvents(cwd, updated, currentLeaf, newAttempts);
    outro(pc.yellow(`Drift ${gate5.drift_score.toFixed(2)} (Z1). Adjust + re-run.`));
    return ok(
      buildEnvelope({
        action: "gate_5_z1",
        current_leaf_id: currentLeaf,
        attempts: newAttempts,
        cap: updated.iteration_cap_per_leaf,
        last_gate_1_result: gate1,
        last_gate_5_result: gate5,
      }),
    );
  }

  // Z2: clack confirm → state in_ralph → in_alignment + reset round.
  // Pre-selection flag (--accept-z2 / --decline-z2) skips the prompt
  // for CI / agent contexts (Stage 6-A.26).
  log.error(
    localized("cli.ralph.gate_5_z2", {
      leaf_id: currentLeaf,
      drift: gate5.drift_score.toFixed(2),
      rationale: gate5.rationale,
    }),
  );
  const z2Confirmed =
    args.z2Preselect === "accept"
      ? true
      : args.z2Preselect === "decline"
        ? false
        : (await confirm({
            message: localized("cli.ralph.gate_5_z2_confirm"),
            initialValue: true,
          })) === true;

  const updated: RalphState = RalphStateSchema.parse({
    ...ralphState,
    per_leaf_attempts: { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
    session_total_attempts: ralphState.session_total_attempts + 1,
    last_gate_1_result: gate1,
    last_gate_5_result: gate5,
    gate_5_history: nextGate5History,
    z1_directives: z1Directives,
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, updated);

  if (z2Confirmed) {
    // Re-enter alignment loop. Preserve ralph_state.json so leaf can
    // be re-attempted after re-alignment + re-handoff.
    const advanced = await saveState(
      cwd,
      {
        ...sessionState,
        current_phase: "in_alignment",
        alignment: { phase: 2, round: 0 },
      },
      "agora ralph",
    );
    if (!advanced.ok) return advanced;
    outro(
      pc.magenta(
        `Z2: re-entering alignment (drift ${gate5.drift_score.toFixed(2)}). Run \`agora resume\`.`,
      ),
    );
    return ok(
      buildEnvelope({
        action: "gate_5_z2_accepted",
        current_leaf_id: currentLeaf,
        attempts: newAttempts,
        last_gate_1_result: gate1,
        last_gate_5_result: gate5,
      }),
    );
  }

  // Z2 declined: treat as Z1 (stay on leaf, accumulate directive).
  emitCapWarnings(updated, currentLeaf, newAttempts);
  await emitCapWarningEvents(cwd, updated, currentLeaf, newAttempts);
  outro(
    pc.yellow(
      `Z2 declined. Drift ${gate5.drift_score.toFixed(2)}. Adjust + re-run \`agora ralph\`.`,
    ),
  );
  return ok(
    buildEnvelope({
      action: "gate_5_z2_declined",
      current_leaf_id: currentLeaf,
      attempts: newAttempts,
      cap: updated.iteration_cap_per_leaf,
      last_gate_1_result: gate1,
      last_gate_5_result: gate5,
    }),
  );
}

function findLeafContent(tree: readonly ACNode[], leafId: string): string | null {
  for (const node of tree) {
    if (node.id === leafId) return node.content;
    const inChild = findLeafContent(node.children, leafId);
    if (inChild !== null) return inChild;
  }
  return null;
}

async function emitGate1Failure(
  cwd: string,
  currentLeaf: string,
  newAttempts: number,
  updated: RalphState,
  gate1: Gate1Result,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  // Gate 1 failed.
  const failed = gate1.commands.filter((c) => !c.passed).map((c) => c.name);
  log.error(
    localized("cli.ralph.gate_1_failed", {
      leaf_id: currentLeaf,
      attempts: String(newAttempts),
      cap: String(updated.iteration_cap_per_leaf),
      failed: failed.join(", "),
    }),
  );

  await emitCapWarningEvents(cwd, updated, currentLeaf, newAttempts);

  // Per-leaf cap warning.
  if (newAttempts >= updated.iteration_cap_per_leaf) {
    log.warn(
      localized("cli.ralph.per_leaf_cap_warning", {
        leaf_id: currentLeaf,
        attempts: String(newAttempts),
      }),
    );
  }
  // Session cap warning.
  if (updated.session_total_attempts >= updated.session_cap_total) {
    log.warn(
      localized("cli.ralph.session_cap_warning", {
        attempts: String(updated.session_total_attempts),
      }),
    );
  }

  outro(pc.yellow(`Gate 1 failed (${failed.join(", ")}). Fix, then re-run \`agora ralph\`.`));

  return ok(
    buildEnvelope({
      action: "gate_1_failed",
      current_leaf_id: currentLeaf,
      attempts: newAttempts,
      cap: updated.iteration_cap_per_leaf,
      failed_commands: failed,
      last_gate_1_result: gate1,
    }),
  );
}

interface RalphEnvelopeData {
  action:
    | "initialized"
    | "leaf_passed"
    | "gate_1_failed"
    | "gate_2_failed"
    | "gate_5_z1"
    | "gate_5_z2_accepted"
    | "gate_5_z2_declined"
    | "disputatio_rejected"
    | "all_complete";
  current_leaf_id?: string;
  previous_leaf_id?: string;
  completed_count?: number;
  total_leaves?: number;
  attempts?: number;
  cap?: number;
  failed_commands?: string[];
  last_gate_1_result?: Gate1Result;
  last_gate_5_result?: Gate5Result;
  last_disputatio_result?: DisputatioResult;
}

function emitCapWarnings(state: RalphState, leafId: string, attempts: number): void {
  if (attempts >= state.iteration_cap_per_leaf) {
    log.warn(
      localized("cli.ralph.per_leaf_cap_warning", {
        leaf_id: leafId,
        attempts: String(attempts),
      }),
    );
  }
  if (state.session_total_attempts >= state.session_cap_total) {
    log.warn(
      localized("cli.ralph.session_cap_warning", {
        attempts: String(state.session_total_attempts),
      }),
    );
  }
}

async function emitCapWarningEvents(
  cwd: string,
  state: RalphState,
  leafId: string,
  attempts: number,
): Promise<void> {
  if (attempts >= state.iteration_cap_per_leaf) {
    await appendEvent(cwd, {
      type: "cap.warning",
      command: "agora ralph",
      data: {
        kind: "per_leaf",
        leaf_id: leafId,
        attempts,
        cap: state.iteration_cap_per_leaf,
      },
    });
  }
  if (state.session_total_attempts >= state.session_cap_total) {
    await appendEvent(cwd, {
      type: "cap.warning",
      command: "agora ralph",
      data: {
        kind: "session",
        attempts: state.session_total_attempts,
        cap: state.session_cap_total,
      },
    });
  }
}

function buildEnvelope(data: RalphEnvelopeData): CommandEnvelope {
  return {
    command: "agora ralph",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: data as unknown as Record<string, unknown>,
    },
    next:
      data.action === "all_complete"
        ? [
            {
              id: "ralph_complete",
              description: "Ralph complete; ralph_complete dialog (Stage 2-C.2 R4-A) pending",
              command: "agora resume",
            },
          ]
        : data.action === "gate_5_z2_accepted"
          ? [
              {
                id: "re_align",
                description: "Z2 accepted: re-enter alignment loop (state in_alignment)",
                command: "agora resume",
              },
            ]
          : [
              {
                id: "implement_or_fix",
                description:
                  data.action === "gate_1_failed"
                    ? "Fix the failed sub-command, then re-run agora ralph"
                    : data.action === "gate_2_failed"
                      ? "Fix the failing Playwright tests, then re-run agora ralph"
                      : data.action === "gate_5_z1" || data.action === "gate_5_z2_declined"
                        ? "Adjust per Gate 5 directive, then re-run agora ralph"
                        : data.action === "disputatio_rejected"
                          ? "Address Aquinas concedo rulings, then re-run agora ralph"
                          : "Implement the next leaf, then re-run agora ralph",
                command: "agora ralph",
              },
            ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}
