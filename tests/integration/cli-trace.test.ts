// SPEC: src/cli/commands/trace.ts (Stage 6-A.25 — agora trace).

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-trace-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(args: string): { output: string; status: number } {
  try {
    const output = execSync(`${TSX} ${CLI_ABS} ${args}`, { stdio: "pipe", cwd }).toString();
    return { output, status: 0 };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const stdout = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    return { output: stdout, status };
  }
}

async function seedEvents(lines: string[]): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeFile(join(cwd, ".agora", "events.jsonl"), `${lines.join("\n")}\n`, "utf8");
}

function fakeEvent(opts: {
  type: string;
  command: string;
  ts?: string;
  data?: Record<string, unknown>;
  prev?: string;
  next?: string;
}): string {
  return JSON.stringify({
    id: "11111111-1111-4111-8111-111111111111",
    ts: opts.ts ?? new Date().toISOString(),
    type: opts.type,
    command: opts.command,
    data: opts.data ?? {},
    ...(opts.prev !== undefined ? { prev_state_phase: opts.prev } : {}),
    ...(opts.next !== undefined ? { new_state_phase: opts.next } : {}),
  });
}

describe("agora trace — refusal", () => {
  test("no .agora/ → exit 2 + user.aborted", () => {
    const { output, status } = run("trace --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });
});

describe("agora trace — empty / no events", () => {
  test("empty .agora/ (no events.jsonl) → ok envelope, count 0, no warnings", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output, status } = run("trace --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; events: unknown[] } };
      warnings: unknown[];
    };
    expect(parsed.result.data.count).toBe(0);
    expect(parsed.result.data.events).toHaveLength(0);
    expect(parsed.warnings).toHaveLength(0);
  });

  test("TUI prints 'no matching events' message", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output } = run("trace");
    expect(output).toContain("No matching events");
  });
});

describe("agora trace — happy path", () => {
  test("returns all events when no filters", async () => {
    await seedEvents([
      fakeEvent({ type: "command.invoked", command: "agora new" }),
      fakeEvent({
        type: "state.transition",
        command: "agora new",
        next: "in_alignment",
      }),
      fakeEvent({
        type: "gate_1.result",
        command: "agora ralph",
        data: { leaf_id: "ac_001.1", overall_passed: true },
      }),
    ]);
    const { output, status } = run("trace --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; events: { type: string }[] } };
    };
    expect(parsed.result.data.count).toBe(3);
    expect(parsed.result.data.events.map((e) => e.type)).toEqual([
      "command.invoked",
      "state.transition",
      "gate_1.result",
    ]);
  });

  test("--type filter narrows to single type", async () => {
    await seedEvents([
      fakeEvent({ type: "command.invoked", command: "agora new" }),
      fakeEvent({
        type: "gate_5.result",
        command: "agora ralph",
        data: { leaf_id: "x", drift_score: 0.1, action: "PASS" },
      }),
      fakeEvent({
        type: "gate_5.result",
        command: "agora ralph",
        data: { leaf_id: "y", drift_score: 0.4, action: "Z1" },
      }),
    ]);
    const { output } = run("trace --type=gate_5.result --json");
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; events: { type: string }[] } };
    };
    expect(parsed.result.data.count).toBe(2);
    expect(parsed.result.data.events.every((e) => e.type === "gate_5.result")).toBe(true);
  });

  test("--type filter accepts multiple types (OR)", async () => {
    await seedEvents([
      fakeEvent({ type: "command.invoked", command: "agora ralph" }),
      fakeEvent({ type: "gate_1.result", command: "agora ralph", data: {} }),
      fakeEvent({ type: "gate_5.result", command: "agora ralph", data: {} }),
      fakeEvent({ type: "llm.call", command: "agora ralph", data: {} }),
    ]);
    const { output } = run("trace --type=gate_1.result --type=gate_5.result --json");
    const parsed = JSON.parse(output) as {
      result: { data: { count: number } };
    };
    expect(parsed.result.data.count).toBe(2);
  });

  test("--command filter does substring match", async () => {
    await seedEvents([
      fakeEvent({ type: "command.invoked", command: "agora ralph" }),
      fakeEvent({ type: "command.invoked", command: "agora status" }),
      fakeEvent({ type: "command.invoked", command: "agora trace" }),
    ]);
    const { output } = run("trace --command=ralph --json");
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; events: { command: string }[] } };
    };
    expect(parsed.result.data.count).toBe(1);
    expect(parsed.result.data.events[0]?.command).toBe("agora ralph");
  });

  test("--limit truncates to last N entries", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      fakeEvent({
        type: "command.invoked",
        command: `agora cmd${String(i)}`,
      }),
    );
    await seedEvents(events);
    const { output } = run("trace --limit=3 --json");
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; truncated: boolean; events: { command: string }[] } };
    };
    expect(parsed.result.data.count).toBe(3);
    expect(parsed.result.data.truncated).toBe(true);
    // Should be last 3 (cmd7, cmd8, cmd9)
    expect(parsed.result.data.events[0]?.command).toBe("agora cmd7");
    expect(parsed.result.data.events[2]?.command).toBe("agora cmd9");
  });

  test("--since=1h filters out older events", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const recent = new Date().toISOString();
    await seedEvents([
      fakeEvent({ type: "command.invoked", command: "agora old", ts: old }),
      fakeEvent({ type: "command.invoked", command: "agora recent", ts: recent }),
    ]);
    const { output } = run("trace --since=1h --json");
    const parsed = JSON.parse(output) as {
      result: { data: { count: number; events: { command: string }[] } };
    };
    expect(parsed.result.data.count).toBe(1);
    expect(parsed.result.data.events[0]?.command).toBe("agora recent");
  });
});

describe("agora trace — TUI rendering", () => {
  test("prints header + per-event lines + summarized data", async () => {
    await seedEvents([
      fakeEvent({
        type: "gate_5.result",
        command: "agora ralph",
        data: { leaf_id: "ac_001.1", drift_score: 0.05, action: "PASS" },
      }),
    ]);
    const { output, status } = run("trace");
    expect(status).toBe(0);
    expect(output).toContain("Showing 1 event(s)");
    expect(output).toContain("gate_5.result");
    expect(output).toContain("leaf=ac_001.1");
    expect(output).toContain("action=PASS");
  });

  test("ko locale renders Korean messages", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output } = run("trace --locale=ko");
    expect(output).toContain("일치하는 이벤트가 없습니다");
  });
});

describe("agora trace — bad input", () => {
  test("invalid --since → exit 2 + user.forbidden-flag-combo", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output, status } = run("trace --since=2years --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("--limit=0 → exit 2", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { status } = run("trace --limit=0 --json");
    expect(status).toBe(2);
  });

  test("unknown trace arg → exit 2", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output, status } = run("trace --bogus-flag --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });
});

describe("agora trace --follow (Stage 6-A.32)", () => {
  test("--follow + --json → user.forbidden-flag-combo exit 2", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    const { output, status } = run("trace --follow --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
    expect(parsed.errors[0]?.message).toContain("--follow is incompatible with --json");
  });

  test("describeFilters surfaces follow marker in TUI header", async () => {
    // Spawn-and-kill before the poll loop blocks forever. The
    // initial-backlog print happens synchronously after startup; the
    // timeout only needs to outlive tsx's cold start, which can exceed
    // 2s on CI runners (a 500ms window flaked there with empty stdout).
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "events.jsonl"),
      `${JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        ts: new Date().toISOString(),
        type: "command.invoked",
        command: "agora new",
        data: {},
      })}\n`,
      "utf8",
    );
    let output = "";
    try {
      output = execSync(`${TSX} ${CLI_ABS} trace --follow`, {
        stdio: "pipe",
        cwd,
        timeout: 5000, // SIGTERM after 5s; initial print + poll-loop entry already happened
      }).toString();
    } catch (e) {
      // execSync throws on SIGTERM; capture stdout up to that point
      output = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    }
    expect(output).toContain("Showing 1 event(s)");
    expect(output).toContain("follow");
    expect(output).toContain("--follow active");
  });
});

describe("agora trace — corrupt lines", () => {
  test("malformed JSON line → counted in parse_failures, valid lines surface", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "events.jsonl"),
      `${fakeEvent({ type: "command.invoked", command: "agora new" })}\nNOT JSON HERE\n${fakeEvent({ type: "gate_1.result", command: "agora ralph", data: {} })}\n`,
      "utf8",
    );
    const { output, status } = run("trace --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { count: number } };
      warnings: { code: string; message: string }[];
    };
    expect(parsed.result.data.count).toBe(2);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]?.code).toBe("trace.parse_failures");
  });
});
