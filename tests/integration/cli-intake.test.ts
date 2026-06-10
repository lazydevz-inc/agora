// SPEC: src/cli/commands/intake.ts non-interactive paths (Stage 6-A.33).

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-intake-"));
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

describe("agora intake — refusal", () => {
  test("--json without --from-file → user.aborted exit 2 with hint", async () => {
    await seedSession();
    const { output, status } = run("intake --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("--from-file");
  });

  test("--from-file= empty path → user.forbidden-flag-combo exit 2", async () => {
    await seedSession();
    const { output, status } = run("intake --from-file= --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("unknown arg → user.forbidden-flag-combo exit 2", async () => {
    await seedSession();
    const { output, status } = run("intake --bogus --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.forbidden-flag-combo");
  });

  test("alignment.phase >= 1 → over-intake guard exit 2", async () => {
    await mkdir(join(cwd, ".agora"), { recursive: true });
    await writeFile(
      join(cwd, ".agora", "state.json"),
      JSON.stringify({
        version: 1,
        current_phase: "in_alignment",
        alignment: { phase: 1, round: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, ".agora", "intake.json"),
      JSON.stringify({ method: "inline", word_count: 5 }),
      "utf8",
    );
    const { output, status } = run("intake --from-file=foo --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.confirmation-required");
    expect(parsed.errors[0]?.message).toContain("already complete");
  });
});

describe("agora intake --from-file — happy path", () => {
  test("reads file content, persists intake.json, advances state", async () => {
    await seedSession();
    await writeFile(
      join(cwd, "intake-text.md"),
      "I want to build a Phase 1 alignment intake test fixture so that the runPhase1Intake orchestrator has plausible input.",
      "utf8",
    );
    const { output, status } = run("intake --from-file=intake-text.md --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: {
        ok: boolean;
        data: {
          phase1_result: { intake_method: string; intake_word_count: number };
        };
      };
    };
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.data.phase1_result.intake_word_count).toBeGreaterThan(0);

    // verify intake.json on disk
    const intakeText = await readFile(join(cwd, ".agora", "intake.json"), "utf8");
    const intake = JSON.parse(intakeText) as {
      intake_word_count: number;
      raw_intake: string;
    };
    expect(intake.intake_word_count).toBeGreaterThan(0);
    expect(intake.raw_intake).toContain("Phase 1 alignment");

    // verify state advanced to alignment.phase = 1
    const stateText = await readFile(join(cwd, ".agora", "state.json"), "utf8");
    const state = JSON.parse(stateText) as { alignment?: { phase: number } };
    expect(state.alignment?.phase).toBe(1);
  });

  test("emits intake.captured event in events.jsonl", async () => {
    await seedSession();
    await writeFile(
      join(cwd, "intake-text.md"),
      "Build a small CLI tool that lets users record daily journal entries with timestamps.",
      "utf8",
    );
    const { status } = run("intake --from-file=intake-text.md --json");
    expect(status).toBe(0);
    const eventsText = await readFile(join(cwd, ".agora", "events.jsonl"), "utf8");
    const lines = eventsText.split("\n").filter((l) => l.length > 0);
    const intakeEvents = lines
      .map((l) => JSON.parse(l) as { type: string; data: Record<string, unknown> })
      .filter((e) => e.type === "intake.captured");
    expect(intakeEvents).toHaveLength(1);
    expect(intakeEvents[0]?.data.word_count).toBeGreaterThan(0);
  });

  test("over hard cap → truncated to 64 KB, FULL original archived to .agora/history/", async () => {
    await seedSession();
    // 64 KB hard cap (R3-A amended) + a tail marker that only survives in
    // the archive — proves the cut is lossless.
    const HARD_CAP = 64 * 1024;
    const body = `intent starts here. ${"filler ".repeat(Math.ceil(HARD_CAP / 7))}TAIL-MARKER`;
    await writeFile(join(cwd, "big-intake.md"), body, "utf8");

    const { output, status } = run("intake --from-file=big-intake.md --json");
    expect(status).toBe(0);
    const parsed = JSON.parse(output) as {
      result: {
        data: {
          phase1_result: {
            intake_truncated: boolean;
            intake_byte_size: number;
            intake_original_byte_size: number | null;
            intake_original_path: string | null;
          };
        };
      };
      warnings: { code: string; message: string }[];
    };
    const phase1 = parsed.result.data.phase1_result;
    expect(phase1.intake_truncated).toBe(true);
    expect(phase1.intake_byte_size).toBeLessThanOrEqual(HARD_CAP);
    expect(phase1.intake_original_byte_size).toBe(Buffer.byteLength(body, "utf8"));
    expect(phase1.intake_original_path).toMatch(/^\.agora\/history\/intake-original-.+\.md$/);
    // Envelope warning carries the archive path for --json / MCP consumers.
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]?.code).toBe("intake_hard_cap_truncated");
    expect(parsed.warnings[0]?.message).toContain(phase1.intake_original_path ?? "");

    // intake.json holds the truncated text (tail gone)…
    const intake = JSON.parse(await readFile(join(cwd, ".agora", "intake.json"), "utf8")) as {
      raw_intake: string;
      intake_original_path: string | null;
    };
    expect(intake.raw_intake).not.toContain("TAIL-MARKER");
    // …and the archive holds the complete original, byte for byte.
    const archived = await readFile(join(cwd, intake.intake_original_path ?? ""), "utf8");
    expect(archived).toBe(body);
  });

  test("missing file → empty content triggers re-prompt → orchestrator returns user.aborted", async () => {
    await seedSession();
    const { output, status } = run("intake --from-file=does-not-exist.txt --json");
    // runPhase1Intake will hit askReprompt (empty content), askReprompt
    // also returns "" → orchestrator returns user.aborted error.
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });
});
