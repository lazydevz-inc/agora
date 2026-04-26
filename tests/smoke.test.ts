/**
 * Stage 0 smoke tests — verify CLI builds and runs.
 */

import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const CLI = "tsx src/cli/index.ts";

describe("agora CLI smoke", () => {
  test("prints version with --version", () => {
    const output = execSync(`${CLI} --version`).toString();
    expect(output).toContain("0.0.1");
  });

  test("version subcommand works", () => {
    const output = execSync(`${CLI} version`).toString();
    expect(output.toLowerCase()).toContain("agora");
  });

  test("default action prints banner", () => {
    const output = execSync(CLI).toString();
    expect(output).toContain("Agora");
    expect(output).toContain("Stage 0");
  });
});
