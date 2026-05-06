// SPEC: docs/loops/handoff.md (Stage 2-C.3 R2-A) — .agora/events.jsonl
//        append-only audit log.
//
// Layer: 0 (no inward dependencies on state/, alignment/, ralph/, etc.).
// Producers across all layers call appendEvent(cwd, event); the helper
// resolves <cwd>/.agora/events.jsonl, validates via EventSchema, and
// fs.appendFile-writes a single newline-terminated JSON line.
//
// Fail-soft: if .agora/ is missing, validation fails, or fs.appendFile
// throws, appendEvent swallows the error and returns false. Audit-log
// writes MUST NOT crash a command — debugging visibility is not worth
// killing user workflow. AGORA_EVENTS_DEBUG=1 surfaces failures on stderr.

import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { hasAgoraDir } from "./path.js";

export const EVENTS_FILE_NAME = "events.jsonl";

// Audit-log event types. Producers and consumers both depend on this
// enum — adding a new type requires updating producers + a viewer
// summary line (see src/cli/commands/trace.ts summarizeData).
export const EventTypeSchema = z.enum([
  "state.transition", // saveState detected current_phase change
  "gate_1.result", // ralph Gate 1 (typecheck/lint/test/build) ran
  "gate_5.result", // ralph Gate 5 (alignment drift) ran
  "disputatio.verdict", // Aquinas Disputatio respondeo verdict
  "dialog.choice", // user picked a clack option (e.g., ralph_complete dialog)
  "cap.warning", // ralph per-leaf or session cap hit
  "llm.call", // any ClaudeRunner.call returned (hit or miss)
  "command.invoked", // CLI dispatch helper entry
  "probe.result", // Gate 0 probe finished (added Stage 6-A.27)
]);
export type EventType = z.infer<typeof EventTypeSchema>;

// EventSchema deliberately keeps prev/new_state_phase as plain string
// (not state/types.PhaseSchema) — LAYER 0 must not depend on LAYER 1+.
// Producers carry the typed phase through `data` if structural typing
// matters; the top-level fields are for cheap log scanning.
export const EventSchema = z
  .object({
    id: z.string().uuid(),
    ts: z.string().datetime(),
    type: EventTypeSchema,
    command: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    prev_state_phase: z.string().optional(),
    new_state_phase: z.string().optional(),
  })
  .strict();
export type Event = z.infer<typeof EventSchema>;

export interface AppendEventInput {
  readonly type: EventType;
  readonly command: string;
  readonly data: Record<string, unknown>;
  readonly prev_state_phase?: string;
  readonly new_state_phase?: string;
}

export function eventsFilePath(cwd: string): string {
  return join(cwd, ".agora", EVENTS_FILE_NAME);
}

/**
 * Append a single event to .agora/events.jsonl. Returns true on success,
 * false on any failure (missing .agora/, validation, I/O). Never throws.
 *
 * The id + ts fields are auto-generated; callers supply only domain data.
 */
export async function appendEvent(cwd: string, input: AppendEventInput): Promise<boolean> {
  try {
    if (!(await hasAgoraDir(cwd))) {
      return false;
    }
    const candidate: Event = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      type: input.type,
      command: input.command,
      data: input.data,
      ...(input.prev_state_phase !== undefined ? { prev_state_phase: input.prev_state_phase } : {}),
      ...(input.new_state_phase !== undefined ? { new_state_phase: input.new_state_phase } : {}),
    };
    const validated = EventSchema.safeParse(candidate);
    if (!validated.success) {
      maybeDebug(`event validation failed: ${validated.error.issues[0]?.message ?? "?"}`);
      return false;
    }
    const line = `${JSON.stringify(validated.data)}\n`;
    await appendFile(eventsFilePath(cwd), line, "utf8");
    return true;
  } catch (e) {
    maybeDebug(`appendEvent threw: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function maybeDebug(message: string): void {
  if (process.env["AGORA_EVENTS_DEBUG"] === "1") {
    process.stderr.write(`[events] ${message}\n`);
  }
}
