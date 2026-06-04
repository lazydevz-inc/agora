// SPEC: docs/cli/spec.md (no per-command anchor — `handoff` is the
//       alignment → ralph transition gate command) +
//       docs/loops/handoff.md (Stage 2-C — DH + seed.json + state lock) +
//       docs/philosophers/runbooks/plato.md §3.2 (DH).
//
// `agora handoff` — atomic operation: Plato Dihairesis on every AC →
// user review of ac_tree (clack confirm) → buildSeed → write seed.json
// + ac_tree.json → state.current_phase: alignment_complete →
// ready_for_ralph + state.alignment.round 6 → 7.
//
// Per Stage 6-A.17 R4-A: SINGLE state transition (no intermediate
// in_handoff phase). Per R5-A: mandatory user review (F-Aquinas-4
// mitigation; SPEC L86 mandate).
//
// Refusal guards (5):
//   - no .agora/ → user.aborted (exit 2)
//   - state.current_phase !== "alignment_complete" → user.aborted
//     (run agora maturity until all 4 causes pass)
//   - missing acceptance_criteria.json → user.aborted
//     (run agora ac first)
//   - missing telos/form/material/efficient (defensive) → state.corrupt
//   - seed.json already present → user.confirmation-required
//     (over-handoff guard; user removes file or proceeds to Ralph)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { confirm, intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import type { AcceptanceCriteriaResult } from "../../alignment/acceptance-criteria.js";
import type { Phase1Result } from "../../alignment/phase-1-intake.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { ACNode, DihairesisResult } from "../../handoff/dihairesis.js";
import { renderTreeForReview, runDihairesis } from "../../handoff/dihairesis.js";
import { buildSeed, type Seed, SeedSchema } from "../../handoff/seed-builder.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import type { FourCauses } from "../../philosophers/aristotle.js";
import type { DefendedFrame } from "../../philosophers/husserl.js";
import { countAtomicLeaves } from "../../ralph/leaf-selector.js";
import { err, ok, type Result } from "../../result/index.js";
import { appendEvent } from "../../shared/events.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runHandoffCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  // Stage 6-A.34: --from-seed=<path> bypasses the entire alignment
  // loop. An agent (or a power user) that already has a complete,
  // schema-valid seed.json provides it directly; handoff validates +
  // installs it + promotes state → ready_for_ralph. Skips the
  // alignment_complete requirement, artifact loading, Dihairesis LLM
  // call, and user confirm.
  const argsResult = parseHandoffArgs(positional);
  if (!argsResult.ok) return argsResult;
  const { fromSeed } = argsResult.value;

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
  const state = stateResult.value;

  // seed.json already exists → over-handoff guard (applies to both paths).
  const seedPath = join(cwd, ".agora", "seed.json");
  const existingSeed = await readJsonOrNull<Seed>(seedPath);
  if (existingSeed !== null) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail: `Seed already locked (.agora/seed.json present). Remove the file to re-handoff, or run \`agora resume\` for Ralph.`,
        },
      }),
    );
  }

  if (fromSeed !== null) {
    return await handoffFromSeed(cwd, state, fromSeed, seedPath, flags.json);
  }

  if (state.current_phase !== "alignment_complete") {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Handoff requires alignment_complete state (current=${state.current_phase}). Run \`agora maturity\` until all 4 causes pass. (Or provide --from-seed=<path> to bypass alignment.)`,
        },
      }),
    );
  }

  // Load all required artifacts.
  const acsPath = join(cwd, ".agora", "acceptance_criteria.json");
  const acs = await readJsonOrNull<AcceptanceCriteriaResult>(acsPath);
  if (acs === null) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: "Handoff requires acceptance criteria first. Run `agora ac` to capture.",
        },
      }),
    );
  }

  const causesPath = join(cwd, ".agora", "four_causes.json");
  const causes = await readJsonOrNull<FourCauses>(causesPath);
  if (
    causes === null ||
    causes.telos === undefined ||
    causes.form === undefined ||
    causes.material === undefined ||
    causes.efficient === undefined
  ) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: causesPath,
          detail: "alignment_complete state but four_causes.json incomplete (defensive check).",
        },
      }),
    );
  }

  const intakePath = join(cwd, ".agora", "intake.json");
  const intake = await readJsonOrNull<Phase1Result>(intakePath);
  if (intake === null) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: intakePath,
          detail: "alignment_complete state but intake.json missing (defensive check).",
        },
      }),
    );
  }

  // Optional: defended_frame (greenfield projects with bracket skipped).
  const defendedFrame = await readJsonOrNull<DefendedFrame>(
    join(cwd, ".agora", "defended_frame.json"),
  );

  intro(pc.bold(localized("cli.handoff.intro")));
  log.message(localized("cli.handoff.dh_starting", { ac_count: String(acs.criteria.length) }));

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

  const dhResult = await runDihairesis(
    {
      acceptance_criteria: acs.criteria,
      telos_statement: causes.telos.statement,
    },
    runtime.runner,
  );
  await runtime.cache.flush();
  if (!dhResult.ok) return dhResult;
  const dh = dhResult.value;

  // Persist ac_tree.json regardless of user confirm (audit trail).
  await writeJsonAtomic(join(cwd, ".agora", "ac_tree.json"), dh);

  // R5-A: mandatory user review.
  log.message(
    localized("cli.handoff.dh_summary", {
      llm_calls: String(dh.total_llm_calls),
      atomic_leaves: String(dh.total_atomic_leaves),
      max_depth: String(dh.max_depth_reached),
      undivided: String(dh.undivided_acs.length),
    }),
  );
  log.message(`\n${renderTreeForReview(dh.ac_tree)}`);

  const accepted = await askLockConfirm(dh.ac_tree);
  if (!accepted) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "User declined to lock seed; ac_tree.json preserved for review." },
      }),
    );
  }

  // Build seed.json (combines all artifacts) + Zod-validate.
  let seed: Seed;
  try {
    seed = buildSeed({
      defended_frame: defendedFrame,
      intake,
      four_causes: causes,
      acceptance_criteria: acs,
      ac_tree: dh.ac_tree,
    });
  } catch (e) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: {
          detail: `seed assembly failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      }),
    );
  }
  await writeJsonAtomic(seedPath, seed);
  await appendEvent(cwd, {
    type: "handoff.completed",
    command: "agora handoff",
    data: {
      ac_tree_root_count: dh.ac_tree.length,
      total_atomic_leaves: dh.total_atomic_leaves,
      max_depth: dh.max_depth_reached,
    },
  });

  // R4-A: single state transition alignment_complete → ready_for_ralph.
  // alignment.round 6 → 7 (handoff done; Ralph next).
  const advanced = await saveState(
    cwd,
    {
      ...state,
      current_phase: "ready_for_ralph",
      alignment: { phase: 2, round: 7 },
    },
    "agora handoff",
  );
  if (!advanced.ok) return advanced;

  outro(
    pc.green(
      `✓ Seed locked. ${String(dh.total_atomic_leaves)} atomic leaves across ${String(dh.ac_tree.length)} ACs. .agora/seed.json written. Ready for Ralph.`,
    ),
  );

  return ok(buildEnvelope(seed, dh));
}

interface HandoffArgs {
  readonly fromSeed: string | null;
}

function parseHandoffArgs(positional: readonly string[]): Result<HandoffArgs, AgoraErrorThrown> {
  let fromSeed: string | null = null;
  for (const arg of positional) {
    if (arg.startsWith("--from-seed=")) {
      fromSeed = arg.slice("--from-seed=".length);
      if (fromSeed.length === 0) {
        return err(
          buildAgoraError("user.forbidden-flag-combo", {
            context: { detail: "--from-seed requires a non-empty path." },
          }),
        );
      }
      continue;
    }
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: {
          detail: `Unknown handoff argument: ${arg}. Supported: --from-seed=<path>.`,
        },
      }),
    );
  }
  return ok({ fromSeed });
}

async function handoffFromSeed(
  cwd: string,
  state: import("../../state/types.js").State,
  fromSeedPath: string,
  seedPath: string,
  json: boolean,
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const resolved = fromSeedPath.startsWith("/") ? fromSeedPath : join(cwd, fromSeedPath);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolved, "utf8"));
  } catch (e) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Could not read/parse --from-seed file ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
        },
      }),
    );
  }
  const parsed = SeedSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `--from-seed file is not a valid seed.json: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
        },
      }),
    );
  }
  const seed = parsed.data;
  // Re-stamp locked_at to NOW (the provided file's timestamp may be
  // stale or copied; the lock happens at this command's execution).
  const lockedSeed: Seed = { ...seed, locked_at: new Date().toISOString() };
  await writeJsonAtomic(seedPath, lockedSeed);

  const atomicLeaves = countAtomicLeaves(lockedSeed.ac_tree as ACNode[]);
  await appendEvent(cwd, {
    type: "handoff.completed",
    command: "agora handoff --from-seed",
    data: {
      ac_tree_root_count: lockedSeed.ac_tree.length,
      total_atomic_leaves: atomicLeaves,
      from_seed: true,
    },
  });

  const advanced = await saveState(
    cwd,
    { ...state, current_phase: "ready_for_ralph", alignment: { phase: 2, round: 7 } },
    "agora handoff --from-seed",
  );
  if (!advanced.ok) return advanced;

  if (!json) {
    outro(
      pc.green(
        `✓ Seed installed from ${resolved}. ${String(atomicLeaves)} atomic leaves across ${String(lockedSeed.ac_tree.length)} ACs. Ready for Ralph.`,
      ),
    );
  }

  return ok({
    command: "agora handoff",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        seed_locked_at: lockedSeed.locked_at,
        ac_tree_atomic_leaves: atomicLeaves,
        ac_tree_root_count: lockedSeed.ac_tree.length,
        from_seed: true,
      },
    },
    next: [
      {
        id: "ralph_pending",
        description: "Seed installed from file; run agora ralph to start implementation",
        command: "agora resume",
      },
    ],
    warnings: [],
    errors: [],
    exit_code: 0,
  });
}

async function askLockConfirm(_tree: readonly ACNode[]): Promise<boolean> {
  const response = await confirm({
    message: "Lock the seed and proceed to Ralph?",
    initialValue: true,
  });
  // Treat clack symbols (cancel) as decline.
  return response === true;
}

function buildEnvelope(seed: Seed, dh: DihairesisResult): CommandEnvelope {
  return {
    command: "agora handoff",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        seed_locked_at: seed.locked_at,
        ac_tree_atomic_leaves: dh.total_atomic_leaves,
        ac_tree_max_depth: dh.max_depth_reached,
        ac_tree_undivided: dh.undivided_acs,
        total_llm_calls: dh.total_llm_calls,
      },
    },
    next: [
      {
        id: "ralph_pending",
        description: "Seed locked; agora ralph (TBD next slice) starts implementation",
        command: "agora resume",
      },
    ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}
