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

import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctorCommand } from "../cli/commands/doctor.js";
import { runIntakeCommand } from "../cli/commands/intake.js";
import { runNewCommand } from "../cli/commands/new.js";
import { runResumeCommand } from "../cli/commands/resume.js";
import { runStatusCommand } from "../cli/commands/status.js";
import { runTraceCommand } from "../cli/commands/trace.js";
import type { GlobalFlags } from "../cli/flags.js";
import type { CommandEnvelope } from "../cli/render.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { type Locale, SUPPORTED_LOCALES } from "../i18n/index.js";
import type { Result } from "../result/index.js";
import { runAlignStep } from "./align-step.js";
import { runRalphStep } from "./ralph-step.js";
import type { StepEnvelope } from "./step.js";

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

// Map a suggested CLI command to the MCP tool that covers it, so the host
// model doesn't have to guess "agora intake" → agora_intake (or worse, try
// to run an interactive CLI command in a TTY it doesn't have). Phase-2
// alignment shortcuts all route to the stepped agora_align_step. Returns
// undefined for commands with no MCP equivalent (e.g. interactive bracket).
const MCP_TOOL_BY_COMMAND: readonly [RegExp, string][] = [
  [/^agora new\b/, "agora_new"],
  [/^agora doctor\b/, "agora_doctor"],
  [/^agora status\b/, "agora_status"],
  [/^agora resume\b/, "agora_resume"],
  [/^agora trace\b/, "agora_trace"],
  [/^agora intake\b/, "agora_intake"],
  [
    /^agora (telos|form|material|efficient|round|socrates|maturity|ac|handoff)\b/,
    "agora_align_step",
  ],
  [/^agora ralph\b/, "agora_ralph_step"],
];

export function mcpToolForCommand(command: string): string | undefined {
  for (const [re, tool] of MCP_TOOL_BY_COMMAND) {
    if (re.test(command)) return tool;
  }
  return undefined;
}

// Decorate next[] with the MCP tool hint. Done HERE (the MCP boundary)
// rather than in the envelope builders, so the CLI JSON envelope shape
// stays exactly per docs/cli/spec.md Stage 3-A.1.
function decorateNext(envelope: CommandEnvelope): Record<string, unknown> {
  return {
    ...envelope,
    next: envelope.next.map((n) => {
      const tool = mcpToolForCommand(n.command);
      return tool === undefined ? n : { ...n, mcp_tool: tool };
    }),
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
    content: [{ type: "text", text: JSON.stringify(decorateNext(result.value), null, 2) }],
  };
}

export async function mcpStatus(): Promise<McpToolResult> {
  return envelopeToMcp(await runStatusCommand(mcpFlags()));
}

export async function mcpDoctor(
  args: { include_disabled?: boolean | undefined; refresh?: boolean | undefined } = {},
): Promise<McpToolResult> {
  // Thread the two doctor-specific flags through so the MCP surface can
  // inspect disabled (tier 2+) probes and bust the 5-min probe cache —
  // previously these were hardcoded off and unreachable via MCP.
  const flags: GlobalFlags = {
    ...mcpFlags(),
    includeDisabled: args.include_disabled === true,
    refresh: args.refresh === true,
  };
  return envelopeToMcp(await runDoctorCommand(flags));
}

export async function mcpResume(): Promise<McpToolResult> {
  return envelopeToMcp(await runResumeCommand(mcpFlags(), []));
}

// LLM-free, but unlike the others this one *mutates* — it materializes .agora/
// (Phase 0 scan + initial state). Refuses if a session already exists.
export async function mcpNew(args: { name?: string | undefined }): Promise<McpToolResult> {
  const positional = args.name !== undefined ? [args.name] : [];
  return envelopeToMcp(await runNewCommand(mcpFlags(), positional));
}

// LLM-free Phase 1 intake for the pure-MCP flow. agora_align_step begins at
// the Aristotle telos round and requires .agora/intake.json to already
// exist; without this tool a Claude-Code-only user had no way to produce it
// (intake/bracket are interactive CLI-only commands), so the alignment loop
// could not bootstrap. We reuse runIntakeCommand's non-interactive
// --from-file path by staging raw_text to a temp file (no LLM, no TTY).
export async function mcpIntake(args: { raw_text?: string | undefined }): Promise<McpToolResult> {
  const rawText = args.raw_text ?? "";
  if (rawText.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: false,
              error: { code: "user.aborted", message: "agora_intake requires non-empty raw_text." },
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  const tmpPath = join(
    tmpdir(),
    `agora-mcp-intake-${String(process.pid)}-${String(Date.now())}.md`,
  );
  await writeFile(tmpPath, rawText, "utf8");
  try {
    return envelopeToMcp(await runIntakeCommand(mcpFlags(), [`--from-file=${tmpPath}`]));
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

export async function mcpTrace(args: TraceToolArgs): Promise<McpToolResult> {
  const positional: string[] = [];
  if (args.type !== undefined) positional.push(`--type=${args.type}`);
  if (args.since !== undefined) positional.push(`--since=${args.since}`);
  if (args.command !== undefined) positional.push(`--command=${args.command}`);
  if (args.limit !== undefined) positional.push(`--limit=${String(args.limit)}`);
  return envelopeToMcp(await runTraceCommand(mcpFlags(), positional));
}

// ─── Stepped tools (ADR-0010) ───
//
// Stepped tools return a `StepEnvelope` rather than a `CommandEnvelope`.
// kind:"error" envelopes are *valid responses* (the host can correct and
// retry), so we don't set MCP `isError` for them — only for genuine
// tool-level failures where we couldn't even produce an envelope
// (e.g. corrupt state file).

export function stepEnvelopeToMcp(result: Result<StepEnvelope, AgoraErrorThrown>): McpToolResult {
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

export async function mcpAlignStep(rawArgs: unknown): Promise<McpToolResult> {
  return stepEnvelopeToMcp(await runAlignStep(rawArgs));
}

export async function mcpRalphStep(rawArgs: unknown): Promise<McpToolResult> {
  return stepEnvelopeToMcp(await runRalphStep(rawArgs));
}
