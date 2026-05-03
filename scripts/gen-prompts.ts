// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 R4-A "Generation
//       + Validation Mechanism" + "Generator Algorithm" sub-section).
//
// Reads docs/philosophers/runbooks/*.md (excluding _template.md) + (future)
// src/critics/definitions/*.ts and emits src/prompts/_generated.ts.
//
// CLI usage:
//   pnpm gen:prompts            # write src/prompts/_generated.ts
//   pnpm gen:prompts --check    # write to a temp file + diff vs committed;
//                               # exit 4 (gate.gate-1-deterministic-fail) on
//                               # mismatch — used by `pnpm lint:prompts`.
//
// Markdown parsing is regex-based on purpose: ADR-0001 minimalism + the
// runbook §4 layout is uniform (## 4. Prompt → ### 4.X <key> → fenced
// ```text block → ## System prompt + ## User prompt template inside).
// No markdown AST dependency.
//
// Critic prompts: SPEC §"Critic Prompt Inclusion" R3-A says critic def
// files live at src/critics/definitions/*.ts each exporting a `prompt`
// const. None exist yet (Stage 6-A.N for first critic). When they land,
// extend extractCriticPrompts() — generator skips silently when the dir
// is empty.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { z } from "zod";

import { PromptEntrySchema } from "../src/prompts/types.js";

const ROOT = resolve(import.meta.dirname, "..");
const RUNBOOK_DIR = join(ROOT, "docs/philosophers/runbooks");
const CRITIC_DIR = join(ROOT, "src/critics/definitions");
const OUTPUT_PATH = join(ROOT, "src/prompts/_generated.ts");

interface ParsedPromptSection {
  key: string;
  system_prompt: string;
  user_prompt_template: string;
}

interface PhilosopherSource {
  owner: string;
  runbook_relpath: string;
  revision: number;
  sections: ParsedPromptSection[];
}

async function main(): Promise<void> {
  const isCheck = process.argv.includes("--check");
  const philosophers = await readPhilosopherRunbooks();
  const critics = await readCriticDefs();

  const entries = buildEntries(philosophers, critics);
  validateEntries(entries);
  const sorted = sortEntries(entries);
  const text = renderModule(sorted);

  if (isCheck) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error(
        `[gen-prompts --check] FAIL: ${OUTPUT_PATH} does not exist. Run \`pnpm gen:prompts\`.`,
      );
      process.exit(4);
    }
    const committed = await readFile(OUTPUT_PATH, "utf8");
    if (committed.trim() !== text.trim()) {
      console.error(
        "[gen-prompts --check] FAIL: src/prompts/_generated.ts is out of sync with sources.",
      );
      console.error(
        "  Run `pnpm gen:prompts` and commit the result. (Stage 4-A.6 gate.gate-1-deterministic-fail)",
      );
      process.exit(4);
    }
    console.log(`[gen-prompts --check] OK — ${String(sorted.length)} entries in sync.`);
    return;
  }

  await writeFile(OUTPUT_PATH, text, "utf8");
  console.log(
    `[gen-prompts] wrote ${OUTPUT_PATH} with ${String(sorted.length)} entries.`,
  );
}

async function readPhilosopherRunbooks(): Promise<PhilosopherSource[]> {
  const sources: PhilosopherSource[] = [];
  if (!existsSync(RUNBOOK_DIR)) return sources;
  const files = await readdir(RUNBOOK_DIR);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    if (file === "_template.md") continue;
    const owner = file.replace(/\.md$/, "");
    const text = await readFile(join(RUNBOOK_DIR, file), "utf8");
    const revision = parseRevision(text);
    const sections = parseSection4(text, owner);
    if (sections.length === 0) continue;
    sources.push({
      owner,
      runbook_relpath: `docs/philosophers/runbooks/${file}`,
      revision,
      sections,
    });
  }
  return sources;
}

async function readCriticDefs(): Promise<{ id: string; relpath: string; system: string; user_template: string; placeholders: string[] }[]> {
  // Critic def files don't exist in this slice (will land with first critic).
  // Generator skips gracefully so the slice ships before critics are wired.
  if (!existsSync(CRITIC_DIR)) return [];
  const files = await readdir(CRITIC_DIR);
  // Reserved for future critic implementation — see SPEC §"Critic Prompt Inclusion".
  if (files.length === 0) return [];
  console.warn(
    `[gen-prompts] critic def files exist at ${CRITIC_DIR} but extractor not yet implemented. Skipping ${String(files.length)} files.`,
  );
  return [];
}

function parseRevision(text: string): number {
  const match = text.match(/^>\s*\*\*Revision\*\*:\s*(\d+)/m);
  if (match === null || match[1] === undefined) {
    throw new Error("runbook missing front-matter `> **Revision**: N`");
  }
  return Number.parseInt(match[1], 10);
}

function parseSection4(text: string, owner: string): ParsedPromptSection[] {
  // Locate "## 4. Prompt" block; ends at next "## " heading (or EOF).
  const startMatch = text.match(/^## 4\. Prompt\s*$/m);
  if (startMatch === null || startMatch.index === undefined) return [];
  const sectionStart = startMatch.index;
  // Find next "## <number>. " heading after section 4.
  const restAfterStart = text.slice(sectionStart + startMatch[0].length);
  const nextSectionMatch = restAfterStart.match(/^## \d+\. /m);
  const sectionEnd =
    nextSectionMatch !== null && nextSectionMatch.index !== undefined
      ? sectionStart + startMatch[0].length + nextSectionMatch.index
      : text.length;
  const section = text.slice(sectionStart, sectionEnd);

  // Iterate "### 4.X <key>" headings.
  const subRe = /^### 4\.(\d+)\s+([^\s\n]+)\s*$/gm;
  const sections: ParsedPromptSection[] = [];
  const subStarts: { idx: number; key: string }[] = [];
  let m: RegExpExecArray | null = subRe.exec(section);
  while (m !== null) {
    const key = m[2];
    if (key !== undefined) {
      subStarts.push({ idx: m.index + m[0].length, key });
    }
    m = subRe.exec(section);
  }
  for (let i = 0; i < subStarts.length; i += 1) {
    const subStart = subStarts[i];
    if (subStart === undefined) continue;
    const subEnd = i + 1 < subStarts.length ? (subStarts[i + 1]?.idx ?? section.length) : section.length;
    const subText = section.slice(subStart.idx, subEnd);
    const parsed = parseFencedPromptBlock(subText, subStart.key, owner);
    if (parsed !== null) sections.push(parsed);
  }
  return sections;
}

function parseFencedPromptBlock(
  subText: string,
  key: string,
  owner: string,
): ParsedPromptSection | null {
  // Find ```text fenced block.
  const fenceMatch = subText.match(/```(?:text)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch === null || fenceMatch[1] === undefined) {
    console.warn(`[gen-prompts] ${owner}/${key}: no fenced text block found, skipping`);
    return null;
  }
  const block = fenceMatch[1];
  // Split on the two ## headings inside the fenced block.
  const sysHeader = "## System prompt";
  const userHeader = "## User prompt template";
  const sysIdx = block.indexOf(sysHeader);
  const userIdx = block.indexOf(userHeader);
  if (sysIdx === -1 || userIdx === -1 || userIdx < sysIdx) {
    console.warn(
      `[gen-prompts] ${owner}/${key}: missing System/User sections inside fenced block, skipping`,
    );
    return null;
  }
  const systemText = block.slice(sysIdx + sysHeader.length, userIdx).trim();
  const userText = block.slice(userIdx + userHeader.length).trim();
  if (systemText.length === 0 || userText.length === 0) {
    console.warn(
      `[gen-prompts] ${owner}/${key}: System or User block is empty, skipping`,
    );
    return null;
  }
  return {
    key,
    system_prompt: systemText,
    user_prompt_template: userText,
  };
}

function buildEntries(
  philosophers: PhilosopherSource[],
  _critics: { id: string }[],
): { key: string; entry: z.infer<typeof PromptEntrySchema> }[] {
  const entries: { key: string; entry: z.infer<typeof PromptEntrySchema> }[] = [];
  for (const p of philosophers) {
    for (const sec of p.sections) {
      const placeholders = extractPlaceholders(sec.user_prompt_template);
      const entry: z.infer<typeof PromptEntrySchema> = {
        namespace: "philosopher",
        owner: p.owner,
        runbook: `${p.runbook_relpath}#4-${sec.key}`,
        runbook_revision: p.revision,
        system_prompt: sec.system_prompt,
        user_prompt_template: sec.user_prompt_template,
        placeholders,
        fingerprint: fingerprint(sec.system_prompt, sec.user_prompt_template),
        used_by: [],
      };
      entries.push({ key: sec.key, entry });
    }
  }
  // Critic entries: deferred until critic def files land.
  return entries;
}

function extractPlaceholders(template: string): string[] {
  const re = /\{([a-z_][a-z0-9_]*)\}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null = re.exec(template);
  while (m !== null) {
    if (m[1] !== undefined) found.add(m[1]);
    m = re.exec(template);
  }
  return [...found].sort();
}

function fingerprint(systemPrompt: string, userPromptTemplate: string): string {
  const normalized = `${systemPrompt}\n---\n${userPromptTemplate}`
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `sha256:${hash}`;
}

function validateEntries(
  entries: { key: string; entry: z.infer<typeof PromptEntrySchema> }[],
): void {
  const seen = new Set<string>();
  for (const { key, entry } of entries) {
    if (seen.has(key)) {
      throw new Error(`Duplicate prompt key: ${key}`);
    }
    seen.add(key);
    const parsed = PromptEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[gen-prompts] entry ${key} fails schema validation: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
  }
}

function sortEntries(
  entries: { key: string; entry: z.infer<typeof PromptEntrySchema> }[],
): { key: string; entry: z.infer<typeof PromptEntrySchema> }[] {
  return [...entries].sort((a, b) => {
    if (a.entry.namespace !== b.entry.namespace) {
      return a.entry.namespace === "philosopher" ? -1 : 1;
    }
    return a.key.localeCompare(b.key);
  });
}

function renderModule(
  entries: { key: string; entry: z.infer<typeof PromptEntrySchema> }[],
): string {
  const lines: string[] = [];
  lines.push("// AUTO-GENERATED — DO NOT EDIT DIRECTLY.");
  lines.push("// Run `pnpm gen:prompts` to regenerate.");
  lines.push("//");
  lines.push("// Source:");
  lines.push("//   - docs/philosophers/runbooks/*.md  (section 4 of each runbook)");
  lines.push("//   - src/critics/definitions/*.ts    (each critic's exported `prompt` const)");
  lines.push("// CI validates in-sync via `pnpm lint:prompts`.");
  lines.push("");
  lines.push('import type { PromptEntry } from "./types.js";');
  lines.push("");
  lines.push("export const PROMPT_LIBRARY = {");
  for (const { key, entry } of entries) {
    lines.push(`  ${JSON.stringify(key)}: ${formatEntry(entry)},`);
  }
  lines.push("} as const satisfies Record<string, PromptEntry>;");
  lines.push("");
  lines.push("export type PromptKey = keyof typeof PROMPT_LIBRARY;");
  lines.push("");
  return lines.join("\n");
}

function formatEntry(entry: z.infer<typeof PromptEntrySchema>): string {
  // Pretty-print with explicit field ordering for stable output.
  const parts: string[] = [];
  parts.push(`namespace: ${JSON.stringify(entry.namespace)}`);
  parts.push(`owner: ${JSON.stringify(entry.owner)}`);
  if (entry.runbook !== undefined) parts.push(`runbook: ${JSON.stringify(entry.runbook)}`);
  if (entry.runbook_revision !== undefined) parts.push(`runbook_revision: ${String(entry.runbook_revision)}`);
  if (entry.critic_def !== undefined) parts.push(`critic_def: ${JSON.stringify(entry.critic_def)}`);
  parts.push(`system_prompt: ${JSON.stringify(entry.system_prompt)}`);
  parts.push(`user_prompt_template: ${JSON.stringify(entry.user_prompt_template)}`);
  parts.push(`placeholders: ${JSON.stringify(entry.placeholders)}`);
  parts.push(`fingerprint: ${JSON.stringify(entry.fingerprint)}`);
  parts.push(`used_by: ${JSON.stringify(entry.used_by)}`);
  return `{\n    ${parts.join(",\n    ")},\n  }`;
}

main().catch((e: unknown) => {
  console.error(`[gen-prompts] FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
