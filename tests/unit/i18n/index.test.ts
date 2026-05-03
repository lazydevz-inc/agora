// SPEC: docs/architecture/locale-catalog.md (Stage 5-A.5).

import { afterEach, describe, expect, test } from "vitest";

import { AgoraErrorThrown } from "@/errors/types.js";
import { lookupKey } from "@/i18n/catalog.js";
import { getLocale, localized, SUPPORTED_LOCALES, setLocale } from "@/i18n/index.js";

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
