// SPEC: docs/philosophers/runbooks/socrates.md (Stage 5-A.3 Rev 2) +
//       docs/loops/alignment-loop.md Phase 2 ordering.
//
// `agora socrates` — Phase 2 elenchus pass. After all 4 Aristotle causes
// are captured and BEFORE Plato maturity tagging, Socrates case-probes
// the load-bearing claims (telos + form) toward aporia. When the user
// reaches aporia / refines, the refined wording is written back into
// four_causes.json so downstream maturity + handoff operate on the
// sharpened claim. Elenchus artifacts persist to .agora/elenchus.json.
//
// Load-bearing policy (runbook §1 + Plato floors): telos + form are
// probed (load_bearing); material + efficient are lighter (pistis floor)
// and skipped here.
//
// Refusal guards:
//   - no .agora/ → user.aborted
//   - all 4 causes not yet captured → user.aborted (run agora round)
//   - elenchus.json already present → user.confirmation-required
//   - --json without nothing to drive (interactive) → user.aborted

import { join } from "node:path";

import { intro, log, outro, text } from "@clack/prompts";
import pc from "picocolors";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { selectRuntime } from "../../llm/selection.js";
import type { FourCauses } from "../../philosophers/aristotle.js";
import {
  type CwdSignal,
  type ElenchedClaim,
  type PriorClaim,
  runSocratesElenchus,
  type SocratesClaim,
  type SocratesUi,
} from "../../philosophers/socrates.js";
import { err, ok, type Result } from "../../result/index.js";
import { appendEvent } from "../../shared/events.js";
import { readJsonOrNull, writeJsonAtomic } from "../../shared/io.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { loadState } from "../../state/reader.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

interface Phase0Scan {
  is_brownfield?: boolean;
  detected_stack?: string[];
  detected_patterns?: string[];
}

interface ElenchusFile {
  version: 1;
  elenched: ElenchedClaim[];
  created_at: string;
}

export async function runSocratesCommand(
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
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "Socrates runs after all 4 Aristotle causes are captured. Run `agora round` until efficient is done.",
        },
      }),
    );
  }

  const elenchusPath = join(cwd, ".agora", "elenchus.json");
  if ((await readJsonOrNull<ElenchusFile>(elenchusPath)) !== null) {
    return err(
      buildAgoraError("user.confirmation-required", {
        context: {
          detail:
            "Elenchus already run (elenchus.json present). Remove .agora/elenchus.json to re-probe, or run `agora round` to continue to maturity.",
        },
      }),
    );
  }

  // Interactive only — refuse JSON mode (clack TUI bytes garble JSON).
  if (flags.json) {
    return err(
      buildAgoraError("user.aborted", {
        context: {
          detail:
            "agora socrates is interactive (Elenchus dialogue). --json driver pending; run in a TTY.",
        },
      }),
    );
  }

  const scan = await readJsonOrNull<Phase0Scan>(join(cwd, ".agora", "scan.json"));
  const cwdSignal: CwdSignal = {
    is_brownfield: scan?.is_brownfield ?? false,
    detected_files: [],
    detected_patterns: scan?.detected_patterns ?? [],
  };

  // Load-bearing claims: telos + form. (material/efficient lighter → skip.)
  const claims: SocratesClaim[] = [
    {
      id: "telos_001",
      content: causes.telos.statement,
      cause: "telos",
      load_bearing: true,
      prior_aporia_count: 0,
    },
    {
      id: "form_001",
      content: causes.form.essential_structure,
      cause: "form",
      load_bearing: true,
      prior_aporia_count: 0,
    },
  ];

  intro(pc.bold(localized("cli.socrates.intro")));

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

  const ui = buildClackUi();
  const elenched: ElenchedClaim[] = [];
  const priorHistory: PriorClaim[] = [];
  const refinedCauses: FourCauses = { ...causes };

  for (const claim of claims) {
    const result = await runSocratesElenchus(
      { claim, cwd_signal: cwdSignal, prior_round_history: priorHistory, locale: flags.locale },
      runtime.runner,
      ui,
    );
    if (!result.ok) {
      await runtime.cache.flush();
      return result;
    }
    const ec = result.value.elenched_claim;
    elenched.push(ec);
    priorHistory.push({ id: ec.claim_id, content: ec.original_content, outcome: ec.outcome });

    // Feed a refinement back into four_causes so downstream operates on the
    // sharpened claim.
    if (ec.outcome !== "confirmed" && ec.refined_content !== undefined) {
      if (claim.cause === "telos" && refinedCauses.telos !== undefined) {
        refinedCauses.telos = { ...refinedCauses.telos, statement: ec.refined_content };
      } else if (claim.cause === "form" && refinedCauses.form !== undefined) {
        refinedCauses.form = { ...refinedCauses.form, essential_structure: ec.refined_content };
      }
      log.info(localized("cli.socrates.refined", { cause: claim.cause }));
    }
  }
  await runtime.cache.flush();

  const elenchusFile: ElenchusFile = {
    version: 1,
    elenched,
    created_at: new Date().toISOString(),
  };
  await writeJsonAtomic(elenchusPath, elenchusFile);

  // Persist any refinements back to four_causes.json.
  const refinedAny = elenched.some((e) => e.outcome !== "confirmed");
  if (refinedAny) {
    await writeJsonAtomic(causesPath, {
      ...refinedCauses,
      updated_at: new Date().toISOString(),
    });
  }

  const aporiaCount = elenched.reduce((sum, e) => sum + e.aporia_count, 0);
  await appendEvent(cwd, {
    type: "dialog.choice",
    command: "agora socrates",
    data: {
      dialog: "elenchus",
      probed: elenched.filter((e) => e.load_bearing_pass).length,
      aporia_count: aporiaCount,
      refined: refinedAny,
    },
  });

  outro(
    pc.green(
      localized("cli.socrates.done", {
        probed: String(elenched.filter((e) => e.load_bearing_pass).length),
        aporia: String(aporiaCount),
      }),
    ),
  );

  return ok(buildEnvelope(elenched, aporiaCount, refinedAny));
}

function buildClackUi(): SocratesUi {
  return {
    askElenchusResponse: async ({ question }) => {
      const response = await text({
        message: question,
        placeholder: "Your honest reaction — agree, disagree, or refine",
      });
      if (typeof response !== "string") return "";
      return response;
    },
  };
}

function buildEnvelope(
  elenched: ElenchedClaim[],
  aporiaCount: number,
  refined: boolean,
): CommandEnvelope {
  return {
    command: "agora socrates",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        probed: elenched.filter((e) => e.load_bearing_pass).length,
        aporia_count: aporiaCount,
        refined,
        outcomes: elenched.map((e) => ({ claim_id: e.claim_id, outcome: e.outcome })),
      },
    },
    next: [
      {
        id: "maturity_pending",
        description: "Elenchus complete; run agora round for Plato maturity tagging",
        command: "agora round",
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
