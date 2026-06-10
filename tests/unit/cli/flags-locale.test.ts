// SPEC: docs/cli/spec.md Stage 3-A.3 (global flags) — locale resolution.
//
// Regression guard (dogfood QA 2026-06-10, surfaced by the first CI run):
// environment-derived locales must FALL BACK to "en", never hard-error.
// GitHub runners ship LANG=C.UTF-8 and real users run ja_JP.UTF-8 etc.;
// rejecting those made every CLI invocation exit 2 in such environments.
// Only an explicit --locale=<x> states an intent we may refuse.

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { parseArgv } from "@/cli/flags.js";

let savedAgoraLocale: string | undefined;
let savedLang: string | undefined;

beforeEach(() => {
  savedAgoraLocale = process.env["AGORA_LOCALE"];
  savedLang = process.env["LANG"];
  delete process.env["AGORA_LOCALE"];
  delete process.env["LANG"];
});

afterEach(() => {
  if (savedAgoraLocale === undefined) delete process.env["AGORA_LOCALE"];
  else process.env["AGORA_LOCALE"] = savedAgoraLocale;
  if (savedLang === undefined) delete process.env["LANG"];
  else process.env["LANG"] = savedLang;
});

describe("locale resolution — environment values always fall back", () => {
  test("LANG=C.UTF-8 (CI default) → en, no error", () => {
    process.env["LANG"] = "C.UTF-8";
    const r = parseArgv(["status"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("en");
  });

  test("LANG=ja_JP.UTF-8 (unsupported user locale) → en, no error", () => {
    process.env["LANG"] = "ja_JP.UTF-8";
    const r = parseArgv(["status"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("en");
  });

  test("LANG=ko_KR.UTF-8 → ko (prefix match)", () => {
    process.env["LANG"] = "ko_KR.UTF-8";
    const r = parseArgv(["status"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("ko");
  });

  test("empty LANG → en", () => {
    process.env["LANG"] = "";
    const r = parseArgv(["status"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("en");
  });

  test("AGORA_LOCALE=fr (unsupported) → en fallback, not an error", () => {
    process.env["AGORA_LOCALE"] = "fr";
    const r = parseArgv(["status"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("en");
  });
});

describe("locale resolution — explicit --locale stays strict", () => {
  test("--locale=fr → user.forbidden-flag-combo", () => {
    const r = parseArgv(["status", "--locale=fr"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("user.forbidden-flag-combo");
  });

  test("--locale=ko_KR normalizes to ko", () => {
    const r = parseArgv(["status", "--locale=ko_KR"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flags.locale).toBe("ko");
  });
});
