// SPEC: docs/architecture/module-graph.md (Stage 5-A.1)
//
// cwd resolution + .agora/ directory awareness. Used by probes/cache,
// state/, config/loader.

import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Returns the project root for the given cwd. v1 simply returns cwd;
 * future revs may walk upward to find the nearest .agora/ or .git/.
 */
export function findProjectRoot(cwd: string): string {
  return cwd;
}

/**
 * Ensure the .agora/ directory exists for a project. Idempotent.
 */
export async function ensureAgoraDir(cwd: string): Promise<string> {
  const path = join(cwd, ".agora");
  await mkdir(path, { recursive: true });
  return path;
}

/**
 * Check whether .agora/ exists in cwd (no create).
 */
export async function hasAgoraDir(cwd: string): Promise<boolean> {
  try {
    const s = await stat(join(cwd, ".agora"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check whether an actual Agora SESSION exists in cwd — keyed on
 * .agora/state.json, not the bare directory. `agora doctor` (probe cache +
 * audit log) materializes .agora/ without creating a session; treating the
 * bare directory as "session present" broke the natural Gate-0-first order
 * (doctor → new refused with "existing session detected").
 */
export async function hasAgoraSession(cwd: string): Promise<boolean> {
  try {
    const s = await stat(join(cwd, ".agora", "state.json"));
    return s.isFile();
  } catch {
    return false;
  }
}
