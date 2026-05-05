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

import { intro, log, outro } from "@clack/prompts";
import pc from "picocolors";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { ACNode } from "../../handoff/dihairesis.js";
import type { Seed } from "../../handoff/seed-builder.js";
import { localized } from "../../i18n/index.js";
import { runGate1 } from "../../ralph/gate-1.js";
import { countAtomicLeaves, selectNextLeaf } from "../../ralph/leaf-selector.js";
import {
  type Gate1Result,
  newRalphState,
  type RalphState,
  RalphStateSchema,
} from "../../ralph/state.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runRalphCommand(
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
    const advanced = await saveState(cwd, {
      ...sessionState,
      current_phase: "in_ralph",
    });
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
    const advanced = await saveState(cwd, {
      ...sessionState,
      current_phase: "ralph_complete",
    });
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

  const gate1 = await runGate1({ cwd });

  // Persist updated ralph_state.
  const newAttempts = attemptsBefore + 1;
  const completed = new Set(ralphState.completed_leaves);
  let nextLeaf: string | null = currentLeaf;
  if (gate1.overall_passed) {
    completed.add(currentLeaf);
    nextLeaf = selectNextLeaf(ralphState.ac_tree_snapshot as ACNode[], completed);
  }
  const updated: RalphState = RalphStateSchema.parse({
    ...ralphState,
    current_leaf_id: nextLeaf,
    completed_leaves: [...completed],
    per_leaf_attempts: gate1.overall_passed
      ? ralphState.per_leaf_attempts
      : { ...ralphState.per_leaf_attempts, [currentLeaf]: newAttempts },
    session_total_attempts: ralphState.session_total_attempts + 1,
    last_gate_1_result: gate1,
    updated_at: new Date().toISOString(),
  });
  await writeJsonAtomic(ralphStatePath, updated);

  // Render + decide outcome.
  if (gate1.overall_passed) {
    log.success(
      localized("cli.ralph.gate_1_passed", {
        leaf_id: currentLeaf,
        duration_s: (gate1.total_duration_ms / 1000).toFixed(1),
      }),
    );
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
      pc.cyan(`Gate 1 passed. Next leaf: ${nextLeaf}. Implement, then re-run \`agora ralph\`.`),
    );
    return ok(
      buildEnvelope({
        action: "leaf_passed",
        previous_leaf_id: currentLeaf,
        current_leaf_id: nextLeaf,
        completed_count: completed.size,
        total_leaves: countAtomicLeaves(seed.ac_tree as ACNode[]),
        last_gate_1_result: gate1,
      }),
    );
  }

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
  action: "initialized" | "leaf_passed" | "gate_1_failed" | "all_complete";
  current_leaf_id?: string;
  previous_leaf_id?: string;
  completed_count?: number;
  total_leaves?: number;
  attempts?: number;
  cap?: number;
  failed_commands?: string[];
  last_gate_1_result?: Gate1Result;
}

function buildEnvelope(data: RalphEnvelopeData): CommandEnvelope {
  return {
    command: "agora ralph",
    version: getAgoraVersion(),
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
              description: "Ralph complete; downstream gates (2-5) not yet implemented",
              command: "agora resume",
            },
          ]
        : [
            {
              id: "implement_or_fix",
              description:
                data.action === "gate_1_failed"
                  ? "Fix the failed sub-command, then re-run agora ralph"
                  : "Implement the current leaf, then re-run agora ralph",
              command: "agora ralph",
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
