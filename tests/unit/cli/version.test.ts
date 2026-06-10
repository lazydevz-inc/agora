// SPEC: docs/infra/install.md (Stage 4-A.1 R4-A).

import { describe, expect, test } from "vitest";

import { runVersionCommand } from "@/cli/commands/version.js";
import { parseArgv } from "@/cli/flags.js";

describe("runVersionCommand (TUI mode)", () => {
  test("returns ok with single agora_version field in result.data", () => {
    const parsed = parseArgv(["--version"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = runVersionCommand(parsed.value.flags);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.command).toBe("agora --version");
    expect(result.value.exit_code).toBe(0);
    expect(result.value.result.ok).toBe(true);
    expect(result.value.result.data?.agora_version).toBeTypeOf("string");
    expect(result.value.warnings).toHaveLength(0);
  });
});

describe("runVersionCommand (JSON mode)", () => {
  test("returns ok with extended env context + deferred-probe warning", () => {
    const parsed = parseArgv(["--version", "--json"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = runVersionCommand(parsed.value.flags);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.value.result.data;
    expect(data).toBeDefined();
    if (data === undefined) return;
    expect(data.agora_version).toBeTypeOf("string");
    expect(data.node_version).toBe(process.version);
    expect(data.platform).toBe(process.platform);
    expect(data.arch).toBe(process.arch);
    expect(data.claude_cli_present).toBeNull();
    expect(data.pnpm_version).toBeNull();
    expect(data.locale_resolved).toBe("en");
    expect(result.value.warnings).toHaveLength(1);
    expect(result.value.warnings[0]?.code).toBe("version_runtime_probes_deferred");
  });
});

describe("parseArgv forbidden combinations", () => {
  test("--json + --verbose rejected", () => {
    const parsed = parseArgv(["--json", "--verbose"]);
    expect(parsed.ok).toBe(false);
  });

  test("--json + --no-color rejected", () => {
    const parsed = parseArgv(["--json", "--no-color"]);
    expect(parsed.ok).toBe(false);
  });

  test("--quiet + --verbose rejected", () => {
    const parsed = parseArgv(["--quiet", "--verbose"]);
    expect(parsed.ok).toBe(false);
  });

  test("--locale=fr rejected (only en, ko bundled)", () => {
    const parsed = parseArgv(["--locale=fr"]);
    expect(parsed.ok).toBe(false);
  });

  test("--locale=ko accepted", () => {
    const parsed = parseArgv(["--locale=ko"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.flags.locale).toBe("ko");
  });

  test("LANG=ko_KR.UTF-8 normalized to ko", () => {
    const original = process.env.LANG;
    process.env.LANG = "ko_KR.UTF-8";
    delete process.env.AGORA_LOCALE;
    const parsed = parseArgv(["--version"]);
    if (original === undefined) {
      delete process.env.LANG;
    } else {
      process.env.LANG = original;
    }
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.flags.locale).toBe("ko");
  });
});
