# Error Handling + Telemetry — Specification (Stage 4)

> **Status**: Stage 4-A in progress (opened 2026-05-03 after Stage 3 close).
> Sections marked **[SPEC]** are formally accepted Stage 4 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 4
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **`AgoraError` Type + Catalog** (4-A.6 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Error → Exit Code Mapping** (4-A.6 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Crash Reporting** (4-A.6 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Telemetry: None at v1** (4-A.6 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Locale-aware Error Format** (4-A.6 R5) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope vs Inherited Decisions

This document is the **cross-cutting** layer for Stage 4. It does not
re-decide subsystem-specific failures (those are owned by their respective
SPECs); it provides the unified vocabulary, exit-code mapping, and crash/
telemetry policy that all subsystems plug into.

| Inherited from | What it owns |
|----------------|--------------|
| Stage 3-A.1 | 7-tier exit code semantics + `errors[]` JSON shape |
| Stage 3-A.1 R5-A | en + ko locale catalog (F1 enforcement) |
| Stage 4-A.2 | `ClaudeError` discriminated union (6 cases) |
| Stage 4-A.3 | Zod validation throws → exit 20 with file/line/path |
| Stage 4-A.4 | `ProbeResult.detail` prefixes (`internal_error:`, `timed out`) |
| Stage 4-A.5 | MCP `errors[]` as canonical failure surface (no exit per call) |
| MANIFESTO P6 | Local-first, no cloud SaaS — strong default for telemetry |
| ADR-0001 | Dependency minimalism — no Sentry/Datadog deps |
| ADR-0007 | Private repo, sole user is Sang — `.agora/history/` is enough audit |

---

## `AgoraError` Type + Catalog [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Single source of truth for every recoverable + unrecoverable
> error Agora can produce. Type-safe codes, locale-aware messages,
> structured fix instructions.

### Type definition

```typescript
// src/errors/types.ts

export type ErrorCategory =
  | "config"      // .agora/config.toml issues, --config path bad, etc.
  | "probe"       // Gate 0 probe internal failure
  | "llm"         // ClaudeRunner failures (auth, rate_limit, timeout, ...)
  | "gate"        // Ralph gate failure (1, 2, 3, 4, 5)
  | "user"        // user input rejected (forbidden flag combo, etc.)
  | "state"       // .agora/state.json corrupt or unreadable
  | "io"          // filesystem / network outside the above
  | "internal";   // bug — should never reach end user without crash report

export interface AgoraError {
  code: ErrorCode;           // typed string from ERROR_CATALOG
  category: ErrorCategory;
  message: string;           // locale-resolved human message
  message_key: string;       // locale catalog key (en.json / ko.json)
  fix?: string;              // actionable instruction (locale-resolved)
  fix_key?: string;          // locale catalog key for fix
  cause?: unknown;           // underlying Error / ZodError / spawn result / etc.
  context?: Record<string, unknown>;  // structured detail (file, line, probe_id, ...)
}

export class AgoraErrorThrown extends Error implements AgoraError {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly message_key: string;
  readonly fix?: string;
  readonly fix_key?: string;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(fields: AgoraError) {
    super(fields.message);
    this.name = "AgoraError";
    this.code = fields.code;
    this.category = fields.category;
    this.message_key = fields.message_key;
    this.fix = fields.fix;
    this.fix_key = fields.fix_key;
    this.cause = fields.cause;
    this.context = fields.context;
  }
}
```

### Catalog (single source of truth)

```typescript
// src/errors/codes.ts

// Each entry pins category, exit_code, and locale catalog keys.
// New errors require a catalog entry — TS strict + ErrorCode literal type
// makes any non-cataloged code a compile error.
export const ERROR_CATALOG = {
  // ─── config category — all → exit 20 (Stage 3-A.1) ───
  "config.missing-version":          { category: "config", exit_code: 20, message_key: "errors.config.missing_version",          fix_key: "errors.config.missing_version.fix" },
  "config.version-mismatch":         { category: "config", exit_code: 20, message_key: "errors.config.version_mismatch",         fix_key: "errors.config.version_mismatch.fix" },
  "config.unknown-key":              { category: "config", exit_code: 20, message_key: "errors.config.unknown_key" },
  "config.threshold-inversion":      { category: "config", exit_code: 20, message_key: "errors.config.threshold_inversion" },
  "config.disabled-forced-overlap":  { category: "config", exit_code: 20, message_key: "errors.config.disabled_forced_overlap" },
  "config.invalid-toml":             { category: "config", exit_code: 20, message_key: "errors.config.invalid_toml" },
  "config.path-not-found":           { category: "config", exit_code: 20, message_key: "errors.config.path_not_found" },

  // ─── llm category — bubble per Stage 4-A.2 ClaudeError union ───
  "llm.auth-failed":          { category: "llm", exit_code: 1, message_key: "errors.llm.auth_failed",          fix_key: "errors.llm.auth_failed.fix" },
  "llm.rate-limited":         { category: "llm", exit_code: 1, message_key: "errors.llm.rate_limited" },
  "llm.timeout":              { category: "llm", exit_code: 1, message_key: "errors.llm.timeout" },
  "llm.invalid-response":     { category: "llm", exit_code: 1, message_key: "errors.llm.invalid_response" },
  "llm.no-runner-available":  { category: "llm", exit_code: 1, message_key: "errors.llm.no_runner_available", fix_key: "errors.llm.no_runner_available.fix" },
  "llm.internal-error":       { category: "llm", exit_code: 1, message_key: "errors.llm.internal_error" },

  // ─── probe category — Gate 0 specifically maps to exit 4 (gate fail) ───
  "probe.timeout":          { category: "probe", exit_code: 4, message_key: "errors.probe.timeout" },
  "probe.internal-error":   { category: "probe", exit_code: 4, message_key: "errors.probe.internal_error" },
  "probe.unknown-id":       { category: "probe", exit_code: 5, message_key: "errors.probe.unknown_id" },

  // ─── gate category — Ralph gate failures → exit 4 ───
  "gate.gate-1-deterministic-fail":  { category: "gate", exit_code: 4, message_key: "errors.gate.gate_1_fail" },
  "gate.gate-2-functional-fail":     { category: "gate", exit_code: 4, message_key: "errors.gate.gate_2_fail" },
  "gate.gate-3-uiux-fail":           { category: "gate", exit_code: 4, message_key: "errors.gate.gate_3_fail" },
  "gate.gate-4-tech-fail":           { category: "gate", exit_code: 4, message_key: "errors.gate.gate_4_fail" },
  "gate.gate-5-alignment-fail":      { category: "gate", exit_code: 4, message_key: "errors.gate.gate_5_fail" },

  // ─── user category → exit 2 (user-initiated) or 5 (misuse) ───
  "user.forbidden-flag-combo":       { category: "user", exit_code: 5, message_key: "errors.user.forbidden_flag_combo" },
  "user.confirmation-required":      { category: "user", exit_code: 2, message_key: "errors.user.confirmation_required" },
  "user.aborted":                    { category: "user", exit_code: 2, message_key: "errors.user.aborted" },

  // ─── state category → exit 20 (per Stage 3-A.1 bucketing) ───
  "state.corrupt":                   { category: "state", exit_code: 20, message_key: "errors.state.corrupt" },
  "state.unreadable":                { category: "state", exit_code: 20, message_key: "errors.state.unreadable" },

  // ─── io category → exit 1 (general) ───
  "io.permission-denied":            { category: "io", exit_code: 1, message_key: "errors.io.permission_denied" },
  "io.disk-full":                    { category: "io", exit_code: 1, message_key: "errors.io.disk_full" },

  // ─── internal category → exit 1 + crash report ───
  "internal.uncaught":               { category: "internal", exit_code: 1, message_key: "errors.internal.uncaught" },
  "internal.invariant-violation":    { category: "internal", exit_code: 1, message_key: "errors.internal.invariant_violation" },
} as const satisfies Record<string, {
  category: ErrorCategory;
  exit_code: 0 | 1 | 2 | 4 | 5 | 20;
  message_key: string;
  fix_key?: string;
}>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
```

### Constructor pattern

```typescript
// src/errors/build.ts
import { ERROR_CATALOG, type ErrorCode } from "./codes.ts";
import { localized } from "../i18n/index.ts";   // Stage 6 locale lookup

export function buildAgoraError(
  code: ErrorCode,
  opts?: { context?: Record<string, unknown>; cause?: unknown },
): AgoraErrorThrown {
  const entry = ERROR_CATALOG[code];
  return new AgoraErrorThrown({
    code,
    category: entry.category,
    message: localized(entry.message_key, opts?.context),
    message_key: entry.message_key,
    fix: entry.fix_key ? localized(entry.fix_key, opts?.context) : undefined,
    fix_key: entry.fix_key,
    cause: opts?.cause,
    context: opts?.context,
  });
}
```

Throw site:

```typescript
throw buildAgoraError("config.threshold-inversion", {
  context: { section: "gate_5", values: { ok: 0.30, warn: 0.15 } },
  cause: zodError,
});
```

R1-B (per-subsystem catalogs without central registry) rejected:
cross-subsystem audit becomes manual; exit_code drift inevitable.
R1-C (free-form string codes) rejected: typo trap; loses TypeScript's
type system as a guard.

---

## Error → Exit Code Mapping [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Each error code has its own exit_code in the catalog above.
> Same category may differ per error (e.g. probe.timeout → 4 vs
> probe.unknown-id → 5).

### Distribution by exit code

```
exit  0  success                          (no error)
exit  1  general / llm / io / internal    (recoverable but command failed)
exit  2  user-initiated abort             (Ctrl+C, "n" at confirmation)
exit  4  gate failure (Ralph or Gate 0)   (fix the env/code, retry)
exit  5  misuse                           (forbidden flag, unknown probe id)
exit 20  config / state corruption        (bad TOML, bad state.json)
```

Stage 3-A.1 R3-A "highest numeric code wins" rule applies when multiple
errors fire (env > config > gate > user > general > success).

### CLI top-level handler

```typescript
// src/cli/index.ts (entry point sketch)

process.on("uncaughtException", (err) => handleUncaught(err));
process.on("unhandledRejection", (err) => handleUncaught(err));

async function main() {
  try {
    const result = await runCommand(process.argv);
    emit(result);                             // TUI render or JSON write per Stage 3-A.1
    process.exit(result.exit_code);
  } catch (e) {
    if (e instanceof AgoraErrorThrown) {
      emitAgoraError(e);                      // TUI or JSON shape
      writeCrashReportIfInternal(e);
      process.exit(ERROR_CATALOG[e.code].exit_code);
    }
    handleUncaught(e);                        // turns into internal.uncaught
  }
}

function handleUncaught(err: unknown) {
  const wrapped = buildAgoraError("internal.uncaught", { cause: err });
  emitAgoraError(wrapped);
  writeCrashReport(wrapped);
  process.exit(1);
}
```

`emitAgoraError` honors Stage 3-A.1 mode dispatch:
- TUI mode → colored stderr summary + fix line
- JSON mode → `errors[]` array entry with full fields
- MCP mode → CallToolResult with `isError: true` + `errors[]` (Stage 4-A.5)

R2-B (per-category fixed mapping) rejected: forces same exit code for
genuinely different error severities (probe.unknown-id is misuse not gate
fail).
R2-C (computed at throw site) rejected: drift across throw sites; canonical
mapping must live in one place.

---

## Crash Reporting [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Capture enough state to reproduce and fix internal bugs,
> without phoning home.

### Local-only crash reports

```
~/.agora/crashes/<ISO_timestamp>-<short_hash>.json
```

Format:

```json
{
  "version": 1,
  "agora_version": "0.4.0-stage-4",
  "timestamp": "2026-05-03T15:30:00Z",
  "code": "internal.uncaught",
  "category": "internal",
  "message": "Cannot read property 'foo' of undefined",
  "stack": "Error: ...\n  at ...",
  "context": {
    "command": "agora ralph",
    "phase": "in_ralph",
    "node_version": "v22.10.1",
    "platform": "darwin",
    "arch": "arm64",
    "locale": "ko"
  },
  "redacted_env_vars": [
    "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "OPENAI_API_KEY",
    "CLERK_SECRET_KEY", "POSTHOG_PROJECT_KEY"
  ]
}
```

### Trigger conditions

Crash report written when:
- `category === "internal"` (uncaught exceptions, invariant violations)
- Any `code` not in ERROR_CATALOG escapes (defensive: should never happen
  given TS literal type, but runtime guard)

NOT written for:
- All other categories (recoverable errors are not crashes)
- Repeat write within 1 second (basic dedup against thrash loops)

### Secret redaction

Auto-redact env vars matching:
- Exact match: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`,
  `CLERK_SECRET_KEY`, `POSTHOG_PROJECT_KEY`, `POSTHOG_API_KEY`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`
- Pattern match: `*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`,
  `*_PRIVATE_KEY`

Redaction means: env var **name** is recorded in `redacted_env_vars[]`,
but its **value** is never written to disk.

### Inspecting a crash

```bash
$ agora doctor --explain-crash ~/.agora/crashes/2026-05-03T15:30:00Z-a1b2c3.json
```

Subflag on existing `agora doctor` (not a new command — 7-cmd cap).
Pretty-prints the JSON with categorized sections + suggests
github.com/lazydevz-inc/agora/issues link with prefilled context.

### No phone-home

Crash reports never leave the user's machine. The user can manually attach
them to bug reports if they choose. This matches MANIFESTO P6 verbatim.

R3-B (Sentry / external crash reporter, opt-in) rejected: adds runtime
dependency (CLAUDE.md L223 TBD list expansion needs justification),
introduces cloud touch point inconsistent with MANIFESTO P6, and even
opt-in default surfaces a question Sang doesn't want to answer at v1.
R3-C (stderr only, no persistent log) rejected: hard-to-reproduce bugs
become impossible to debug; user has no artifact to share.

---

## Telemetry: None at v1 [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Make the explicit decision that v1 ships zero telemetry.

### Decision

**No telemetry at v1.** No phone-home. No anonymized usage stats. No
build-time analytics deps. `~/.agora/telemetry/` directory does NOT exist.

### Justification

- **MANIFESTO P6**: "Not a cloud SaaS. Local-first. User data stays on
  the user's machine."
- **ADR-0007**: Repo is private; Sang is the sole user during Stage 1-5+.
  Telemetry to whom? `tail -f .agora/history/<session>/events.jsonl` is
  the canonical "what happened" surface and it's already richer than any
  analytics SDK would capture.
- **ADR-0001 minimalism**: Telemetry SDKs (PostHog, Mixpanel, etc.) add
  100KB+ of runtime weight for zero v1 benefit.
- **Trust posture**: A spec-first tool that secretly phones home would
  be tonally inconsistent with the entire MANIFESTO.

### What IS captured locally (NOT telemetry)

These already exist per other SPECs and serve **the user**, not Agora-the-
project:

| File | Owner | Purpose |
|------|-------|---------|
| `.agora/history/{session}/events.jsonl` | Stage 2-C.3 | append-only audit of alignment + ralph events |
| `.agora/cache/llm_responses.json` | Stage 4-A.2 | LLM response memoization |
| `.agora/cache/gate0_results.json` | Stage 2-B.1 + 4-A.4 | probe result memoization |
| `.agora/cache/drift_scores.json` | Stage 2-B.4 | drift score memoization |
| `~/.agora/crashes/<ts>.json` | this SPEC R3-A | crash artifacts (local-only) |

All file-backed, all local, all user-inspectable, none transmitted.

### Re-evaluation trigger

Telemetry is re-evaluated **only if** ADR-0007's public-release trigger
fires AND a concrete metric question emerges that local data cannot answer.
Until then, this SPEC stands.

### What this SPEC explicitly forbids at v1

- ❌ Importing PostHog SDK (`posthog-node`, `posthog-js`, `@posthog/*`) into
  Agora's runtime code
- ❌ Importing Sentry / Mixpanel / Amplitude / Datadog SDKs
- ❌ Background HTTP requests on `agora <any command>` execution
- ❌ Optional phone-home behind `--telemetry on` flag (R4-B rejected:
  the option itself is the noise)
- ❌ Writing `~/.agora/telemetry/` directory in any code path

R4-B (local-only opt-in event log, off by default) rejected: solves a
problem (Sang's own analysis) that `events.jsonl` already solves; adds
code surface for negligible v1 ROI; the `--telemetry on` flag itself
becomes a pattern that future-Sang might extend toward remote.
R4-C (remote opt-in PostHog etc.) rejected: direct MANIFESTO P6 violation;
v1 absolute no.

---

## Locale-aware Error Format [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Every error message and fix instruction lives in the locale
> catalog (en.json + ko.json per Stage 3-A.1 R5-A). No string literals at
> throw sites.

### Locale catalog structure

```json
// messages/en.json (Stage 6 implementation populates this)
{
  "errors": {
    "config": {
      "missing_version": "Config file at {file} has no `version` field. v1 requires `version = 1`.",
      "missing_version.fix": "Add `version = 1` at the top of {file}.",
      "version_mismatch": "Config schema version mismatch in {file}: found {found}, expected {expected}.",
      "version_mismatch.fix": "Run `agora doctor --explain-config` to see migration steps, or read https://github.com/lazydevz-inc/agora/blob/main/docs/infra/config.md#migrations",
      "unknown_key": "Unknown config key `{path}` in {file} (line {line}).",
      "threshold_inversion": "Section {section} thresholds must satisfy ok < warn < fail. Saw {values}.",
      "...": "..."
    },
    "llm": { "...": "..." },
    "probe": { "...": "..." },
    "gate": { "...": "..." },
    "user": { "...": "..." },
    "state": { "...": "..." },
    "io": { "...": "..." },
    "internal": {
      "uncaught": "Internal error: {message}. This is a bug in Agora.",
      "uncaught.fix": "Crash report written to {crash_file}. Please file at github.com/lazydevz-inc/agora/issues with the file attached."
    }
  }
}
```

```json
// messages/ko.json (parallel structure)
{
  "errors": {
    "config": {
      "missing_version": "{file} 설정 파일에 `version` 필드가 없습니다. v1은 `version = 1`이 필요합니다.",
      "missing_version.fix": "{file} 상단에 `version = 1`을 추가하세요.",
      "...": "..."
    },
    "...": "..."
  }
}
```

### Lookup function (Stage 6 implementation contract)

```typescript
// src/i18n/index.ts
export function localized(key: string, ctx?: Record<string, unknown>): string {
  const locale = currentLocale();   // resolved per Stage 3-A.1: --locale > AGORA_LOCALE > LANG > "en"
  const catalog = loadCatalog(locale);
  const template = lookup(catalog, key) ?? lookup(loadCatalog("en"), key);
  if (!template) throw buildAgoraError("internal.invariant-violation", {
    context: { kind: "missing_locale_key", key, locale },
  });
  return interpolate(template, ctx ?? {});
}
```

### F1 enforcement (no Korean typos in en, no English fallback in ko)

Stage 1's F1 forbidden pattern: "비영어 출력에 locale 검증 없음 (한글 타이포)".
This SPEC enforces:

- Both `en.json` and `ko.json` MUST contain every key in `ERROR_CATALOG`
  that has a `message_key` or `fix_key` field.
- CI test (Stage 6 implementation): assert
  `Object.keys(en) === Object.keys(ko)` (deep) — fails build on missing key.
- en is the fallback ONLY when `currentLocale() === "en"`. Korean users
  see Korean or a clear `internal.invariant-violation` (not a silent en
  fallback that violates F1).

### Per-mode rendering

| Mode | Output | Source |
|------|--------|--------|
| TUI  | colored stderr: `<icon> <message>\n  Fix: <fix>` | `picocolors` per Stage 3-A.1 |
| JSON | `errors[]` array entry: `{ code, category, message, fix?, context? }` | Stage 3-A.1 envelope |
| MCP  | CallToolResult: `isError: true` + `structuredContent.errors[]` | Stage 4-A.5 |

In all modes, `cause` is omitted from external output (it can leak stack
traces / object identities). It's preserved in the in-process AgoraError
for crash reports + logging only.

R5-B (per-category Error subclass, plain message string) rejected: no
locale support; F1 violation; loses structured `fix` instruction.
R5-C (free string `throw new Error("...")`) rejected: AI agents can't
follow structured `code` for retry logic; F1 violation; no fix discipline.

---

## Boundaries

- ❌ Per-subsystem error catalogs (R1-B rejected): cross-subsystem audit fails.
- ❌ Free-form string codes (R1-C rejected): typo trap.
- ❌ Per-category fixed exit_code (R2-B rejected): forces wrong code on misuse.
- ❌ Throw-site exit code computation (R2-C rejected): drift inevitable.
- ❌ External crash reporter (R3-B rejected): MANIFESTO P6 + dep + cloud.
- ❌ stderr-only crash (R3-C rejected): hard bugs become irreproducible.
- ❌ Local opt-in telemetry log (R4-B rejected): events.jsonl already solves.
- ❌ Remote telemetry (R4-C rejected): direct MANIFESTO P6 violation.
- ❌ Plain Error subclass per category (R5-B rejected): F1 + no fix discipline.
- ❌ Free string throws (R5-C rejected): AI agents can't follow.
- ❌ String literals at throw sites: must use locale catalog keys.
- ❌ `cause` field in external output: leaks stack traces.
- ❌ English fallback for ko locale: F1 violation.
- ❌ Importing analytics SDK runtime: explicit forbid for v1.

## Failure modes specifically guarded

- **Silent crash with no artifact**: `internal.*` always writes crash file.
- **Secret leak in crash report**: env var name only; value redacted by
  pattern + exact-match list.
- **Locale typo / missing key**: CI test asserts en/ko keysets identical;
  runtime fall-through throws `internal.invariant-violation`.
- **Drift between throw sites and catalog**: TS literal type forces
  ERROR_CATALOG entry before code can be used.
- **Phone-home accidentally introduced**: explicit forbid list +
  dependency review on every PR (Stage 5 contributor rule, see
  ADR-0007 trigger).
- **Crash thrash loop writes 1000 files/sec**: 1-second dedup window per
  unique (code, message, stack-hash) tuple.
- **Same error fires multiple exit codes across subsystems**: catalog is
  the single source of truth — exit code is queried, not decided.

## Output consumed by

- **Every Stage 4 SPEC's failure case**: config / probe / llm / mcp errors
  all build through `buildAgoraError(code, opts)`.
- **Stage 3-A.1 universal JSON envelope**: `errors[]` shape derives from
  `AgoraError` field projection.
- **Stage 3-B.1 `agora doctor`**: `--explain-crash <file>` subflag renders
  saved crash artifacts.
- **Stage 4-A.5 MCP `CallToolResult`**: `isError + errors[]` reuses same
  serialization.
- **Stage 5 locale catalog content**: en.json / ko.json populated with
  every catalog key; CI test enforces parity.
- **Stage 6 implementation**: `src/errors/`, `src/i18n/`, top-level
  `process.on("uncaughtException")` handler.

---

## Closing note on Stage 4-A.6

This is a **policy doc**, not an implementation doc. It pins the vocabulary,
mapping rules, and forbidden behaviors. Stage 6 fills `src/errors/`,
`src/i18n/`, and the top-level CLI handler against this SPEC.

The "no telemetry at v1" decision is a strong commitment that constrains
future PRs — any reintroduction requires an ADR superseding this section
plus an ADR-0007 public-release trigger event.
