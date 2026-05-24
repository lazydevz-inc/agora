// SPEC: src/mcp/tools.ts + src/mcp/server.ts (ADR-0009 MCP foundation).
//
// Tool handlers wrap read-only commands that resolve cwd via
// findProjectRoot(process.cwd()); tests chdir into a temp dir (restored
// afterEach) to exercise them in isolation.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AgoraErrorThrown } from "@/errors/types.js";
import { buildAgoraMcpServer } from "@/mcp/server.js";
import { envelopeToMcp, mcpResume, mcpStatus, mcpTrace } from "@/mcp/tools.js";
import { err, ok } from "@/result/index.js";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), "agora-mcp-"));
  process.chdir(cwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(cwd, { recursive: true, force: true });
});

describe("envelopeToMcp", () => {
  test("ok result → text content, no isError", () => {
    const envelope = {
      command: "agora status",
      version: "x",
      timestamp: "t",
      result: { ok: true as const, data: { session_present: false } },
      next: [],
      warnings: [],
      errors: [],
      exit_code: 0 as const,
    };
    const r = envelopeToMcp(ok(envelope));
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.type).toBe("text");
    const parsed = JSON.parse(r.content[0]?.text ?? "") as { command: string };
    expect(parsed.command).toBe("agora status");
  });

  test("err result → isError true + code/message", () => {
    const error = new AgoraErrorThrown({
      code: "user.aborted",
      category: "user",
      message: "nope",
      message_key: "errors.user.aborted",
    });
    const r = envelopeToMcp(err(error));
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content[0]?.text ?? "") as { ok: boolean; error: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("user.aborted");
  });
});

describe("mcpStatus — read-only, no session", () => {
  test("no .agora/ → ok envelope with session_present false", async () => {
    const r = await mcpStatus();
    expect(r.isError).toBeUndefined();
    const parsed = JSON.parse(r.content[0]?.text ?? "") as {
      result: { data: { session_present: boolean } };
    };
    expect(parsed.result.data.session_present).toBe(false);
  });
});

describe("mcpResume — read-only, no session", () => {
  test("no .agora/ → no_session handler envelope", async () => {
    const r = await mcpResume();
    expect(r.isError).toBeUndefined();
    const parsed = JSON.parse(r.content[0]?.text ?? "") as {
      result: { data: { handler: string } };
    };
    expect(parsed.result.data.handler).toBe("no_session");
  });
});

describe("mcpTrace", () => {
  test("no .agora/ → isError (user.aborted)", async () => {
    const r = await mcpTrace({});
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content[0]?.text ?? "") as { error: { code: string } };
    expect(parsed.error.code).toBe("user.aborted");
  });

  test("seeded events.jsonl + type filter → returns matching events", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const ev = (type: string, command: string) =>
      JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        ts: new Date().toISOString(),
        type,
        command,
        data: {},
      });
    await writeFile(
      join(cwd, ".agora", "events.jsonl"),
      `${ev("command.invoked", "agora new")}\n${ev("gate_5.result", "agora ralph")}\n`,
      "utf8",
    );
    const r = await mcpTrace({ type: "gate_5.result" });
    expect(r.isError).toBeUndefined();
    const parsed = JSON.parse(r.content[0]?.text ?? "") as {
      result: { data: { count: number } };
    };
    expect(parsed.result.data.count).toBe(1);
  });
});

describe("buildAgoraMcpServer", () => {
  test("constructs a server without throwing", () => {
    expect(() => buildAgoraMcpServer()).not.toThrow();
  });
});
