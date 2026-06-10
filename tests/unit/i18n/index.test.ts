// SPEC: docs/architecture/locale-catalog.md (Stage 5-A.5).

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AgoraErrorThrown } from "@/errors/types.js";
import { lookupKey } from "@/i18n/catalog.js";
import {
  getLocale,
  localized,
  resolveEnvLocale,
  SUPPORTED_LOCALES,
  setLocale,
} from "@/i18n/index.js";

afterEach(() => setLocale("en"));

describe("i18n", () => {
  test("SUPPORTED_LOCALES contains en + ko exactly", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["en", "ko"]);
  });

  test("setLocale + getLocale roundtrip", () => {
    setLocale("ko");
    expect(getLocale()).toBe("ko");
    setLocale("en");
    expect(getLocale()).toBe("en");
  });

  test("localized resolves nested key with interpolation (en)", () => {
    setLocale("en");
    const out = localized("errors.config.path_not_found", { file: "x.toml" });
    expect(out).toContain("x.toml");
  });

  test("localized resolves the same key in ko", () => {
    setLocale("ko");
    const out = localized("errors.config.path_not_found", { file: "x.toml" });
    expect(out).toContain("x.toml");
    expect(out).toContain("찾을 수 없습니다");
  });

  test("localized resolves flat-leaf-with-dots key (.fix suffix)", () => {
    setLocale("en");
    const out = localized("errors.config.missing_version.fix", { file: "agora/config.toml" });
    expect(out).toContain("agora/config.toml");
  });

  test("localized throws on missing key with structured AgoraError", () => {
    setLocale("en");
    expect(() => localized("does.not.exist")).toThrowError(AgoraErrorThrown);
    try {
      localized("does.not.exist");
    } catch (e) {
      expect(e).toBeInstanceOf(AgoraErrorThrown);
      const err = e as AgoraErrorThrown;
      expect(err.code).toBe("internal.invariant-violation");
      expect(err.context).toMatchObject({ kind: "missing_locale_key", key: "does.not.exist" });
    }
  });

  test("localized throws on missing placeholder", () => {
    setLocale("en");
    expect(() => localized("errors.config.path_not_found", {})).toThrowError(AgoraErrorThrown);
    try {
      localized("errors.config.path_not_found", {});
    } catch (e) {
      expect(e).toBeInstanceOf(AgoraErrorThrown);
      const err = e as AgoraErrorThrown;
      expect(err.context).toMatchObject({ kind: "missing_placeholder", placeholder: "file" });
    }
  });
});

describe("resolveEnvLocale — shared env locale resolver", () => {
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

  test("unset env → en", () => {
    expect(resolveEnvLocale()).toBe("en");
  });

  test("AGORA_LOCALE=ko → ko; takes precedence over LANG", () => {
    process.env["AGORA_LOCALE"] = "ko";
    process.env["LANG"] = "en_US.UTF-8";
    expect(resolveEnvLocale()).toBe("ko");
  });

  test("LANG=ko_KR.UTF-8 → ko (prefix match)", () => {
    process.env["LANG"] = "ko_KR.UTF-8";
    expect(resolveEnvLocale()).toBe("ko");
  });

  test("unsupported values fall back to en, never error", () => {
    process.env["LANG"] = "ja_JP.UTF-8";
    expect(resolveEnvLocale()).toBe("en");
    process.env["AGORA_LOCALE"] = "fr";
    expect(resolveEnvLocale()).toBe("en");
  });
});

describe("lookupKey", () => {
  const fixture = {
    a: {
      b: {
        c: "leaf-c",
        "c.fix": "leaf-c-fix",
      },
    },
  };

  test("resolves nested path", () => {
    expect(lookupKey(fixture, "a.b.c")).toBe("leaf-c");
  });

  test("resolves flat-leaf-with-dots", () => {
    expect(lookupKey(fixture, "a.b.c.fix")).toBe("leaf-c-fix");
  });

  test("returns undefined on miss", () => {
    expect(lookupKey(fixture, "a.x.y")).toBeUndefined();
    expect(lookupKey(fixture, "nope")).toBeUndefined();
  });

  test("returns undefined when descending into non-object", () => {
    expect(lookupKey(fixture, "a.b.c.deeper")).toBeUndefined();
  });
});
