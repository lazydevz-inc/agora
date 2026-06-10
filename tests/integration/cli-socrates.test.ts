// SPEC: src/cli/commands/socrates.ts refusal guards (Stage 6-A.35).
// Interactive elenchus happy path is covered by the socrates module unit
// tests (QueueRunner + RecordedUi); this file covers the deterministic
// refusal/routing guards reachable without a TTY.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-socrates-"));
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

const ts = "2026-05-24T00:00:00.000Z";

async function seedState(): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeFile(
    join(cwd, ".agora", "state.json"),
    JSON.stringify({
      version: 1,
      current_phase: "in_alignment",
      alignment: { phase: 2, round: 4 },
      created_at: ts,
      updated_at: ts,
    }),
    "utf8",
  );
}

function fourCauses(): Record<string, unknown> {
  return {
    telos: { statement: "x", served_good: "y", failure_signal: "z", maturity: "dianoia" },
    form: { essential_structure: "s", irreducible_parts: ["p"], maturity: "dianoia" },
    material: {
      tech_stack: ["ts"],
      data_shape: "json",
      infrastructure: "local",
      maturity: "pistis",
    },
    efficient: { who: "solo", when: "eve", how: "tdd", maturity: "pistis" },
    created_at: ts,
    updated_at: ts,
  };
}

describe("agora socrates — refusal", () => {
  test("no .agora/ → user.aborted exit 2", () => {
    const { output, status } = run("socrates --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });

  test("causes incomplete → user.aborted (run agora round)", async () => {
    await seedState();
    const { output, status } = run("socrates --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("4 Aristotle causes");
  });

  test("all causes present but --json → interactive refusal exit 2", async () => {
    await seedState();
    await writeFile(join(cwd, ".agora", "four_causes.json"), JSON.stringify(fourCauses()), "utf8");
    const { output, status } = run("socrates --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("interactive");
  });

  test("elenchus already present → confirmation-required exit 2", async () => {
    await seedState();
    await writeFile(join(cwd, ".agora", "four_causes.json"), JSON.stringify(fourCauses()), "utf8");
    await writeFile(
      join(cwd, ".agora", "elenchus.json"),
      JSON.stringify({ version: 1, elenched: [], created_at: ts }),
      "utf8",
    );
    const { output, status } = run("socrates --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.confirmation-required");
    expect(parsed.errors[0]?.message).toContain("elenchus.json");
  });
});

describe("agora round → routes to socrates after efficient (Stage 6-A.35)", () => {
  test("4 causes present, no elenchus.json → round dispatches socrates (interactive refusal in --json proves routing)", async () => {
    await seedState();
    await writeFile(join(cwd, ".agora", "four_causes.json"), JSON.stringify(fourCauses()), "utf8");
    // `agora round --json` routes to socrates, which refuses --json with
    // the interactive message — that error proves the route landed on socrates.
    const { output, status } = run("round --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.message).toContain("interactive");
  });
});
