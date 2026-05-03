// SPEC: docs/infra/install.md (Stage 4-A.1 R4-A) — end-to-end version output.
//
// Spawns the CLI via tsx (dev mode equivalent) and asserts stdout shape.

import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const CLI = "tsx src/cli/index.ts";

describe("agora --version (TUI)", () => {
  test("prints single line `agora <semver>`", () => {
    const output = execSync(`${CLI} --version`).toString().trim();
    expect(output).toMatch(/^agora \d+\.\d+\.\d+/);
  });
});

describe("agora --version --json (JSON)", () => {
  test("emits valid JSON envelope with extended env context", () => {
    const output = execSync(`${CLI} --version --json`).toString();
    const parsed = JSON.parse(output) as {
      command: string;
      version: string;
      result: { ok: boolean; data?: Record<string, unknown> };
      next: unknown[];
      warnings: { code: string }[];
      errors: unknown[];
      exit_code: number;
    };
    expect(parsed.command).toBe("agora --version");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.data?.["agora_version"]).toBeTypeOf("string");
    expect(parsed.result.data?.["node_version"]).toBeTypeOf("string");
    expect(parsed.result.data?.["platform"]).toBeTypeOf("string");
    expect(parsed.result.data?.["arch"]).toBeTypeOf("string");
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]?.code).toBe("version_runtime_probes_deferred");
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.exit_code).toBe(0);
  });
});

describe("agora --version --json with locale (ko)", () => {
  test("locale_resolved is ko when --locale=ko provided", () => {
    const output = execSync(`${CLI} --version --json --locale=ko`).toString();
    const parsed = JSON.parse(output) as {
      result: { data?: Record<string, unknown> };
      warnings: { message: string }[];
    };
    expect(parsed.result.data?.["locale_resolved"]).toBe("ko");
    // Warning message itself is locale-resolved.
    expect(parsed.warnings[0]?.message).toContain("agora doctor");
  });
});

describe("agora forbidden flag combinations", () => {
  test("--json + --verbose exits non-zero with structured error", () => {
    let exited = false;
    try {
      execSync(`${CLI} --json --verbose`, { stdio: "pipe" });
    } catch (e) {
      exited = true;
      const status = (e as { status?: number }).status;
      expect(status).toBe(5); // user.forbidden-flag-combo
    }
    expect(exited).toBe(true);
  });

  test("--locale=fr exits 5", () => {
    let exited = false;
    try {
      execSync(`${CLI} --locale=fr --version`, { stdio: "pipe" });
    } catch (e) {
      exited = true;
      const status = (e as { status?: number }).status;
      expect(status).toBe(5);
    }
    expect(exited).toBe(true);
  });
});
