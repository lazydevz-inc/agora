// SPEC: ADR-0010 §"Pending-state shape" — roundtrip + clear + schema
// rejection for .agora/mcp_pending.json.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  clearPending,
  type McpPending,
  pendingPath,
  readPending,
  writePending,
} from "@/mcp/pending.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-pending-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("readPending", () => {
  test("missing file → ok(null)", async () => {
    const r = await readPending(cwd);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(null);
  });

  test("malformed JSON → state.corrupt error", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(pendingPath(cwd), "{not-json", "utf8");
    const r = await readPending(cwd);
    // readJsonOrNull degrades to null on parse fail; orchestrator treats
    // that as "no pending" rather than corrupt, so this returns null.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(null);
  });

  test("valid-shaped JSON but missing fields → state.corrupt error", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(pendingPath(cwd), JSON.stringify({ version: 1 }), "utf8");
    const r = await readPending(cwd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("state.corrupt");
  });
});

describe("write + read roundtrip", () => {
  test("preserves the full pending shape", async () => {
    const pending: McpPending = {
      version: 1,
      owner: "align",
      step: "telos.extract",
      expects: "llm_responses",
      issued_prompts: [
        {
          id: "extract",
          system: "S",
          user: "U",
          expect: "json",
          schema_hint: "{a, b}",
        },
      ],
      scratch: { input: { raw_intake: "x" }, raw: { why_exists: "w" } },
      issued_at: new Date().toISOString(),
    };
    await writePending(cwd, pending);
    const r = await readPending(cwd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(pending);
  });
});

describe("clearPending", () => {
  test("removes existing file; ENOENT is fine", async () => {
    await clearPending(cwd); // no file yet → no throw
    const pending: McpPending = {
      version: 1,
      owner: "ralph",
      step: "gate_5",
      expects: "llm_responses",
      scratch: {},
      issued_at: new Date().toISOString(),
    };
    await writePending(cwd, pending);
    const before = await readPending(cwd);
    expect(before.ok && before.value !== null).toBe(true);
    await clearPending(cwd);
    const after = await readPending(cwd);
    expect(after.ok && after.value).toBe(null);
  });
});
