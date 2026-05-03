// SPEC: docs/infra/errors-and-telemetry.md
//
// AgoraError + AgoraErrorThrown — Stage 4-A.6 R1-A canonical types.
// Single source of truth shape; ERROR_CATALOG (codes.ts) pins category +
// exit_code + locale keys per code.

import type { ErrorCode } from "./codes.js";

export type ErrorCategory =
  | "config"
  | "probe"
  | "llm"
  | "gate"
  | "user"
  | "state"
  | "io"
  | "internal";

export interface AgoraError {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  message_key: string;
  // Fields below use `| undefined` (vs bare `?:`) so callers may pass undefined
  // explicitly without violating exactOptionalPropertyTypes. Class-side
  // declaration uses bare `?:` + conditional assignment in the constructor.
  fix?: string | undefined;
  fix_key?: string | undefined;
  cause?: unknown;
  context?: Record<string, unknown> | undefined;
}

export class AgoraErrorThrown extends Error implements AgoraError {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly message_key: string;
  readonly fix?: string;
  readonly fix_key?: string;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(fields: AgoraError) {
    super(fields.message);
    this.name = "AgoraError";
    this.code = fields.code;
    this.category = fields.category;
    this.message_key = fields.message_key;
    if (fields.fix !== undefined) this.fix = fields.fix;
    if (fields.fix_key !== undefined) this.fix_key = fields.fix_key;
    if (fields.cause !== undefined) this.cause = fields.cause;
    if (fields.context !== undefined) this.context = fields.context;
  }
}
