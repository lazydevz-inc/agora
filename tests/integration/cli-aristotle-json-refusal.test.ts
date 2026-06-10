// SPEC: Stage 6-A.31 — Aristotle 4-cause + maturity commands refuse
// --json mode (clack TUI bytes garble JSON output). Future slice will
// add --from-json=<path> to provide pre-built JSON directly.

import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ABS = `${process.cwd()}/src/cli/index.ts`;
const TSX = `${process.cwd()}/node_modules/.bin/tsx`;

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agora-aristotle-json-"));
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

async function seed(opts: {
  phase: string;
  alignmentPhase?: number;
  alignmentRound?: number;
  causes?: Record<string, unknown>;
  intake?: boolean;
  scan?: boolean;
}): Promise<void> {
  const ts = "2026-05-06T00:00:00.000Z";
  await mkdir(join(cwd, ".agora"), { recursive: true });
  const state: Record<string, unknown> = {
    version: 1,
    current_phase: opts.phase,
    created_at: ts,
    updated_at: ts,
  };
  if (opts.alignmentPhase !== undefined) {
    state["alignment"] = { phase: opts.alignmentPhase, round: opts.alignmentRound ?? 0 };
  }
  await writeFile(join(cwd, ".agora", "state.json"), JSON.stringify(state), "utf8");
  if (opts.scan === true) {
    await writeFile(
      join(cwd, ".agora", "scan.json"),
      JSON.stringify({
        project_name: "x",
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
  if (opts.intake === true) {
    await writeFile(
      join(cwd, ".agora", "intake.json"),
      JSON.stringify({
        version: 1,
        intake_method: "inline",
        intake_word_count: 5,
        raw_text: "x x x x x",
        estimated_rounds: "1-2",
        captured_at: ts,
      }),
      "utf8",
    );
  }
  if (opts.causes !== undefined) {
    await writeFile(join(cwd, ".agora", "four_causes.json"), JSON.stringify(opts.causes), "utf8");
  }
}

describe("agora telos --json → refuse exit 2", () => {
  test("hint mentions four_causes.json + JSON pending", async () => {
    await seed({ phase: "in_alignment", alignmentPhase: 1, intake: true, scan: true });
    const { output, status } = run("telos --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("four_causes.json");
  });
});

describe("agora form --json → refuse exit 2", () => {
  test("requires telos in causes; refuses regardless", async () => {
    const ts = "2026-05-06T00:00:00.000Z";
    await seed({
      phase: "in_alignment",
      alignmentPhase: 2,
      intake: true,
      scan: true,
      causes: {
        version: 1,
        telos: {
          statement: "x",
          served_good: "x",
          failure_signal: "x",
          maturity: "dianoia",
        },
        created_at: ts,
        updated_at: ts,
      },
    });
    const { output, status } = run("form --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });
});

describe("agora material --json → refuse exit 2", () => {
  test("refuses when reachable", async () => {
    const ts = "2026-05-06T00:00:00.000Z";
    await seed({
      phase: "in_alignment",
      alignmentPhase: 2,
      intake: true,
      scan: true,
      causes: {
        version: 1,
        telos: { statement: "x", served_good: "x", failure_signal: "x", maturity: "dianoia" },
        form: {
          essential_structure: "x",
          irreducible_parts: ["x"],
          maturity: "dianoia",
        },
        created_at: ts,
        updated_at: ts,
      },
    });
    const { output, status } = run("material --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });
});

describe("agora efficient --json → refuse exit 2", () => {
  test("refuses when reachable", async () => {
    const ts = "2026-05-06T00:00:00.000Z";
    await seed({
      phase: "in_alignment",
      alignmentPhase: 2,
      intake: true,
      scan: true,
      causes: {
        version: 1,
        telos: { statement: "x", served_good: "x", failure_signal: "x", maturity: "dianoia" },
        form: {
          essential_structure: "x",
          irreducible_parts: ["x"],
          maturity: "dianoia",
        },
        material: {
          tech_stack: ["x"],
          data_shape: "x",
          infrastructure: "x",
          maturity: "pistis",
        },
        created_at: ts,
        updated_at: ts,
      },
    });
    const { output, status } = run("efficient --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
  });
});

describe("agora maturity --json → refuse exit 2", () => {
  test("refuses with hint about TTY-then-inspect", async () => {
    const ts = "2026-05-06T00:00:00.000Z";
    await seed({
      phase: "in_alignment",
      alignmentPhase: 2,
      alignmentRound: 4,
      causes: {
        version: 1,
        telos: { statement: "x", served_good: "x", failure_signal: "x", maturity: "dianoia" },
        form: {
          essential_structure: "x",
          irreducible_parts: ["x"],
          maturity: "dianoia",
        },
        material: {
          tech_stack: ["x"],
          data_shape: "x",
          infrastructure: "x",
          maturity: "pistis",
        },
        efficient: { who: "x", when: "x", how: "x", maturity: "pistis" },
        created_at: ts,
        updated_at: ts,
      },
    });
    const { output, status } = run("maturity --json");
    expect(status).toBe(2);
    const parsed = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(parsed.errors[0]?.code).toBe("user.aborted");
    expect(parsed.errors[0]?.message).toContain("four_causes.json");
  });
});
