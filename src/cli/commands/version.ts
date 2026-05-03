// SPEC: docs/infra/install.md (Stage 4-A.1 R4-A — Version Output)
//
// `agora --version` command:
// - TUI mode: single-line `agora <semver>`
// - JSON mode: extends with environment context (node version, install path,
//   platform, arch, claude_cli_present, anthropic_api_key_present)
//
// Per first-slice scope: probes that need shell-out (claude_cli_present,
// pnpm_version) emit a warning instead of running, and direct users to
// `agora doctor` for full env scan. Full probe runner lands in next slice.

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgoraErrorThrown } from "../../errors/types.js";
import { localized } from "../../i18n/index.js";
import { ok, type Result } from "../../result/index.js";
import type { GlobalFlags } from "../flags.js";
import type { CommandEnvelope } from "../render.js";

interface PackageJson {
  version?: string;
  name?: string;
}

export function runVersionCommand(flags: GlobalFlags): Result<CommandEnvelope, AgoraErrorThrown> {
  const pkg = readPackageJson();
  const agoraVersion = pkg.version ?? "unknown";

  if (!flags.json) {
    // TUI mode — single line; the render layer formats this from result.data.
    return ok(buildTuiEnvelope(agoraVersion));
  }
  return ok(buildJsonEnvelope(agoraVersion, flags));
}

function buildTuiEnvelope(version: string): CommandEnvelope {
  return {
    command: "agora --version",
    version,
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: { agora_version: version },
    },
    next: [],
    warnings: [],
    errors: [],
    exit_code: 0,
  };
}

function buildJsonEnvelope(version: string, flags: GlobalFlags): CommandEnvelope {
  const envelope: CommandEnvelope = {
    command: "agora --version",
    version,
    timestamp: new Date().toISOString(),
    result: {
      ok: true,
      data: {
        agora_version: version,
        agora_install_path: getInstallPath(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        anthropic_api_key_present: isAnthropicApiKeyPresent(),
        // Probes deferred to `agora doctor` — surfaced as warning below.
        claude_cli_present: null,
        claude_cli_version: null,
        pnpm_version: null,
        locale_resolved: flags.locale,
      },
    },
    next: [],
    warnings: [
      {
        code: "version_runtime_probes_deferred",
        message: localized("cli.version.json_warning_no_runtime_check"),
      },
    ],
    errors: [],
    exit_code: 0,
  };
  return envelope;
}

function readPackageJson(): PackageJson {
  // Resolve package.json relative to this module. Works in both:
  //   - dev mode (tsx): src/cli/commands/version.ts → ../../../package.json
  //   - dist mode (built): dist/cli/commands/version.js → ../../../package.json
  // Both are 3 levels up from this file.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    `${here}/../../../package.json`,
    `${here}/../../package.json`, // safety fallback
  ];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf8");
      return JSON.parse(text) as PackageJson;
    } catch {
      // try next candidate
    }
  }
  return {};
}

function getInstallPath(): string {
  // Best-effort: directory containing package.json (3 levels up).
  const here = dirname(fileURLToPath(import.meta.url));
  return `${here}/../../..`;
}

function isAnthropicApiKeyPresent(): boolean {
  const key = process.env["ANTHROPIC_API_KEY"];
  return typeof key === "string" && key.startsWith("sk-ant-");
}
