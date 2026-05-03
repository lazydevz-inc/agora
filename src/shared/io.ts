// SPEC: docs/architecture/module-graph.md (Stage 5-A.1)
//
// Atomic JSON read/write helpers. Used by state/, probes/cache, history/.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Read JSON file. Returns parsed value, or `null` if file missing / invalid.
 * (Throws nothing — errors degrade to null. Caller can use Zod for validation.)
 */
export async function readJsonOrNull<T = unknown>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Atomic JSON write: writes to <path>.tmp, then renames over <path>.
 * Creates parent directory if needed.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}
