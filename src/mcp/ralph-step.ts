// SPEC: ADR-0010 (host-reasoning stepped MCP tools) — agora_ralph_step
//       orchestrator. Slice D scope: ralph init + Gate 1 + Gate 2 +
//       Gate 5 (LLM) + Z1/Z2 escalation. Disputatio (Gate 3+4) lands
//       in Slice E.
//
// Lifecycle of a single Ralph iteration through the stepped contract:
//
//   1) First call (state=ready_for_ralph, no ralph_state.json):
//        - init ralph_state (DFS leftmost leaf), state → in_ralph
//        - return advanced "ralph.initialized" — host informs user to
//          implement, then re-call.
//   2) Subsequent call (no pending):
//        - run Gate 1 (typecheck/lint/test/build, deterministic). Fail →
//          record attempt + return advanced "ralph.gate_1_failed".
//        - run Gate 2 (Playwright, deterministic; SKIPs if no config).
//          Fail → record + return advanced "ralph.gate_2_failed".
//        - Both pass → issue needs_reasoning "ralph.gate_5" with the
//          drift_score prompt.
//   3) Call with llm_responses[gate_5]:
//        - PASS / SOFT_WARN → leaf complete (Slice E folds Disputatio
//          in here). Advance leaf. All done → state ralph_complete.
//        - Z1 → record directive + stay on leaf → advanced "ralph.gate_5_z1".
//        - Z2 → issue needs_user_input "ralph.confirm_z2".
//   4) Call with user_answers[q_confirm_z2]:
//        - yes → state in_alignment + reset alignment.round → advanced
//          "ralph.z2_accepted".
//        - no  → treat as Z1 → advanced "ralph.z2_declined".
//
// LAYER 3 — depends on state, pending, step, ralph/*, handoff/{seed,dh},
// shared.

import { rm } from "node:fs/promises";
import { join } from "node:path";

import { selectCritics } from "../critics/registry.js";
import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ACNode } from "../handoff/dihairesis.js";
import type { Seed } from "../handoff/seed-builder.js";
import type { DisputatioResult } from "../ralph/disputatio.js";
import { runGate1WithCache } from "../ralph/gate-1-cache.js";
import { runGate2 } from "../ralph/gate-2.js";
import {
  buildGate5UserPrompt,
  GATE_5_SYSTEM,
  Gate5ExtractionResponseSchema,
  type Gate5Result,
  Gate5ResultSchema,
  mapDriftToAction,
} from "../ralph/gate-5.js";
import { countAtomicLeaves, selectNextLeaf } from "../ralph/leaf-selector.js";
import { newRalphState, type RalphState, RalphStateSchema } from "../ralph/state.js";
import { err, ok, type Result } from "../result/index.js";
import { appendEvent } from "../shared/events.js";
import { getRecentDiff, parseChangedFiles } from "../shared/git-diff.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { findProjectRoot, hasAgoraSession } from "../shared/path.js";
import { spawnExec } from "../shared/spawn.js";
import { loadState } from "../state/reader.js";
import type { State } from "../state/types.js";
import { saveState } from "../state/writer.js";
import { clearPending, type McpPending, readPending, writePending } from "./pending.js";
import {
  envAdvanced,
  envError,
  envNeedsReasoning,
  envNeedsUserInput,
  type StepArgs,
  StepArgsSchema,
  type StepEnvelope,
} from "./step.js";
import {
  advanceDisputatio,
  beginDisputatio,
  type DisputatioStepOutcome,
} from "./steps/disputatio.js";

export async function runRalphStep(
  rawArgs: unknown,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  const argsResult = StepArgsSchema.safeParse(rawArgs ?? {});
  if (!argsResult.success) {
    return ok(
      envError(
        "ralph",
        "user.forbidden-flag-combo",
        `agora_ralph_step args invalid: ${argsResult.error.issues[0]?.message ?? "validation failed"}`,
      ),
    );
  }
  const args = argsResult.data;

  if (!(await hasAgoraSession(cwd))) {
    return ok(
      envError(
        "ralph",
        "user.aborted",
        "No Agora session in this directory. Run `agora new <name>` first.",
      ),
    );
  }

  const stateResult = await loadState(cwd);
  if (!stateResult.ok) return stateResult;
  if (stateResult.value === null) {
    return ok(envError("ralph", "state.corrupt", "state.json missing despite .agora/ existing"));
  }
  const state = stateResult.value;
  if (state.current_phase !== "ready_for_ralph" && state.current_phase !== "in_ralph") {
    return ok(
      envError(
        "ralph",
        "user.aborted",
        `agora_ralph_step requires state.current_phase in {ready_for_ralph, in_ralph} (current=${state.current_phase}). Lock the seed via agora_align_step handoff first.`,
      ),
    );
  }

  const seed = await readJsonOrNull<Seed>(join(cwd, ".agora", "seed.json"));
  if (seed === null) {
    return ok(
      envError("ralph", "state.corrupt", "seed.json missing despite ready/in_ralph state."),
    );
  }

  const ralphStatePath = join(cwd, ".agora", "ralph_state.json");
  let ralphState: RalphState | null = null;
  const rawRalph = await readJsonOrNull<unknown>(ralphStatePath);
  if (rawRalph !== null) {
    const parsed = RalphStateSchema.safeParse(rawRalph);
    if (!parsed.success) {
      return ok(
        envError(
          "ralph",
          "state.corrupt",
          `ralph_state.json invalid: ${parsed.error.issues[0]?.message ?? "?"}`,
        ),
      );
    }
    ralphState = parsed.data;
  }

  const pendingResult = await readPending(cwd);
  if (!pendingResult.ok) return pendingResult;
  const pending = pendingResult.value;

  if (pending !== null) {
    return await dispatchPending(cwd, state, seed, ralphState, pending, args, ralphStatePath);
  }
  return await dispatchFresh(cwd, state, seed, ralphState, args, ralphStatePath);
}

// ─── Pending branch ───

async function dispatchPending(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState | null,
  pending: McpPending,
  args: StepArgs,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  if (pending.owner !== "ralph") {
    return ok(
      envError(
        "ralph",
        "user.aborted",
        `mcp_pending.json belongs to "${pending.owner}", not ralph. Use agora_${pending.owner}_step.`,
      ),
    );
  }
  if (ralphState === null) {
    return ok(envError("ralph", "state.corrupt", "pending exists but ralph_state.json missing"));
  }
  const expectMatch = matchesExpects(pending.expects, args);
  if (!expectMatch.ok) {
    return ok(envError("ralph", expectMatch.error.code, expectMatch.error.message));
  }
  switch (pending.step) {
    case "ralph.gate_5":
      return await applyGate5(cwd, state, seed, ralphState, pending, args, ralphStatePath);
    case "ralph.confirm_z2":
      return await applyZ2(cwd, state, seed, ralphState, args, ralphStatePath);
    case "disputatio.videtur":
    case "disputatio.sed_contra":
    case "disputatio.respondeo":
    case "disputatio.ad_singula":
      return await applyDisputatioOutcome(
        cwd,
        state,
        seed,
        ralphState,
        advanceDisputatio(pending, args),
        ralphStatePath,
      );
    default:
      return ok(
        envError(
          "ralph",
          "internal.invariant-violation",
          `Unknown ralph pending step: ${pending.step}`,
        ),
      );
  }
}

// ─── Fresh branch ───

async function dispatchFresh(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState | null,
  args: StepArgs,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  if (args.user_answers !== undefined || args.llm_responses !== undefined) {
    return ok(
      envError(
        "ralph",
        "user.aborted",
        "agora_ralph_step received user_answers / llm_responses but no pending step is in flight.",
      ),
    );
  }
  if (ralphState === null) {
    return await initRalph(cwd, state, seed, ralphStatePath);
  }
  if (ralphState.current_leaf_id === null) {
    // Reconcile: all leaves done; mark state ralph_complete.
    const advanced = await saveState(
      cwd,
      { ...state, current_phase: "ralph_complete" },
      "agora_ralph_step",
    );
    if (!advanced.ok) return advanced;
    return ok(
      envAdvanced(
        "ralph",
        "ralph.complete",
        "All atomic leaves complete. state advanced to ralph_complete.",
        { completed_count: ralphState.completed_leaves.length },
      ),
    );
  }
  return await runGatesForLeaf(cwd, state, seed, ralphState, ralphStatePath);
}

async function initRalph(
  cwd: string,
  state: State,
  seed: Seed,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const firstLeaf = selectNextLeaf(seed.ac_tree, new Set());
  if (firstLeaf === null) {
    return ok(
      envError(
        "ralph",
        "internal.invariant-violation",
        "seed.ac_tree has no atomic leaves — handoff produced an empty tree.",
      ),
    );
  }
  const initial = newRalphState({
    ac_tree: seed.ac_tree as ACNode[],
    initial_leaf_id: firstLeaf,
  });
  await writeJsonAtomic(ralphStatePath, initial);
  const advanced = await saveState(
    cwd,
    { ...state, current_phase: "in_ralph" },
    "agora_ralph_step",
  );
  if (!advanced.ok) return advanced;
  // Gate 5 judges a git diff; without a repo every iteration is stuck at
  // the drift-0.50 uncertainty anchor (Z1 forever). Surface that at init,
  // not three gates deep.
  const repoProbe = await spawnExec("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    timeoutMs: 10_000,
  });
  const hasGitRepo = repoProbe.exit_code === 0 && !repoProbe.timed_out;
  const gitWarning = hasGitRepo
    ? ""
    : " Warning: no git repository detected — Gate 5 judges a git diff and stays at drift 0.50 (Z1) without one. Run `git init` (a baseline commit is optional) before implementing.";
  return ok(
    envAdvanced(
      "ralph",
      "ralph.initialized",
      `Ralph initialized. Current leaf: ${firstLeaf}. Implement the leaf, then call agora_ralph_step again to run Gates 1 → 2 → 5.${gitWarning}`,
      {
        current_leaf_id: firstLeaf,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
        git_repo: hasGitRepo,
      },
    ),
  );
}

async function runGatesForLeaf(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(
      envError("ralph", "internal.invariant-violation", "runGatesForLeaf: current_leaf_id null"),
    );
  }
  const attemptsBefore = ralphState.per_leaf_attempts[leafId] ?? 0;

  // Gate 1 (deterministic, sequential; tree-fingerprint memoized — an
  // unchanged tree re-yields the same verdict, so sibling leaves don't
  // re-pay the full typecheck/lint/test/build wall-clock).
  const gate1Run = await runGate1WithCache({ cwd });
  const gate1 = gate1Run.result;
  await appendEvent(cwd, {
    type: "gate_1.result",
    command: "agora_ralph_step",
    data: {
      leaf_id: leafId,
      passed: gate1.overall_passed,
      from_cache: gate1Run.from_cache,
      failed_commands: gate1.commands.filter((c) => !c.passed).map((c) => c.name),
    },
  });
  if (!gate1.overall_passed) {
    const newAttempts = attemptsBefore + 1;
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [leafId]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    void state;
    return ok(
      envAdvanced(
        "ralph",
        "ralph.gate_1_failed",
        `Gate 1 failed: ${gate1.commands
          .filter((c) => !c.passed)
          .map((c) => c.name)
          .join(", ")}. Fix the failing sub-command + call agora_ralph_step again.`,
        {
          current_leaf_id: leafId,
          attempts: newAttempts,
          cap: updated.iteration_cap_per_leaf,
          failed_commands: gate1.commands.filter((c) => !c.passed).map((c) => c.name),
          // Carry the failure output so the host can fix without re-running
          // the gate commands by hand (the tails otherwise hide in
          // ralph_state.json where no host will look).
          failed_detail: gate1.commands
            .filter((c) => !c.passed)
            .map((c) => ({
              name: c.name,
              exit_code: c.exit_code,
              timed_out: c.timed_out,
              stdout_tail: clipTail(c.stdout_tail),
              stderr_tail: clipTail(c.stderr_tail),
            })),
        },
      ),
    );
  }

  // Gate 2 (deterministic, Playwright; skips when no config)
  const gate2 = await runGate2({ cwd });
  await appendEvent(cwd, {
    type: "gate_2.result",
    command: "agora_ralph_step",
    data: { leaf_id: leafId, passed: gate2.passed },
  });
  if (!gate2.passed) {
    const newAttempts = attemptsBefore + 1;
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [leafId]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_1_result: gate1,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    return ok(
      envAdvanced(
        "ralph",
        "ralph.gate_2_failed",
        "Gate 2 (Playwright) failed. Fix functional tests + call agora_ralph_step again.",
        {
          current_leaf_id: leafId,
          attempts: newAttempts,
          cap: updated.iteration_cap_per_leaf,
          failed_detail: {
            exit_code: gate2.exit_code,
            timed_out: gate2.timed_out,
            stdout_tail: clipTail(gate2.stdout_tail),
            stderr_tail: clipTail(gate2.stderr_tail),
          },
        },
      ),
    );
  }

  // Gate 5: issue needs_reasoning with the drift_score prompt.
  const leafContent = findLeafContent(ralphState.ac_tree_snapshot as ACNode[], leafId);
  const diff = await getRecentDiff(cwd);
  const promptInput = {
    leaf_id: leafId,
    leaf_content: leafContent ?? "(content missing from ac_tree_snapshot)",
    telos_statement: seed.four_causes.telos?.statement ?? "(telos missing)",
    telos_failure_signal: seed.four_causes.telos?.failure_signal ?? "(failure_signal missing)",
    all_acceptance_criteria: seed.acceptance_criteria.criteria,
    diff: diff.diff,
    diff_source: diff.source,
    diff_truncated: diff.truncated,
  };
  const userPrompt = buildGate5UserPrompt(promptInput);
  const pending: McpPending = {
    version: 1,
    owner: "ralph",
    step: "ralph.gate_5",
    expects: "llm_responses",
    issued_prompts: [
      {
        id: "gate_5",
        system: GATE_5_SYSTEM,
        user: userPrompt,
        expect: "json",
        schema_hint: "{ drift_score: 0-1, rationale, z1_directive? }",
      },
    ],
    scratch: {
      leaf_id: leafId,
      attempts_before: attemptsBefore,
      gate_1: gate1 as unknown as Record<string, unknown>,
      diff_source: diff.source,
      diff_truncated: diff.truncated,
    },
    issued_at: new Date().toISOString(),
  };
  await writePending(cwd, pending);
  return ok(
    envNeedsReasoning("ralph", "ralph.gate_5", [
      {
        id: "gate_5",
        system: GATE_5_SYSTEM,
        user: userPrompt,
        expect: "json",
        schema_hint: "{ drift_score: 0-1, rationale, z1_directive? }",
      },
    ]),
  );
}

// ─── Gate 5 apply ───

async function applyGate5(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  pending: McpPending,
  args: StepArgs,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(
      envError("ralph", "internal.invariant-violation", "applyGate5: current_leaf_id null"),
    );
  }
  const responses = args.llm_responses ?? [];
  const found = responses.find((r) => r.id === "gate_5");
  if (found === undefined) {
    return ok(
      envError("ralph", "llm.invalid-response", 'ralph.gate_5: no llm_response with id="gate_5".'),
    );
  }
  const parsedExtract = parseGate5Response(found.content);
  if (!parsedExtract.ok) {
    return ok(envError("ralph", parsedExtract.error.code, parsedExtract.error.message));
  }
  const extracted = parsedExtract.value;
  const action = mapDriftToAction(extracted.drift_score);
  // Record the ACTUAL diff source the Gate 5 prompt was built from
  // (threaded through pending.scratch by runGatesForLeaf), not a hardcoded
  // sentinel — so the gate trail faithfully reflects what was judged.
  const scratchDiffSource = pending.scratch["diff_source"];
  const scratchDiffTruncated = pending.scratch["diff_truncated"];
  const gate5: Gate5Result = Gate5ResultSchema.parse({
    leaf_id: leafId,
    drift_score: extracted.drift_score,
    action,
    rationale: extracted.rationale,
    ...(extracted.z1_directive !== undefined ? { z1_directive: extracted.z1_directive } : {}),
    diff_source:
      typeof scratchDiffSource === "string" ? scratchDiffSource : "head_minus_one_to_head",
    diff_truncated: scratchDiffTruncated === true,
    ran_at: new Date().toISOString(),
  });
  await appendEvent(cwd, {
    type: "gate_5.result",
    command: "agora_ralph_step",
    data: {
      leaf_id: gate5.leaf_id,
      drift_score: gate5.drift_score,
      action: gate5.action,
      diff_source: gate5.diff_source,
    },
  });
  const attemptsBefore = ralphState.per_leaf_attempts[leafId] ?? 0;
  const newAttempts = attemptsBefore + 1;

  if (action === "PASS" || action === "SOFT_WARN") {
    // Update ralph_state with Gate 5 result + history before kicking
    // off Disputatio so the post-Disputatio advanceLeaf has the latest
    // gate trail.
    const withGate5: RalphState = RalphStateSchema.parse({
      ...ralphState,
      last_gate_5_result: gate5,
      gate_5_history: [...ralphState.gate_5_history, gate5],
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, withGate5);
    return await kickoffDisputatio(cwd, state, seed, withGate5, ralphStatePath);
  }
  if (action === "Z1") {
    const updated: RalphState = RalphStateSchema.parse({
      ...ralphState,
      per_leaf_attempts: { ...ralphState.per_leaf_attempts, [leafId]: newAttempts },
      session_total_attempts: ralphState.session_total_attempts + 1,
      last_gate_5_result: gate5,
      gate_5_history: [...ralphState.gate_5_history, gate5],
      z1_directives:
        gate5.z1_directive !== undefined
          ? [...ralphState.z1_directives, gate5.z1_directive]
          : ralphState.z1_directives,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(ralphStatePath, updated);
    await clearPending(cwd);
    return ok(
      envAdvanced(
        "ralph",
        "ralph.gate_5_z1",
        `Gate 5 Z1 (drift=${gate5.drift_score.toFixed(2)}): ${gate5.rationale}. Adjust + call agora_ralph_step again.`,
        {
          current_leaf_id: leafId,
          attempts: newAttempts,
          cap: updated.iteration_cap_per_leaf,
          z1_directive: gate5.z1_directive ?? null,
        },
      ),
    );
  }
  // Record the (catastrophic) drift in the gate trail NOW, before the Z2
  // confirm round-trip. Otherwise a declined Z2 loses this spike from
  // gate_5_history entirely — and the drift trend exists precisely to show
  // spike-and-recover. applyZ2 reloads this persisted state and does not
  // re-append, so there is no double count.
  const withZ2Gate5: RalphState = RalphStateSchema.parse({
    ...ralphState,
    last_gate_5_result: gate5,
    gate_5_history: [...ralphState.gate_5_history, gate5],
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, withZ2Gate5);

  // Z2: issue confirm step.
  const z2Pending: McpPending = {
    version: 1,
    owner: "ralph",
    step: "ralph.confirm_z2",
    expects: "user_answers",
    issued_questions: [
      {
        id: "q_confirm_z2",
        prompt: `Gate 5 escalated to Z2 (drift=${gate5.drift_score.toFixed(2)}). Re-enter the alignment loop to re-align this leaf? Answer "yes" to reset state to in_alignment, or "no" to keep this leaf and treat as Z1.\n\nRationale: ${gate5.rationale}`,
        hint: 'reply "yes" or "no"',
      },
    ],
    scratch: {
      leaf_id: leafId,
      gate_5: gate5 as unknown as Record<string, unknown>,
      attempts_before: attemptsBefore,
    },
    issued_at: new Date().toISOString(),
  };
  await writePending(cwd, z2Pending);
  return ok(
    envNeedsUserInput("ralph", "ralph.confirm_z2", [
      {
        id: "q_confirm_z2",
        prompt: `Gate 5 escalated to Z2 (drift=${gate5.drift_score.toFixed(2)}). Re-enter the alignment loop to re-align this leaf? Answer "yes" to reset state to in_alignment, or "no" to keep this leaf and treat as Z1.\n\nRationale: ${gate5.rationale}`,
        hint: 'reply "yes" or "no"',
      },
    ]),
  );
}

async function advanceLeaf(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  gate5: Gate5Result,
  ralphStatePath: string,
  disputatio?: DisputatioResult,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(
      envError("ralph", "internal.invariant-violation", "advanceLeaf: current_leaf_id null"),
    );
  }
  const completed = new Set(ralphState.completed_leaves);
  completed.add(leafId);
  const nextLeaf = selectNextLeaf(ralphState.ac_tree_snapshot as ACNode[], completed);
  const updated: RalphState = RalphStateSchema.parse({
    ...ralphState,
    current_leaf_id: nextLeaf,
    completed_leaves: [...completed],
    session_total_attempts: ralphState.session_total_attempts + 1,
    last_gate_5_result: gate5,
    // gate_5_history was already appended in applyGate5 before kicking off
    // Disputatio — do NOT append again here. (A prior reference-equality
    // dedup `.includes(gate5)` silently failed across the
    // RalphStateSchema.parse clone boundary, double-recording the drift.)
    gate_5_history: ralphState.gate_5_history,
    ...(disputatio !== undefined
      ? {
          last_disputatio_result: disputatio,
          disputatio_history: [...ralphState.disputatio_history, disputatio],
        }
      : {}),
    z1_directives: [], // cleared on leaf completion
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, updated);
  await clearPending(cwd);
  const driftStr = gate5.drift_score.toFixed(2);
  const verdictTag = disputatio !== undefined ? `, verdict=${disputatio.respondeo.verdict}` : "";
  if (nextLeaf === null) {
    const advanced = await saveState(
      cwd,
      { ...state, current_phase: "ralph_complete" },
      "agora_ralph_step",
    );
    if (!advanced.ok) return advanced;
    return ok(
      envAdvanced(
        "ralph",
        "ralph.complete",
        `All atomic leaves complete (drift=${driftStr}${verdictTag}). state advanced to ralph_complete.`,
        { completed_count: completed.size },
      ),
    );
  }
  return ok(
    envAdvanced(
      "ralph",
      "ralph.leaf_passed",
      `Leaf complete (drift=${driftStr}${verdictTag}). Next leaf: ${nextLeaf}.`,
      {
        previous_leaf_id: leafId,
        current_leaf_id: nextLeaf,
        completed_count: completed.size,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
        ...(disputatio !== undefined ? { disputatio_verdict: disputatio.respondeo.verdict } : {}),
      },
    ),
  );
}

// ─── Disputatio kickoff + persistence ───

async function kickoffDisputatio(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(envError("ralph", "internal.invariant-violation", "kickoffDisputatio: leaf null"));
  }
  const leafContent =
    findLeafContent(ralphState.ac_tree_snapshot as ACNode[], leafId) ??
    "(content missing from ac_tree_snapshot)";
  const completedSummary =
    ralphState.completed_leaves.length === 0
      ? "(none — first leaf)"
      : ralphState.completed_leaves.map((id) => `- ${id}`).join("\n");
  const diff = await getRecentDiff(cwd);
  // Real selection signals: the judged diff's file list + the seed's tech
  // stack — previously hardcoded empty, leaving file_pattern/tech_stack
  // critic triggers permanently dead in the MCP path.
  const ctx = {
    leaf_content: leafContent,
    changed_files: parseChangedFiles(diff.diff),
    tech_stack: seed.four_causes.material?.tech_stack ?? [],
  };
  const critics = selectCritics(ctx);
  // Fallback: if no critics matched (shouldn't happen — universal critic
  // is always-trigger), advance leaf directly using last Gate 5.
  if (critics.length === 0 && ralphState.last_gate_5_result !== undefined) {
    return await advanceLeaf(
      cwd,
      state,
      seed,
      ralphState,
      ralphState.last_gate_5_result,
      ralphStatePath,
    );
  }
  const outcome = beginDisputatio({
    leaf_id: leafId,
    leaf_content: leafContent,
    telos_statement: seed.four_causes.telos?.statement ?? "(telos missing)",
    telos_failure_signal: seed.four_causes.telos?.failure_signal ?? "(failure_signal missing)",
    all_acceptance_criteria: seed.acceptance_criteria.criteria,
    completed_leaves_summary: completedSummary,
    diff: diff.diff,
    diff_source: diff.source,
    critics,
  });
  return await applyDisputatioOutcome(cwd, state, seed, ralphState, outcome, ralphStatePath);
}

async function applyDisputatioOutcome(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  outcome: DisputatioStepOutcome,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  switch (outcome.type) {
    case "issue":
      await writePending(cwd, outcome.pending);
      return ok(outcome.envelope);
    case "complete":
      return await applyDisputatioVerdict(
        cwd,
        state,
        seed,
        ralphState,
        outcome.result,
        ralphStatePath,
      );
    case "error":
      return ok(outcome.envelope);
  }
}

async function applyDisputatioVerdict(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  disputatio: DisputatioResult,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const lastGate5 = ralphState.last_gate_5_result;
  if (lastGate5 === undefined) {
    return ok(
      envError(
        "ralph",
        "internal.invariant-violation",
        "Disputatio verdict apply: last_gate_5_result missing",
      ),
    );
  }
  await appendEvent(cwd, {
    type: "disputatio.verdict",
    command: "agora_ralph_step",
    data: {
      leaf_id: ralphState.current_leaf_id,
      verdict: disputatio.respondeo.verdict,
      objections: disputatio.all_objections_count,
      critical_objections: disputatio.critical_objections_count,
    },
  });
  if (disputatio.respondeo.verdict === "rejected") {
    return await stayOnLeafAfterReject(cwd, ralphState, disputatio, ralphStatePath);
  }
  return await advanceLeaf(cwd, state, seed, ralphState, lastGate5, ralphStatePath, disputatio);
}

async function stayOnLeafAfterReject(
  cwd: string,
  ralphState: RalphState,
  disputatio: DisputatioResult,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(
      envError("ralph", "internal.invariant-violation", "stayOnLeafAfterReject: leaf null"),
    );
  }
  const attemptsBefore = ralphState.per_leaf_attempts[leafId] ?? 0;
  const newAttempts = attemptsBefore + 1;
  const updated: RalphState = RalphStateSchema.parse({
    ...ralphState,
    per_leaf_attempts: { ...ralphState.per_leaf_attempts, [leafId]: newAttempts },
    session_total_attempts: ralphState.session_total_attempts + 1,
    last_disputatio_result: disputatio,
    disputatio_history: [...ralphState.disputatio_history, disputatio],
    z1_directives: [...ralphState.z1_directives, ...disputatio.action_items],
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, updated);
  await clearPending(cwd);
  return ok(
    envAdvanced(
      "ralph",
      "ralph.disputatio_rejected",
      `Aquinas rejected (${String(disputatio.all_objections_count)} objections, ${String(disputatio.critical_objections_count)} critical). Address concedo rulings + call agora_ralph_step again.`,
      {
        current_leaf_id: leafId,
        attempts: newAttempts,
        cap: updated.iteration_cap_per_leaf,
        action_items: disputatio.action_items,
      },
    ),
  );
}

// ─── Z2 apply ───

async function applyZ2(
  cwd: string,
  state: State,
  seed: Seed,
  ralphState: RalphState,
  args: StepArgs,
  ralphStatePath: string,
): Promise<Result<StepEnvelope, AgoraErrorThrown>> {
  const raw = (args.user_answers?.q_confirm_z2 ?? "").trim().toLowerCase();
  const yes = raw === "yes" || raw === "y" || raw === "true";
  const no = raw === "no" || raw === "n" || raw === "false";
  if (!yes && !no) {
    return ok(
      envError("ralph", "user.aborted", `ralph.confirm_z2: expected "yes" or "no", got "${raw}".`),
    );
  }
  const leafId = ralphState.current_leaf_id;
  if (leafId === null) {
    return ok(envError("ralph", "internal.invariant-violation", "applyZ2: current_leaf_id null"));
  }
  await clearPending(cwd);
  const attemptsBefore = ralphState.per_leaf_attempts[leafId] ?? 0;
  const updated: RalphState = RalphStateSchema.parse({
    ...ralphState,
    per_leaf_attempts: { ...ralphState.per_leaf_attempts, [leafId]: attemptsBefore + 1 },
    session_total_attempts: ralphState.session_total_attempts + 1,
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, updated);
  void seed;

  if (yes) {
    // Re-entering the alignment loop must actually OPEN something to
    // re-align: invalidate the Plato maturity tags + the locked seed so
    // agora_align_step re-runs maturity → handoff (the preserved
    // ac_tree.json makes handoff a single confirm). Without this, every
    // artifact still exists, align_step reports "done", ralph_step refuses
    // in_alignment — a hard deadlock (dogfood QA 2026-06-10).
    // ralph_state.json is preserved: completed leaves + the current leaf
    // survive the re-alignment and Ralph resumes where it left off.
    await rm(join(cwd, ".agora", "maturity.json"), { force: true });
    await rm(join(cwd, ".agora", "seed.json"), { force: true });
    const advanced = await saveState(
      cwd,
      {
        ...state,
        current_phase: "in_alignment",
        alignment: { phase: 2, round: 0 },
      },
      "agora_ralph_step",
    );
    if (!advanced.ok) return advanced;
    return ok(
      envAdvanced(
        "ralph",
        "ralph.z2_accepted",
        "Z2 accepted: state reset to in_alignment (maturity tags + seed lock invalidated). Drive agora_align_step to re-align — maturity re-runs, then handoff re-confirms the preserved ac_tree, then agora_ralph_step resumes this leaf.",
        { current_leaf_id: leafId },
      ),
    );
  }
  return ok(
    envAdvanced(
      "ralph",
      "ralph.z2_declined",
      "Z2 declined: treated as Z1. Adjust + call agora_ralph_step again.",
      { current_leaf_id: leafId },
    ),
  );
}

// ─── Helpers ───

// Bound per-command output carried in a StepEnvelope: enough to diagnose,
// small enough to not blow the host's context.
const ENVELOPE_TAIL_CHARS = 700;
function clipTail(s: string): string {
  if (s.length <= ENVELOPE_TAIL_CHARS) return s;
  return `…${s.slice(-ENVELOPE_TAIL_CHARS)}`;
}

function parseGate5Response(
  raw: string | Record<string, unknown>,
): Result<
  { drift_score: number; rationale: string; z1_directive?: string | undefined },
  AgoraErrorThrown
> {
  const obj = typeof raw === "string" ? safeJsonParse(raw) : (raw as unknown);
  if (obj === null || typeof obj !== "object") {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "ralph.gate_5: content is not a JSON object." },
      }),
    );
  }
  const parsed = Gate5ExtractionResponseSchema.safeParse(obj);
  if (!parsed.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: `ralph.gate_5: ${parsed.error.issues[0]?.message ?? "schema fail"}` },
      }),
    );
  }
  return ok(parsed.data);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findLeafContent(tree: readonly ACNode[], leafId: string): string | null {
  for (const node of tree) {
    if (node.id === leafId) return node.content;
    const inChild = findLeafContent(node.children, leafId);
    if (inChild !== null) return inChild;
  }
  return null;
}

function matchesExpects(
  expects: "user_answers" | "llm_responses",
  args: StepArgs,
): Result<true, { code: string; message: string }> {
  if (expects === "user_answers") {
    if (args.user_answers === undefined) {
      return err({
        code: "user.aborted",
        message: "Pending step expects user_answers; none provided.",
      });
    }
    if (args.llm_responses !== undefined) {
      return err({
        code: "user.forbidden-flag-combo",
        message: "Pending step expects user_answers; llm_responses should not be sent.",
      });
    }
  } else {
    if (args.llm_responses === undefined) {
      return err({
        code: "user.aborted",
        message: "Pending step expects llm_responses; none provided.",
      });
    }
    if (args.user_answers !== undefined) {
      return err({
        code: "user.forbidden-flag-combo",
        message: "Pending step expects llm_responses; user_answers should not be sent.",
      });
    }
  }
  return ok(true);
}
