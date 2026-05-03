// SPEC: docs/loops/handoff.md (Stage 2-C.3) — atomic state.json reader.
//
// loadState(cwd) → Result<State | null>:
//   - null: no .agora/state.json exists yet (greenfield / pre-session)
//   - State: parsed + Zod-validated
//   - err: state.corrupt (parse/validation fail) or state.unreadable (FS error)

import { join } from "node:path";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";
import { readJsonOrNull } from "../shared/io.js";
import { type State, StateSchema } from "./types.js";

export function stateFilePath(cwd: string): string {
  return join(cwd, ".agora", "state.json");
}

export async function loadState(cwd: string): Promise<Result<State | null, AgoraErrorThrown>> {
  const path = stateFilePath(cwd);
  const raw = await readJsonOrNull<unknown>(path);
  if (raw === null) {
    return ok(null);
  }
  const parsed = StateSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      buildAgoraError("state.corrupt", {
        context: { file: path, detail: parsed.error.issues[0]?.message ?? "validation failed" },
      }),
    );
  }
  return ok(parsed.data);
}
