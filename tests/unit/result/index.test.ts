// SPEC: docs/architecture/result-type.md (Stage 5-A.6) — test contract section.

import { describe, expect, test } from "vitest";

import { AgoraErrorThrown } from "@/errors/types.js";
import {
  err,
  flatMap,
  flatMapAsync,
  map,
  mapErr,
  ok,
  tryFrom,
  tryFromAsync,
  unwrap,
  unwrapOr,
} from "@/result/index.js";

const sampleError = (): AgoraErrorThrown =>
  new AgoraErrorThrown({
    code: "internal.invariant-violation",
    category: "internal",
    message: "test",
    message_key: "errors.internal.invariant_violation",
  });

describe("Result", () => {
  test("ok().ok === true and value preserved", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  test("err().ok === false and error preserved", () => {
    const e = sampleError();
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(e);
  });

  test("map preserves err; transforms value on ok", () => {
    expect(map(ok(2), (n: number) => n + 1)).toEqual({ ok: true, value: 3 });
    const e = sampleError();
    expect(map<number, number, AgoraErrorThrown>(err(e), (n) => n + 1)).toEqual({
      ok: false,
      error: e,
    });
  });

  test("flatMap chains on ok; short-circuits on err", () => {
    const r = flatMap(ok(2), (n: number) => ok(n * 10));
    expect(r).toEqual({ ok: true, value: 20 });
    const e = sampleError();
    const r2 = flatMap<number, number, AgoraErrorThrown>(err(e), (n) => ok(n));
    expect(r2).toEqual({ ok: false, error: e });
  });

  test("flatMapAsync awaits + chains", async () => {
    const r = await flatMapAsync(ok(2), async (n: number) => ok(n + 5));
    expect(r).toEqual({ ok: true, value: 7 });
  });

  test("mapErr transforms err; passes ok through", () => {
    const e = sampleError();
    expect(mapErr(err(e), (er: AgoraErrorThrown) => er.code)).toEqual({
      ok: false,
      error: "internal.invariant-violation",
    });
    expect(mapErr<number, AgoraErrorThrown, AgoraErrorThrown>(ok(1), (er) => er)).toEqual({
      ok: true,
      value: 1,
    });
  });

  test("unwrap returns value on ok; throws on err", () => {
    expect(unwrap(ok(99))).toBe(99);
    const e = sampleError();
    expect(() => unwrap(err(e))).toThrow(e);
  });

  test("unwrapOr returns value on ok; default on err", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    expect(unwrapOr(err(sampleError()), 99)).toBe(99);
  });

  test("tryFrom catches AgoraErrorThrown → err()", () => {
    const e = sampleError();
    const r = tryFrom(() => {
      throw e;
    });
    expect(r).toEqual({ ok: false, error: e });
  });

  test("tryFrom re-throws non-AgoraError (plain Error)", () => {
    expect(() =>
      tryFrom(() => {
        throw new Error("not agora");
      }),
    ).toThrow("not agora");
  });

  test("tryFromAsync handles both branches", async () => {
    const okR = await tryFromAsync(async () => 5);
    expect(okR).toEqual({ ok: true, value: 5 });
    const e = sampleError();
    const errR = await tryFromAsync(async () => {
      throw e;
    });
    expect(errR).toEqual({ ok: false, error: e });
  });
});
