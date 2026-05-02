# Probe Registry — Implementation Specification (Stage 4)

> **Status**: Stage 4-A in progress (opened 2026-05-03 after Stage 3 close).
> Sections marked **[SPEC]** are formally accepted Stage 4 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 4
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Probe Interface** (4-A.4 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Module Layout** (4-A.4 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Execution Model** (4-A.4 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Detection Helpers** (4-A.4 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Failure + Cache Policy** (4-A.4 R5) | **[SPEC]** Accepted 2026-05-03 |
| **v1 Probe Inventory (TypeScript skeletons)** (4-A.4) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope vs Inherited Decisions

This document specifies the **implementation contract** for the probe
registry. The following are inherited and not reopened here:

| Decision | Source |
|----------|--------|
| 19 v1 probe inventory + IDs + check commands + fix instructions | Stage 2-B.1 |
| Two-axis model (`detect_shape` × `tier`) | Stage 2-B.1 |
| Active set computation (`bundled → active → enabled`) | Stage 2-B.1 |
| 5-minute TTL cache + `gate0_results.json` schema | Stage 2-B.1 R3-A |
| `[probes].disabled[]` / `[probes].forced[]` config (mutually disjoint) | Stage 4-A.3 + Stage 2-B.1 R5-A |
| Probe cache TTL is contract, NOT a config knob | Stage 4-A.3 |
| Per-probe 5s hard timeout | ADR-0006 |
| Probes are read-only (never mutate user env) | ADR-0006 |
| Material cause auto-population from Phase 0 markers | ADR-0006 + Stage 2-A.2 |
| `agora doctor` reuses Gate 0 execution with different output formatting | Stage 2-B.1 + Stage 3-B.1 |
| `claude` probe shares command with ClaudeRunner liveness check | Stage 4-A.2 |
| TypeScript strict / Node 22+ / dependency minimalism | ADR-0001 |

---

## Probe Interface [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: A single TypeScript interface every probe implements. Runner
> owns timeout, sandboxing, and error normalization. Probes own only
> "is this dep relevant" and "is it healthy."

### Types

```typescript
// src/probes/types.ts

export type ProbeTier = 1 | 2 | 3;

export type DetectShape =
  | { kind: "always" }                                                // universal
  | { kind: "marker"; detect: (ctx: ProbeContext) => Promise<boolean> }; // project-specific

export interface ProbeResult {
  ok: boolean;
  detail: string;          // human-readable status (e.g. "Max plan, 240ms latency")
  fix?: string;            // actionable fix instruction (only when !ok)
  duration_ms: number;     // measured wall-clock for the check
}

export interface Probe {
  readonly id: string;             // canonical, kebab-case ("claude", "gh", "anthropic_api_key")
  readonly tier: ProbeTier;
  readonly description: string;    // one-line for `agora doctor`
  readonly detect_shape: DetectShape;
  check(ctx: ProbeContext): Promise<ProbeResult>;
}

export interface ProbeContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;

  // Probes call shellExec via context — never spawn children directly.
  // Centralizes timeout + sandboxing + test mocking.
  shellExec(
    cmd: string,
    args: readonly string[],
    opts?: { stdin?: string }
  ): Promise<{ exit_code: number; stdout: string; stderr: string }>;
}

// Special signal: runner enforces timeout, not the probe.
export class ProbeTimeoutError extends Error {
  constructor(
    public readonly probe_id: string,
    public readonly timeout_ms: number,
  ) {
    super(`Probe '${probe_id}' exceeded ${timeout_ms}ms timeout`);
    this.name = "ProbeTimeoutError";
  }
}
```

### Why discriminated union for `detect_shape`

```typescript
{ kind: "always" }
{ kind: "marker"; detect: (ctx) => Promise<boolean> }
```

Compile-time narrowing. The runner can `if (probe.detect_shape.kind === "always")`
and TypeScript knows there's no `detect` function to call. Prevents the
"forgot to handle the universal case" class of bugs.

### Why ProbeContext injection

- `shellExec` injection means tests substitute a mock executor (no real
  `gh auth status` calls in unit tests).
- `cwd` and `env` are not module-globals — easier to test with synthetic
  project layouts.
- Adding context fields later (e.g. logger, telemetry) does not break
  existing probe signatures.

R1-B (class-based + decorator) rejected: TS decorators are still Stage 3
language proposal; experimental flag overhead; auto-discovery is solving a
problem we don't have (19 probes is small enough to maintain explicitly).

R1-C (pure functions + side metadata map) rejected: detect/check/metadata
get separated across two files per probe; harder to navigate, easier to
forget metadata when adding new probe.

---

## Module Layout [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: One file per probe under `src/probes/definitions/<id>.ts`,
> static-imported into a single registry array.

### Tree

```
src/probes/
├── types.ts                        # interface + ProbeResult + DetectShape + ProbeContext
├── runner.ts                       # executeProbes() — bounded concurrency + timeout
├── registry.ts                     # ALL_PROBES: readonly Probe[]  (static array)
├── cache.ts                        # gate0_results.json read/write + 5-min TTL
├── markers.ts                      # shared detect helpers (memoized per process+cwd)
└── definitions/
    ├── claude.ts                   # always   Tier 1
    ├── node.ts                     # always   Tier 1
    ├── pnpm.ts                     # always   Tier 1
    ├── git.ts                      # marker   Tier 1
    ├── gh.ts                       # marker   Tier 1
    ├── vercel.ts                   # marker   Tier 1
    ├── supabase.ts                 # marker   Tier 1
    ├── anthropic-api-key.ts        # marker   Tier 1
    ├── stripe.ts                   # marker   Tier 1+2
    ├── clerk.ts                    # marker   Tier 1+2
    ├── openai-api-key.ts           # marker   Tier 1+2
    ├── docker.ts                   # marker   Tier 1+2
    ├── railway.ts                  # marker   Tier 1+2
    ├── posthog-key.ts              # marker   Tier 1+2
    ├── gcloud.ts                   # marker   Tier 3-partial
    ├── aws.ts                      # marker   Tier 3-partial
    ├── bun.ts                      # marker   Tier 3-partial
    ├── upstash.ts                  # marker   Tier 3-partial
    └── cloudflare.ts               # marker   Tier 3-partial    (19 files total)
```

### Registration

```typescript
// src/probes/registry.ts
import { claudeProbe } from "./definitions/claude.ts";
import { nodeProbe } from "./definitions/node.ts";
import { pnpmProbe } from "./definitions/pnpm.ts";
import { gitProbe } from "./definitions/git.ts";
import { ghProbe } from "./definitions/gh.ts";
import { vercelProbe } from "./definitions/vercel.ts";
import { supabaseProbe } from "./definitions/supabase.ts";
import { anthropicApiKeyProbe } from "./definitions/anthropic-api-key.ts";
import { stripeProbe } from "./definitions/stripe.ts";
import { clerkProbe } from "./definitions/clerk.ts";
import { openaiApiKeyProbe } from "./definitions/openai-api-key.ts";
import { dockerProbe } from "./definitions/docker.ts";
import { railwayProbe } from "./definitions/railway.ts";
import { posthogKeyProbe } from "./definitions/posthog-key.ts";
import { gcloudProbe } from "./definitions/gcloud.ts";
import { awsProbe } from "./definitions/aws.ts";
import { bunProbe } from "./definitions/bun.ts";
import { upstashProbe } from "./definitions/upstash.ts";
import { cloudflareProbe } from "./definitions/cloudflare.ts";

export const ALL_PROBES: readonly Probe[] = [
  claudeProbe, nodeProbe, pnpmProbe,
  gitProbe, ghProbe, vercelProbe, supabaseProbe, anthropicApiKeyProbe,
  stripeProbe, clerkProbe, openaiApiKeyProbe,
  dockerProbe, railwayProbe, posthogKeyProbe,
  gcloudProbe, awsProbe, bunProbe, upstashProbe, cloudflareProbe,
];
```

Tree-shakable. Adding a probe = 1 file under `definitions/` + 1 import + 1
array entry. No dynamic discovery (no plugin model at v1; community
contribution path is PR per ADR-0006 + Stage 2-B.1).

### File naming

- File: `kebab-case.ts` matches CLAUDE.md naming convention
- Exported probe: `<id>Probe` (camelCase) — e.g. `anthropicApiKeyProbe` for
  `id = "anthropic_api_key"`
- The `id` field uses snake_case (matches Stage 2-B.1's YAML-style inventory
  and TOML config keys)

R2-B (tier directories `definitions/tier1/`, etc.) rejected: probes are
already promoted across tiers (Stage 2-B.1 promoted Tier 3 → Tier 1+2
mid-spec); file moves on every promotion add diff noise without buying
anything. Tier is a metadata field, not a layout axis.

R2-C (single 800-line `registry.ts` with all 19 inline) rejected: navigation
hostile, diff-noise on every probe edit, conflict-prone in branches.

---

## Execution Model [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Run all enabled probes with bounded concurrency, per-probe
> timeout enforced by the runner, and crash-proof result collection.

### Algorithm

```typescript
// src/probes/runner.ts
const PER_PROBE_TIMEOUT_MS = 5_000;        // ADR-0006 hard contract
const PROBE_CONCURRENCY = 5;               // R3-A bound

export interface ExecuteOptions {
  cache: ProbeCache;
  ctxBuilder: (probe: Probe) => ProbeContext;
  forceRefresh?: boolean;                  // agora doctor --refresh
}

export async function executeProbes(
  probes: readonly Probe[],
  opts: ExecuteOptions,
): Promise<ProbeResult[]> {
  const limit = createLimit(PROBE_CONCURRENCY);   // inline ~30 LOC, no dep
  return Promise.all(probes.map(p => limit(() => runOne(p, opts))));
}

async function runOne(probe: Probe, opts: ExecuteOptions): Promise<ProbeResult> {
  // 1. Cache check (unless --refresh)
  if (!opts.forceRefresh) {
    const cached = opts.cache.get(probe.id);
    if (cached && opts.cache.age_seconds(probe.id) < 300) {
      return cached;
    }
  }

  // 2. Race check() against timeout
  const start = performance.now();
  let result: ProbeResult;
  try {
    result = await Promise.race([
      probe.check(opts.ctxBuilder(probe)),
      timeoutAfter(PER_PROBE_TIMEOUT_MS, probe.id),    // throws ProbeTimeoutError
    ]);
  } catch (e) {
    const duration_ms = performance.now() - start;
    if (e instanceof ProbeTimeoutError) {
      // Transient — do NOT cache (R5-A)
      return {
        ok: false,
        detail: `timed out after ${PER_PROBE_TIMEOUT_MS}ms`,
        fix: "Probe hung — check network or run `agora doctor --refresh`",
        duration_ms,
      };
    }
    // Unexpected exception — gate stays alive, do NOT cache
    return {
      ok: false,
      detail: `internal_error: ${e instanceof Error ? e.message : String(e)}`,
      fix: "Probe code bug — please report at github.com/lazydevz-inc/agora/issues",
      duration_ms,
    };
  }

  // 3. Cache deterministic results (success AND non-timeout failure)
  opts.cache.set(probe.id, result);
  return result;
}
```

### Concurrency bound rationale

- 19 probes ÷ 5 parallel ≈ 4 batches. Each batch ≤ 5s timeout → worst-case
  Gate 0 wall time ~20s; typical ~3-5s (most probes return in <500ms).
- Full parallel (R3-B) bursts 19 child_process spawns at once — observed
  rate-limit triggers on `gh` and `vercel` CLIs, plus desktop CPU spike.
- Sequential (R3-C) gives 19 × ~1s typical = ~19s baseline even on healthy
  systems; UX friction Sang flagged as red flag in Stage 1.

### Timeout enforcement

- Owned by runner via `Promise.race`, not by probe code.
- `shellExec` provided through `ProbeContext` also accepts a soft timeout
  (e.g. `gh auth status` fast path); but the runner's hard `Promise.race`
  is the real safety net — even infinite-loop probe code will lose the race.
- After timeout, the lingering subprocess (if any) is killed via the same
  SIGTERM → 5s grace → SIGKILL pattern as Stage 4-A.2.

### Inline `createLimit` (no new dep)

ADR-0001 mandates dependency minimalism. We do not add `p-limit`. Instead,
`createLimit` is ~30 LOC inline:

```typescript
function createLimit(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      active < n ? run() : queue.push(run);
    });
}
```

Tested behavior: at most `n` concurrent in-flight; FIFO queueing; backpressure-correct.

R3-B (full parallel) rejected: rate-limit risk + CPU spike, no measurable
benefit beyond ~5x parallel.
R3-C (sequential) rejected: ~19s baseline; violates "biased product, snappy
UX" principle from Stage 1.

---

## Detection Helpers [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Probe `detect_shape: marker` functions need fast, memoized
> access to common project signals (file existence, package.json deps, git
> remote URL). Avoid 19 probes each re-reading `package.json`.

### `markers.ts` API

```typescript
// src/probes/markers.ts
export interface MarkerHelpers {
  fileExists(relativePath: string): Promise<boolean>;        // fs.access
  packageJsonDeps(): Promise<Set<string>>;                   // parsed once per cwd
  gitRemoteUrl(): Promise<string | null>;                    // git config remote.origin.url
  envVarPresent(name: string): boolean;                      // process.env[name] non-empty
  envVarMatches(name: string, regex: RegExp): boolean;       // present + regex test
}

export function buildMarkerHelpers(ctx: ProbeContext): MarkerHelpers;
```

### Memoization model

- Per-process, per-cwd. A `Map<string, unknown>` keyed by `${cwd}::${operation}`.
- File reads (`package.json`) cached for the process lifetime — Gate 0
  runs once per `agora` invocation, so this is single-snapshot semantics.
- Git remote: 1 child_process per cwd, then cached.
- Each helper returns the same Promise on subsequent calls (deduplication).

### IO allowed (R4-A)

| Helper | What it does | Cost |
|--------|--------------|------|
| `fileExists` | `fs.access(path, F_OK)` | <1ms |
| `packageJsonDeps` | Read+parse `package.json` once → return `Set` of dep names (deps + devDeps + peerDeps) | ~5ms once |
| `gitRemoteUrl` | `git config --get remote.origin.url` once | ~30ms once |
| `envVarPresent` / `envVarMatches` | `process.env[name]` | ~0ms |

### IO NOT allowed in `detect_shape: marker`

- Network calls — would inflate Gate 0 wall time + add fail modes
- Recursive directory traversal — handled at Phase 0 auto-scan, not per-probe
- Modification of any file or env (read-only contract from ADR-0006)

If a probe needs richer detection (e.g. parse `wrangler.toml` to find a
project name), do that work inside `check()` after `detect()` returns true.
Detection must remain **cheap** and **idempotent**.

### Example: vercel probe detection

```typescript
// src/probes/definitions/vercel.ts
import { buildMarkerHelpers } from "../markers.ts";

export const vercelProbe: Probe = {
  id: "vercel",
  tier: 1,
  description: "Vercel CLI authenticated and project linked",
  detect_shape: {
    kind: "marker",
    detect: async (ctx) => {
      const m = buildMarkerHelpers(ctx);
      return (await m.fileExists(".vercel/project.json")) ||
             (await m.fileExists("vercel.json"));
    },
  },
  async check(ctx) {
    const start = performance.now();
    const r = await ctx.shellExec("vercel", ["whoami"]);
    const linked = await buildMarkerHelpers(ctx).fileExists(".vercel/project.json");
    const ok = r.exit_code === 0 && linked;
    return {
      ok,
      detail: ok ? `linked (${r.stdout.trim()})` : `not authenticated or not linked`,
      fix: ok ? undefined : "vercel login && vercel link",
      duration_ms: performance.now() - start,
    };
  },
};
```

R4-B (file existence only) rejected: stripe/clerk/openai/upstash/cloudflare
probes need package.json deps detection per Stage 2-B.1 inventory; cutting
this would require re-spec'ing the inventory.
R4-C (arbitrary IO per probe) rejected: makes Gate 0 wall time unpredictable;
defeats the timeout contract; probe authors will reach for `fetch` etc.

---

## Failure + Cache Policy [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Cache deterministic outcomes; never cache transient failures;
> never let a probe crash kill Gate 0.

### Decision matrix

| Outcome | Cache? | User-visible result |
|---------|--------|---------------------|
| `ok: true` | **Yes** (5min TTL) | `✓ <id>  <detail>` |
| `ok: false`, deterministic (auth missing, version old) | **Yes** (5min TTL) | `✗ <id>  <detail>  Fix: <fix>` |
| `ProbeTimeoutError` (5s exceeded) | **No** | `✗ <id>  timed out after 5000ms  Fix: ... --refresh` |
| Unexpected exception in probe code | **No** | `✗ <id>  internal_error: <msg>  Fix: report bug` |

### Why cache deterministic failures

A user with `gh` unauthenticated will fail every time within the next 5min
unless they run `gh auth login`. Re-checking on every `agora ralph`
invocation in that window wastes 5s+ for no signal.

### Why NOT cache timeouts

Timeouts are **transient**. A 5s timeout often means the probe was queued
behind a slow VPN handshake or a momentary CPU spike. Caching that for 5min
would punish the user's recovery (`agora doctor --refresh` is the only
escape). Better: re-attempt next invocation, no `--refresh` needed.

### Why NOT cache exceptions

Exceptions = probe code bugs (or environment so broken `process.env` is
malformed). Caching would multiply the bug's blast radius across 5min of
sessions. Re-attempting may surface "intermittent" via different stack
traces and helps the bug report.

### Crash containment

Every probe `check()` is wrapped in `try/catch` at the runner level. **Gate
0 never aborts mid-flight from a single probe failure** — all 19 results
are collected, then Gate 0 reports passed/failed atomically. This matches
Stage 2-B.1's "Probe code bug → per-probe 5-second timeout caps damage"
guarantee.

### Cache file format (recap from Stage 2-B.1, no change here)

```json
{
  "version": 1,
  "cached_at": "2026-05-03T13:31:00Z",
  "ttl_seconds": 300,
  "results": [
    { "probe_id": "claude", "ok": true, "detail": "Max plan", "duration_ms": 240 },
    { "probe_id": "vercel", "ok": false, "detail": "...", "fix": "...", "duration_ms": 480 }
  ]
}
```

`ProbeCache.set(probe_id, result)` only writes when `result.detail` does not
start with `"timed out"` or `"internal_error:"` (mechanical guard backing
the policy above).

R5-B (cache everything including timeouts/exceptions) rejected: `agora
doctor --refresh` becomes mandatory for any timeout recovery; UX hostile.
R5-C (no cache at all) rejected: violates Stage 2-B.1 R3-A 5-min TTL.

---

## v1 Probe Inventory (TypeScript Skeletons) [SPEC] (Accepted 2026-05-03)

> **Goal**: Each Stage 2-B.1 inventory entry has a corresponding TypeScript
> skeleton ready for Stage 6 implementation. The check command and fix
> instruction are inherited verbatim from Stage 2-B.1.

### Tier 1 — universal (always-true detect)

```typescript
// claude — shares command with Stage 4-A.2 ClaudeRunner liveness check
export const claudeProbe: Probe = {
  id: "claude", tier: 1,
  description: "Claude CLI installed and authenticated (or ANTHROPIC_API_KEY)",
  detect_shape: { kind: "always" },
  async check(ctx) { /* claude --print --output-format json "ping" */ },
};

// node — version >= 22
export const nodeProbe: Probe = {
  id: "node", tier: 1,
  description: "Node.js >= 22",
  detect_shape: { kind: "always" },
  async check(ctx) { /* node --version, semver compare */ },
};

// pnpm — Agora's own package manager (ADR-0001)
export const pnpmProbe: Probe = {
  id: "pnpm", tier: 1,
  description: "pnpm >= 10",
  detect_shape: { kind: "always" },
  async check(ctx) { /* pnpm --version, semver compare */ },
};
```

### Tier 1 — project-specific (marker detect)

```typescript
// git — .git/ exists
gitProbe: detect_shape.detect → fileExists(".git")
         check → git status --porcelain (exit 0)

// gh — .github/ exists OR git remote contains "github.com"
ghProbe: detect_shape.detect → fileExists(".github") || gitRemoteUrl().includes("github.com")
        check → gh auth status (exit 0 + token present)

// vercel — .vercel/project.json OR vercel.json
vercelProbe: detect_shape.detect → fileExists(".vercel/project.json") || fileExists("vercel.json")
            check → vercel whoami + .vercel/project.json present

// supabase — supabase/config.toml
supabaseProbe: detect_shape.detect → fileExists("supabase/config.toml")
              check → supabase status (or supabase projects list)

// anthropic_api_key — claude probe failed AND ANTHROPIC SDK in package.json
//   NOTE: cross-probe dependency. Resolved by runner ordering: claude probe
//         result is checked from cache when this detect runs. Implementation
//         note for Stage 6: detect signature gets read access to prior results
//         via ProbeContext.priorResult(id) — to be added if still simple, else
//         this probe's detect inspects ANTHROPIC_API_KEY env var as proxy.
anthropicApiKeyProbe: detect_shape.detect → packageJsonDeps().has("@anthropic-ai/sdk")
                                            || packageJsonDeps().has("@anthropic-ai/claude-agent-sdk")
                     check → envVarMatches("ANTHROPIC_API_KEY", /^sk-ant-/)
```

### Tier 1+2 — package-marker probes

```typescript
// stripe — package.json deps include "stripe" OR stripe/ config dir
stripeProbe: detect_shape.detect → packageJsonDeps().has("stripe") || fileExists("stripe/")
            check → stripe config --list (exit 0 + test_mode key present)

// clerk — package.json deps include "@clerk/*"
clerkProbe: detect_shape.detect → [...packageJsonDeps()].some(d => d.startsWith("@clerk/"))
           check → envVarPresent("CLERK_SECRET_KEY")

// openai_api_key
openaiApiKeyProbe: detect_shape.detect → packageJsonDeps().has("openai")
                  check → envVarMatches("OPENAI_API_KEY", /^sk-/)

// docker
dockerProbe: detect_shape.detect → fileExists("Dockerfile") || fileExists("docker-compose.yml") || fileExists("compose.yaml")
            check → docker --version (exit 0)

// railway
railwayProbe: detect_shape.detect → fileExists("railway.json") || fileExists("railway/") || fileExists("~/.railway/")
             check → railway whoami

// posthog_key
posthogKeyProbe: detect_shape.detect → [...packageJsonDeps()].some(d => /^(posthog-|@posthog\/)/.test(d))
                check → envVarPresent("POSTHOG_PROJECT_KEY") || envVarPresent("POSTHOG_API_KEY")
```

### Tier 1+2+3-partial — promoted by Sang's Stage 2-B.1 decision

```typescript
gcloudProbe:    detect → gcloud config dir OR fileExists("cloudbuild.yaml") OR fileExists("app.yaml")
                         OR packageJsonDeps has "@google-cloud/*"
               check  → gcloud auth list --format=json (exit 0 + active account)

awsProbe:      detect → fileExists(".aws/") OR packageJsonDeps has "aws-sdk" or "@aws-sdk/*"
                        OR fileExists("amplify.yml") OR fileExists("samconfig.toml")
               check  → aws sts get-caller-identity (exit 0)

bunProbe:      detect → fileExists("bun.lockb") || fileExists("bun.lock")
               check  → bun --version (exit 0)

upstashProbe:  detect → packageJsonDeps has "@upstash/*"
               check  → envVarPresent for matching pair (UPSTASH_REDIS_REST_URL+TOKEN, QSTASH_TOKEN, etc.)

cloudflareProbe: detect → fileExists("wrangler.toml") || packageJsonDeps has "@cloudflare/*" or "wrangler"
               check  → wrangler whoami (exit 0)
```

### Anthropic API key — cross-probe dependency note

`anthropic_api_key`'s Stage 2-B.1 detect spec reads "claude probe failed
AND ANTHROPIC SDK in package.json." The cross-probe dependency is a Stage 6
implementation concern. Recommended Stage 6 resolution:

```typescript
// Detect runs before runner does check; runner can pass prior probe outcomes
// via ProbeContext extension if still simple. Otherwise:
detect: async (ctx) => {
  const m = buildMarkerHelpers(ctx);
  const deps = await m.packageJsonDeps();
  const hasSdk = deps.has("@anthropic-ai/sdk") || deps.has("@anthropic-ai/claude-agent-sdk");
  // Conservative: if SDK is present, always run check — the env-var check
  // is cheap, no need to gate on prior probe result.
  return hasSdk;
}
```

This avoids cross-probe coupling at the cost of one extra cheap check when
both `claude` and `ANTHROPIC_API_KEY` are healthy.

---

## Boundaries

- ❌ Class-based probes with decorators (R1-B rejected): TS decorator stage 3.
- ❌ Pure function + side metadata map (R1-C rejected): scattered probe definition.
- ❌ Tier-keyed directories (R2-B rejected): tier promotions force file moves.
- ❌ Single 800-line registry file (R2-C rejected): navigation/diff hostile.
- ❌ Full 19-way parallel (R3-B rejected): rate-limit + CPU spike.
- ❌ Sequential execution (R3-C rejected): ~19s baseline kills snappy UX.
- ❌ File-existence-only detection (R4-B rejected): inventory requires deps parse.
- ❌ Arbitrary IO in detect (R4-C rejected): unbounded wall time.
- ❌ Caching timeouts/exceptions (R5-B rejected): blocks recovery.
- ❌ No caching at all (R5-C rejected): violates Stage 2-B.1 R3-A.
- ❌ New runtime dependency (`p-limit` etc.): ADR-0001 minimalism — inline ~30 LOC instead.
- ❌ Probe code spawning child processes directly: must go through `ctx.shellExec`.
- ❌ Probe code mutating files / env: ADR-0006 read-only contract.
- ❌ Plugin discovery / dynamic registration at v1: PR is the contribution path.

## Failure modes specifically guarded

- **Probe code crashes the gate**: runner wraps every `check()` in try/catch
  → result becomes `internal_error`, gate continues with remaining probes.
- **Probe hangs forever**: `Promise.race` against 5s timeout enforced by
  runner regardless of probe author's intent.
- **Subprocess zombie after timeout**: runner kills via SIGTERM → 5s grace →
  SIGKILL (matches Stage 4-A.2 pattern).
- **`package.json` re-read 19 times**: `markers.ts` per-process memoization
  collapses to a single read.
- **Rate-limit on parallel CLI auth checks**: bounded concurrency = 5
  smooths the request rate.
- **Stale auth blocking recovery for 5min**: timeouts and exceptions are
  not cached; only deterministic outcomes are.
- **Cross-probe dependency confusion** (`anthropic_api_key` reads `claude`
  state): resolved at definition time by inspecting cheap proxy
  (package.json deps) rather than coupling to runner-internal state.
- **Probe author forgets timeout / sandboxing**: not their job — runner
  owns it; probes that ignore best practices still cannot escape the
  runner's enforcement.

## Output consumed by

- **Gate 0 in Ralph Loop start sequence** (`docs/loops/ralph-loop.md`):
  blocks Ralph start unless `--skip-gate-0=<list>` per Stage 2-B.7.
- **`agora doctor`** (Stage 3-B.1): same `executeProbes()` call with
  different output formatter; `--refresh` sets `forceRefresh: true`;
  `--include-disabled` surfaces disabled probes as warnings.
- **`.agora/cache/gate0_results.json`**: read/written by `ProbeCache`.
- **Phase 0 auto-scan** (`docs/loops/alignment-loop.md`): shares
  `markers.ts` helpers — single source of truth for "this dep is in this
  project."
- **Stage 4-A.2 `ClaudeRunner` liveness check**: `claude` probe and
  `ClaudeCliRunner` initialization share the same command; both check exit
  code + JSON parse.

---

## Next sections (still OPEN in this document)

This document covers Stage 4-A.4 (Probe Registry Implementation). Other
Stage 4 sub-questions land in adjacent infra docs:

- `docs/infra/llm-integration.md` — Stage 4-A.5 (MCP server design — adds
  to existing 4-A.2 doc)
- (Cross-cutting) — Stage 4-A.6 (error handling + telemetry) — likely
  woven into the above
