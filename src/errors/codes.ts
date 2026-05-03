// SPEC: docs/infra/errors-and-telemetry.md (Stage 4-A.6 R1-A)
//
// ERROR_CATALOG — single source of truth for every recoverable +
// unrecoverable error. TS literal type derives ErrorCode union — any
// non-cataloged code becomes a compile error.
//
// Each entry pins category, exit_code, and locale catalog keys.
// Stage 4-A.6 R2-A: per-error explicit exit_code in catalog.

import type { ErrorCategory } from "./types.js";

export interface ErrorCatalogEntry {
  category: ErrorCategory;
  exit_code: 0 | 1 | 2 | 4 | 5 | 20;
  message_key: string;
  fix_key?: string;
}

export const ERROR_CATALOG = {
  // ─── config category — all → exit 20 (Stage 3-A.1) ───
  "config.missing-version": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.missing_version",
    fix_key: "errors.config.missing_version.fix",
  },
  "config.version-mismatch": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.version_mismatch",
    fix_key: "errors.config.version_mismatch.fix",
  },
  "config.unknown-key": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.unknown_key",
  },
  "config.threshold-inversion": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.threshold_inversion",
  },
  "config.disabled-forced-overlap": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.disabled_forced_overlap",
  },
  "config.invalid-toml": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.invalid_toml",
  },
  "config.path-not-found": {
    category: "config",
    exit_code: 20,
    message_key: "errors.config.path_not_found",
  },

  // ─── llm category ───
  "llm.auth-failed": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.auth_failed",
    fix_key: "errors.llm.auth_failed.fix",
  },
  "llm.rate-limited": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.rate_limited",
  },
  "llm.timeout": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.timeout",
  },
  "llm.invalid-response": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.invalid_response",
  },
  "llm.no-runner-available": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.no_runner_available",
    fix_key: "errors.llm.no_runner_available.fix",
  },
  "llm.internal-error": {
    category: "llm",
    exit_code: 1,
    message_key: "errors.llm.internal_error",
  },

  // ─── probe category ───
  "probe.timeout": {
    category: "probe",
    exit_code: 4,
    message_key: "errors.probe.timeout",
  },
  "probe.internal-error": {
    category: "probe",
    exit_code: 4,
    message_key: "errors.probe.internal_error",
  },
  "probe.unknown-id": {
    category: "probe",
    exit_code: 5,
    message_key: "errors.probe.unknown_id",
  },

  // ─── gate category — Ralph gate failures ───
  "gate.gate-1-deterministic-fail": {
    category: "gate",
    exit_code: 4,
    message_key: "errors.gate.gate_1_fail",
  },
  "gate.gate-2-functional-fail": {
    category: "gate",
    exit_code: 4,
    message_key: "errors.gate.gate_2_fail",
  },
  "gate.gate-3-uiux-fail": {
    category: "gate",
    exit_code: 4,
    message_key: "errors.gate.gate_3_fail",
  },
  "gate.gate-4-tech-fail": {
    category: "gate",
    exit_code: 4,
    message_key: "errors.gate.gate_4_fail",
  },
  "gate.gate-5-alignment-fail": {
    category: "gate",
    exit_code: 4,
    message_key: "errors.gate.gate_5_fail",
  },

  // ─── user category ───
  "user.forbidden-flag-combo": {
    category: "user",
    exit_code: 5,
    message_key: "errors.user.forbidden_flag_combo",
  },
  "user.confirmation-required": {
    category: "user",
    exit_code: 2,
    message_key: "errors.user.confirmation_required",
  },
  "user.aborted": {
    category: "user",
    exit_code: 2,
    message_key: "errors.user.aborted",
  },

  // ─── state category ───
  "state.corrupt": {
    category: "state",
    exit_code: 20,
    message_key: "errors.state.corrupt",
  },
  "state.unreadable": {
    category: "state",
    exit_code: 20,
    message_key: "errors.state.unreadable",
  },

  // ─── io category ───
  "io.permission-denied": {
    category: "io",
    exit_code: 1,
    message_key: "errors.io.permission_denied",
  },
  "io.disk-full": {
    category: "io",
    exit_code: 1,
    message_key: "errors.io.disk_full",
  },
  "io.editor-unavailable": {
    category: "io",
    exit_code: 1,
    message_key: "errors.io.editor_unavailable",
    fix_key: "errors.io.editor_unavailable.fix",
  },

  // ─── internal category — exit 1 + crash report ───
  "internal.uncaught": {
    category: "internal",
    exit_code: 1,
    message_key: "errors.internal.uncaught",
    fix_key: "errors.internal.uncaught.fix",
  },
  "internal.invariant-violation": {
    category: "internal",
    exit_code: 1,
    message_key: "errors.internal.invariant_violation",
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
