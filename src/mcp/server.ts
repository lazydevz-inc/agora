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
//   - Session create (LLM-free, mutating):
//       agora_new — Phase 0 scan + materialize .agora/
//   - Stepped (ADR-0010):
//       agora_align_step — Slice A handles telos; subsequent slices
//                          extend to form / material / efficient /
//                          socrates / maturity / ac / handoff.
//       agora_ralph_step — lands in slices D/E.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { agoraVersion } from "../shared/version.js";

import {
  mcpAlignStep,
  mcpDoctor,
  mcpNew,
  mcpRalphStep,
  mcpResume,
  mcpStatus,
  mcpTrace,
} from "./tools.js";

export function buildAgoraMcpServer(): McpServer {
  const server = new McpServer({ name: "agora", version: agoraVersion() });

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
    "agora_new",
    {
      description:
        "Start a new Agora session in the current project: runs the Phase 0 auto-scan (brownfield/greenfield detection) and materializes .agora/. Call this once before agora_align_step. LLM-free; refuses if a session already exists.",
      inputSchema: {
        name: z.string().optional(),
      },
    },
    async (args) => mcpNew(args),
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

  // ─── Stepped tool: Ralph loop (ADR-0010 Slice D) ───
  //
  // Same StepEnvelope contract as agora_align_step. Slice D wires:
  //   - init (first call when state=ready_for_ralph)
  //   - per-call Gate 1 (typecheck/lint/test/build) + Gate 2 (Playwright)
  //   - Gate 5 (LLM drift_score) issued as needs_reasoning
  //   - Z1/Z2 escalation, Z2 surfaced as needs_user_input confirm
  // Disputatio (Gate 3+4) lands in Slice E.
  server.registerTool(
    "agora_ralph_step",
    {
      description:
        "Advance the Agora Ralph loop one step. Host supplies reasoning + Z2 confirm via subsequent calls; Agora runs deterministic Gates 1/2 in-process and asks the host for Gate 5 reasoning. Returns a StepEnvelope (kind: done | advanced | needs_user_input | needs_reasoning | error). Slice D scope: Gate 1 + Gate 2 + Gate 5; Disputatio lands in Slice E.",
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
    async (args) => mcpRalphStep(args),
  );

  return server;
}

export async function startAgoraMcpServer(): Promise<void> {
  const server = buildAgoraMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
