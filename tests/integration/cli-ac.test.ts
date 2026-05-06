// SPEC: src/cli/commands/ac.ts non-interactive paths (Stage 6-A.29).
//
// Note: --from-file happy path requires LLM extraction (runAcCapture
// calls Claude). Integration tests here cover only the deterministic
// refusal + arg-parsing paths. Full LLM-driven tests would require
// runtime stubbing not available via execSync subprocess.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-ac-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(args: string): { output: string; status: number } {
  try {
    const output = execSync(`tsx ${CLI_ABS} ${args}`, { stdio: "pipe", cwd }).toString();
    return { output, status: 0 };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const stdout = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    return { output: stdout, status };
  }
}

async function seedAlignmentComplete(): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  const ts = "2026-05-06T00:00:00.000Z";
  await writeFile(
    join(cwd, ".agora", "state.json"),
    JSON.stringify({
      version: 1,
      current_phase: "alignment_complete",
      alignment: { phase: 2, round: 5 },
      created_at: ts,
      updated_at: ts,
    }),
    "utf8",
  );
  await writeFile(
    join(cwd, ".agora", "four_causes.json"),
    JSON.stringify({
      version: 1,
      telos: { statement: "x", failure_signal: "x", maturity: "noesis", captured_at: ts },
      form: { essential_structure: ["x"], maturity: "dianoia", captured_at: ts },
      material: { tech_stack: ["x"], maturity: "pistis", captured_at: ts },
      efficient: {
        who: "x",
        when: "x",
        how: "x",
        maturity: "pistis",
        captured_at: ts,
      },
      created_at: ts,
      updated_at: ts,
    }),
    "utf8",
  );
}

describe("agora ac — refusal", () => {
  test("no .agora/ → exit 2 + user.aborted", () => {
    const { output, status } = run("ac --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });

  test("--json without --from-file → user.aborted with hint", async () => {
    await seedAlignmentComplete();
    const { output, status } = run("ac --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("--from-file");
  });

  test("--from-file= empty path → user.forbidden-flag-combo exit 2", async () => {
    await seedAlignmentComplete();
    const { output, status } = run("ac --from-file= --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("unknown arg → user.forbidden-flag-combo exit 2", async () => {
    await seedAlignmentComplete();
    const { output, status } = run("ac --bogus --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("wrong phase → user.aborted exit 2", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: "in_alignment",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
    const { output, status } = run("ac --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("alignment_complete");
  });
});
