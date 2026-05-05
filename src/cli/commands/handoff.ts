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

import { join } from "node:path";

import { confirm, intro, log, outro } from "@clack/prompts";
import pc from "picocolors";

import type { AcceptanceCriteriaResult } from "../../alignment/acceptance-criteria.js";
import type { Phase1Result } from "../../alignment/phase-1-intake.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import type { ACNode, DihairesisResult } from "../../handoff/dihairesis.js";
import { renderTreeForReview, runDihairesis } from "../../handoff/dihairesis.js";
import { buildSeed, type Seed } from "../../handoff/seed-builder.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import type { FourCauses } from "../../philosophers/aristotle.js";
import type { DefendedFrame } from "../../philosophers/husserl.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runHandoffCommand(
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
  const state = stateResult.value;
  if (state.current_phase !== "alignment_complete") {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail: `Handoff requires alignment_complete state (current=${state.current_phase}). Run \`agora maturity\` until all 4 causes pass.`,
        },
      }),
    );
  }

  // seed.json already exists → over-handoff guard.
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

  // R4-A: single state transition alignment_complete → ready_for_ralph.
  // alignment.round 6 → 7 (handoff done; Ralph next).
  const advanced = await saveState(cwd, {
    ...state,
    current_phase: "ready_for_ralph",
    alignment: { phase: 2, round: 7 },
  });
  if (!advanced.ok) return advanced;

  outro(
    pc.green(
      `✓ Seed locked. ${String(dh.total_atomic_leaves)} atomic leaves across ${String(dh.ac_tree.length)} ACs. .agora/seed.json written. Ready for Ralph.`,
    ),
  );

  return ok(buildEnvelope(seed, dh));
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
    version: getAgoraVersion(),
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
