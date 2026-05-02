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

Next task: Stage 4-A.3 — Config loading (per-project + global per ADR-0002).
