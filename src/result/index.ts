// SPEC: docs/architecture/result-type.md
//
// Result<T, E> — Stage 5-A.6 R1-A canonical implementation.
// Module boundary returns Result; internal helpers may throw.
// CLI top-level uses unwrap() for final emit.

import type { AgoraErrorThrown } from "../errors/types.js";

// ─── Type ───
export type Result<T, E = AgoraErrorThrown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// ─── Constructors ───
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Combinators ───
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> {
  return result.ok ? await fn(result.value) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

// ─── Lift from throwing functions ───
export function tryFrom<T>(fn: () => T): Result<T, AgoraErrorThrown> {
  try {
    return ok(fn());
  } catch (e) {
    if (isAgoraError(e)) return err(e);
    throw e;
  }
}

export async function tryFromAsync<T>(fn: () => Promise<T>): Promise<Result<T, AgoraErrorThrown>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (isAgoraError(e)) return err(e);
    throw e;
  }
}

function isAgoraError(e: unknown): e is AgoraErrorThrown {
  return (
    e instanceof Error &&
    typeof (e as AgoraErrorThrown).code === "string" &&
    typeof (e as AgoraErrorThrown).category === "string"
  );
}
