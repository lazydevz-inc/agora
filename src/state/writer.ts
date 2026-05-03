// SPEC: docs/loops/handoff.md (Stage 2-C.3) — atomic state.json writer.
//
// saveState(cwd, state) writes via shared/io.writeJsonAtomic
// (write-temp + rename). Updates `updated_at` automatically.

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";
import { writeJsonAtomic } from "../shared/io.js";
import { stateFilePath } from "./reader.js";
import { type State, StateSchema } from "./types.js";

export async function saveState(
  cwd: string,
  state: State,
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
  return ok(validated.data);
}
