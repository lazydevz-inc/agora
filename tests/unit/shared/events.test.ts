// SPEC: src/shared/events.ts (.agora/events.jsonl audit log).

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { appendEvent, EVENTS_FILE_NAME, EventSchema, eventsFilePath } from "@/shared/events.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-events-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function readLines(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((l) => l.length > 0);
}

describe("eventsFilePath", () => {
  test("resolves to <cwd>/.agora/events.jsonl", () => {
    expect(eventsFilePath(cwd)).toBe(join(cwd, ".agora", EVENTS_FILE_NAME));
  });
});

describe("appendEvent — fail-soft", () => {
  test("returns false when .agora/ does not exist (no throw)", async () => {
    const result = await appendEvent(cwd, {
      type: "command.invoked",
      command: "agora ralph",
      data: { positional: ["ralph"] },
    });
    expect(result).toBe(false);
  });

  test("returns false when input fails validation (empty command)", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const result = await appendEvent(cwd, {
      type: "command.invoked",
      command: "",
      data: {},
    });
    expect(result).toBe(false);
  });
});

describe("appendEvent — happy path", () => {
  beforeEach(async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
  });

  test("writes a single newline-terminated JSON line", async () => {
    const ok = await appendEvent(cwd, {
      type: "command.invoked",
      command: "agora ralph",
      data: { positional: ["ralph"] },
    });
    expect(ok).toBe(true);
    const text = await readFile(eventsFilePath(cwd), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
  });

  test("emitted event validates against EventSchema with auto-id + iso ts", async () => {
    await appendEvent(cwd, {
      type: "gate_1.result",
      command: "agora ralph",
      data: { leaf_id: "ac_001.1", overall_passed: true },
    });
    const [line] = await readLines(eventsFilePath(cwd));
    const parsed = EventSchema.parse(JSON.parse(line ?? ""));
    expect(parsed.type).toBe("gate_1.result");
    expect(parsed.command).toBe("agora ralph");
    expect(parsed.data.leaf_id).toBe("ac_001.1");
    expect(parsed.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
  });

  test("multiple appends produce one line per call (append-only)", async () => {
    for (let i = 0; i < 5; i++) {
      await appendEvent(cwd, {
        type: "llm.call",
        command: "agora ralph",
        data: { i },
      });
    }
    const lines = await readLines(eventsFilePath(cwd));
    expect(lines).toHaveLength(5);
    for (const [i, line] of lines.entries()) {
      const parsed = EventSchema.parse(JSON.parse(line));
      expect(parsed.data.i).toBe(i);
    }
  });

  test("includes prev_state_phase + new_state_phase top-level when supplied", async () => {
    await appendEvent(cwd, {
      type: "state.transition",
      command: "agora handoff",
      data: { version: 1 },
      prev_state_phase: "in_alignment",
      new_state_phase: "ready_for_ralph",
    });
    const [line] = await readLines(eventsFilePath(cwd));
    const parsed = EventSchema.parse(JSON.parse(line ?? ""));
    expect(parsed.prev_state_phase).toBe("in_alignment");
    expect(parsed.new_state_phase).toBe("ready_for_ralph");
  });

  test("omits prev_state_phase from on-disk JSON when not supplied", async () => {
    await appendEvent(cwd, {
      type: "command.invoked",
      command: "agora new",
      data: {},
      new_state_phase: "in_alignment",
    });
    const [line] = await readLines(eventsFilePath(cwd));
    const raw = JSON.parse(line ?? "") as Record<string, unknown>;
    expect("prev_state_phase" in raw).toBe(false);
    expect(raw.new_state_phase).toBe("in_alignment");
  });
});

describe("EventSchema", () => {
  test("accepts all 13 declared event types", () => {
    const types = [
      "state.transition",
      "gate_1.result",
      "gate_2.result",
      "gate_5.result",
      "disputatio.verdict",
      "dialog.choice",
      "cap.warning",
      "llm.call",
      "command.invoked",
      "probe.result",
      "intake.captured",
      "bracket.captured",
      "handoff.completed",
    ] as const;
    for (const t of types) {
      const r = EventSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        ts: "2026-05-04T00:00:00.000Z",
        type: t,
        command: "agora",
        data: {},
      });
      expect(r.success).toBe(true);
    }
  });

  test("rejects unknown event type", () => {
    const r = EventSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      ts: "2026-05-04T00:00:00.000Z",
      type: "totally_made_up",
      command: "agora",
      data: {},
    });
    expect(r.success).toBe(false);
  });

  test("rejects extra top-level fields (strict)", () => {
    const r = EventSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      ts: "2026-05-04T00:00:00.000Z",
      type: "command.invoked",
      command: "agora",
      data: {},
      bogus: "extra",
    });
    expect(r.success).toBe(false);
  });
});
