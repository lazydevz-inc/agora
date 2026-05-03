// SPEC: Stage 6-A.3 R4-A — `agora ping` end-to-end.
//
// Requires `claude` CLI installed + authenticated. CI without claude will
// see exit code 1 (llm.no-runner-available); test asserts shape, not pass.

import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const CLI = "tsx src/cli/index.ts";

function run(args: string): { output: string; status: number; combined: string } {
  try {
    const output = execSync(`${CLI} ${args}`, { stdio: "pipe", timeout: 60_000 }).toString();
    return { output, status: 0, combined: output };
  } catch (e) {
    const status = (e as { status?: number }).status ?? -1;
    const stdout = ((e as { stdout?: Buffer }).stdout ?? Buffer.from("")).toString();
    const stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from("")).toString();
    return { output: stdout, status, combined: `${stdout}\n${stderr}` };
  }
}

describe("agora ping (JSON)", () => {
  test("returns valid envelope (ok or error) — shape stable", () => {
    const { output, status } = run("ping --json");
    // Output may be empty if error path emits to stderr only.
    if (output.length === 0) {
      expect([1, 4, 5]).toContain(status);
      return;
    }
    const parsed = JSON.parse(output) as {
      command: string;
      result: { ok: boolean };
      exit_code: number;
      errors?: unknown[];
    };
    // Success path uses "agora ping"; error path emits via emitAgoraError
    // which uses the generic "agora" command label. Both shapes valid.
    expect(["agora ping", "agora"]).toContain(parsed.command);
    if (parsed.result.ok) {
      expect(parsed.exit_code).toBe(0);
      expect(status).toBe(0);
    } else {
      expect(parsed.exit_code).not.toBe(0);
    }
  }, 65_000);
});
