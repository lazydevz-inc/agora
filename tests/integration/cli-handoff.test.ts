// SPEC: src/cli/commands/handoff.ts --from-seed bypass (Stage 6-A.34).

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-handoff-"));
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

async function seedSession(phase: string): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeFile(
    join(cwd, ".agora", "state.json"),
    JSON.stringify({
      version: 1,
      current_phase: phase,
      alignment: { phase: 0, round: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    "utf8",
  );
}

function validSeed(): Record<string, unknown> {
  const ts = "2026-05-06T00:00:00.000Z";
  return {
    version: 1,
    locked_at: ts,
    intake: {
      raw_intake: "Build a daily journal CLI.",
      intake_method: "inline",
      intake_word_count: 5,
      intake_byte_size: 26,
      intake_truncated: false,
      intake_duration_ms: 100,
      estimated_rounds: "1-2",
      classification: "greenfield",
      created_at: ts,
    },
    four_causes: {
      version: 1,
      telos: {
        statement: "journaling habit",
        served_good: "reflection",
        failure_signal: "stops journaling",
        maturity: "noesis",
      },
      form: {
        essential_structure: "entry log",
        irreducible_parts: ["entry", "timestamp"],
        maturity: "dianoia",
      },
      material: {
        tech_stack: ["typescript"],
        data_shape: "json lines",
        infrastructure: "local fs",
        maturity: "pistis",
      },
      efficient: { who: "solo dev", when: "evenings", how: "cli", maturity: "pistis" },
      created_at: ts,
      updated_at: ts,
    },
    acceptance_criteria: {
      criteria: [
        { id: "ac_001", content: "User can add a journal entry with a timestamp." },
        { id: "ac_002", content: "User can list entries in reverse-chronological order." },
      ],
      raw_input: "Add entries with timestamps; list in reverse order.",
      created_at: ts,
    },
    ac_tree: [
      { id: "ac_001", content: "User can add an entry", depth: 1, atomic: true, children: [] },
      { id: "ac_002", content: "User can list entries", depth: 1, atomic: true, children: [] },
    ],
  };
}

describe("agora handoff --from-seed — refusal", () => {
  test("no .agora/ → exit 2", () => {
    const { status } = run("handoff --from-seed=seed.json --json");
    expect(status).toBe(2);
  });

  test("--from-seed= empty path → user.forbidden-flag-combo exit 2", async () => {
    await seedSession("in_alignment");
    const { output, status } = run("handoff --from-seed= --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("unknown arg → user.forbidden-flag-combo exit 2", async () => {
    await seedSession("in_alignment");
    const { output, status } = run("handoff --bogus --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("nonexistent seed file → user.aborted exit 2", async () => {
    await seedSession("in_alignment");
    const { output, status } = run("handoff --from-seed=nope.json --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("Could not read");
  });

  test("invalid seed JSON → user.aborted exit 2", async () => {
    await seedSession("in_alignment");
    await writeFile(join(cwd, "bad.json"), JSON.stringify({ version: 1 }), "utf8");
    const { output, status } = run("handoff --from-seed=bad.json --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("not a valid seed.json");
  });

  test("existing seed.json → over-handoff guard exit 2", async () => {
    await seedSession("in_alignment");
    await writeFile(join(cwd, ".agora", "seed.json"), JSON.stringify(validSeed()), "utf8");
    await writeFile(join(cwd, "new-seed.json"), JSON.stringify(validSeed()), "utf8");
    const { output, status } = run("handoff --from-seed=new-seed.json --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.confirmation-required");
  });
});

describe("agora handoff --from-seed — happy path", () => {
  test("installs seed, advances state to ready_for_ralph, bypasses alignment", async () => {
    // Note: state is in_alignment (NOT alignment_complete) — --from-seed
    // bypasses that requirement entirely.
    await seedSession("in_alignment");
    await writeFile(join(cwd, "my-seed.json"), JSON.stringify(validSeed()), "utf8");
    const { output, status } = run("handoff --from-seed=my-seed.json --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { ok: boolean; data: { from_seed: boolean; ac_tree_atomic_leaves: number } };
    };
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.data.from_seed).toBe(true);
    expect(parsed.result.data.ac_tree_atomic_leaves).toBe(2);

    // verify seed.json installed
    const seedText = await readFile(join(cwd, ".agora", "seed.json"), "utf8");
    const seed = JSON.parse(seedText) as { ac_tree: unknown[]; locked_at: string };
    expect(seed.ac_tree).toHaveLength(2);

    // verify state transitioned
    const stateText = await readFile(join(cwd, ".agora", "state.json"), "utf8");
    const state = JSON.parse(stateText) as { current_phase: string };
    expect(state.current_phase).toBe("ready_for_ralph");
  });

  test("emits handoff.completed event with from_seed=true", async () => {
    await seedSession("in_alignment");
    await writeFile(join(cwd, "my-seed.json"), JSON.stringify(validSeed()), "utf8");
    const { status } = run("handoff --from-seed=my-seed.json --json");
    expect(status).toBe(0);
    const eventsText = await readFile(join(cwd, ".agora", "events.jsonl"), "utf8");
    const events = eventsText
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { type: string; data: Record<string, unknown> })
      .filter((e) => e.type === "handoff.completed");
    expect(events).toHaveLength(1);
    expect(events[0]?.data.from_seed).toBe(true);
    expect(events[0]?.data.total_atomic_leaves).toBe(2);
  });

  test("re-stamps locked_at to execution time (not the file's stale timestamp)", async () => {
    await seedSession("in_alignment");
    await writeFile(join(cwd, "my-seed.json"), JSON.stringify(validSeed()), "utf8");
    const before = Date.now();
    run("handoff --from-seed=my-seed.json --json");
    const seedText = await readFile(join(cwd, ".agora", "seed.json"), "utf8");
    const seed = JSON.parse(seedText) as { locked_at: string };
    // Original fixture locked_at is 2026-05-06T00:00:00Z; re-stamped must
    // be >= test start (well after the fixture's hardcoded date in real
    // wall-clock terms only if current date > fixture — instead assert it
    // differs from the fixture value).
    expect(seed.locked_at).not.toBe("2026-05-06T00:00:00.000Z");
    expect(Number.isFinite(Date.parse(seed.locked_at))).toBe(true);
    expect(Date.parse(seed.locked_at)).toBeGreaterThanOrEqual(before - 1000);
  });
});
