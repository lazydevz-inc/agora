// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 R5-A Runtime API).

import { describe, expect, test } from "vitest";

import { getPrompt, PROMPT_LIBRARY, renderPrompt } from "@/prompts/index.js";
import { PromptEntrySchema } from "@/prompts/types.js";

describe("PROMPT_LIBRARY (generated)", () => {
  test("contains at least one entry", () => {
    const keys = Object.keys(PROMPT_LIBRARY);
    expect(keys.length).toBeGreaterThan(0);
  });

  test("every entry validates against PromptEntrySchema", () => {
    for (const [key, entry] of Object.entries(PROMPT_LIBRARY)) {
      const result = PromptEntrySchema.safeParse(entry);
      if (!result.success) {
        throw new Error(
          `${key} fails schema: ${result.error.issues.map((i) => i.message).join("; ")}`,
        );
      }
    }
  });

  test("every philosopher entry has runbook + runbook_revision pointer", () => {
    for (const [key, entry] of Object.entries(PROMPT_LIBRARY)) {
      if (entry.namespace === "philosopher") {
        expect(entry.runbook, `${key}: runbook should be set`).toBeDefined();
        expect(entry.runbook_revision, `${key}: runbook_revision should be set`).toBeDefined();
      }
    }
  });

  test("fingerprint matches sha256:<64 hex> shape", () => {
    for (const [key, entry] of Object.entries(PROMPT_LIBRARY)) {
      expect(entry.fingerprint, `${key}: fingerprint shape`).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
});

describe("getPrompt", () => {
  test("returns the entry for a known key", () => {
    const keys = Object.keys(PROMPT_LIBRARY) as (keyof typeof PROMPT_LIBRARY)[];
    const firstKey = keys[0];
    if (firstKey === undefined) return;
    const entry = getPrompt(firstKey);
    expect(entry).toBe(PROMPT_LIBRARY[firstKey]);
  });
});

describe("renderPrompt", () => {
  test("renders a prompt with full context, returns Result.ok", () => {
    // Pick the first available entry and build a context covering all
    // its declared placeholders with stub strings.
    const keys = Object.keys(PROMPT_LIBRARY) as (keyof typeof PROMPT_LIBRARY)[];
    const firstKey = keys[0];
    if (firstKey === undefined) return;
    const entry = PROMPT_LIBRARY[firstKey];
    const context: Record<string, string> = {};
    for (const p of entry.placeholders) context[p] = `<${p}>`;
    const result = renderPrompt(firstKey, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { system, user } = result.value;
    expect(typeof system).toBe("string");
    expect(typeof user).toBe("string");
    // Every placeholder should have been substituted in the user template.
    for (const p of entry.placeholders) {
      expect(user).toContain(`<${p}>`);
      expect(user).not.toContain(`{${p}}`);
    }
  });

  test("returns Result.err when a declared placeholder is missing from context", () => {
    const keys = Object.keys(PROMPT_LIBRARY) as (keyof typeof PROMPT_LIBRARY)[];
    const candidate = keys.find((k) => PROMPT_LIBRARY[k].placeholders.length > 0);
    if (candidate === undefined) return; // all entries have zero placeholders
    const result = renderPrompt(candidate, {}); // missing all
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("internal.invariant-violation");
  });
});
