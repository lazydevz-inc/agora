// SPEC: docs/cli/spec.md (no per-command anchor — `round` is a Phase 2
//       orchestrator added when shortcut count exceeded threshold per
//       6-A.13 NOTES) + docs/loops/alignment-loop.md Phase 2 ordering.
//
// `agora round` — state-aware orchestrator that picks the next Phase 2
// step and runs it. Reads .agora/four_causes.json + state.alignment.round
// and dispatches to the correct underlying command:
//
//   nothing yet (round=0)        → telos
//   telos done                   → form
//   form done                    → material
//   material done                → efficient
//   efficient done (round=4)     → maturity (Plato DL)
//   maturity done                → "ready for handoff" (deferred)
//
// Falls through to existing per-cause commands' refusal-guards if state
// is corrupt or upstream prerequisites missing — `round` does not
// duplicate those checks; it just routes.
//
// Existing per-cause commands (telos / form / material / efficient /
// maturity) stay registered so power users can force-invoke specific
// rounds. `agora round` is the discoverable single-entry alternative.

import { join } from "node:path";
import pc from "picocolors";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import type { FourCauses } from "../../philosophers/aristotle.js";
import { err, ok, type Result } from "../../result/index.js";
import { readJsonOrNull } from "../../shared/io.js";
import { findProjectRoot, hasAgoraSession } from "../../shared/path.js";
import { agoraVersion } from "../../shared/version.js";
import { loadState } from "../../state/reader.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";
import { runAcCommand } from "./ac.js";
import { runEfficientCommand } from "./efficient.js";
import { runFormCommand } from "./form.js";
import { runHandoffCommand } from "./handoff.js";
import { runMaterialCommand } from "./material.js";
import { runMaturityCommand } from "./maturity.js";
import { runSocratesCommand } from "./socrates.js";
import { runTelosCommand } from "./telos.js";

type RoundTarget =
  | "telos"
  | "form"
  | "material"
  | "efficient"
  | "socrates"
  | "maturity"
  | "ac"
  | "handoff"
  | "complete";

export async function runRoundCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
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
  const state = stateResult.value;
  const alignmentPhase = state.alignment?.phase ?? 0;
  if (alignmentPhase < 1) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "agora round requires Phase 1 intake first. Run `agora intake` to capture raw context.",
        },
      }),
    );
  }

  const causes = await readJsonOrNull<FourCauses>(join(cwd, ".agora", "four_causes.json"));
  // elenchus + AC + seed presence discriminate the post-cause branches.
  const elenchusPresent =
    (await readJsonOrNull<unknown>(join(cwd, ".agora", "elenchus.json"))) !== null;
  const acsPresent =
    (await readJsonOrNull<unknown>(join(cwd, ".agora", "acceptance_criteria.json"))) !== null;
  const seedPresent = (await readJsonOrNull<unknown>(join(cwd, ".agora", "seed.json"))) !== null;
  const target = pickNextRound(causes, acsPresent, seedPresent, elenchusPresent);

  if (target === "complete") {
    return ok(buildCompleteEnvelope());
  }

  return await dispatchTarget(target, flags, positional);
}

export function pickNextRound(
  causes: FourCauses | null,
  acsPresent = false,
  seedPresent = false,
  elenchusPresent = false,
): RoundTarget {
  if (causes === null || causes.telos === undefined) return "telos";
  if (causes.form === undefined) return "form";
  if (causes.material === undefined) return "material";
  if (causes.efficient === undefined) return "efficient";
  // All 4 captured. Socrates elenchus runs next (case-probe load-bearing
  // claims toward aporia) — discriminated by elenchus.json presence so it
  // sits between efficient and maturity without disturbing round numbers.
  if (!elenchusPresent) return "socrates";
  // All 4 captured + elenchus done. Maturity has not been re-tagged yet if
  // telos.maturity is still its Aristotle-default. Heuristic: noesis means
  // Plato has run successfully on telos.
  if (causes.telos.maturity !== "noesis") return "maturity";
  // Maturity passed. AC capture is next prep step before handoff.
  if (!acsPresent) return "ac";
  // AC captured. Handoff (Plato DH + seed.json) is next.
  if (!seedPresent) return "handoff";
  return "complete";
}

async function dispatchTarget(
  target: Exclude<RoundTarget, "complete">,
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  switch (target) {
    case "telos":
      return await runTelosCommand(flags, positional);
    case "form":
      return await runFormCommand(flags, positional);
    case "material":
      return await runMaterialCommand(flags, positional);
    case "efficient":
      return await runEfficientCommand(flags, positional);
    case "socrates":
      return await runSocratesCommand(flags, positional);
    case "maturity":
      return await runMaturityCommand(flags, positional);
    case "ac":
      return await runAcCommand(flags, positional);
    case "handoff":
      return await runHandoffCommand(flags, positional);
  }
}

function buildCompleteEnvelope(): CommandEnvelope {
  console.log(pc.green(localized("cli.round.alignment_complete_msg")));
  return {
    command: "agora round",
    version: agoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { target: "complete" },
    },
    next: [
      {
        id: "handoff_pending",
        description: "Alignment complete; handoff (Plato Dihairesis + ac_tree) not yet implemented",
        command: "agora resume",
      },
    ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}
