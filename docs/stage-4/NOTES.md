# Stage 4 — Infra + LLM Integration + Install

> **Status**: Active (opened 2026-05-03 after Stage 3 close)
> **Goal**: Specify the infrastructure layer — install mechanics, Claude
> integration runtime, MCP server design, probe registry implementation,
> config loading, error handling. Bridges from Stage 2/3 specifications
> down to Stage 6 implementation patterns.
> **Done when**: `docs/infra/install.md`, `docs/infra/llm-integration.md`,
> and `docs/infra/mcp-server.md` are marked Accepted. Probe registry +
> config loading patterns are specified.

---

## Stage 4 sub-questions (estimated 6)

```
4-A.1  Install mechanics                ← curl|bash, npx, pnpm dlx, npm install -g
4-A.2  Claude integration runtime       ← subprocess wrapper, retry, error handling
4-A.3  Config loading                   ← per-project + global per ADR-0002
4-A.4  Probe registry implementation    ← Stage 2-B.1's 19 v1 probes pattern
4-A.5  MCP server design                ← when running inside Claude Code
4-A.6  Error handling + telemetry       ← cross-cutting per 3-A.1 exit codes
```

Order rationale:
- 4-A.1 is the first user touchpoint (install)
- 4-A.2 is the engine for everything Agora does
- 4-A.3 is shared infra used by all (config affects every command)
- 4-A.4 makes Stage 2-B.1's abstract probe interface concrete
- 4-A.5 is parallel feature (separate I/O mode per ADR-0005)
- 4-A.6 is cross-cutting; resolves once others are specified

---

## What this stage settles vs defers

**Settled in Stage 4**:
- Install distribution channels and detection logic
- Claude subprocess wrapper API + retry/timeout policy
- MCP server registration + tool schema
- Probe interface concrete shape + 19 v1 probe stubs
- Config file loading order + merge rules
- Error normalization and telemetry data points

**Deferred to Stage 5 / 6**:
- Module-level file organization (Stage 5)
- Per-philosopher prompt library (Stage 5)
- Actual library bindings (Stage 6: e.g. which subprocess library, which TOML parser)
- Locale catalog content (Stage 6)
- Test suite architecture (Stage 6)

---

## Working principle for Stage 4

Stage 4 is **less algorithmic, more infrastructure**. SPECs here lean toward
"what's the contract, what's the file, what's the dependency" rather than
"what's the user-facing UX." Mostly Mode B (single recommendation + 1-2
alternatives) for technical decisions Sang has delegated.

Some decisions will involve ADR-grade structural choices (e.g. install via
`@lazydevz/agora` npm package vs single-binary distribution). Those will
spawn ADRs as needed (likely 1-2 new ones in Stage 4).

---

## Stage 4 will produce

- `docs/infra/install.md` — Install mechanics SPEC
- `docs/infra/llm-integration.md` — Claude runtime SPEC + MCP server design
- `docs/infra/probes.md` — Probe registry implementation patterns
- `docs/infra/config.md` — Config loading SPEC
- Possibly 1-3 new ADRs

Stage 4 close requires same gate as prior stages: deliverables Accepted, Sang explicit approval, no Proposed ADRs.

---

## Progress Log

### Stage 4-A.1 — DONE (2026-05-03)

Install mechanics specified. Four decisions accepted:

- **R1-A**: 3 v1 distribution channels — npx, pnpm dlx, npm install -g.
  No curl|bash (private repo blocks public hosting), no Homebrew/Docker
  (npm covers needs), no single-binary (Node 22+ satisfies).
- **R2-A**: Document `npx -y @lazydevz/agora` for AI-agent-safe usage.
  Cannot enforce -y from inside package; documented in README + agent guide.
- **R3-A**: First-run banner once via `~/.agora/.first_run` marker.
  Suppressed thereafter. agora doctor always re-checks explicitly.
- **R4-A**: --version single-line `agora <semver>`. JSON mode adds env context
  (node version, install path, claude_cli_present, etc.) for diagnostics.

npm package shape:
  bin.agora → ./dist/cli/index.js
  files: dist, messages (i18n), probes, README, LICENSE, CREDITS
  engines.node: >=22

Update / Uninstall:
  Standard npm/pnpm patterns; no `agora update` command (7-cmd cap)
  Uninstall removes tool but NOT user data (~/.agora/, project .agora/)

Failure modes guarded:
  - First-time bewilderment → banner with env check
  - AI-agent install loop → -y documented
  - User data loss → preservation guarantee
  - Stale version blindness → doctor surfaces
  - Banner fatigue → marker file suppression

Full SPEC committed to `docs/infra/install.md` with Distribution Channels,
First-Run UX, Update+Uninstall, Version Output sections.

### Stage 4-A.2 — DONE (2026-05-03)

Claude Integration Runtime specified. Five decisions accepted:

- **R1-A**: Single ClaudeRunner interface with call(opts) method. Composition (CachedRunner wraps ClaudeCliRunner / ClaudeSdkRunner). Caller-side complexity prevented.
- **R2-A**: 3 attempts (1+2 retries), exponential backoff (1s, 4s). Rate-limit special case (10s, 30s or API-suggested). Non-transient errors bubble immediately.
- **R3-A**: 60s default timeout, opts.timeout_ms override. SIGTERM → 5s grace → SIGKILL escalation.
- **R4-A**: Per-project cache (.agora/cache/) default, global (~/.agora/cache/) for non-project calls. Cross-project pollution prevented.
- **R5-A**: SDK fallback warning once per session via stderr + always in JSON warnings[]. Process-level dedup via sdk_warning_shown flag.

Wrapper API: ClaudeRunner / ClaudeCallOptions / ClaudeResponse / ClaudeError types specified.

Runtime selection algorithm (per ADR-0005):
  1. Try `claude --print "ping"` — if works, ClaudeCliRunner (Max)
  2. Try ANTHROPIC_API_KEY — if present + sk-ant- pattern, ClaudeSdkRunner (API)
  3. Else throw no_runner_available

Selection runs once per process; re-detect requires restart.

Subprocess invocation:
  - Stdin for prompts > 1024 chars OR multi-line
  - Argv for short single-line
  - --output-format json by default; result field extracted
  - Exit code → ClaudeError mapping

Retry classification:
  Transient (retry): timeout, rate_limited, invalid_response (json), network errors
  Non-transient (bubble): auth_failed, no_runner_available, internal_error

Cache layer:
  .agora/cache/llm_responses.json schema with version + entries
  TTL expiry passive; --refresh active
  Cache key conventions: "subsystem:input_fingerprint"
  Soft limit 100 entries, LRU eviction 20%
  source: "cache" substituted on hit for telemetry

SDK fallback notification:
  TUI: stderr warning once per session
  JSON: warnings[] every command (not deduplicated — AI agents need billing context)

Boundaries enforced (rejections by name).

Failure modes guarded:
  - Silent billing surprise → R5-A explicit notification
  - Retry storm → bounded attempts + classification
  - Stuck UI → 60s timeout + SIGTERM/SIGKILL
  - Cache cross-pollution → per-project default
  - Auth state confusion → process-restart for re-detect

Full SPEC committed to `docs/infra/llm-integration.md` with Claude Runner API,
Runtime Selection, Subprocess Invocation, Retry Policy, Default Timeout,
Cache Layer, SDK Fallback Notification sections.

### Stage 4-A.3 — DONE (2026-05-03)

Config loading specified. Five decisions accepted (all recommended):

- **R1-A**: Adopt **Zod** for config validation in Stage 4 (brings forward
  CLAUDE.md L324's "Stage 5 결정" — config is the first place that needs
  runtime-validated external input). `.strict()` rejects unknown keys
  (typo guard). `Result<T,E>` adoption (CLAUDE.md L327) still deferred to
  Stage 5; loader throws + CLI catches → exit 20 in interim.
- **R2-A**: Deep merge **per section** (key-level granular). Partial
  overrides survive (global iteration_cap + project parallelism both
  win). Arrays replace, not concatenate (avoids silent accumulation).
- **R3-A**: Global config at `~/.agora/config.toml` always. No XDG. Aligned
  with Stage 4-A.1's `~/.agora/.first_run` + `~/.agora/cache/` siblings.
- **R4-A**: Direct `$EDITOR` file edit + `agora doctor` validates +
  `agora doctor --explain-config` subflag shows merged effective config
  with per-key provenance. **No `agora config` 8th command** (7-cmd cap).
- **R5-A**: `version = 1` field required. Mismatch → exit 20 + migration
  hint. **Manual migration only** at v1 (Sang is sole user; auto-rewrite
  surprise too costly).

v1 config sections inventory:
  version, locale (top-level)
  [ralph]:           parallelism, iteration_cap
  [gate_5]:          threshold_ok/warn/fail, z1_max_attempts (with refine)
  [gates.3.critics]: enabled[], disabled[]
  [gates.4.critics]: enabled[], disabled[]
  [probes]:          disabled[], forced[]   (mutually disjoint)
  [bypass_alerts]:   stale_bypass_threshold_iterations
  [preview_quality]: threshold (Y3 gate, 0.75 default)
  [llm]:             cache_ttl_seconds, timeout_ms, retries

Loader algorithm:
  layers = [DEFAULTS, global, project (or --config), env, cli]
  merged = deep_merge_per_section(...layers)
  return ConfigSchema.parse(merged)   # throw → exit 20

State vs config boundary made explicit:
  config = policy (thresholds, defaults) → owned by loader
  state  = history (bypass records, phase pointer) → state.json (Stage 2-C.3)
  cache  = memoized work (gate0/drift/llm) → cache layer (Stage 2-B / 4-A.2)

Env mapping: `AGORA_<DOTTED_KEY_UPPERCASED>` (e.g. AGORA_RALPH_PARALLELISM).
Scalar coercion only; complex sections via TOML or `--config=<path>`.

Boundaries enforced (rejections by name): no validation deferral, no
section-replace merge, no XDG, no edit-wrapper subflag, no 8th command,
no auto-migrate, no array deep-merge, no bypass-records-in-config, no
probe-cache-TTL config knob.

Failure modes guarded:
  - Silent typo            → .strict() rejection
  - Threshold inversion    → Zod refine
  - Schema drift           → version field + manual migration
  - Global value leak      → array replace, not concatenate
  - Auto-rewrite surprise  → manual migration only at v1
  - Bypass loss on reset   → bypass records in state, not config
  - Mid-process reload gap → load once per process (matches 4-A.2)

Full SPEC committed to `docs/infra/config.md` with 8 [SPEC] sections.

CLAUDE.md L324 updated to reflect Zod adoption in Stage 4-A.3 (config
first, domain models follow naturally in Stage 5+).

### Stage 4-A.4 — DONE (2026-05-03)

Probe Registry Implementation specified. Five decisions accepted (all
recommended):

- **R1-A**: `Probe` interface with `id` / `tier` / `description` /
  `detect_shape` (discriminated union: always | marker) / `check(ctx)`.
  `ProbeContext` injects `shellExec` → timeout/sandboxing/test-mocking
  centralized. `ProbeResult = {ok, detail, fix?, duration_ms}`. Special
  `ProbeTimeoutError` signal owned by runner. R1-B (decorator/class)
  rejected (TS decorator stage 3); R1-C (pure-fn + side metadata)
  rejected (scattered definition).
- **R2-A**: One file per probe at `src/probes/definitions/<id>.ts` (19
  files), static-imported into `registry.ts`. Tree-shakable, navigation-
  friendly, kebab-case files / camelCase exports / snake_case ids
  (matches TOML config + Stage 2-B.1 YAML inventory). R2-B (tier dirs)
  rejected (promotion forces moves); R2-C (single registry file)
  rejected (800+ LOC, diff hostile).
- **R3-A**: Bounded parallel — concurrency=5 via inline `createLimit`
  (~30 LOC, no new dep per ADR-0001). Per-probe 5s timeout enforced by
  runner via `Promise.race`. SIGTERM → 5s → SIGKILL escalation matches
  Stage 4-A.2. Worst-case Gate 0 wall time ~20s, typical ~3-5s. R3-B
  (full 19 parallel) rejected (rate-limit + CPU spike); R3-C (sequential)
  rejected (~19s baseline).
- **R4-A**: `markers.ts` helpers — `fileExists`, `packageJsonDeps`,
  `gitRemoteUrl`, `envVarPresent`, `envVarMatches`. Per-process per-cwd
  memoized (single package.json read for all 19 probes). Network/recursive-
  traversal/mutation forbidden in detect. Richer parsing (e.g. wrangler.toml
  contents) lives in check(), not detect(). R4-B (file-existence only)
  rejected (Stage 2-B.1 inventory requires deps parse); R4-C (arbitrary IO)
  rejected (unbounded wall time).
- **R5-A**: Cache deterministic outcomes (success + non-timeout failure)
  for 5min. Timeouts and exceptions NOT cached (transient — recovery must
  not require `--refresh`). Runner wraps every `check()` in try/catch so
  Gate 0 never aborts mid-flight; per-probe failure becomes `{ok:false,
  detail:"internal_error: ..."}`. ProbeCache.set() mechanically guards
  against caching transients via detail-prefix check. R5-B (cache all)
  rejected (blocks recovery); R5-C (no cache) rejected (violates 2-B.1
  R3-A 5min TTL).

Module layout finalized (19 probe files):
  Tier 1 always: claude, node, pnpm
  Tier 1 marker: git, gh, vercel, supabase, anthropic-api-key
  Tier 1+2:      stripe, clerk, openai-api-key, docker, railway, posthog-key
  Tier 1+2+3:    gcloud, aws, bun, upstash, cloudflare

Cross-probe dependency note (anthropic_api_key reads claude state):
resolved at definition time via cheap proxy (package.json deps), avoiding
runner-internal state coupling. One extra cheap env-var check is the cost.

TypeScript skeletons drafted for all 19 probes with detect_shape and
check command pseudocode. Stage 6 implementation has 1:1 mapping.

Boundaries enforced (rejections by name): no decorators, no tier dirs, no
single registry file, no full parallel, no sequential, no file-only detect,
no arbitrary IO detect, no transient caching, no cache-disabled, no new
runtime deps (createLimit inline), no direct child_process spawning, no
env mutation, no plugin discovery at v1.

Failure modes guarded:
  - Probe crash kills gate → runner try/catch, gate continues
  - Probe hangs            → Promise.race 5s timeout
  - Subprocess zombie      → SIGTERM/SIGKILL escalation
  - 19× package.json reads → markers.ts memoization
  - Rate-limit on parallel auth checks → concurrency=5 bound
  - Stale auth blocking recovery → transient outcomes never cached
  - Cross-probe dependency confusion → cheap proxy at detect time
  - Author forgets timeout → runner enforces, not author

Full SPEC committed to `docs/infra/probes.md` with 6 [SPEC] sections +
boundaries + failure modes + output consumers + 19-probe TypeScript
skeleton inventory.

Next task: Stage 4-A.5 — MCP server design (when Agora runs inside
Claude Code per ADR-0005 Mode 3, expose MCP tools instead of nesting LLM
calls). Adds new section to existing `docs/infra/llm-integration.md`.
