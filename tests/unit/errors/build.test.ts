// SPEC: docs/infra/errors-and-telemetry.md (Stage 4-A.6).

import { beforeEach, describe, expect, test } from "vitest";
import { buildAgoraError } from "@/errors/build.js";
import { ERROR_CATALOG } from "@/errors/codes.js";
import { AgoraErrorThrown } from "@/errors/types.js";
import { setLocale } from "@/i18n/index.js";

describe("buildAgoraError", () => {
  beforeEach(() => {
    setLocale("en");
  });

  test("returns AgoraErrorThrown without throwing", () => {
    const error = buildAgoraError("config.path-not-found", { context: { file: "foo.toml" } });
    expect(error).toBeInstanceOf(AgoraErrorThrown);
    expect(error.code).toBe("config.path-not-found");
    expect(error.category).toBe("config");
    expect(error.message).toContain("foo.toml");
  });

  test("includes localized fix when fix_key declared", () => {
    const error = buildAgoraError("llm.no-runner-available");
    expect(error.fix).toBeDefined();
    expect(error.fix).toContain("Claude Code");
  });

  test("omits fix when no fix_key", () => {
    const error = buildAgoraError("llm.timeout", { context: { timeout_ms: 60000 } });
    expect(error.fix).toBeUndefined();
  });

  test("preserves cause", () => {
    const cause = new Error("underlying");
    const error = buildAgoraError("internal.uncaught", {
      cause,
      context: { detail: "boom", crash_file: "/tmp/x.json" },
    });
    expect(error.cause).toBe(cause);
  });

  test("respects current locale", () => {
    setLocale("ko");
    const error = buildAgoraError("config.path-not-found", { context: { file: "foo.toml" } });
    expect(error.message).toContain("foo.toml");
    expect(error.message).toContain("찾을 수 없습니다");
  });
});

describe("ERROR_CATALOG", () => {
  test("every entry has category + exit_code + message_key", () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG) as [
      string,
      (typeof ERROR_CATALOG)[keyof typeof ERROR_CATALOG],
    ][]) {
      expect(entry.category, `${code}: missing category`).toBeDefined();
      expect(entry.exit_code, `${code}: missing exit_code`).toBeDefined();
      expect(entry.message_key, `${code}: missing message_key`).toBeDefined();
    }
  });

  test("exit_code is one of the canonical 7-tier values", () => {
    const allowed = new Set([0, 1, 2, 4, 5, 20]);
    for (const [code, entry] of Object.entries(ERROR_CATALOG) as [
      string,
      (typeof ERROR_CATALOG)[keyof typeof ERROR_CATALOG],
    ][]) {
      expect(allowed.has(entry.exit_code), `${code}: invalid exit_code ${entry.exit_code}`).toBe(
        true,
      );
    }
  });
});
