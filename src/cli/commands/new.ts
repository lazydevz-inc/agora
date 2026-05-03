// SPEC: docs/cli/spec.md Stage 3-B.4 + docs/loops/alignment-loop.md (Phase 0).
//
// `agora new [name]` — create .agora/ directory + initial state.json +
// run Phase 0 auto-scan. Refuses to overwrite an existing session;
// suggests `agora status` instead.

import { join } from "node:path";
import pc from "picocolors";
import { runPhase0Scan } from "../../alignment/phase-0-scan.js";
import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { ok, type Result } from "../../result/index.js";
import { writeJsonAtomic } from "../../shared/io.js";
import { ensureAgoraDir, findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import { newState } from "../../state/types.js";
import { saveState } from "../../state/writer.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

export async function runNewCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());
  if (await hasAgoraDir(cwd)) {
    return error("user.confirmation-required", {
      detail:
        "Existing Agora session detected (.agora/ already present). Use `agora status` to inspect or remove .agora/ to start fresh.",
    });
  }

  const projectName = positional.length > 0 ? positional[0] : undefined;
  const scan = await runPhase0Scan(cwd, projectName);

  // Materialize .agora/ + state.json + scan.json.
  await ensureAgoraDir(cwd);
  const initialState = newState();
  initialState.current_phase = "in_alignment";
  initialState.alignment = { phase: 0, round: 0 };
  const stateResult = await saveState(cwd, initialState);
  if (!stateResult.ok) return stateResult;

  await writeJsonAtomic(join(cwd, ".agora", "scan.json"), scan);

  if (!flags.json) {
    emitTui(scan);
  }
  return ok(buildEnvelope(scan));
}

function emitTui(scan: Awaited<ReturnType<typeof runPhase0Scan>>): void {
  console.log(pc.bold(localized("cli.new.created", { project: scan.project_name })));
  console.log("");
  const fieldLabel = (key: string, value: string): string =>
    `  ${pc.dim(key.padEnd(18, " "))} ${value}`;
  console.log(fieldLabel("Project type:", scan.is_brownfield ? "brownfield" : "greenfield"));
  if (scan.git_remote !== null) {
    console.log(fieldLabel("Git remote:", scan.git_remote));
  }
  if (scan.detected_patterns.length > 0) {
    console.log(fieldLabel("Patterns:", scan.detected_patterns.join(", ")));
  }
  if (scan.detected_stack.length > 0) {
    const first = scan.detected_stack.slice(0, 5).join(", ");
    const more = scan.detected_stack.length > 5 ? ` (+${scan.detected_stack.length - 5} more)` : "";
    console.log(fieldLabel("Top deps:", `${first}${more}`));
  }
  console.log(fieldLabel("Scan time:", `${scan.scan_duration_ms}ms`));
  console.log("");
  console.log(localized("cli.new.next_phase_minus_1"));
  console.log(localized("cli.new.next_phase_1"));
}

function buildEnvelope(scan: Awaited<ReturnType<typeof runPhase0Scan>>): CommandEnvelope {
  return {
    command: "agora new",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { scan },
    },
    next: [
      {
        id: "continue_alignment",
        description: scan.is_brownfield
          ? "Skip Phase −1 brackets (brownfield default-off); jump to Phase 1 intake"
          : "Run Phase −1 Epoché to bracket assumptions before intake",
        command: scan.is_brownfield ? "agora resume" : "agora bracket",
      },
    ],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}

function error(
  code: Parameters<typeof buildAgoraError>[0],
  ctx: Record<string, unknown>,
): Result<never, AgoraErrorThrown> {
  return { ok: false, error: buildAgoraError(code, { context: ctx }) };
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
