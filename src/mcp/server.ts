// SPEC: ADR-0009 (Claude Code plugin / MCP as primary mode).
//
// MCP server bootstrap. Registers Agora's read-only tools so a host
// Claude Code session can drive alignment/Ralph state inspection without
// Agora making any LLM call (the host reasons). Connects over stdio.
//
// This is the FOUNDATION: status / doctor / resume / trace (all
// deterministic, LLM-free). The LLM-bearing orchestration tools (running
// a Phase 2 round, a Ralph iteration) land in follow-up slices — those
// require the host-reasoning callback contract described in ADR-0009 §
// "Implementation notes".

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { mcpDoctor, mcpResume, mcpStatus, mcpTrace } from "./tools.js";

export function buildAgoraMcpServer(): McpServer {
  const server = new McpServer({ name: "agora", version: getAgoraVersion() });

  server.registerTool(
    "agora_status",
    {
      description:
        "Show the current Agora session phase + progress, including the Ralph drift trend when in a Ralph phase. Read-only; makes no LLM call.",
    },
    async () => mcpStatus(),
  );

  server.registerTool(
    "agora_doctor",
    {
      description:
        "Run Gate 0 pre-flight infrastructure probes (CLI auth, deps reachable). Read-only; makes no LLM call.",
    },
    async () => mcpDoctor(),
  );

  server.registerTool(
    "agora_resume",
    {
      description:
        "Inspect the current session and report the next concrete step (which command/phase comes next). Read-only; makes no LLM call.",
    },
    async () => mcpResume(),
  );

  server.registerTool(
    "agora_trace",
    {
      description:
        "Query the .agora/events.jsonl audit log. Filter by event type, time window, command substring, and limit. Read-only; makes no LLM call.",
      inputSchema: {
        type: z.string().optional(),
        since: z.string().optional(),
        command: z.string().optional(),
        limit: z.number().int().optional(),
      },
    },
    async (args) => mcpTrace(args),
  );

  return server;
}

export async function startAgoraMcpServer(): Promise<void> {
  const server = buildAgoraMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function getAgoraVersion(): string {
  try {
    const url = new URL("../../package.json", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
