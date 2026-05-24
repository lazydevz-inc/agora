// SPEC: ADR-0009 (Claude Code plugin / MCP as primary mode) +
//       ADR-0010 (host-reasoning stepped MCP tools).
//
// MCP server bootstrap. Registers Agora's tools so a host Claude Code
// session can drive alignment/Ralph state inspection AND the alignment
// loop itself without Agora making any LLM call (the host reasons).
// Connects over stdio.
//
// Tool surface:
//   - Read-only (ADR-0009 foundation):
//       agora_status / agora_doctor / agora_resume / agora_trace
//   - Stepped (ADR-0010):
//       agora_align_step — Slice A handles telos; subsequent slices
//                          extend to form / material / efficient /
//                          socrates / maturity / ac / handoff.
//       agora_ralph_step — lands in slices D/E.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { mcpAlignStep, mcpDoctor, mcpResume, mcpStatus, mcpTrace } from "./tools.js";

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

  // ─── Stepped tool: alignment loop (ADR-0010) ───
  //
  // Call with no args to advance the loop. The tool returns one of:
  //   - {kind:"advanced"}        → deterministic step ran; call again
  //   - {kind:"needs_user_input"} → ask the user the listed questions,
  //                                 call again with user_answers
  //   - {kind:"needs_reasoning"}  → reason about each prompt, call again
  //                                 with llm_responses
  //   - {kind:"done"}             → loop complete (for this slice scope)
  //   - {kind:"error"}            → recoverable; correct + retry
  //
  // Slice A: telos round only. Subsequent slices extend to the rest of
  // Phase 2 + handoff.
  server.registerTool(
    "agora_align_step",
    {
      description:
        "Advance the Agora Alignment Loop one step. Host supplies reasoning + user answers via subsequent calls; Agora makes no LLM call. Returns a StepEnvelope (kind: done | advanced | needs_user_input | needs_reasoning | error). Slice A scope: Aristotle telos.",
      inputSchema: {
        user_answers: z.record(z.string(), z.string()).optional(),
        llm_responses: z
          .array(
            z.object({
              id: z.string().min(1),
              content: z.union([z.string(), z.record(z.string(), z.unknown())]),
            }),
          )
          .optional(),
      },
    },
    async (args) => mcpAlignStep(args),
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
