// SPEC: Slice H — Mode 2 cost-warning UX.
//
// Unit tests for the helpers exported by src/llm/selection.ts. The
// integration path (selectRuntime → maybeEmitMode2CostWarning) is
// exercised indirectly here; we don't shell out to `claude --version`
// in tests.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  _resetSelectionForTests,
  buildCostWarningMessage,
  maybeEmitMode2CostWarning,
  shouldSuppressCostWarning,
} from "@/llm/selection.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  _resetSelectionForTests();
  delete process.env["AGORA_NO_COST_WARNING"];
  delete process.env["AGORA_QUIET"];
  delete process.env["AGORA_LOCALE"];
  delete process.env["LANG"];
});

afterEach(() => {
  process.env = { ...originalEnv };
  _resetSelectionForTests();
});

describe("shouldSuppressCostWarning", () => {
  test("default → false", () => {
    expect(shouldSuppressCostWarning()).toBe(false);
  });

  test("AGORA_NO_COST_WARNING=1 → true", () => {
    process.env["AGORA_NO_COST_WARNING"] = "1";
    expect(shouldSuppressCostWarning()).toBe(true);
  });

  test("AGORA_QUIET=1 → true", () => {
    process.env["AGORA_QUIET"] = "1";
    expect(shouldSuppressCostWarning()).toBe(true);
  });

  test('AGORA_NO_COST_WARNING="" (empty) → false', () => {
    process.env["AGORA_NO_COST_WARNING"] = "";
    expect(shouldSuppressCostWarning()).toBe(false);
  });
});

describe("buildCostWarningMessage", () => {
  test("en locale → English message with ADR-0009/0010 reference", () => {
    const msg = buildCostWarningMessage("en");
    expect(msg).toMatch(/Mode 2/);
    expect(msg).toMatch(/2026-06-15/);
    expect(msg).toMatch(/ADR-0009/);
    expect(msg).toMatch(/ADR-0010/);
    expect(msg).toMatch(/AGORA_NO_COST_WARNING/);
  });

  test("ko locale → Korean message", () => {
    const msg = buildCostWarningMessage("ko");
    expect(msg).toMatch(/Mode 2/);
    expect(msg).toMatch(/2026-06-15/);
    expect(msg).toMatch(/플러그인/);
  });
});

describe("maybeEmitMode2CostWarning — emission control", () => {
  test("first call writes to stderr; second call is silent (idempotent)", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      maybeEmitMode2CostWarning();
      expect(spy).toHaveBeenCalledTimes(1);
      maybeEmitMode2CostWarning();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("AGORA_NO_COST_WARNING=1 → no stderr write", () => {
    process.env["AGORA_NO_COST_WARNING"] = "1";
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      maybeEmitMode2CostWarning();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("AGORA_QUIET=1 → no stderr write", () => {
    process.env["AGORA_QUIET"] = "1";
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      maybeEmitMode2CostWarning();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("ko locale via LANG → Korean message emitted", () => {
    process.env["LANG"] = "ko_KR.UTF-8";
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      maybeEmitMode2CostWarning();
      expect(spy).toHaveBeenCalledTimes(1);
      const written = spy.mock.calls[0]?.[0] as string;
      expect(written).toMatch(/플러그인/);
    } finally {
      spy.mockRestore();
    }
  });
});
