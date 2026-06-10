// SPEC: docs/cli/spec.md Stage 3-B.4 — `agora new` end-to-end.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-new-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(args: string): { output: string; status: number; combined: string } {
  try {
    const output = execSync(`${TSX} ${CLI_ABS} ${args}`, { stdio: "pipe", cwd }).toString();
    return { output, status: 0, combined: output };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const stdout = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    const stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from("")).toString();
    return { output: stdout, status, combined: `${stdout}\n${stderr}` };
  }
}

describe("agora new (greenfield)", () => {
  test("creates .agora/ + state.json + scan.json", async () => {
    const { status } = run("new my-project");
    expect(status).toBe(0);
    const stateStat = await stat(join(cwd, ".agora", "state.json"));
    expect(stateStat.isFile()).toBe(true);
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
      alignment: { phase: number };
    };
    expect(state.current_phase).toBe("in_alignment");
    expect(state.alignment.phase).toBe(0);
    const scan = JSON.parse(await readFile(join(cwd, ".agora", "scan.json"), "utf8")) as {
      is_greenfield: boolean;
      project_name: string;
    };
    expect(scan.is_greenfield).toBe(true);
    expect(scan.project_name).toBe("my-project");
  });

  test("TUI prints session started + greenfield + next-phase suggestions", () => {
    const { output } = run("new my-project");
    expect(output).toContain("Agora session started: my-project");
    expect(output).toContain("greenfield");
    expect(output).toContain("agora bracket");
  });
});

describe("agora new (brownfield)", () => {
  test("detects .git + package.json → brownfield", async () => {
    await mkdir(join(cwd, ".git"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fix", dependencies: { react: "18" } }),
    );
    const { output, status } = run("new --json fix");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      command: string;
      result: { data: { scan: { is_brownfield: boolean; detected_patterns: string[] } } };
      next: { command: string }[];
    };
    expect(parsed.command).toBe("agora new");
    expect(parsed.result.data.scan.is_brownfield).toBe(true);
    expect(parsed.result.data.scan.detected_patterns).toContain("uses_git");
    expect(parsed.next[0]?.command).toBe("agora resume");
  });
});

describe("agora new (existing session)", () => {
  test("refuses to overwrite a real session (state.json) — exit 2 + confirmation_required", async () => {
    await mkdir(join(cwd, ".agora"));
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({ version: 1, current_phase: "in_alignment" }),
      "utf8",
    );
    const { combined, status } = run("new my-project");
    expect(status).toBe(2);
    expect(combined).toContain("Existing Agora session detected");
  });

  test("bare .agora/ WITHOUT state.json (doctor cache/audit log) does not block new", async () => {
    // `agora doctor` materializes .agora/ (probe cache + events.jsonl)
    // without creating a session. Gate-0-first order must stay legal:
    // doctor → new.
    await mkdir(join(cwd, ".agora", "cache"), { recursive: true });
    await writeFile(join(cwd, ".agora", "events.jsonl"), "{}\n", "utf8");
    const { status } = run("new my-project");
    expect(status).toBe(0);
    const state = JSON.parse(await readFile(join(cwd, ".agora", "state.json"), "utf8")) as {
      current_phase: string;
    };
    expect(state.current_phase).toBe("in_alignment");
  });
});
