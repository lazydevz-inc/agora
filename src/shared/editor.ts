// SPEC: docs/loops/alignment-loop.md (Phase 1 §"Editor escape contract", L304-321).
//
// LAYER 0 helper for spawning the user's $EDITOR with a temp file. Used by
// `agora intake` (Phase 1 open intake editor escape). Any future command
// that needs long-form input through the user's editor can share this.
//
// Behavior:
//   - Writes the temp file with the supplied initialContent (the SPEC's
//     pre-populated comment header lives in the caller, not here — this
//     module is content-agnostic).
//   - Resolves the editor in this order: $EDITOR env → vim → nano → vi.
//   - Spawns inherit-stdio so the user sees the real TTY editor.
//   - After the editor exits cleanly, reads the file back and strips
//     HTML-style comment lines (`<!-- ... -->`) per the SPEC's
//     "Lines starting with <!-- are ignored" rule.
//   - Throws a typed AgoraErrorThrown when no editor candidate is
//     available so the caller can render the catalog message.
//
// Boundaries:
//   - Does NOT decide what to do with empty content; that's orchestrator
//     logic (re-prompt-once → exit 2 lives in alignment/phase-1-intake).
//   - Does NOT clean up the temp file. Callers move it into history/ or
//     delete it; this module is invoked once per editor session.

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { buildAgoraError } from "../errors/build.js";

export interface OpenEditorOptions {
  readonly filePath: string;
  readonly initialContent: string;
}

export async function openEditorAndRead(opts: OpenEditorOptions): Promise<string> {
  await writeFile(opts.filePath, opts.initialContent, "utf8");
  const editor = await pickEditor();
  if (editor === null) {
    throw buildAgoraError("io.editor-unavailable", {
      context: { detail: "No editor found via $EDITOR or vim/nano/vi fallback chain" },
    });
  }
  await spawnEditorInteractive(editor, opts.filePath);
  const raw = await readFile(opts.filePath, "utf8");
  return stripCommentLines(raw);
}

async function pickEditor(): Promise<string | null> {
  const explicit = process.env.EDITOR;
  if (explicit !== undefined && explicit.trim().length > 0) {
    if (await commandAvailable(explicit)) return explicit;
  }
  for (const fallback of ["vim", "nano", "vi"]) {
    if (await commandAvailable(fallback)) return fallback;
  }
  return null;
}

function commandAvailable(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd], { stdio: "ignore" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function spawnEditorInteractive(cmd: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [filePath], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`Editor '${cmd}' exited with code ${String(code)}`));
    });
    child.on("error", reject);
  });
}

export function stripCommentLines(content: string): string {
  // Per SPEC: lines starting with <!-- are ignored. Block comments
  // <!-- ... --> across multiple lines are also stripped.
  const lines = content.split("\n");
  const kept: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.endsWith("-->")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("<!--") && trimmed.endsWith("-->")) continue;
    if (trimmed.startsWith("<!--")) {
      inBlock = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}
