// SPEC: docs/loops/handoff.md (Stage 2-C.3) — atomic state.json writer.
//
// saveState(cwd, state, command?) writes via shared/io.writeJsonAtomic
// (write-temp + rename). Updates `updated_at` automatically. Per Stage
// 6-A.23 R5-A: when current_phase changes, emits a state.transition
// event to .agora/events.jsonl (fail-soft).

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";
import { appendEvent } from "../shared/events.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { stateFilePath } from "./reader.js";
import { type State, StateSchema } from "./types.js";

export async function saveState(
  cwd: string,
  state: State,
  command: string = "agora",
): Promise<Result<State, AgoraErrorThrown>> {
  const next: State = { ...state, updated_at: new Date().toISOString() };
  const validated = StateSchema.safeParse(next);
  if (!validated.success) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: stateFilePath(cwd),
          detail: validated.error.issues[0]?.message ?? "writer validation failed",
        },
      }),
    );
  }
  // Read prior state BEFORE write so we can detect a phase transition.
  // Bypass loadState (which validates) — a corrupt prior file shouldn't
  // block writing a corrected one. readJsonOrNull returns null if missing.
  const priorRaw = await readJsonOrNull<{ current_phase?: string }>(stateFilePath(cwd));
  const priorPhase = priorRaw?.current_phase;
  try {
    await writeJsonAtomic(stateFilePath(cwd), validated.data);
  } catch (e) {
    return err(
      buildAgoraError("state.unreadable", {
        context: {
          file: stateFilePath(cwd),
          detail: e instanceof Error ? e.message : String(e),
        },
      }),
    );
  }
  if (priorPhase !== validated.data.current_phase) {
    await appendEvent(cwd, {
      type: "state.transition",
      command,
      data: {
        version: validated.data.version,
        prior_present: priorRaw !== null,
      },
      ...(priorPhase !== undefined ? { prev_state_phase: priorPhase } : {}),
      new_state_phase: validated.data.current_phase,
    });
  }
  return ok(validated.data);
}
