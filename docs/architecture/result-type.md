# Result&lt;T, E&gt; — Specification (Stage 5)

> **Status**: Stage 5-A.6 (Accepted 2026-05-03).
> Sections marked **[SPEC]** are formally accepted Stage 5 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 5
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Adoption Decision** (5-A.6 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Implementation: custom inline, no library** (5-A.6 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Default Pattern: module boundary Result, internal throw** (5-A.6 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Migration Policy** (5-A.6 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Special-case Throw Retention** (5-A.6 R5) | **[SPEC]** Accepted 2026-05-03 |
| **Canonical Types + Combinators** (5-A.6) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope vs Inherited Decisions

| Inherited | Source |
|-----------|--------|
| `Result<T, E>` adoption deferred from Stage 4 to Stage 5 | CLAUDE.md L327 |
| All errors flow through `AgoraErrorThrown` (single ERROR_CATALOG) | Stage 4-A.6 R1-A |
| CLI top-level handler catches AgoraErrorThrown → emit + exit | Stage 4-A.6 R2-A |
| `renderPrompt` currently throws on missing placeholder; "if Stage 5-A.6 adopts Result, signature changes in one place" | Stage 5-A.4 R5-A note |
| `localized()` currently throws on missing key; "if adopted, signature converts to Result<string, AgoraError> in one place" | Stage 5-A.5 (closing note) |
| Dependency minimalism — no new runtime deps without justification | ADR-0001 |
| `src/result/` directory is LAYER 0 (declared in Stage 5-A.1) | Stage 5-A.1 |
| TypeScript strict mode + Zod-style validate-at-boundary pattern | Stage 4-A.3 R1-A |
| Implementation code volume so far: `src/cli/index.ts` placeholder + tests/smoke.test.ts only | Stage 0 baseline |

This SPEC pins:
- Whether Result is adopted (yes)
- The exact type + combinator surface
- The throw vs Result boundary policy
- Migration approach (none needed — empty codebase)
- Special cases that stay throw

---

## Adoption Decision [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Confirm CLAUDE.md L327's deferred Result adoption. Lock the
> direction so Stage 6 implementation starts Result-first.

### Decision

**Adopt `Result<T, E>` as the canonical error-handling pattern at module
boundaries.** CLAUDE.md L327's "Stage 5에서 검토" closes here as YES.

### Why now

- **Marginal cost is zero**: implementation code is currently a placeholder
  CLI entry + smoke test. There is no legacy throw-based code to migrate.
- **Marginal benefit is high**: Stage 6 starts with vertical slices that
  span alignment + ralph orchestrators + LLM runner + Aquinas disputatio
  pipeline. These compose deeply (output of one stage is input to the
  next, with each stage having recoverable error modes). Without Result,
  every composition needs try/catch at each call site.
- **Alignment-loop math reinforces**: the 0.9^10 thesis applies to error
  drift too. Implicit error handling (try/catch missed at one site) is
  the same compounding problem as alignment drift. Result makes error
  paths explicit and unmissable in TypeScript's type system.

### What "adoption" means here

- A `src/result/index.ts` module exists with the type + combinators.
- Stage 6 implementation files use `Result<T, E>` as return type for
  module-boundary functions (per R3-A policy).
- TypeScript strict mode catches "forgot to handle the err branch"
  via discriminated union exhaustiveness.
- CLI top-level `unwrap()` is the only place where Result becomes throw,
  catching naturally at `process.on("uncaughtException")` per Stage 4-A.6.

### What "adoption" does NOT mean

- It does NOT mean every function returns Result (see R3-A — internal
  helpers stay throw).
- It does NOT mean external libraries (Zod, child_process, etc.) get
  wrapped at every site (see R3-A — wrap at boundary).
- It does NOT mean introducing a Result library dependency (see R2-A).
- It does NOT mean retroactive changes to the philosophical concept docs
  or runbooks (those declare TS interfaces that Stage 6 implements; the
  return shape can be either `Promise<T>` or `Promise<Result<T, E>>`
  per R3-A).

R1-B (no adoption — throw-only) rejected: explicit error flow is one of
the cheapest disciplines available; the "small codebase doesn't need it"
argument flips the moment Stage 6 vertical slices start composing
multi-step orchestrators.
R1-C (partial adoption — Result for validation only, throw elsewhere)
rejected: boundary becomes ambiguous; reviewer has to remember "this
area is Result, that area is throw"; consistency lost.

---

## Implementation: Custom Inline, No Library [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: ~50 LOC custom Result module. Zero new dependencies.

### Decision

`src/result/index.ts` is a **custom inline implementation**. No
`neverthrow` / `ts-results` / `oxide.ts` dependency.

### Why custom

- **ADR-0001 minimalism**: every dep needs justification. `neverthrow`
  ships ~10KB and a much wider API surface than we use.
- **Surface control**: we ship only the combinators we actually use.
  Smaller surface = simpler Stage 6 implementation reviews.
- **Interop**: custom type with our `AgoraErrorThrown` default error type
  means no naming/structural collisions with library types.
- **Stable**: zero version-pinning concerns; the API we wrote is the API
  we have.

### Cost

~50 LOC of well-tested code. The combinator surface is small and
universally understood (any TS dev who's used Rust/Scala/Effect-TS
patterns recognizes ok/err/map/flatMap/unwrap immediately).

R2-B (`neverthrow`) rejected: dep + larger surface than needed; ADR-0001
violation without concrete benefit.
R2-C (`ts-results` / `oxide.ts` / `effect`) rejected: same reasoning;
some are heavier still (Effect is a whole ecosystem).

---

## Default Pattern: Module Boundary Result, Internal Throw [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Hybrid — module-exported functions return Result, internal
> helpers may throw. Pure validation (Zod) throws natively, lifted at
> caller. CLI top-level unwraps for final emit.

### The pattern

| Layer | Pattern | Example |
|-------|---------|---------|
| Module-exported functions | `Result<T, E>` return | `loadConfig(opts) → Result<Config, AgoraErrorThrown>` |
| Async module-exported functions | `Promise<Result<T, E>>` | `runner.call(opts) → Promise<Result<ClaudeResponse, AgoraErrorThrown>>` |
| Internal helpers within a module | throw OK | `mergeLayers(...)` throws `AgoraErrorThrown` if invariant broken |
| External lib calls (Zod, child_process) | throw native | Caller wraps with `tryFrom()` at module boundary |
| CLI top-level (cli/index.ts) | `unwrap()` for final emit | `const result = await dispatch(); const value = unwrap(result);` |
| Test fixtures | throw OK | Test setup that requires "this MUST work" can throw |

### Why this hybrid

- **Pragmatic**: Zod's `parse()` throws — wrapping every parse with `tryFrom`
  inside a module is fine; making Zod itself return Result requires a
  wrapper layer for every Zod call. Hybrid puts the wrapper at module
  boundary only.
- **Composable at the right layer**: the place where errors compound is
  multi-module orchestration (alignment → seed → handoff → ralph). Module
  boundaries return Result so orchestrators can flatMap cleanly.
- **No internal Result fatigue**: a 10-line internal helper that calls
  three `.parse()` calls doesn't need to be a 30-line Result-flattening
  exercise. Throw-and-catch at the module export is enough.

### Worked example

```typescript
// src/config/loader.ts (module export)
import { tryFrom, type Result } from "@/result";
import { ConfigSchema } from "./schema";
import { buildAgoraError } from "@/errors/build";

export function loadConfig(opts: LoadOptions): Result<Config, AgoraErrorThrown> {
  return tryFrom(() => loadAndMerge(opts));   // wraps internal throws
}

// internal helper — throws freely
function loadAndMerge(opts: LoadOptions): Config {
  const layers = readAllLayers(opts);          // throws on FS errors
  const merged = mergeLayers(...layers);       // throws on invariant break
  return ConfigSchema.parse(merged);            // Zod throws on validation
}
```

```typescript
// src/cli/commands/doctor.ts (orchestrator at LAYER 3)
import { loadConfig } from "@/config/loader";
import { runProbes } from "@/probes/runner";
import { flatMap, ok } from "@/result";

export async function runDoctor(opts: DoctorOpts) {
  const cfg = loadConfig(opts);
  return flatMap(cfg, async (c) => {
    const probes = await runProbes(c.probes);
    return ok({ config: c, probes });
  });
}
```

```typescript
// src/cli/index.ts (top-level entry)
import { unwrap } from "@/result";
import { dispatch } from "./dispatch";
import { emit } from "./render";

async function main() {
  const result = await dispatch(process.argv);
  const value = unwrap(result);   // throws AgoraErrorThrown if err
  emit(value);
  process.exit(value.exit_code);
}

main().catch(handleUncaught);     // existing Stage 4-A.6 handler
```

R3-B (Result everywhere) rejected: every Zod parse, every internal helper
becomes `Result` — boilerplate explosion for trivial paths; wrapping
external libraries (Zod, child_process, fs) per call eats LOC budget.
R3-C (Throw everywhere) rejected: equivalent to R1-B (no adoption); the
whole point of Result is making error flow explicit at composition points.

---

## Migration Policy [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: No migration phase needed. Stage 6 starts Result-first.

### Decision

**Stage 6 implementation files write Result-first from the first commit.**

Stage 0-5 deliverables are SPECs + sketches; the only actual TypeScript
code is `src/cli/index.ts` (a 10-line placeholder) and `tests/smoke.test.ts`.
There is no migration burden.

The sketches in Stage 4-5 SPECs that show throw signatures (e.g. Stage 4-A.6
`buildAgoraError` throws, Stage 5-A.5 `localized()` throws, Stage 5-A.4
`renderPrompt` throws) are **deliberately preserved as throw** — see R5-A.

The sketches that show TypeScript interfaces with `Promise<T>` return
types (e.g. Stage 4-A.4 `Probe.check(): Promise<ProbeResult>`,
Stage 4-A.2 `ClaudeRunner.call(): Promise<ClaudeResponse>`) are
**reinterpreted at Stage 6 implementation as `Promise<Result<T, AgoraErrorThrown>>`**
when the function is a module export. The interface as written is the
"happy path success type"; Result wraps it.

### Stage 6 file convention

When implementing a Stage-2/3/4/5 SPEC, the implementation file:

1. Reads the SPEC interface as the "success branch" type.
2. Wraps in Result for module-exported functions per R3-A.
3. Adds `tryFrom()` at calls into Zod / child_process / fs.
4. Documents at the file head: `// SPEC: docs/<area>/<file>.md` for traceability.

### What about back-compat?

There is none to maintain. Stage 6 is the first runtime code beyond the
placeholder. Result-first from day one.

R4-B (big-bang migration phase) rejected: there's nothing to migrate.
R4-C (lazy migration — both throw + Result coexist) rejected: equivalent
to R1-B; defeats the consistency benefit of adoption.

---

## Special-case Throw Retention [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Identify the small set of functions that explicitly stay
> throw-based after Result adoption, with rationale per case.

### Functions that STAY throw (canonical exceptions)

#### 1. `localized(key, ctx?) → string` (Stage 5-A.5)

```typescript
// src/i18n/index.ts
export function localized(key: string, ctx?: Record<string, string>): string {
  // throws on missing key
}
```

Why throw, not Result:
- Called inline in template literal-like positions: `summary: localized("cli.doctor.banner_title")`.
- Wrapping every call with `unwrap(localized(...))` defeats the inline ergonomic.
- Missing-key is an internal bug (CI prevents it via `pnpm lint:locale`); when it fires at runtime, the existing top-level uncaught handler catches it and writes a crash report (Stage 4-A.6 R3-A).

#### 2. `buildAgoraError(code, opts) → AgoraErrorThrown` (Stage 4-A.6)

```typescript
// src/errors/build.ts
export function buildAgoraError(
  code: ErrorCode,
  opts?: { context?: Record<string, unknown>; cause?: unknown },
): AgoraErrorThrown {
  // returns the error object; does NOT throw it
}
```

This is a **constructor**, not a function that can fail. It always
succeeds in producing an `AgoraErrorThrown` object (the caller may then
choose to `throw` it or wrap it in `err()`). Result has nothing to wrap
here.

#### 3. `unwrap(result) → T` (this SPEC)

```typescript
// src/result/index.ts
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
```

By definition, `unwrap` converts Result back to throw. It exists for the
CLI top-level boundary and for places where the caller *truly* knows the
err branch is impossible (rare; comment required).

#### 4. Zod `parse()` and other external library calls

`ConfigSchema.parse(data)` throws `ZodError`. We do NOT wrap Zod itself
with a Result-returning shim. Internal callers throw freely; module
boundaries wrap with `tryFrom()`.

#### 5. `interpolate()` (Stage 5-A.5 + 5-A.4)

Both `i18n/interpolation.ts` and `prompts/interpolation.ts` throw on
declared/undeclared placeholder mismatch. Same reasoning as `localized()`:
called inline; missing placeholder is a programming bug caught immediately;
wrapping with Result adds boilerplate without semantic gain.

#### 6. Internal helpers within any module

Per R3-A, internal helpers may throw. The module's exported wrapper does
the `tryFrom()` lift. Examples:
- `mergeLayers(...)` inside `config/loader.ts`
- `parseRunbookSection4(...)` inside the prompt-library generator script
- `buildContext(probe)` inside `probes/runner.ts`

These are not user-facing surface; Result discipline at the export layer
suffices.

### Functions that ALWAYS return Result

| Function | Module |
|----------|--------|
| `loadConfig(opts)` | `src/config/loader.ts` |
| `runner.call(opts)` (`ClaudeRunner` interface method) | `src/llm/runner.ts` |
| `executeProbes(probes, opts)` | `src/probes/runner.ts` |
| `renderPrompt(key, ctx)` | `src/prompts/index.ts` ← **changes from throw** |
| `runAlignmentRound(input)` | `src/alignment/orchestrator.ts` (Stage 6) |
| `runRalphIteration(input)` | `src/ralph/orchestrator.ts` (Stage 6) |
| `dihairesisDecompose(seed)` | `src/handlers/dihairesis.ts` (Stage 6) |
| Any LAYER 2 orchestrator export | All `src/{alignment,ralph,handoff,mcp}/*.ts` exports |
| Most LAYER 1 module exports | `src/{config,state,llm,probes,critics,philosophers}/*.ts` exports |

### Reconciling with Stage 5-A.4 R5-A note

Stage 5-A.4 R5-A noted that `renderPrompt` currently throws and "if
Stage 5-A.6 adopts Result, signature changes in one place". This SPEC's
adoption (R1-A) triggers that change. `renderPrompt` becomes:

```typescript
// src/prompts/index.ts (Stage 6 implementation)
export function renderPrompt<K extends PromptKey>(
  key: K,
  context: Record<string, string>,
): Result<{ system: string; user: string }, AgoraErrorThrown> {
  return tryFrom(() => {
    const entry = getPrompt(key);
    return {
      system: interpolate(entry.system_prompt, context, entry.placeholders),
      user:   interpolate(entry.user_prompt_template, context, entry.placeholders),
    };
  });
}
```

`interpolate` (internal helper) keeps throwing; `renderPrompt` (module
export) returns Result. Per R3-A.

### Reconciling with Stage 5-A.5 closing note

Stage 5-A.5 closed with: "if adopted, `localized()` return signature
converts to Result<string, AgoraError> in one place." This SPEC's R5-A
**reverses** that direction — `localized()` stays throw because of the
inline-call ergonomic argument. The Stage 5-A.5 closing note is
**superseded** by this R5-A decision.

R5-B (Result everywhere — `localized()` returns Result) rejected: every
inline string interpolation site needs `unwrap()` or pattern match;
boilerplate explosion; ergonomic regression.
R5-C (case-by-case Throw vs Result decision per function) rejected:
inconsistency cost outweighs flexibility.

---

## Canonical Types + Combinators [SPEC] (Accepted 2026-05-03)

> **Goal**: Pin the exact `src/result/index.ts` contract.

```typescript
// src/result/index.ts
import type { AgoraErrorThrown } from "@/errors/types";

// ─── Type ───
export type Result<T, E = AgoraErrorThrown> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

// ─── Constructors ───
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Combinators ───

/** Apply fn to the success value; pass error through unchanged. */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Apply fn (returning Result) to the success value; flatten. */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Apply async fn (returning Promise<Result>) to the success value. */
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> {
  return result.ok ? await fn(result.value) : result;
}

/** Apply fn to the error; pass success through. */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Convert Result to throw on error; return value on success. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

/** Provide a default for the error case. */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

// ─── Lift from throwing functions ───

/** Run a sync function; wrap its throw in err() (for AgoraErrorThrown). */
export function tryFrom<T>(fn: () => T): Result<T, AgoraErrorThrown> {
  try {
    return ok(fn());
  } catch (e) {
    if (isAgoraError(e)) return err(e);
    throw e;   // unexpected non-AgoraError → bubble (caught by uncaughtException)
  }
}

/** Async version of tryFrom. */
export async function tryFromAsync<T>(
  fn: () => Promise<T>,
): Promise<Result<T, AgoraErrorThrown>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (isAgoraError(e)) return err(e);
    throw e;
  }
}

/** Type guard — uses instance check via duck-typing on AgoraError shape. */
function isAgoraError(e: unknown): e is AgoraErrorThrown {
  return (
    e instanceof Error &&
    typeof (e as AgoraErrorThrown).code === "string" &&
    typeof (e as AgoraErrorThrown).category === "string"
  );
}
```

### Surface size

8 exported functions + 1 type alias + 1 internal type guard. Stage 6
implementation can extend with `combineAll(results[])`, `partition(results)`
etc. only when actual usage demands.

### What's NOT included at v1

- `match` / `fold` — TypeScript discriminated union narrowing makes
  `if (result.ok) { ... } else { ... }` ergonomic enough; explicit
  match function adds mental model overhead.
- `andThen` / `orElse` — flatMap covers it; renaming is just style.
- Pipeable / curried versions — inflicts a style on call sites.
- `Result.all()` / `Result.collect()` — add when first concrete need surfaces.

### Test contract

```
tests/unit/result/index.test.ts:
  - ok().ok === true; ok().value preserved
  - err().ok === false; err().error preserved
  - map preserves err; transforms value on ok
  - flatMap chains success; short-circuits on err
  - flatMapAsync awaits + chains
  - mapErr transforms err; passes ok through
  - unwrap throws on err; returns value on ok
  - unwrapOr returns value on ok; default on err
  - tryFrom catches AgoraErrorThrown → err()
  - tryFrom re-throws non-AgoraError (e.g. plain Error)
  - tryFromAsync handles both branches
  - isAgoraError true positives + true negatives
```

---

## Boundaries

- ❌ No adoption (R1-B rejected): explicit error flow is cheap discipline; Stage 6 multi-module orchestrators benefit immediately.
- ❌ Partial adoption (R1-C rejected): boundary ambiguity outweighs flexibility.
- ❌ `neverthrow` library (R2-B rejected): ADR-0001 minimalism without justification; ~10KB + larger surface.
- ❌ `ts-results` / `effect` (R2-C rejected): same reasoning; some heavier still.
- ❌ Result everywhere (R3-B rejected): boilerplate explosion at trivial paths.
- ❌ Throw everywhere (R3-C rejected): equivalent to R1-B.
- ❌ Big-bang migration (R4-B rejected): nothing to migrate (empty codebase).
- ❌ Lazy / never-finish migration (R4-C rejected): defeats consistency benefit.
- ❌ `localized()` returns Result (R5-B rejected): inline-call ergonomic regression.
- ❌ Case-by-case throw vs Result (R5-C rejected): inconsistency cost.
- ❌ `Result` library API surface beyond what's specified here without ADR.
- ❌ Module exports that mix throw + Result for similar operations (e.g. `loadConfig` returns Result but `loadConfigSync` throws).
- ❌ `unwrap()` outside CLI top-level entry or test fixtures (use pattern match instead).
- ❌ Wrapping every external library call with Result (Zod, child_process, fs); wrap at module boundary only.
- ❌ `Promise<T> | Promise<Result<T, E>>` union return types — pick one consistently.
- ❌ Result containing nested Result (`Result<Result<T, E>, E>`) — flatten with `flatMap`.

## Failure modes specifically guarded

- **Forgotten error handling**: TypeScript discriminated union exhaustiveness catches `if (result.ok) {...}` without an else branch (when result is then dereferenced).
- **Mixed throw + Result fatigue**: R3-A pins the boundary; convention is enforceable in code review.
- **Result fatigue at trivial paths**: internal helpers stay throw — Result wraps only at module exports.
- **`unwrap()` proliferation**: documented to live only at CLI top-level; reviewer flags `unwrap()` calls in non-top-level files.
- **External library exception leakage**: `tryFrom()` at module boundary catches AgoraErrorThrown; non-AgoraError bubbles to top-level uncaught handler (Stage 4-A.6).
- **Custom Result library divergence over time**: ADR required to extend the surface; canonical types live in this SPEC.
- **`localized()` Result conversion** (Stage 5-A.5 closing note): explicitly reversed by R5-A; documented for traceability.

## Output consumed by

- **Stage 6 implementation** (every module): `src/result/` provides the Result type + combinators; module exports return Result; CLI top-level unwraps.
- **Stage 5-A.4 prompt library**: `renderPrompt` signature converts to Result per R5-A reconciliation (in one place).
- **Stage 5-A.5 i18n**: `localized()` STAYS throw per R5-A reconciliation (reverses Stage 5-A.5 closing note).
- **Stage 4-A.6 ERROR_CATALOG**: `AgoraErrorThrown` is the default error type for `Result<T, E = AgoraErrorThrown>`.
- **CLAUDE.md L327**: updated to mark Result as decided (was "검토 (Stage 5)"); now points here.
- **Tests**: `tests/unit/result/index.test.ts` covers the 12-test contract above.

---

## CLAUDE.md update

CLAUDE.md L327 (data patterns section) is updated in this commit:

```diff
- - Result 패턴은 `Result<T, E>` 헬퍼 도입 검토 (Stage 5)
+ - Result<T, E>는 Stage 5-A.6에서 도입 결정됨 — `src/result/`. 모듈
+   boundary는 Result return, 내부 helper는 throw 자유. 자세한 정책:
+   `docs/architecture/result-type.md`.
```

---

## Module-graph note

`src/result/` was already declared LAYER 0 in Stage 5-A.1 module-graph
("Result<T, E> helper (CLAUDE.md L327; decided 5-A.6)"). The "decided
5-A.6" marker resolves with this SPEC. No tree-section update needed
beyond clarifying the contents:

```
src/result/
└── index.ts     # Result<T, E> type + combinators (ok, err, map, flatMap,
                  flatMapAsync, mapErr, unwrap, unwrapOr, tryFrom, tryFromAsync)
```

That clarification can fold into a future module-graph rev or stay as-is
(the module-graph already mentions the file).

---

## Stage 5 status after this SPEC

This is the **6th and final** Stage 5 sub-question. With R1-A through R5-A
accepted, all Stage 5 deliverables are in place:

| # | Topic | Path |
|---|-------|------|
| 5-A.1 | Module / file-tree organization | `docs/architecture/module-graph.md` |
| 5-A.2 | Per-philosopher runbook template | `docs/architecture/runbook-template.md` |
| 5-A.3 | 5 philosopher runbooks (batch + Rev 2 fixes) | `docs/philosophers/runbooks/{husserl,socrates,aristotle,plato,aquinas}.md` |
| 5-A.4 | Prompt library structure | `docs/architecture/prompt-library.md` |
| 5-A.5 | Locale catalog content rules | `docs/architecture/locale-catalog.md` |
| 5-A.6 | `Result<T, E>` adoption | `docs/architecture/result-type.md` (this file) |

Stage 5 close requires (per ADR-0004):
1. All named deliverables exist + committed ✓
2. Sang explicit approval — pending close declaration
3. No ADR left in Proposed state — none introduced in Stage 5 ✓

Awaiting Sang's "Stage 5 close 선언" → then create `docs/stage-5/CLOSED.md`,
tag `v0.5.0-stage-5`, open Stage 6 NOTES.md (first vertical slice).
