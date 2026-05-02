# LLM Integration — Specification (Stage 4)

> **Status**: Stage 4-A in progress (opened 2026-05-03 after Stage 3 close).
> Sections marked **[SPEC]** are formally accepted Stage 4 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 4
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Claude Runner — API Contract** (4-A.2 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Runtime Selection** (4-A.2 inherited from ADR-0005) | **[SPEC]** Accepted 2026-05-03 |
| **Subprocess Invocation** (4-A.2) | **[SPEC]** Accepted 2026-05-03 |
| **Retry Policy** (4-A.2 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Default Timeout** (4-A.2 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Cache Layer** (4-A.2 R4) | **[SPEC]** Accepted 2026-05-03 |
| **SDK Fallback Notification** (4-A.2 R5) | **[SPEC]** Accepted 2026-05-03 |
| MCP Server Design (4-A.5) | [OPEN] |

---

## Claude Runner — API Contract [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Single TypeScript interface that every Agora subsystem uses to
> reach Claude. All retry, cache, and runtime-selection logic lives behind
> this interface.

### Interface

```typescript
interface ClaudeRunner {
  call(opts: ClaudeCallOptions): Promise<ClaudeResponse>;
}

interface ClaudeCallOptions {
  prompt: string;
  system?: string;             // optional system prompt
  format?: "json" | "text";    // default "text"
  cache_key?: string;          // when set, response is cacheable
  cache_ttl_seconds?: number;  // default 0 (no cache)
  timeout_ms?: number;         // default 60_000 (1 min, per R3-A)
  retries?: number;            // default 2 (3 total attempts, per R2-A)
  max_tokens?: number;         // default 4096
}

interface ClaudeResponse {
  ok: boolean;
  content?: string | object;   // string for text, object for json
  error?: ClaudeError;
  attempts: number;
  total_duration_ms: number;
  source: "subprocess" | "sdk" | "cache";
}

type ClaudeError =
  | { code: "auth_failed"; detail: string; fix_command?: string }
  | { code: "rate_limited"; detail: string; retry_after_ms?: number }
  | { code: "timeout"; detail: string }
  | { code: "invalid_response"; detail: string; raw_response?: string }
  | { code: "no_runner_available"; detail: string }
  | { code: "internal_error"; detail: string };
```

Single `call(opts)` method. All control via the options object. Source field
on response indicates which path served the call (useful for debugging and
the cache-hit telemetry).

R1-B (separate methods per format) rejected: caller-side complexity for no
gain; format is a single field on opts.
R1-C (raw subprocess wrapper) rejected: each caller would re-implement retry
and cache, leading to drift.

### Polymorphism

```typescript
class ClaudeCliRunner implements ClaudeRunner { ... }   // subprocess path
class ClaudeSdkRunner implements ClaudeRunner { ... }   // SDK fallback
class CachedRunner implements ClaudeRunner {
  constructor(inner: ClaudeRunner, cache: LLMCache) { ... }
  // wraps another runner with cache lookup before delegating
}
```

Composition: `runner = new CachedRunner(new ClaudeCliRunner(), cache)`.
Default Agora wiring uses cached subprocess; SDK fallback substitutes the
inner runner only.

---

## Runtime Selection [SPEC] (Accepted 2026-05-03, inherited from ADR-0005)

> **Goal**: Decide between subprocess and SDK at process start. Auto-detect
> with graceful warning on fallback.

### Selection algorithm

```
on_init():
  // Try subprocess path first
  claude_present = which("claude") !== null
  if claude_present:
    test_result = await run_subprocess_check("claude --print 'ping' --output-format json")
    if test_result.ok:
      return new ClaudeCliRunner()

  // Fallback to SDK
  api_key = process.env.ANTHROPIC_API_KEY
  if api_key && api_key.startsWith("sk-ant-"):
    notify_sdk_fallback_once()       // R5-A
    return new ClaudeSdkRunner(api_key)

  // No path available — fail-closed
  throw new Error("no_runner_available: " +
    "Install Claude Code (https://claude.com/claude-code) " +
    "OR set ANTHROPIC_API_KEY")
```

Selection runs **once per process** (cached for the duration). Re-init
requires process restart (no in-process re-detection — keeps state simple).

### `claude --print` test

```bash
claude --print "ping" --output-format json
```

This is the canonical liveness check (matches Stage 2-B.1's `claude` probe).
Cached at session start; not re-run per call.

If the test command times out (5s), runtime selection falls through to SDK.
This handles network-degraded Claude Code states.

---

## Subprocess Invocation [SPEC] (Accepted 2026-05-03)

> **Goal**: Define the exact subprocess invocation pattern for ClaudeCliRunner.

### Command shape

```bash
claude --print \
       --output-format <text|json> \
       --max-tokens <N> \
       (--system "<system prompt>" if provided) \
       (prompt via stdin)
```

### Stdin vs argv for prompt

- Prompts > 1024 chars OR containing newlines: **stdin**
  ```
  echo "<prompt>" | claude --print --output-format json
  ```
- Short single-line prompts: **argv**
  ```
  claude --print --output-format json "ping"
  ```

Stdin is the default safe path (no shell-escape concerns, no length limits).
Argv used only for cleanly-bounded short prompts.

### Output parsing

For `--output-format json`:
```json
{
  "type": "result",
  "subtype": "success",
  "result": "<content>",
  "session_id": "...",
  "input_tokens": ...,
  "output_tokens": ...
}
```

`ClaudeCliRunner.call()` extracts `result` field as `content`.

For `--output-format text`: stdout = response content directly.

If `format=json` (the caller wants structured output), the runner additionally
parses the `result` content as JSON. Parse failure → `invalid_response` error.

### Exit code mapping

| Exit code | ClaudeError code |
|-----------|------------------|
| 0 + valid JSON | (success) |
| 0 + invalid JSON when format=json | invalid_response |
| 1 + auth-related stderr pattern | auth_failed |
| 1 + rate-limit stderr pattern | rate_limited (retry_after_ms parsed if present) |
| Any non-zero | internal_error (fallback) |
| Process killed by timeout | timeout |

---

## Retry Policy [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Tolerate transient failures without flooding API or Max plan
> with retry storms.

### Default retry schedule

```
attempt 1: immediate
attempt 2: wait 1000 ms
attempt 3: wait 4000 ms

Total: 3 attempts (initial + 2 retries)
```

`opts.retries` overrides retry count (0 = no retry).

### Rate-limit special case

When error code is `rate_limited`:

```
attempt 1: immediate
on rate_limited:
  if response includes retry_after_ms: wait that long
  else: wait 10_000 ms
attempt 2: same logic, but increase to wait 30_000 ms on second rate-limit
```

Rate-limit is treated separately because the API tells us when to retry.

### Transient error classification

| Error code | Retry? |
|------------|--------|
| `timeout` | yes |
| `rate_limited` | yes (with API-suggested or longer backoff) |
| `invalid_response` | yes (format=json case only) |
| Network errors (`ECONNRESET`, `ENOTFOUND`) | yes |
| `auth_failed` | NO — bubble immediately |
| `no_runner_available` | NO — bubble immediately |
| `internal_error` (unknown) | NO — bubble immediately |

R2-B (1 retry only) rejected: too aggressive; common transient hiccups
(network blip, rate-limit) deserve more than one attempt.
R2-C (5 retries with long backoff) rejected: cumulative wait time blocks UX.
R2-D (no retry, caller responsibility) rejected: every caller would reimplement
the same logic, introducing drift.

---

## Default Timeout [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Bound LLM call duration so a stuck call doesn't freeze Agora.

### Default

```
timeout_ms = 60_000   // 60 seconds (1 minute)
```

`opts.timeout_ms` overrides. Subsystems with known long-prompt patterns may
explicitly raise (e.g. `agora seed --regen-tests` may set 120_000).

### Rationale

- Most Sonnet 4 calls complete in 5-30 seconds
- 60s covers comfortable overhead for long contexts
- > 60s usually indicates a true stall, not legitimate work
- Subprocess timeout via `child_process` SIGTERM after `timeout_ms`

R3-B (30s default) rejected: cuts off legitimate long-context calls.
R3-C (120s default) rejected: too tolerant of stalls; UI feels frozen.

### Subprocess timeout enforcement

```typescript
const child = spawn("claude", args);
const timer = setTimeout(() => {
  child.kill("SIGTERM");
  // After 5s grace, escalate to SIGKILL if still alive
  setTimeout(() => child.kill("SIGKILL"), 5000);
}, opts.timeout_ms);

child.on("exit", () => clearTimeout(timer));
```

SIGTERM → 5s grace → SIGKILL is the standard graceful-then-forceful pattern.

---

## Cache Layer [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Avoid re-running deterministic LLM calls (drift_score, probes, etc.)
> within their TTL window.

### Storage location

```
.agora/cache/llm_responses.json    ← per-project cache (default)
~/.agora/cache/llm_responses.json  ← global cache (for non-project calls)
```

Per-project is default (R4-A). The runner determines location based on
caller context: if invoked within a project (cwd has `.agora/`), use project
cache; else use global.

### Cache file format

```json
{
  "version": 1,
  "entries": {
    "<cache_key>": {
      "cached_at": "2026-05-03T07:43:00Z",
      "ttl_seconds": 3600,
      "response": {
        "ok": true,
        "content": "...",
        "source": "subprocess",
        "attempts": 1,
        "total_duration_ms": 850
      }
    }
  }
}
```

When read:
- If `cached_at + ttl_seconds < now` → entry expired, ignore (treated as miss)
- Else → return the cached response with `source: "cache"` substituted

### Cache key conventions

Caller is responsible for constructing a stable cache_key. Convention:

```
"<subsystem>:<input_fingerprint>"

Examples:
  "drift_score:sha256(diff + seed.fingerprint)"
  "probe:claude:v1"
  "atomicity:sha256(ac.content)"
```

Stable means: same input → same key. Time, session_id, etc. should NOT
appear in cache_key (defeats the cache).

### Cache invalidation

Cache invalidation entry points:
- TTL expiry (passive)
- `agora doctor --refresh` (busts gate0_results.json — Stage 2-B.1)
- Explicit `LLMCache.invalidate(key)` from caller
- Agora version upgrade (cache file's `version` field bumped → ignore old format)

R4-B (always global) rejected: cross-project pollution; one project's
mistake affects others.
R4-C (always per-project) rejected: universal calls (e.g. version check)
have no project context; would force ad-hoc workarounds.

### Cache size management

```
Default soft limit: 100 entries per cache file
On reaching: evict oldest 20% (LRU)
```

Documented but not aggressive — TTL expiry handles most growth naturally.

---

## SDK Fallback Notification [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: When falling back to SDK (API billing), inform user once per
> session without spamming.

### Behavior

```
on_runtime_selection():
  if selected == ClaudeSdkRunner:
    if not session.sdk_warning_shown:
      print_to_stderr("""
        ⚠ Using Claude Agent SDK fallback (API billing).
          claude CLI not detected or unauthenticated.
          To use Max subscription instead:
            1. Install Claude Code: https://claude.com/claude-code
            2. Run `claude login`
            3. Re-run agora.
      """)
      session.sdk_warning_shown = true
```

The `session.sdk_warning_shown` flag is a process-level boolean. Per-process
deduplication; new `agora` invocations re-display the warning.

R5-B (warn every call) rejected: noisy; session-level dedup is the right
balance of "obvious initially, quiet after acknowledged."
R5-C (silent) rejected: user must know they're being billed when they
expected free Max usage.

### JSON mode

In `--json` output mode, the SDK fallback notice does NOT go to stderr.
Instead, the first command's output `warnings[]` array contains:

```json
{
  "code": "sdk_fallback_active",
  "message": "Using Claude Agent SDK (API billing). Install claude CLI for Max plan usage.",
  "fix": "Install Claude Code (https://claude.com/claude-code) and run `claude login`."
}
```

This warning appears on every JSON command output for the session (not
deduplicated, because each JSON command output is independent and AI agents
should always see the billing context).

---

## Boundaries

- ❌ Single-method API (R1-B/C rejected): consistency wins.
- ❌ Hardcoded retry without classification (R2-D rejected): every caller drift.
- ❌ Single timeout for all calls (R3-A is default, opts override per-call).
- ❌ Cross-project cache pollution (R4-B rejected): isolation principle.
- ❌ Global-only cache (R4-B): same.
- ❌ Per-project for global calls (R4-C rejected): nonsensical for non-project work.
- ❌ Silent SDK fallback (R5-C rejected): billing hidden = surprise bill.
- ❌ Per-call SDK warning (R5-B rejected): spam.
- ❌ Re-runtime-detection mid-process: process restart required.

## Failure modes specifically guarded

- **Silent billing surprise**: SDK fallback explicitly notified once per session
  (stderr) + every JSON command (warnings[]).
- **Retry storm**: 3 attempts max, exponential backoff, non-transient errors bubble.
- **Stuck UI**: 60s timeout default with SIGTERM/SIGKILL escalation.
- **Cache cross-pollution**: per-project default; global only for explicitly non-project calls.
- **Auth state confusion**: runtime selected once per process; re-detect requires restart (clear semantics).
- **Cached stale auth**: probe cache TTL is 5min (Stage 2-B.1); LLM cache uses caller-specified TTL.

## Output consumed by

- **Every Stage 2 SPEC's LLM call**: drift_score (2-B.4), probes (2-B.1),
  Disputatio (2-B.3), atomicity (2-C.1), defense scoring (2-C.1), etc. —
  all use `ClaudeRunner.call(opts)`.
- **Stage 6 implementation**: ClaudeCliRunner / ClaudeSdkRunner / CachedRunner
  classes with this exact interface.
- **`agora --version --json`**: `claude_cli_present` field reflects runtime
  selection result.
- **`agora doctor`**: claude probe shares the runtime selection logic.

---

## Next sections (still OPEN in this document)

- **MCP Server Design** (Stage 4-A.5) — when running inside Claude Code,
  Agora exposes MCP tools instead of calling Claude itself
