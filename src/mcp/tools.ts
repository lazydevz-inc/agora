// SPEC: ADR-0009 (Claude Code plugin / MCP as primary mode) +
//       docs/architecture/module-graph.md (src/mcp/).
//
// MCP tool handlers. Each wraps an existing read-only command function
// and returns its envelope as structured text. CRITICAL: these tools make
// ZERO LLM calls — they expose Agora's deterministic structure/state/gate
// data so the HOST Claude Code session does any reasoning (per ADR-0009).
//
// stdout safety: MCP uses stdout as the protocol channel. The wrapped
// commands print to console only when !flags.json; we always pass
// json:true, so they stay silent and only build their envelope. The four
// wrapped commands (status / doctor / resume / trace) are all
// json-gated + LLM-free.

import { runDoctorCommand } from "../cli/commands/doctor.js";
import { runResumeCommand } from "../cli/commands/resume.js";
import { runStatusCommand } from "../cli/commands/status.js";
import { runTraceCommand } from "../cli/commands/trace.js";
import type { GlobalFlags } from "../cli/flags.js";
import type { CommandEnvelope } from "../cli/render.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { type Locale, SUPPORTED_LOCALES } from "../i18n/index.js";
import type { Result } from "../result/index.js";

export interface McpToolResult {
  // Index signature required for structural compatibility with the MCP
  // SDK's CallToolResult return type.
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface TraceToolArgs {
  type?: string | undefined;
  since?: string | undefined;
  command?: string | undefined;
  limit?: number | undefined;
}

function mcpLocale(): Locale {
  const raw = (process.env["AGORA_LOCALE"] ?? process.env["LANG"] ?? "en").toLowerCase();
  const normalized = raw.startsWith("ko") ? "ko" : "en";
  return SUPPORTED_LOCALES.includes(normalized as Locale) ? (normalized as Locale) : "en";
}

function mcpFlags(): GlobalFlags {
  // json:true → wrapped commands build envelopes silently (no clack/TUI to
  // stdout). noColor:true → no ANSI in serialized output.
  return {
    help: false,
    version: false,
    json: true,
    locale: mcpLocale(),
    quiet: false,
    verbose: false,
    noColor: true,
    refresh: false,
    includeDisabled: false,
  };
}

export function envelopeToMcp(result: Result<CommandEnvelope, AgoraErrorThrown>): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { ok: false, error: { code: result.error.code, message: result.error.message } },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }],
  };
}

export async function mcpStatus(): Promise<McpToolResult> {
  return envelopeToMcp(await runStatusCommand(mcpFlags()));
}

export async function mcpDoctor(): Promise<McpToolResult> {
  return envelopeToMcp(await runDoctorCommand(mcpFlags()));
}

export async function mcpResume(): Promise<McpToolResult> {
  return envelopeToMcp(await runResumeCommand(mcpFlags(), []));
}

export async function mcpTrace(args: TraceToolArgs): Promise<McpToolResult> {
  const positional: string[] = [];
  if (args.type !== undefined) positional.push(`--type=${args.type}`);
  if (args.since !== undefined) positional.push(`--since=${args.since}`);
  if (args.command !== undefined) positional.push(`--command=${args.command}`);
  if (args.limit !== undefined) positional.push(`--limit=${String(args.limit)}`);
  return envelopeToMcp(await runTraceCommand(mcpFlags(), positional));
}
