// SPEC: docs/loops/handoff.md (Stage 2-C.3 R2-A audit log) +
//       Stage 6-A.25 — `agora trace` viewer over .agora/events.jsonl.
//
// Reads events.jsonl, applies filters (--type, --since, --command,
// --limit), renders as compact TUI table or JSON envelope (data.events).
// Refusal guards: missing .agora/ → user.aborted; missing events.jsonl
// (session never wrote audit events) → empty result + warning.
//
// Filter syntax:
//   --type=<event_type>      Filter by EventType (e.g., gate_5.result).
//                            Repeat to OR-match multiple types.
//   --since=<duration>       Relative window: 30s, 5m, 2h, 1d.
//   --command=<name>         Filter by event.command (substring match).
//   --limit=<N>              Cap output to last N matching entries (default 50).

import { readFile } from "node:fs/promises";

import pc from "picocolors";

import { buildAgoraError } from "../../errors/build.js";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { err, ok, type Result } from "../../result/index.js";
import { type Event, EventSchema, eventsFilePath } from "../../shared/events.js";
import { findProjectRoot, hasAgoraDir } from "../../shared/path.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1_000;

interface TraceFilters {
  readonly types: readonly string[]; // empty → all types
  readonly sinceMs: number | null; // null → no lower bound
  readonly commandSubstring: string | null;
  readonly limit: number;
}

export async function runTraceCommand(
  flags: GlobalFlags,
  positional: readonly string[],
): Promise<Result<CommandEnvelope, AgoraErrorThrown>> {
  const cwd = findProjectRoot(process.cwd());

  if (!(await hasAgoraDir(cwd))) {
    return err(
      buildAgoraError("user.aborted", {
        context: { detail: "No Agora session in this directory. Run `agora new <name>` first." },
      }),
    );
  }

  const filtersResult = parseTraceFilters(positional);
  if (!filtersResult.ok) return filtersResult;
  const filters = filtersResult.value;

  const loadResult = await loadEvents(cwd);
  if (!loadResult.ok) return loadResult;
  const { events, parseFailures } = loadResult.value;

  const filtered = applyFilters(events, filters);
  const truncated = filtered.length > filters.limit;
  const visible = truncated ? filtered.slice(filtered.length - filters.limit) : filtered;

  if (!flags.json) emitTui(visible, filters, parseFailures, truncated);
  return ok(buildEnvelope(visible, filters, parseFailures, truncated));
}

function parseTraceFilters(positional: readonly string[]): Result<TraceFilters, AgoraErrorThrown> {
  const types: string[] = [];
  let sinceMs: number | null = null;
  let commandSubstring: string | null = null;
  let limit = DEFAULT_LIMIT;

  for (const arg of positional) {
    if (arg.startsWith("--type=")) {
      types.push(arg.slice("--type=".length));
      continue;
    }
    if (arg.startsWith("--since=")) {
      const parsed = parseDuration(arg.slice("--since=".length));
      if (parsed === null) {
        return err(
          buildAgoraError("user.forbidden-flag-combo", {
            context: { detail: `Invalid --since value: ${arg}. Use 30s / 5m / 2h / 1d.` },
          }),
        );
      }
      sinceMs = parsed;
      continue;
    }
    if (arg.startsWith("--command=")) {
      commandSubstring = arg.slice("--command=".length);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(n) || n < 1 || n > MAX_LIMIT) {
        return err(
          buildAgoraError("user.forbidden-flag-combo", {
            context: { detail: `--limit must be 1..${String(MAX_LIMIT)} (got ${arg}).` },
          }),
        );
      }
      limit = n;
      continue;
    }
    return err(
      buildAgoraError("user.forbidden-flag-combo", {
        context: {
          detail: `Unknown trace argument: ${arg}. Supported: --type, --since, --command, --limit.`,
        },
      }),
    );
  }
  return ok({ types, sinceMs, commandSubstring, limit });
}

function parseDuration(raw: string): number | null {
  const m = /^(\d+)(s|m|h|d)$/.exec(raw);
  if (m === null) return null;
  const n = Number.parseInt(m[1] ?? "0", 10);
  const unit = m[2];
  const factor =
    unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * factor;
}

interface LoadResult {
  readonly events: readonly Event[];
  readonly parseFailures: number;
}

async function loadEvents(cwd: string): Promise<Result<LoadResult, AgoraErrorThrown>> {
  const path = eventsFilePath(cwd);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return ok({ events: [], parseFailures: 0 });
  }
  const lines = text.split("\n").filter((l) => l.length > 0);
  const events: Event[] = [];
  let parseFailures = 0;
  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const parsed = EventSchema.safeParse(raw);
      if (parsed.success) {
        events.push(parsed.data);
      } else {
        parseFailures += 1;
      }
    } catch {
      parseFailures += 1;
    }
  }
  return ok({ events, parseFailures });
}

function applyFilters(events: readonly Event[], filters: TraceFilters): readonly Event[] {
  const cutoff = filters.sinceMs !== null ? Date.now() - filters.sinceMs : null;
  return events.filter((e) => {
    if (filters.types.length > 0 && !filters.types.includes(e.type)) return false;
    if (filters.commandSubstring !== null && !e.command.includes(filters.commandSubstring)) {
      return false;
    }
    if (cutoff !== null) {
      const ts = Date.parse(e.ts);
      if (!Number.isFinite(ts) || ts < cutoff) return false;
    }
    return true;
  });
}

function emitTui(
  events: readonly Event[],
  filters: TraceFilters,
  parseFailures: number,
  truncated: boolean,
): void {
  if (events.length === 0) {
    console.log(localized("cli.trace.no_events"));
    if (parseFailures > 0) {
      console.log(
        pc.yellow(localized("cli.trace.parse_failures", { count: String(parseFailures) })),
      );
    }
    return;
  }
  console.log(
    pc.bold(
      localized("cli.trace.header", {
        count: String(events.length),
        filters: describeFilters(filters),
      }),
    ),
  );
  for (const e of events) {
    console.log(formatEventLine(e));
  }
  if (truncated) {
    console.log(pc.dim(localized("cli.trace.truncated", { limit: String(filters.limit) })));
  }
  if (parseFailures > 0) {
    console.log(pc.yellow(localized("cli.trace.parse_failures", { count: String(parseFailures) })));
  }
}

function formatEventLine(e: Event): string {
  const ts = e.ts.slice(11, 19); // HH:MM:SS
  const type = e.type.padEnd(20);
  const command = e.command.padEnd(20);
  const summary = summarizeData(e);
  return `  ${pc.dim(ts)}  ${pc.cyan(type)}  ${command}  ${summary}`;
}

function summarizeData(e: Event): string {
  const d = e.data;
  switch (e.type) {
    case "state.transition":
      return `${e.prev_state_phase ?? "(none)"} → ${e.new_state_phase ?? "?"}`;
    case "gate_1.result":
      return `leaf=${String(d["leaf_id"] ?? "?")} passed=${String(d["overall_passed"] ?? "?")}`;
    case "gate_5.result":
      return `leaf=${String(d["leaf_id"] ?? "?")} drift=${String(d["drift_score"] ?? "?")} action=${String(d["action"] ?? "?")}`;
    case "disputatio.verdict":
      return `leaf=${String(d["leaf_id"] ?? "?")} verdict=${String(d["verdict"] ?? "?")} objections=${String(d["all_objections_count"] ?? "?")}`;
    case "dialog.choice":
      return `dialog=${String(d["dialog"] ?? "?")} choice=${String(d["choice"] ?? "?")}`;
    case "cap.warning":
      return `kind=${String(d["kind"] ?? "?")} attempts=${String(d["attempts"] ?? "?")}/${String(d["cap"] ?? "?")}`;
    case "llm.call":
      return `cache_hit=${String(d["cache_hit"] ?? "?")} ok=${String(d["ok"] ?? "?")} attempts=${String(d["attempts"] ?? "?")} duration_ms=${String(d["total_duration_ms"] ?? "?")}`;
    case "command.invoked": {
      const positional = Array.isArray(d["positional"])
        ? (d["positional"] as unknown[]).join(" ")
        : "";
      return positional;
    }
    default:
      return "";
  }
}

function describeFilters(filters: TraceFilters): string {
  const parts: string[] = [];
  if (filters.types.length > 0) parts.push(`type=${filters.types.join("|")}`);
  if (filters.sinceMs !== null) parts.push(`since=${String(filters.sinceMs / 1_000)}s`);
  if (filters.commandSubstring !== null) parts.push(`command~${filters.commandSubstring}`);
  parts.push(`limit=${String(filters.limit)}`);
  return parts.join(" · ");
}

function buildEnvelope(
  events: readonly Event[],
  filters: TraceFilters,
  parseFailures: number,
  truncated: boolean,
): CommandEnvelope {
  const warnings =
    parseFailures > 0
      ? [
          {
            code: "trace.parse_failures",
            message: localized("cli.trace.parse_failures", { count: String(parseFailures) }),
          },
        ]
      : [];
  return {
    command: "agora trace",
    version: getAgoraVersion(),
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        count: events.length,
        truncated,
        filters: {
          types: filters.types,
          since_ms: filters.sinceMs,
          command_substring: filters.commandSubstring,
          limit: filters.limit,
        },
        events: events as unknown as Record<string, unknown>[],
      },
    },
    next: [],
    warnings,
    errors: [],
    exit_code: 0,
  };
}

function getAgoraVersion(): string {
  try {
    const url = new URL("../../../package.json", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const text = fs.readFileSync(url, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
