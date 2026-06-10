// SPEC: src/cli/commands/bracket.ts non-interactive paths (Stage 6-A.29).

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-bracket-"));
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

async function seedSession(): Promise<void> {
  await mkdir(join(cwd, ".agora"), { recursive: true });
  await writeFile(
    join(cwd, ".agora", "state.json"),
    JSON.stringify({
      version: 1,
      current_phase: "in_alignment",
      alignment: { phase: 0, round: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    "utf8",
  );
  await writeFile(
    join(cwd, ".agora", "scan.json"),
    JSON.stringify({
      project_name: "test",
      is_brownfield: false,
      is_greenfield: true,
      detected_stack: [],
      detected_patterns: [],
      git_remote: null,
      scan_duration_ms: 0,
    }),
    "utf8",
  );
}

describe("agora bracket — refusal", () => {
  test("no .agora/ → exit 2 + user.aborted", () => {
    const { output, status } = run('bracket --skip-bracket "my intent" --json');
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });

  test("--skip-bracket without intent → user.aborted exit 2", async () => {
    await seedSession();
    const { output, status } = run("bracket --skip-bracket --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("--skip-bracket requires intent");
  });

  test("--json without --skip-bracket → user.aborted with hint", async () => {
    await seedSession();
    const { output, status } = run("bracket --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("--skip-bracket");
  });

  test("unknown arg → user.forbidden-flag-combo exit 2", async () => {
    await seedSession();
    const { output, status } = run("bracket --bogus --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });
});

describe("agora bracket --skip-bracket — happy path", () => {
  test("writes defended_frame.json with skip markers + advances state", async () => {
    await seedSession();
    const { output, status } = run('bracket --skip-bracket "build a login form" --json');
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: {
        ok: boolean;
        data: { defended_frame: { raw_intent: string; chosen_form: string } };
      };
    };
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.data.defended_frame.raw_intent).toBe("build a login form");
    expect(parsed.result.data.defended_frame.chosen_form).toBe("build a login form");

    // verify on-disk frame
    const frameText = await readFile(join(cwd, ".agora", "defended_frame.json"), "utf8");
    const frame = JSON.parse(frameText) as {
      brackets_considered: { software_bracket: { defense: string } };
      invocation: string;
    };
    expect(frame.brackets_considered.software_bracket.defense).toContain("user opted out");
    expect(frame.invocation).toBe("explicit_bracket");

    // verify state advanced
    const stateText = await readFile(join(cwd, ".agora", "state.json"), "utf8");
    const state = JSON.parse(stateText) as { alignment?: { phase: number } };
    expect(state.alignment?.phase).toBe(-1);
  });

  test("multi-word intent joins via spaces", async () => {
    await seedSession();
    const { output, status } = run("bracket --skip-bracket build the agora project --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: { data: { defended_frame: { raw_intent: string } } };
    };
    expect(parsed.result.data.defended_frame.raw_intent).toBe("build the agora project");
  });

  test("emits bracket.captured event with skipped=true (Stage 6-A.30)", async () => {
    await seedSession();
    const { status } = run('bracket --skip-bracket "test intent" --json');
    expect(status).toBe(0);
    const eventsText = await readFile(join(cwd, ".agora", "events.jsonl"), "utf8");
    const lines = eventsText.split("\n").filter((l) => l.length > 0);
    const bracketEvents = lines
      .map((l) => JSON.parse(l) as { type: string; data: Record<string, unknown> })
      .filter((e) => e.type === "bracket.captured");
    expect(bracketEvents).toHaveLength(1);
    expect(bracketEvents[0]?.data["skipped"]).toBe(true);
    expect(bracketEvents[0]?.data["raw_intent_chars"]).toBe(11); // "test intent"
  });
});
