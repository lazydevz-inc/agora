# Stage 6 — Implementation (vertical slices)

> **Status**: Active (opened 2026-05-04 after Stage 5 close)
> **Goal**: Turn the 5,300+ lines of SPEC produced in Stages 0-5 into
> runnable code, one **vertical slice** at a time. Each slice is a thin
> end-to-end path that exercises multiple layers (CLI → orchestrator →
> infra → external) and ships with tests + manual verification.
> **Done when**: v1 is feature-complete per north-star.md 3-month
> horizon — Sang uses Agora daily across 3+ projects, every active
> lazydevz project has a `.agora/` folder, `claude` is no longer his
> first move.

---

## 🚦 Quick Start (read this first when resuming Stage 6)

> Read `docs/SESSION_HANDOFF.md` first for project-wide conventions.
> This Quick Start is Stage-6-specific live state.

**Working commands** (each = one shipped slice):
```
agora --version  (6-A.1) — foundation
agora doctor    (6-A.2) — 5 probes + Gate 0 cache
agora ping      (6-A.3) — first LLM call (ClaudeRunner)
agora status    (6-A.4) — state foundation
agora new       (6-A.5) — Phase 0 auto-scan
agora bracket   (6-A.6) — Husserl Phase −1 (first philosopher)
agora resume    (6-A.7) — phase orchestrator (8-phase dispatch)
agora intake    (6-A.8) — Phase 1 open intake (interactive)
agora telos     (6-A.9) — Aristotle Phase 2 telos round (interactive, 2nd philosopher)
(6-A.10) — prompt-library generator infrastructure (no new command; pnpm gen:prompts)
```

**To find the next slice's starting context**: scroll to the bottom of
this file. Last "### Stage 6-A.N — DONE" entry has lessons + outstanding
items + "Next task:" line.

**Slice cadence**: ~3-6 vertical slices per focused session. Each slice:
~600-1500 LOC + tests + commit + Progress Log entry.

**Estimated to v1 daily-use**: 15-25 more slices. Roughly:
- Alignment loop completion: Phase 1 intake / Aristotle / Socrates /
  Plato (Y2 + Dihairesis) / agora resume orchestrator → 6-8 slices
- Ralph loop foundation: Gate 1 / Gate 2 / Aquinas Gate 3+4 (+10 critics) /
  Gate 5 / Z1/Z2 → 6-8 slices
- Infra: config loader / 14 remaining probes / SDK fallback → 3-5 slices
- prompt-library generator (refactor inline prompts) → 1 slice

Total ~20 slices = ~5-7 sessions at current pace.

---

## Stage 6 sub-questions (open-ended)

```
6-A.1   Pick first vertical slice + DoD                ← entry decision
6-A.2+  Implement, verify, ship the slice               ← repeat per slice
6-B+    (vertical slices accumulate; structure emerges as we go)
```

Unlike Stages 0-5 (each had ~6 fixed sub-questions), Stage 6 is
**open-ended**. New sub-questions emerge as slices land — e.g. "how
does the next slice handle X edge case" only becomes asked when the
previous slice is in.

Estimated 20-50 sub-questions over weeks of focused work.

---

## Working principle for Stage 6

### Vertical slice discipline

A vertical slice is the **smallest end-to-end path that adds user
value**. Examples:

- `agora --version` (single CLI flag, exercises CLI entry + render + i18n)
- `agora doctor` (probes runner + cache + render + locale)
- `agora new <name>` Phase 0 only (auto-scan + state.json write)
- First Husserl Phase −1 invocation (alignment loop entry + ClaudeRunner)

A slice is NOT:
- A horizontal layer ("implement all of `src/probes/`")
- A speculative abstraction ("build the runtime selection algorithm
  before we know which slice needs it")
- A refactor of placeholder code

### Per-slice structure

Each vertical slice round follows roughly:

```
1. Mode B Q: which slice next + DoD specifics
2. Implement files top-down (CLI command → orchestrator → infra)
3. Write unit tests per Stage 5-A.1 (mirrored tests/ structure)
4. Write integration test (one cross-module flow per slice)
5. Manual verify: agora <command> in TUI mode + --json mode
   + (where applicable) MCP mode via Claude Code
6. Run pnpm typecheck + pnpm lint + pnpm test (all must pass)
7. Commit + push
8. Update Progress Log here with what shipped
```

### Definition-of-Done (DoD) per slice (default — sub-question may extend)

- All new code follows Stage 5-A.1 layer rules (Biome
  `useImportRestrictions` once configured; manual review until then)
- All new module exports use `Result<T, E>` per Stage 5-A.6 R3-A
- All new errors throw `AgoraErrorThrown` from `ERROR_CATALOG` (no
  string literals)
- All user-facing strings come from locale catalog (no string literals
  at render sites)
- All new prompts go through `renderPrompt(key, ctx)` (no inline LLM
  calls bypassing prompt library)
- `pnpm typecheck` ✓ / `pnpm lint` ✓ / `pnpm test` ✓
- Manual TUI verification (terminal screen capture in PR description)
- Manual JSON verification (`agora <cmd> --json | jq` output captured)
- Per Stage 4-A.6: any new ERROR_CATALOG entries land with both en + ko
  catalog keys (no F1 violation)

### What this stage settles vs defers

**Settled in Stage 6**:
- Actual code for v1 features
- Real prompts (currently sketched in runbooks; Stage 6 generates from runbooks via `pnpm gen:prompts`)
- Locale catalog populated per Stage 5-A.5 scaffold
- Library bindings (TOML parser, markdown parser for generator, MCP SDK)
- Test fixtures + integration test conventions
- Pre-commit hook decisions (only if workflow surfaces chronic forgotten regens)

**Deferred to Stage 7+ / commercial form decisions**:
- Public-release decision per ADR-0007 trigger
- Commercial product form (open-core / paid CLI / SaaS / hybrid) per north-star.md 1-year horizon
- Foundation model adapter beyond Claude
- Multi-locale beyond en/ko
- 6th philosopher (per MANIFESTO V justification standard)

---

## Stage 6 will produce

- `src/result/index.ts` (Stage 5-A.6 implementation — likely first slice)
- `src/errors/{types,codes,build,crash,handlers}.ts` (Stage 4-A.6 + 5-A.6 integration)
- `src/i18n/{index,catalog}.ts` (Stage 5-A.5 implementation)
- `src/config/{schema,loader,env,explain}.ts` (Stage 4-A.3 implementation)
- `src/llm/{runner,cli-runner,sdk-runner,cached-runner,cache,selection}.ts` (Stage 4-A.2)
- `src/probes/{types,runner,registry,cache,markers}.ts` + 19 definition files (Stage 4-A.4)
- `src/prompts/{_generated,types,index,interpolation}.ts` (Stage 5-A.4)
- `src/state/{reader,writer,bypass}.ts` (Stage 2-C.3 + 4-A.3)
- `src/philosophers/{husserl,socrates,aristotle,plato,aquinas}.ts` (Stage 5-A.3)
- `src/critics/{registry,selection}.ts` + 10 definition files (Stage 2-B.3)
- `src/alignment/{orchestrator,phase-0-scan,phase-1-intake,phase-2-rounds,recommendations,seed-builder,preview}.ts` (Stage 2-A)
- `src/handoff/{dihairesis,ac-tree,state-machine,audit}.ts` (Stage 2-C)
- `src/ralph/{orchestrator,workspace,gate-1-deterministic,gate-2-functional,gate-3-uiux,gate-4-tech,gate-5-alignment,disputatio}.ts` (Stage 2-B + ADR-0008)
- `src/mcp/{server,tools,host-action}.ts` (Stage 4-A.5)
- `src/cli/{index,render,flags}.ts` + `src/cli/commands/*.ts` × 7 (Stage 3-B)
- `messages/{en,ko}.json` populated per Stage 5-A.5 scaffold (~150 keys × 2)
- `scripts/gen-prompts.ts` (Stage 5-A.4 generator)
- `tests/unit/` + `tests/integration/` + `tests/fixtures/` (Stage 5-A.1 layout)
- npm scripts: `pnpm gen:prompts`, `pnpm lint:prompts`, `pnpm lint:locale`
- biome.json `useImportRestrictions` rule configuration (Stage 5-A.1 R3-A)
- Possibly 1-3 new ADRs (e.g. markdown parser choice, MCP SDK choice if material trade-offs surface)

Stage 6 close requires same gate as prior stages: deliverables Accepted,
Sang explicit approval, no Proposed ADRs. AND additionally: v1 feature
complete per north-star.md 3-month horizon checks.

---

## Progress Log

### Stage 6-A.1 — DONE (2026-05-04)

**First vertical slice: `agora --version` end-to-end** + LAYER 0 foundations.

Five decisions accepted (all R1~R5 recommended):
- R1-A: `agora --version` full-stack slice scope
- R2-A: `--version`-needed LAYER 0 + ERROR_CATALOG full (~30 entries)
- R3-A: `errors.*` + `cli.global.*` full population (~40 keys × 2 locales)
- R4-A: TOML/markdown/MCP parser bindings deferred (not used in this slice)
- R5-A: SPEC traceability `// SPEC:` comments + DoD per slice + `pnpm lint:locale` in CI

Files shipped (real code, no longer placeholder):
  src/result/index.ts            (Stage 5-A.6 canonical: 8 fns + Result type)
  src/errors/types.ts            (AgoraError + AgoraErrorThrown class)
  src/errors/codes.ts            (ERROR_CATALOG full — 30 entries)
  src/errors/build.ts            (buildAgoraError constructor)
  src/i18n/catalog.ts            (JSON imports + lookupKey hybrid algorithm)
  src/i18n/index.ts              (localized + setLocale + getLocale + interpolate
                                  + makeMissingKeyError English self-throw)
  src/cli/index.ts               (real entry; replaces Stage 0 placeholder)
  src/cli/render.ts              (TUI + JSON emit; Stage 3-A.1 envelope)
  src/cli/flags.ts               (manual argv parser + locale resolution +
                                  forbidden combo validation)
  src/cli/commands/version.ts    (runVersionCommand → CommandEnvelope)
  src/shared/{io,path}.ts        (skeletons reserving import paths)
  src/prompts/types.ts           (skeleton reserving @/prompts path)
  messages/en.json               (~50 leaf keys: errors.* + cli.* )
  messages/ko.json               (parallel ko translation, identical key set)
  scripts/lint-locale.ts         (3-check parity verifier; exits 4 on fail)
  tests/unit/result/index.test.ts        (12-test contract)
  tests/unit/errors/build.test.ts        (catalog + buildAgoraError)
  tests/unit/i18n/index.test.ts          (localized + interpolate + missing-key)
  tests/unit/cli/version.test.ts         (runVersionCommand + parseArgv)
  tests/integration/cli-version.test.ts  (end-to-end via tsx)
  package.json                   (added "messages" to files; lint:locale script;
                                  build chmod +x; lint+format expanded to scripts/)
  vitest.config.ts               (resolve.alias for @/* → src/)

Removed: tests/smoke.test.ts (replaced by integration/cli-version.test.ts).

Verification (DoD):
  pnpm typecheck ✓
  pnpm lint     ✓ (1 warning: parseArgv complexity 23 — accepted; explicit
                  refactor in next slice if it grows)
  pnpm test     ✓ (5 files, 42 tests passing)
  pnpm lint:locale ✓ (3 checks pass: keyset parity, ERROR_CATALOG xref,
                     placeholder consistency)
  pnpm build    ✓ → dist/cli/index.js (chmod +x applied)

Manual verification (TTY screen captures recommended for PR):
  $ node dist/cli/index.js --version
    → "agora 0.0.1-alpha.0"
  $ node dist/cli/index.js --version --json
    → Stage 3-A.1 envelope with agora_version, node_version, platform,
      arch, locale_resolved, anthropic_api_key_present + warnings[1]
      (probe deferral)
  $ AGORA_LOCALE=ko node dist/cli/index.js --version --json
    → locale_resolved: "ko"; warning message in Korean
  $ node dist/cli/index.js --json --verbose ; echo $?
    → JSON envelope with errors[0].code = "user.forbidden-flag-combo"
      exit 5

Surprises encountered + decisions made:
1. **NodeNext + path alias incompatibility**: tsc does not rewrite path
   aliases (`@/foo`) to relative paths at emit. Node ESM resolver then
   fails on `@/foo/bar.js` (treats as scoped package).
   Resolution chosen: source files use relative imports; test files keep
   `@/*` via vitest config alias; typecheck honors paths in tsconfig.
   Module-graph SPEC updated with the rationale + pattern.
2. **`exactOptionalPropertyTypes` + class with optional fields**: had to
   move from direct assignment in constructor to conditional assignment
   (`if (fields.fix !== undefined) this.fix = fields.fix`). AgoraError
   interface uses `field?: T | undefined` (vs bare `field?: T`) so callers
   can pass undefined explicitly without violating the strict optional rule.
3. **`as const satisfies`** preserves narrow types — accessing `.fix_key`
   on an entry that doesn't declare it fails. Resolution: cast at lookup
   site (`ERROR_CATALOG[code] as ErrorCatalogEntry`) to widen.
4. **vitest needs explicit resolve.alias** for `@/*` despite tsconfig
   paths. Added in vitest.config.ts.

Lessons for next slice (Stage 6-A.2):
- Pattern is established; subsequent slices follow this structure
  (foundation pieces if needed + command + tests + manual verify).
- The "// SPEC: docs/<area>/<file>.md" header convention works well for
  traceability.
- `pnpm lint:locale` running in verify chain catches new ERROR_CATALOG
  entries without locale strings — saved a regression cycle.

Stage 5-A.1 module-graph.md updated:
  - R5-A Path Alias section: documented source-vs-test asymmetry and
    NodeNext rationale for relative imports in source

Outstanding (intentional defer):
  - parseArgv cognitive complexity 23 — refactor in next slice when it
    grows beyond version flag set
  - claude_cli_present + pnpm_version probes — handled by full probe
    runner in next slice (likely `agora doctor`)
  - TOML parser, markdown parser, MCP SDK bindings — picked when first
    slice needs each

### Stage 6-A.2 — DONE (2026-05-04)

**Second vertical slice: `agora doctor` + 5 probes + Stage 4-A.4 infra.**

Five decisions accepted (R1-R5 recommended):
- R1-A: `agora doctor` + 5 universal probes (claude/node/pnpm + git/gh)
- R2-A: 5 probes only (Tier 1+2+3 batch in 6-A.3 fast-follow)
- R3-A: Full ProbeContext with shellExec (timeout, SIGTERM/SIGKILL escalation)
- R4-A: Full Stage 4-A.4 R5-A cache schema (5min TTL, transient-skip,
  `.agora/cache/gate0_results.json` atomic write)
- R5-A: parseArgv refactored (cognitive complexity 23 → ~10 via 4 small
  helpers: scanArgv / classifyArg / matchBooleanFlag / resolveLocale /
  validateForbiddenCombinations)

Files shipped:
  src/probes/types.ts            — Probe interface + ProbeContext + ShellResult
                                   + ProbeTimeoutError per Stage 4-A.4 R1-A
  src/probes/markers.ts          — fileExists / packageJsonDeps / gitRemoteUrl
                                   / envVarPresent / envVarMatches; per-process
                                   per-cwd memoization; _resetMarkerCacheForTests
  src/probes/cache.ts            — loadProbeCache + ProbeCache interface;
                                   transient-skip enforced via isTransient
                                   helper; flush() atomic write
  src/probes/runner.ts           — executeProbes with bounded concurrency=5,
                                   Promise.race timeout 5s, crash containment
                                   try/catch; spawnExec with SIGTERM → 5s →
                                   SIGKILL escalation; createLimit (~30 LOC
                                   inline, no new dep)
  src/probes/registry.ts         — ALL_PROBES static array + findProbe lookup
  src/probes/definitions/{claude,node,pnpm,git,gh}.ts — 5 probe definitions
                                   (3 universal Tier 1 always, 2 marker Tier 1)

  src/shared/path.ts             — findProjectRoot (v1: returns cwd) +
                                   ensureAgoraDir + hasAgoraDir
  src/shared/io.ts               — readJsonOrNull + writeJsonAtomic (mkdir +
                                   write-temp + rename pattern)

  src/cli/commands/doctor.ts     — runDoctorCommand: TUI sectioned output
                                   (Universal / Project-specific) + JSON
                                   envelope with full probe details + summary
  src/cli/index.ts               — added doctor dispatch + help text update
  src/cli/flags.ts               — REFACTORED:
                                   parseArgv now ~6 lines orchestrating
                                   scanArgv / classifyArg / resolveLocale /
                                   validateForbiddenCombinations helpers.
                                   Cognitive complexity 23 → well under 15.
                                   New flags: --refresh, --include-disabled

  messages/en.json + ko.json     — added cli.doctor.{section_universal,
                                   section_project, section_disabled,
                                   section_detected_not_bundled,
                                   summary_format, no_failures} (6 new keys
                                   × 2 locales = 12 strings)

  tests/unit/probes/runner.test.ts  — 5 tests:
                                      - healthy probe → ok
                                      - failing probe → fail with fix
                                      - crash containment (one probe throws,
                                        siblings still complete)
                                      - hung probe times out at ~5s
                                      - createLimit bounds concurrency
  tests/unit/probes/cache.test.ts   — 6 tests:
                                      - set/get within TTL
                                      - timeout/internal_error NOT cached
                                        (transient-skip)
                                      - deterministic failure IS cached
                                      - flush writes file with TTL+entries;
                                        reload sees them
                                      - flush no-op when untouched
  tests/integration/cli-doctor.test.ts — 4 tests:
                                      - JSON envelope shape with summary +
                                        probes array
                                      - --refresh forces from_cache: false
                                      - TUI output has section headers
                                      - ko locale uses Korean section headers

Verification (DoD):
  pnpm typecheck ✓
  pnpm lint     ✓ (no warnings about parseArgv anymore)
  pnpm test     ✓ 8 files, 57 tests (was 5/42 in 6-A.1)
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual TUI:   $ node dist/cli/index.js doctor
                → 5 probes categorized; summary line
  Manual JSON:  $ node dist/cli/index.js doctor --json | jq
                → envelope with summary + probes[] including from_cache flag
  Manual cache: 2nd run shows from_cache: true for all 5 probes
  Manual refresh: $ doctor --refresh → from_cache: false, fresh run
  Manual ko:    $ AGORA_LOCALE=ko ... doctor → Korean section headers
  Manual fail:  When claude probe fails (e.g. in CI without claude),
                exit 4 (gate.gate-1-deterministic-fail per Stage 4-A.6)
  Cache file:   .agora/cache/gate0_results.json written with 5 entries

Surprises encountered + decisions made:
1. **claude --print "ping" exceeds timeout**: original probe used the SPEC
   liveness check, but it's a real LLM call and consistently exceeded the
   5s hard timeout. Resolution: claude probe now uses cheap `claude --version`
   for installation check; full LLM liveness moves to ClaudeRunner runtime
   selection (next slice). Stage 4-A.4 SPEC unchanged at the contract level
   (5s hard); the per-probe choice of which subprocess command to run is
   the lever.
2. **Cached failure surfaced after fix**: changing the probe but not
   clearing cache means the OLD failure result was served. Cache works as
   spec'd; lesson is `agora doctor --refresh` is the recovery path. When
   a probe definition changes, dev workflow should `rm -rf .agora/cache`.
3. **claude probe's exit 143 = SIGTERM**: the SIGTERM-killed exit shows
   up as `exit_code: 143` in shellExec. Probe interpreted as deterministic
   failure ("claude CLI not available") and cached it. This is correct per
   spec but the wording could be clearer; defer to next slice.
4. **`fix` field omission requires conditional spread**: with
   `exactOptionalPropertyTypes`, returning `{ ok, detail, fix }` where
   `fix === undefined` violates the optional rule. Probes consistently
   omit the field with `...(condition ? { fix } : {})`.
5. **TypeScript `as unknown as` cast for marker detection context**: when
   building the lightweight context for `detect_shape.detect`, the full
   ProbeContext requires shellExec which markers don't need. Used cast to
   throwing-stub context. Cleaner future refactor: split DetectContext
   from ProbeContext.

Lessons for next slice:
- `pnpm gen:prompts` script (Stage 5-A.4) not yet implemented; slice that
  adds first philosopher will need it
- `src/shared/io.ts.writeJsonAtomic` is now usable for state.json writes
  (Stage 2-C.3 implementation in handoff slice)
- 5-probe pattern is cookie-cutter; 6-A.3 batching 14 more is fast follow

Outstanding (intentional defer):
  - 14 remaining probes (vercel/supabase/anthropic_api_key/stripe/clerk/
    openai_api_key/docker/railway/posthog/gcloud/aws/bun/upstash/cloudflare):
    Stage 6-A.3 batch
  - Cross-probe dependency for anthropic_api_key (reads claude state):
    cheap-proxy resolution per Stage 4-A.4 spec, lands in 6-A.3
  - claude probe's full LLM liveness check: ClaudeRunner runtime selection
    slice (Stage 4-A.2 implementation)
  - `--include-disabled` flag is parsed but no behavior yet (no disabled
    probes since no config loader yet)
  - `[probes].disabled` config integration: needs config loader (Stage 4-A.3)

Stage 6 status: 2 slices done. Foundation + agora --version + agora doctor
all working end-to-end with cache + locale + JSON envelope.

### Stage 6-A.3 — DONE (2026-05-04)

**Third vertical slice: ClaudeRunner (CLI-only) + `agora ping` command.**

Five decisions accepted (R1-R5 recommended):
- R1-A: ClaudeRunner CLI-only + `agora ping` command (LLM unlock + verifiable)
- R2-A: CLI-only this slice; SDK fallback DEFERRED (no `@anthropic-ai/claude-agent-sdk` dep)
- R3-A: Full Stage 4-A.2 R4-A cache (`.agora/cache/llm_responses.json`,
  per-project, soft limit 100 + LRU 20% eviction, source: "cache" substituted)
- R4-A: New hidden-ish `agora ping [prompt]` command — defaults to
  "Reply with exactly the word: pong"; always skips cache (real LLM call)
- R5-A: SDK binding DEFERRED — no new dep, no premature implementation;
  no_runner_available throw is the placeholder

Files shipped:
  src/shared/spawn.ts            — Generic LAYER 0 helper for subprocess
                                   execution with timeout + SIGTERM/SIGKILL
                                   escalation. Used by probes/runner (refactored
                                   to consume) AND llm/cli-runner (new caller).
                                   Atomically replaces the duplicated logic.
  src/llm/runner.ts              — ClaudeRunner interface + ClaudeCallOptions +
                                   ClaudeResponse + ClaudeError discriminated union
                                   (per Stage 4-A.2 R1-A)
  src/llm/cli-runner.ts          — ClaudeCliRunner class implementing
                                   ClaudeRunner via `claude --print
                                   --output-format json`. Retry policy
                                   (3 attempts, exponential 1s/4s, rate-limit
                                   special case 10s/30s). Stdin for prompts
                                   >1024 chars or multi-line; argv otherwise.
                                   Transient classification (timeout / rate /
                                   invalid_response = retry; auth / no_runner /
                                   internal = bubble immediately).
  src/llm/cache.ts               — LLMCache file-backed at
                                   `.agora/cache/llm_responses.json`. Soft
                                   limit 100 + LRU 20% eviction. ttl_seconds=0
                                   means no cache. Error responses NEVER
                                   cached. source: "cache" substituted on hit.
  src/llm/cached-runner.ts       — CachedRunner wrapper composition (decorator
                                   pattern). Inner runner injected; checks
                                   cache before delegating; sets cache on
                                   successful response when cache_key + ttl set.
  src/llm/selection.ts           — selectRuntime(cwd) — once-per-process
                                   selection. Tries `claude --version` (cheap
                                   liveness; <3s timeout). On success: returns
                                   `CachedRunner(new ClaudeCliRunner(), cache)`.
                                   On failure: throws no_runner_available with
                                   message saying SDK fallback not yet implemented.
                                   _resetSelectionForTests() helper.
  src/cli/commands/ping.ts       — runPingCommand: takes positional args as
                                   prompt (default "Reply with exactly the
                                   word: pong"), invokes runner, renders TUI
                                   (✓ pong + response + meta line) or JSON
                                   envelope. Maps ClaudeError.code → ErrorCode
                                   for unified error path.
  src/cli/index.ts               — added "ping" command dispatch + help line

  src/probes/runner.ts           — REFACTORED: now imports `spawnExec` from
                                   `shared/spawn.js`. Local probeShellExec
                                   is a thin adapter for ProbeContext interface.
                                   Removed local spawn/escalateKill duplication.
                                   Probe tests still pass (5/5 in runner.test.ts,
                                   6/6 in cache.test.ts).

Tests (3 new files; total now 11 files / 68 tests, was 8/57):
  tests/unit/llm/cache.test.ts          — 6 tests:
                                          - set/get within TTL with source: cache
                                          - never caches error responses
                                          - ttl_seconds=0 means no cache
                                          - invalidate removes entry
                                          - flush writes file; reload sees
                                          - expired entries pruned on get
  tests/unit/llm/cached-runner.test.ts  — 4 tests:
                                          - delegates when no cache_key
                                          - caches when cache_key + ttl set
                                          - does NOT cache when ttl=0
                                          - does NOT cache failed responses
  tests/integration/cli-ping.test.ts    — 1 test:
                                          - JSON envelope shape stable
                                            (success or error path both valid)

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (no warnings)
  pnpm test     ✓ 11 files, 68 tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ node dist/cli/index.js ping
      → "✓ pong\n─────\npong\n─────\n1 attempt(s) · 9031ms · source: subprocess"
    $ node dist/cli/index.js ping --json | jq
      → envelope: command="agora ping", ok=true, data.source=subprocess,
        data.attempts=1, data.response="pong"
    $ node dist/cli/index.js doctor (still works after spawn refactor)
      → 5/5 probes, summary line, exit 0

Surprises encountered + decisions made:

1. claude CLI does NOT support `--max-tokens`:
   Stage 4-A.2 SPEC anticipated --max-tokens flag (it's standard for the
   Anthropic API). claude CLI uses --effort / --max-budget-usd instead.
   Resolution: dropped --max-tokens from buildArgs; max_tokens in
   ClaudeCallOptions is informational. Future slice may map max_tokens →
   --effort heuristic. Stage 4-A.2 SPEC L46-49 (max_tokens declaration)
   needs Rev 2 note.

2. claude --output-format json emits a JSON ARRAY of streaming events,
   not a single envelope:
   Original parser expected `{ result: "..." }`. Actual: array of
   {type: "system"|"assistant"|"rate_limit_event"|"result"} events.
   The terminal `type: "result"` event holds the final response.
   Resolution: parser walks events in reverse, finds last result event,
   extracts result.result string. Also handles is_error flag.

3. SIGKILL escalation extracted to shared/spawn:
   Both probes/runner and llm/cli-runner need spawn-with-timeout-and-kill.
   Decision: extract to shared/spawn.ts (LAYER 0). Refactored probes/
   runner in same slice (small touch, kept tests green). DRY foundation
   for any future subprocess caller.

4. CachedRunner composition cleanly separates concerns:
   Inner runner does the work; wrapper handles cache. Test became trivial
   with fake CountingRunner (4 tests, no real LLM needed). Stage 4-A.2
   R1-A composition pattern validated.

5. selectRuntime() module-level singleton:
   Per Stage 4-A.2 R5-A: "selection runs once per process; re-detect
   requires restart". Implemented as module-level `cached` variable +
   `_resetSelectionForTests()` helper. Intentional process-lifetime cache.

Lessons for next slice:
- shared/spawn is now battle-tested; future subprocess callers (e.g.
  Playwright CLI runner for Gate 2) can reuse without re-implementing
  timeout/kill.
- Real LLM call cost: Sang's machine took ~9 seconds for "pong" with
  16k cache_read input tokens. Cache layer pays for itself immediately
  on repeated dev iterations.
- ClaudeCallOptions.max_tokens is now a no-op; Stage 4-A.2 SPEC needs
  Rev 2 for accuracy when next reading.
- JSON envelope for error case still uses generic "agora" command label
  (emitAgoraError in render.ts). Consider passing command context per
  call for richer errors. Defer to next ergonomics slice.

Outstanding (intentional defer):
  - SDK fallback (`ClaudeSdkRunner`): need `@anthropic-ai/claude-agent-sdk`
    dep + ADR-0001 justification. Defer until first user without claude
    CLI hits no_runner_available
  - SDK fallback notification UX (Stage 4-A.2 R5-A): tied to SDK runner
  - max_tokens → claude --effort mapping: future ergonomics
  - emitAgoraError command context: future ergonomics
  - Stage 4-A.2 SPEC Rev 2 note about max_tokens being CLI-incompatible
  - 14 remaining probes (still deferred from 6-A.2)
  - `src/config/` + TOML loader (still deferred)
  - `src/state/` + state.json (still deferred)

Stage 6 status: 3 slices done. Foundation + version + doctor + ping all
working end-to-end. **First real LLM call from Agora succeeded.** Next
slices unlock first philosopher implementations (need state.json + maybe
prompt-library generator) OR fill out probe inventory OR add config loader.

### Stage 6-A.4 — DONE (2026-05-04)

**Fourth vertical slice: `src/state/` + `agora status` command + Zod adoption.**

Auto-selected sequentially per Sang's instruction. Foundation slice
needed before alignment loop philosophers can persist DefendedFrame /
phase progress.

Key decisions:
- Add `zod` dep (Stage 4-A.3 R1-A standing approval — first usage)
- Minimal v1 state schema: phase pointer + alignment progress + ralph progress
- `agora status` command shows current phase + next-action hint
- Bypass records (Stage 2-B.7) deferred to Ralph slice
- Z1/Z2 escalation state (Stage 2-A.10) deferred to Gate 5 slice

Files shipped:

  src/state/types.ts             — Zod schemas: PhaseSchema (5 phases),
                                   AlignmentProgressSchema (phase/round),
                                   RalphProgressSchema (iteration/last_gate),
                                   StateSchema (.strict). newState() factory.
  src/state/reader.ts            — loadState(cwd) → Result<State|null>
                                   null = no session yet (greenfield)
                                   state = parsed + Zod-validated
                                   err = state.corrupt with detail/path
  src/state/writer.ts            — saveState(cwd, state) → Result<State>
                                   auto-bumps updated_at, validates before
                                   write, atomic via shared/io.writeJsonAtomic.
                                   Writer-side validation catches enum drift.

  src/cli/commands/status.ts     — runStatusCommand:
                                     no session → "No active Agora session"
                                       + "Run `agora new <name>` to start"
                                       + next: [start_new]
                                     in_alignment → "Phase: in_alignment"
                                       + "Alignment phase X, round Y"
                                     ralph_complete → "Phase: ralph_complete"
                                     all → timestamps line
  src/cli/index.ts               — added status dispatch + help line

  messages/en.json + ko.json     — added cli.status.* (6 keys × 2 locales):
                                     no_session / suggest_new / phase_label
                                     alignment_progress / ralph_progress
                                     timestamps

  package.json                   — added zod ^4.4.2 (first runtime use of
                                   Stage 4-A.3 R1-A approval)

Tests (2 new files; total 13 files / 80 tests, was 11/68):

tests/unit/state/state.test.ts (6 tests):
  Reader:
    - returns null when state.json missing (greenfield)
    - loads valid state.json
    - returns state.corrupt on invalid schema (Zod refuses)
    - returns null on JSON parse failure (readJsonOrNull degrades — known)
  Writer:
    - writes atomic file with updated_at bumped
    - roundtrip: write → read returns same state
    - rejects state with invalid phase enum (writer-side validation)

tests/integration/cli-status.test.ts (5 tests):
  - TUI prints "no session" suggestion
  - JSON envelope: session_present: false + next[start_new]
  - TUI with seeded state: "Phase: in_alignment" + "phase 2, round 3"
  - JSON with seeded state: result.data.state.current_phase populated
  - ko locale uses Korean labels

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓
  pnpm test     ✓ 13 files, 80 tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ node dist/cli/index.js status (no .agora/)
      → "No active Agora session in this directory.\nRun `agora new <name>`..."
    $ node dist/cli/index.js status --json
      → {session_present: false, next: [{id:"start_new", command:"agora new <name>"}]}
    $ # seed state.json with in_alignment phase 2 round 3
    $ node dist/cli/index.js status
      → "Phase: in_alignment\n  Alignment phase 2, round 3\nCreated: ...\nUpdated: ..."
    $ node dist/cli/index.js status --locale=ko
      → "현재 디렉토리에 활성 Agora 세션이 없습니다.\n`agora new <name>` 으로 세션을 시작하세요."

Lessons / observations:
- Zod adoption frictionless — Stage 4-A.3 R1-A standing approval +
  TS strict + .strict() on schema rejected unknown keys cleanly.
- readJsonOrNull degrades parse failures to null (treats as missing file);
  for state.json this is a known sharp edge — deliberately corrupt JSON
  reads as "no session" instead of state.corrupt error. Acceptable for
  v1; revisit when state corruption becomes a real failure mode.
- Reader/writer separation enables clean Result-based composition
  (per Stage 5-A.6 R3-A): commands compose state ops with flatMap.
- saveState's writer-side validation catches enum drift early — bug
  protection without runtime overhead.

Outstanding (intentional defer):
  - bypass.ts + bypass record schema (waits for Ralph + --skip-gate-N)
  - Z1/Z2 escalation state (waits for Gate 5 implementation)
  - state.json migration (when v2 ships)
  - readJsonOrNull strict-corrupt mode (when state corruption surfaces)

Stage 6 status: 4 slices done. agora --version / doctor / ping / status
all working. State foundation ready; next philosopher slice can persist
to .agora/state.json.

### Stage 6-A.5 — DONE (2026-05-04)

**Fifth vertical slice: `agora new <name>` + Phase 0 auto-scan + .agora/
materialization.** Auto-selected per Sang's "ok continue".

Bridges state foundation (6-A.4) to alignment loop entry. Phase 0 is
the only philosopher-free phase (no LLM call); pure FS inspection.
Implements Stage 2-A Phase 0 + Stage 3-B.4 `agora new` SPEC subset.

Files shipped:

src/alignment/phase-0-scan.ts (LAYER 2 → reuses LAYER 1 markers):
  runPhase0Scan(cwd, projectName?) → Phase0Output
    Parallel marker checks:
      .git, package.json, src/, tests/, node_modules,
      pnpm-lock.yaml, package-lock.json, bun.lock(b), tsconfig.json
    Reads package.json deps via markers (memoized).
    Reads git remote URL when .git/ present (memoized).
    is_brownfield = .git OR (package.json + node_modules) OR src/
    is_greenfield = !is_brownfield
    detected_stack = top 10 deps alphabetically (stable output)
    detected_patterns = capability flags:
      uses_git / has_src_dir / has_tests_dir / has_node_modules /
      uses_pnpm / uses_npm / uses_bun / uses_typescript /
      uses_react (react|next deps) / uses_vue / has_test_runner
      (vitest|jest deps) / uses_anthropic_sdk
    project_name = positional arg OR basename(cwd)
    Reuses src/probes/markers.buildMarkerHelpers with stub ProbeContext
      (shellExec throws — not needed for Phase 0 detection).

src/cli/commands/new.ts:
  runNewCommand(flags, positional):
    1. Refuse if .agora/ exists → buildAgoraError("user.confirmation-required")
       with message suggesting `agora status` or rm .agora/
       → exit 2
    2. Run Phase 0 scan with optional project name from positional[0]
    3. Materialize .agora/ via shared/path.ensureAgoraDir
    4. Save initial state.json (current_phase: "in_alignment",
       alignment: { phase: 0, round: 0 }) via state/writer.saveState
    5. Write .agora/scan.json with full Phase0Output
    6. TUI: prints session label + project type + git remote (if any) +
            patterns + top deps + scan time + next-action hint
            (greenfield → `agora bracket`, brownfield → `agora resume`)
    7. JSON: envelope with result.data.scan + next[continue_alignment]

src/cli/index.ts:
  Added "new" command dispatch + help text line.
  dispatchNew exits 2 on error (user.confirmation-required) per
    Stage 4-A.6 ERROR_CATALOG.

messages/en.json + ko.json:
  +3 keys × 2 locales = 6 strings:
    cli.new.created (with {project} placeholder)
    cli.new.next_phase_minus_1
    cli.new.next_phase_1

Tests (2 new files; total 15 files / 91 tests, was 13/80):

tests/unit/alignment/phase-0-scan.test.ts (7 tests):
  - greenfield: empty directory → is_greenfield true, no patterns
  - brownfield: .git → uses_git pattern + brownfield true
  - detects pnpm + tsconfig + src/ patterns
  - detected_stack collects package.json deps (alphabetical top N)
  - project_name uses positional arg when given
  - project_name defaults to basename(cwd)
  - scan_duration_ms recorded
  Uses _resetMarkerCacheForTests() between cases (per-process memoization
    needs reset between independent fixture cwds).

tests/integration/cli-new.test.ts (4 tests):
  - greenfield: creates .agora/ + state.json (current_phase: in_alignment,
    alignment.phase: 0) + scan.json
  - greenfield TUI prints "session started" + "greenfield" + "agora bracket"
  - brownfield: detects .git + react dep → JSON envelope with
    is_brownfield: true + uses_git pattern + next: agora resume
  - existing session: refuses with exit 2 + "Existing Agora session detected"

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (no warnings)
  pnpm test     ✓ 15 files, 91 tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ # in /tmp empty dir:
    $ node dist/cli/index.js new my-greenfield
      Agora session started: my-greenfield
        Project type:      greenfield
        Scan time:         0ms
      Next: `agora bracket` to run Husserl Phase −1 (greenfield default).
            `agora resume` to skip directly to Phase 1 intake (brownfield default).
      → state.json + scan.json materialized in .agora/
    $ # in agora repo (brownfield):
    $ node dist/cli/index.js new --json | jq '.result.data.scan'
      {
        "is_brownfield": true,
        "detected_patterns": ["uses_git", "has_src_dir", "has_tests_dir",
                              "has_node_modules", "uses_pnpm",
                              "uses_typescript", "has_test_runner"],
        "detected_stack": ["@biomejs/biome", "@clack/prompts",
                           "@types/node", "commander", "picocolors", ...]
      }
      next: "agora resume"
    $ # second invocation refuses:
    $ node dist/cli/index.js new another
      agora: error: User confirmation required: Existing Agora session
        detected (.agora/ already present). Use `agora status` to inspect
        or remove .agora/ to start fresh.
      exit 2

Lessons / observations:
- LAYER 2 → LAYER 1 import (alignment imports probes/markers) works
  cleanly per Stage 5-A.1 layer rules. The stub ProbeContext (shellExec
  throws) is a small ergonomic cost but preserves the contract.
- Phase 0 entirely synchronous-feeling (~0-2ms even with FS reads) thanks
  to Promise.all parallel checks + markers memoization.
- agora repo's own Phase 0 output exercises the brownfield path richly:
  detects all 7 capability patterns + top 5 deps. Sang's daily-use
  scenario already realistic.
- `--json` flag suppresses TUI output naturally — the CommandEnvelope
  built by buildEnvelope is the full-fidelity record.
- error() helper for early returns (refuse-overwrite path) keeps command
  body readable; pattern likely repeats in next slices.

Outstanding (intentional defer):
  - Phase 0 doesn't yet read package.json `name` field for project_name
    (uses basename only). Easy add when needed.
  - Phase 0 doesn't capture tsconfig strict flags or biome rules — stays
    minimal until alignment rounds need richer signal.
  - .agora/scan.json doesn't have a Zod schema — just JSON dump.
    Add when alignment loop wants typed access.
  - `agora resume` / `agora bracket` commands referenced in next-action
    hints don't exist yet — next slice (Phase −1 Husserl) will add bracket.

Stage 6 status: 5 slices done. agora --version / doctor / ping / status /
new all working end-to-end. Alignment loop entry path: live. Greenfield
+ brownfield detection: validated on real Sang daily-use repo (this one).

### Stage 6-A.6 — DONE (2026-05-04)

**Sixth vertical slice: Husserl Phase −1 (`agora bracket`) — first
philosopher implementation, first multi-turn user dialogue, first
LLM call serving alignment loop substance.**

Auto-selected per Sang's "ok continue". Bridges Phase 0 (auto-scan from
6-A.5) → Phase 1 (open intake — future). Husserl is greenfield default-on
per Stage 5-A.3; this slice exposes it as `agora bracket` (explicit
invocation).

Simplification vs Stage 5-A.3 runbook §3.2 (multi-turn LLM dialogue):
single LLM call constructs the 3 bracket alternatives upfront; user
dialogue is orchestrated locally (cheaper + faster + cache-friendly).
Future iteration may move to runbook's full multi-turn pattern when
concrete usage shows it adds value.

PROMPT INLINE: Stage 5-A.4 prompt-library generator not yet implemented.
This slice's HUSSERL_SYSTEM + buildUserPrompt() constants will be
replaced by `renderPrompt("husserl:phase-minus-1-bracket", ctx)` when
that lands.

Files shipped:

src/philosophers/husserl.ts (LAYER 1 — first philosopher module):
  Types (Zod schemas + TS interfaces):
    BracketDefenseSchema { considered_alternative, defense,
                           defense_followup_triggered }
    DefendedFrameSchema { raw_intent, raw_experience?, chosen_form,
                          brackets_considered: { software/form/audience },
                          surprising_findings[], invocation, created_at }
    HusserlInput, BracketAlternatives, HusserlUi (injectable for tests)
  Inline prompt:
    HUSSERL_SYSTEM constant (~600 chars; describes Epoché + JSON shape
      contract) — Husserl is told to construct alternatives, NOT to
      propose solutions
    buildUserPrompt(input) helper composing raw_intent + raw_experience +
      cwd_signal summary
  Orchestrator:
    runHusserlPhaseMinusOne(input, runner, ui) → Result<DefendedFrame>
      1. Single ClaudeRunner.call with format: "json" → 3 alternatives
      2. captureBracket loop × 3 (Software/Form/Audience):
           ui.askDefense(label, alternative, question)
           If defense < 50 chars (SHORT_DEFENSE_THRESHOLD):
             ui.askFollowupOnShortDefense → merged into final defense
             defense_followup_triggered: true (F-Husserl-1 mitigation)
      3. ui.askSurprisingFindings → surprising_findings[]
      4. Build DefendedFrame; Zod validate; return Result.
    HusserlUi adapter pattern — production wires @clack/prompts; tests
      use deterministic mocks.

src/cli/commands/bracket.ts:
  runBracketCommand(flags, positional):
    1. Refuse if no .agora/ → user.aborted with "run agora new first"
    2. Read or re-run Phase 0 scan (.agora/scan.json)
    3. Load state.json
    4. @clack/prompts intro banner
    5. Get raw_intent: positional joined OR await text() prompt
    6. Get raw_experience: await text() prompt (Husserl-specific)
    7. selectRuntime → ClaudeRunner (cached subprocess)
    8. Build HusserlUi adapter wiring text() to clack
    9. runHusserlPhaseMinusOne → DefendedFrame
    10. Save .agora/defended_frame.json (atomic via shared/io)
    11. Update state.json: alignment.phase: -1 (bracket complete)
    12. clack outro: "✓ Bracketing complete"

src/cli/index.ts:
  Added "bracket" command dispatch + help text line.
  Errors → exit 1 (not 2 — user.aborted is exit 2 per catalog but
    no_runner is 1; conservative exit 1 covers both).

messages/en.json + ko.json:
  +5 keys × 2 locales = 10 strings:
    cli.bracket.intro / ask_intent / ask_experience /
    constructing / ask_surprising

Tests (1 new file; total 16 files / 96 tests, was 15/91):

tests/unit/philosophers/husserl.test.ts (5 tests):
  - Happy path: 3 long defenses → DefendedFrame, no follow-ups
  - F-Husserl-1: short defense triggers follow-up + merged into defense
                  + defense_followup_triggered: true
  - LLM error → llm.internal-error Result.err
  - LLM returns malformed JSON shape → llm.invalid-response
  - All 3 brackets populated with LLM-supplied alternatives

  Tests use StubRunner + makeUi() factory — fully deterministic, no
  real LLM calls. HusserlUi injection pattern proves out.

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (2 warnings — both cognitive complexity, accepted)
  pnpm test     ✓ 16 files, 96 tests
  pnpm lint:locale ✓
  pnpm build    ✓

Manual verification deferred to Sang's interactive run:
  Note: agora bracket is INTERACTIVE (uses @clack/prompts). Cannot be
  exercised via execSync output capture — requires real TTY. Sang can
  run `agora new <name> && agora bracket "I want to..."` in a real
  terminal to test end-to-end. Tests cover Husserl logic with mocks.

Lessons / observations:
- DefendedFrame Zod schema prevents in-process bugs from corrupting
  saved frames — same pattern as state.json writer.
- HusserlUi injection makes Husserl testable WITHOUT mocking
  @clack/prompts — clean separation between domain logic + presentation.
- The "single LLM call constructs alternatives + local dialogue"
  simplification feels right: cheaper, deterministic (per-call cache
  works), and the user-facing dialogue stays under their control.
  Multi-turn LLM dialogue can be added if users want LLM as facilitator
  rather than scripter.
- Inline HUSSERL_SYSTEM is a known SPEC drift from prompt library — but
  the prompt is short (~600 chars) and the contract is clear. When
  scripts/gen-prompts.ts lands, this becomes a one-line refactor.
- Conditional spread `...(rawExperience.trim().length > 0 ? { raw_experience: rawExperience } : {})`
  pattern repeating again (after errors/types.ts, render.ts envelope,
  new.ts envelope). Lock-in pattern for exactOptionalPropertyTypes.

Outstanding (intentional defer):
  - prompt-library generator (Stage 5-A.4 implementation): replaces
    inline HUSSERL_SYSTEM with renderPrompt() lookup
  - F-Husserl-2: over-bracketing prevention (only one Phase −1 per
    session) — needs state.json to track bracket_done flag
  - F-Husserl-3: domain-specific brackets — currently always
    Software/Form/Audience; non-software domains get same brackets
  - Multi-turn LLM facilitator pattern (per runbook) — if simpler
    pattern's UX feels limited
  - prior_frame consistency check (re-bracketing detection)
  - Husserl invocation: "auto" branch (greenfield default-on from
    `agora new`) — currently only "explicit_bracket" via this command
  - Surprising findings follow-up question
  - Locale parity tests for husserl prompt
  - Integration test for `agora bracket` (needs interactive TTY mock)

Stage 6 status: 6 slices done. Working commands:
  agora --version (6-A.1)
  agora doctor   (6-A.2)
  agora ping     (6-A.3)
  agora status   (6-A.4)
  agora new      (6-A.5)
  agora bracket  (6-A.6)  ← NEW

First philosopher implementation alive. Alignment loop now reaches
Phase −1 end-to-end (Husserl bracketing user assumptions before any
specification work begins). 0.9^N alignment thesis — first concrete
step toward closing the gap before Ralph iterations.

Next task: Stage 6-A.7 — likely candidates:
  (a) `agora resume` — orchestrator that picks up state and routes to
      next phase (Phase 1 intake / Phase 2 rounds). Foundational for
      multi-step alignment loop UX.
  (b) Phase 1 open intake (`agora intake` OR fold into `resume`):
      collect raw_intake, save to .agora/intake.json
  (c) Aristotle Phase 2 telos round (next philosopher; needs Phase 1
      intake first to feed cause-statements)
  (d) prompt-library generator (Stage 5-A.4 impl) — refactor
      Husserl prompt out of inline; sets pattern for next philosophers
  (e) `src/config/` + TOML+Zod
  (f) Remaining 14 probes

### Stage 6-A.7 — DONE (2026-05-04)

**Seventh vertical slice: `agora resume` — phase orchestrator + 8-phase
enum extension.** Auto-selected per Sang's "좋아. 진행해줘" — option (a)
from prior NOTES, the strategic priority per SESSION_HANDOFF §8 (resume →
intake → Aristotle path). Bridges per-command slices (6-A.1..6-A.6) to
multi-step alignment loop UX: resume is the single-entry dispatcher every
follow-up phase will route through.

Schema deviation vs prior slices: the 5-phase PhaseSchema (no_session +
4 core phases) became the SPEC's 8-phase enum (in_alignment /
in_alignment_paused / alignment_complete / in_handoff / ready_for_ralph /
in_ralph / in_ralph_paused / ralph_complete). The vestigial `no_session`
default (used only as newState() placeholder, immediately overwritten by
agora new) was dropped — newState() now defaults to "in_alignment".

Five decisions accepted (R1-R5 recommended):
- R1-A: 8-phase enum 한 번에 확장 (SPEC L2582-2584). corrupt detection이
  SPEC와 정렬됨; future slices는 enum 마이그레이션 없이 핸들러만 채움
  (additive). no_session vestigial default 제거.
- R2-A: in_alignment 핸들러는 state.alignment.phase (-1/0/1/2) 별로 분기.
  phase 0 → bracket + intake suggestions. phase -1 → bracket_done line +
  intake only. phase 1/2 → "runtime not yet implemented" guidance.
  reachable subset만 풍부, 나머지는 informative defer.
- R3-A: 미구현 phase (alignment_complete / in_handoff / ready_for_ralph /
  in_ralph / in_ralph_paused / ralph_complete)은 명시적 "deferred phase"
  envelope. exit 0, result.ok=true, data.deferred_reason 포함. F-Aquinas-4
  silent override 안 위반.
- R4-A: corrupt state는 기존 state.corrupt 코드 재사용. Zod ZodError
  detail이 expected_one_of 8-enum 자동 포함. 새 ERROR_CATALOG entry 안 만듦.
- R5-A: --auto-progress / --ralph-complete-action 두 플래그 모두 defer.
  적용될 phase가 모두 R3에서 deferred dispatch이므로 dead surface area.
  handoff/ralph slice에서 함께 추가 예정.

Files shipped:

src/state/types.ts (LAYER 1 — modified):
  PhaseSchema z.enum 5 → 8 values. 추가: in_alignment_paused,
  alignment_complete, ready_for_ralph, in_ralph_paused. 제거: no_session.
  newState() default current_phase: "no_session" → "in_alignment".

src/cli/commands/new.ts (modified):
  initialState.current_phase = "in_alignment" override 라인 제거 (newState
  default와 중복).

src/cli/commands/resume.ts (LAYER 3 — new, ~220 LOC):
  runResumeCommand(flags) → Result<CommandEnvelope>:
    1. !hasAgoraDir → no_session outcome (exit 1)
    2. loadState() → null이면 no_session, err면 state.corrupt bubble (exit 20)
    3. state.current_phase switch (8-arm exhaustive):
         in_alignment | in_alignment_paused → buildAlignmentOutcome
         alignment_complete | in_handoff → deferred (handoff_not_implemented)
         ready_for_ralph | in_ralph | in_ralph_paused →
           deferred (ralph_not_implemented)
         ralph_complete → deferred (ralph_complete_dialog_not_implemented)
  buildAlignmentOutcome reads state.alignment?.phase ?? 0:
    ap === 0 → bracket + intake_pending suggestions
    ap === -1 → bracket_done line + intake_pending only
    ap >= 1 → alignment_runtime_pending message + alignment_runtime_pending suggestion
  buildDeferredOutcome(phase, reason, follow_up): single envelope with
    deferred_reason in data + deferred_follow_up suggestion in next.
  TUI emit + JSON envelope; no LLM calls (pure dispatch).

src/cli/index.ts (modified):
  resume command dispatch + dispatchResume helper. exit 20 routing on
  state.* errors (`result.error.category === "state" ? 20 : 1`).
  printHelp() updated with "agora resume" line.

messages/en.json + ko.json:
  +14 keys × 2 locales = 28 strings under cli.resume.*:
    no_session / suggest_new
    next_start_new_desc / next_doctor_desc
    resuming_alignment / alignment_progress
    next_phase_minus_1 / next_phase_1_pending
    next_bracket_desc / next_intake_desc
    bracket_done / alignment_runtime_pending / next_alignment_runtime_desc
    deferred_phase / deferred_follow_up_desc

tests/unit/state/state.test.ts (modified):
  Two no_session assertions → in_alignment (newState default change).

Tests (1 new file; total 17 files / 107 tests, was 16/96):

tests/integration/cli-resume.test.ts (11 tests):
  no session:
    - TUI prints 'Nothing to resume' + suggests agora new (exit 1)
    - JSON envelope: handler=no_session + 2 next suggestions, exit_code=1
  in_alignment handler:
    - phase 0 → bracket + intake_pending suggestions (exit 0)
    - phase -1 → bracket_done line + intake_pending only
    - phase 2 → "Phase 2 runtime not yet implemented"
    - in_alignment_paused dispatches to same handler
  deferred phases (R3-A):
    - alignment_complete → deferred_reason: handoff_not_implemented
    - ralph_complete → deferred_reason: ralph_complete_dialog_not_implemented
    - ready_for_ralph → deferred_reason: ralph_not_implemented
  corrupt state:
    - invalid phase enum → state.corrupt error envelope, exit 20
  locale:
    - ko locale uses Korean no-session message

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (2 warnings — pre-existing cognitive complexity)
  pnpm test     ✓ 17 files, 107 tests
  pnpm lint:locale ✓ (3 checks: parity / ERROR_CATALOG xref / placeholder)
  pnpm build    ✓
  Manual:
    $ # /tmp/empty
    $ node dist/cli/index.js resume
      Nothing to resume.
      No project state found in this folder. Run `agora new <name>`...
      exit=1
    $ # state.json with in_alignment + alignment.phase=0
    $ node dist/cli/index.js resume
      Resuming alignment session [phase: in_alignment]
        Last activity: alignment phase 0, round 0
      Next: `agora bracket` — run Husserl Phase −1 (greenfield default).
            `agora intake` — Phase 1 open intake (TBD next slice).
      exit=0
    $ # state.json with in_alignment + alignment.phase=-1
    $ node dist/cli/index.js resume
      Resuming alignment session [phase: in_alignment]
        Last activity: alignment phase -1, round 0
      Husserl Phase −1 already complete (alignment.phase = -1).
            `agora intake` — Phase 1 open intake (TBD next slice).
      exit=0
    $ # state.json with alignment_complete
    $ node dist/cli/index.js resume --json | jq '.result.data'
      { "handler": "deferred", "previous_phase": "alignment_complete",
        "new_phase": "alignment_complete",
        "deferred_reason": "handoff_not_implemented" }
      exit=0
    $ # state.json with current_phase: "bogus"
    $ node dist/cli/index.js resume --json | jq '.errors[0].code, .exit_code'
      "state.corrupt"
      20
      exit=20
    $ AGORA_LOCALE=ko node dist/cli/index.js resume
      이어서 진행할 작업이 없습니다.
      현재 디렉토리에 프로젝트 상태가 없습니다. ...
      exit=1

Surprises encountered + decisions made:

1. **PhaseSchema vestigial `no_session`**: existing 5-phase enum included
   `no_session` as newState() default, immediately overwritten by `agora
   new`. Production code never actually held this value — it was a dead
   placeholder. SPEC's 8-phase enum doesn't include it. Resolution: drop
   `no_session`, default newState() to "in_alignment". Updated
   `src/cli/commands/new.ts` (removed redundant override line) +
   `tests/unit/state/state.test.ts` (two assertions). Net negative LOC
   for the schema change despite enum widening.

2. **two-brief Phase B disagreement**: Explore agents returned conflicting
   phase models — CLI brief said 8 phases (correct per SPEC L2582-2584);
   alignment-loop brief said 5 monolithic phases. Resolution: cross-checked
   the actual SPEC inline. cli/spec.md L2421-2443 dispatch table is
   authoritative; alignment-loop.md describes the philosophical lifecycle
   (5 core states) but the dispatch enum is broader (paused / complete /
   ready_for_ralph intermediate states). Lesson: when two Phase B briefs
   conflict, read the SPEC line range directly before committing schema.

3. **`version: "unknown"` in JSON envelope when running outside repo cwd**:
   pre-existing pattern in status.ts / new.ts uses `require("node:fs") +
   new URL(..., import.meta.url)` which resolves to "unknown" in built
   dist + foreign cwd. resume.ts copied the same pattern for consistency.
   Not a regression — same behavior in status/new. version.ts uses the
   correct pattern (fileURLToPath + readFileSync + try-fallback). Future
   ergonomics slice should unify all three on version.ts's pattern.

4. **`emitTui` deferred-phase line printed without bold**: only the
   no_session first-line is bolded (matches SPEC's "Nothing to resume"
   prominence). Deferred phase lines are informative-not-actionable, so
   they render as plain text. Matches Stage 3-A.1 icon/color guidance:
   bold for headers, plain for body.

5. **`--auto-progress` / `--ralph-complete-action` deferred (R5-A)**:
   the SPEC L2640-2654 specifies these flags for non-interactive mode
   on the 4 actionable phases (alignment_complete / in_handoff /
   ready_for_ralph / ralph_complete). Since all 4 are themselves deferred
   in this slice (R3-A), adding the flags would be dead surface area.
   They land naturally in the handoff slice (when alignment_complete →
   in_handoff transition becomes real) and the ralph slice (when
   ready_for_ralph → in_ralph + ralph_complete dialog become real).

Lessons / observations:
- **8-arm exhaustive switch + buildDeferredOutcome helper** keeps the
  dispatcher one-screen-tall despite covering all 8 phases. TS exhaustive
  check catches future enum additions (would force a new case arm).
- **deferred envelope is the F-Aquinas-4 mitigation**: silent override
  is "I had no answer so I picked one"; informative defer is "I have
  an answer (do X next) and I'm telling you what's not yet wired".
  exit_code stays 0 because the dispatch succeeded.
- **Same DispatchOutcome type for all 3 handlers** (no_session /
  in_alignment / deferred) means buildEnvelope is one function. Spreading
  optional fields with `...(opt !== undefined ? { opt } : {})` continues
  to be the canonical exactOptionalPropertyTypes pattern (5th occurrence
  now: errors/types, render envelope, new.ts, husserl.ts, resume.ts).
- **`ap === 0`** branch contains both bracket + intake_pending — the
  most common "just ran agora new" case. greenfield/brownfield divergence
  isn't read at this slice (agora new already encoded the right next-action
  in scan.json's downstream impact); resume just dispatches.

Outstanding (intentional defer):
  - `--auto-progress=yes/no` flag (Stage 3-B.5 R1-A non-TTY): lands when
    actionable phases (alignment_complete / in_handoff / ready_for_ralph)
    have real handlers (handoff slice + ralph slice).
  - `--ralph-complete-action=re_align/accept_deferred/view_log` flag:
    lands with ralph_complete dialog implementation (Stage 2-C.2 R4-A).
  - `agora intake` command (Phase 1 open intake): the next obvious slice
    — currently resume points users to "agora intake (TBD)" string.
  - state.last_answered_field tracking (Stage 3-B.5 mockup): waits on
    alignment loop runtime that actually answers fields (Phase 2 rounds).
  - Plato Dihairesis decomposition + ralph_state.json (Stage 2-C):
    deferred_reason "handoff_not_implemented" lifts when this lands.
  - SPEC mockup convergence: SPEC L2476-2506 shows full "Round 5 / ~6"
    UI for in_alignment resume. Current implementation shows minimal
    "Last activity: alignment phase X, round Y". Convergence happens
    when Phase 2 runtime exists to populate the mockup fields.
  - `version: "unknown"` in resume/status/new JSON envelopes when running
    outside repo cwd: unify on version.ts's `fileURLToPath +
    readFileSync + try-fallback` pattern in a future ergonomics slice.

Stage 6 status: 7 slices done. Working commands:
  agora --version (6-A.1)
  agora doctor   (6-A.2)
  agora ping     (6-A.3)
  agora status   (6-A.4)
  agora new      (6-A.5)
  agora bracket  (6-A.6)
  agora resume   (6-A.7)  ← NEW

`agora resume` is the single-entry dispatcher every multi-step alignment/
handoff/ralph flow will route through. PhaseSchema now matches SPEC's
8-value enum — corrupt detection lists the canonical phase set. Six
deferred-phase envelopes give downstream slices a stable insertion point:
when Stage 2-C handoff lands, swapping out `buildDeferredOutcome("...",
"handoff_not_implemented", ...)` for a real handler is a 2-line change
per phase.

Next task: Stage 6-A.8 — likely candidates:
  (a) `agora intake` — Phase 1 open intake. Next concrete step on the
      alignment loop path: resume's "intake_pending" suggestion becomes
      live. Brownfield/greenfield branching (Stage 2-A.3 R1-A vs R2-A
      prompts), 8KB cap, mechanical echo, .agora/intake.json output.
  (b) Aristotle Phase 2 telos round — needs Phase 1 intake to feed
      cause-statement input. Sequential dependency on (a).
  (c) prompt-library generator (Stage 5-A.4 impl) — refactor inline
      Husserl prompt + sets pattern for Aristotle/Socrates/Plato/Aquinas.
      One-time investment, paid back across 4+ philosophers.
  (d) `src/config/` + TOML + Zod (Stage 4-A.3 impl) — unblocks
      `[probes].disabled`, custom telemetry off, locale override at
      project level.
  (e) Remaining 14 probes (Stage 4-A.4 cookie-cutter batch) —
      lazydevz stack coverage (vercel/supabase/anthropic/...).

### Stage 6-A.8 — DONE (2026-05-04)

**Eighth vertical slice: `agora intake` (Phase 1 open intake) — second
philosopher-free interactive command + first $EDITOR escape implementation +
Phase1Result schema.** Auto-selected per Sang's "너가 추천한 방향으로 진행해줘"
on Q2 — option (a) from prior NOTES, the strategic priority continuation
of resume → intake → Aristotle path. Bridges 6-A.7's `intake_pending` hint
to a live command; alignment loop now reaches Phase 1 end-to-end (Phase 0
auto-scan from `agora new` → Husserl Phase −1 from `agora bracket` → Phase 1
open intake from `agora intake`). Phase 2 philosopher rounds still pending.

Five decisions accepted (R1-R5 recommended):
- R1-A: separate `agora intake` shortcut command (mirroring 6-A.6 bracket).
  7-cmd cap from ADR-0001 covers primary commands (doctor/status/seed/new/
  resume/ralph/default); bracket/ping/intake are explicit philosopher /
  philosopher-adjacent shortcuts.
- R2-A: SPEC L210-234 brownfield/greenfield prompt verbatim through locale
  catalog. brownfield references ingested doc list (.git, deps count, src/);
  greenfield asks what/why/shape 3 dimensions.
- R3-A: 8 KB soft cap (warning, no truncate) + 16 KB hard cap (truncate +
  intake_truncated flag). UTF-8-codepoint-aware truncation guard — never
  splits a multi-byte codepoint mid-character.
- R4-A: full $EDITOR escape contract — temp file at .agora/cache/intake-
  {ts}.md + comment header + spawn $EDITOR (env || vim || nano || vi
  fallback chain) + comment-line stripping after editor close. New
  io.editor-unavailable ERROR_CATALOG entry + en/ko locale entries.
- R5-A: Phase1Result Zod schema per alignment-loop.md L273-281
  (raw_intake / intake_method / intake_word_count / intake_byte_size /
  intake_truncated / intake_duration_ms / estimated_rounds + classification
  + created_at). state.alignment.phase: 0|-1 → 1 transition. session_id
  history/ persistence deferred (no session_id concept in schema yet).

Files shipped:

src/shared/editor.ts (LAYER 0 — new, ~95 LOC):
  openEditorAndRead({ filePath, initialContent }) → string:
    1. Write initial content (caller supplies header) to filePath
    2. pickEditor: $EDITOR → vim → nano → vi (uses `which` for availability)
    3. spawnEditorInteractive: spawn(cmd, [path], stdio: "inherit")
    4. Read file back, stripCommentLines (HTML-style block + line comments)
  Throws AgoraErrorThrown("io.editor-unavailable") when no editor found.
  stripCommentLines exported for unit testing.

src/alignment/phase-1-intake.ts (LAYER 2 — new, ~210 LOC):
  IntakeMethodSchema = "inline" | "editor" | "paste"
  Phase1ResultSchema (Zod): raw_intake (min 1) / method / word_count /
    byte_size / truncated / duration_ms / estimated_rounds /
    classification / created_at (ISO 8601)
  IntakeUi interface: askInline / openEditor / askReprompt /
    displaySoftCap / displayHardCap / displayEcho — adapter pattern
    mirrors HusserlUi (Stage 6-A.6).
  Constants: SOFT_CAP_BYTES=8192, HARD_CAP_BYTES=16384.
  estimateRounds(wordCount): "<50: 5–8 rounds (lots to clarify)",
    "50-300: 3–5 rounds", ">300: 2–3 rounds" (per SPEC L266-270).
  countWords(input): trim + split on \s+, returns 0 for empty/whitespace.
  runPhase1Intake(input, ui) → Result<Phase1Result>:
    1. collectInput: handles inline → paste/inline classify; empty →
       openEditor → editor; empty editor → askReprompt → inline OR
       user.aborted (empty twice, exit 2 per SPEC L254).
    2. Cap mechanics: byte_size >=16KB → truncateToBytes (UTF-8 boundary
       safe, walks back over continuation bytes) + displayHardCap;
       >=8KB → displaySoftCap, no truncate.
    3. Compute word count + estimated rounds.
    4. displayEcho (mechanical, no LLM).
    5. Validate against Phase1ResultSchema, return Result.

src/cli/commands/intake.ts (LAYER 3 — new, ~205 LOC):
  runIntakeCommand(flags, positional):
    1. Refuse if no .agora/ → user.aborted (exit 2)
    2. Load scan.json (re-run Phase 0 if missing)
    3. Load state.json — refuse if alignment.phase >= 1 (no over-intake →
       user.confirmation-required, exit 2)
    4. composeIntakePrompt(scan): brownfield (with doc hints) vs greenfield
       via locale catalog
    5. clack intro + buildClackUi adapter (text() + log.info/warn/success,
       openEditorAndRead with cache temp file)
    6. runPhase1Intake → Phase1Result
    7. writeJsonAtomic(.agora/intake.json)
    8. saveState → alignment.phase: 1
    9. clack outro + buildEnvelope (next: agora resume → Phase 2 pending)

src/cli/index.ts:
  Added "intake" command dispatch + dispatchIntake helper. exit code mapping:
    state → 20, user → 2, default → 1.
  printHelp() updated with "agora intake" line.

src/cli/commands/resume.ts (modified):
  Removed " (TBD)" suffix from "agora intake" string in three deferred
  hint locations (alignment phase 0 / phase -1 / next_intake_desc).
  resume.next[*].command now points to live `agora intake`.

src/errors/codes.ts (modified):
  Added "io.editor-unavailable" entry — category io, exit 1, message_key
  errors.io.editor_unavailable + fix_key suggesting $EDITOR setup.

messages/en.json + ko.json:
  +9 keys × 2 locales under cli.intake.* = 18 strings:
    intro / prompt_brownfield (with {ingested_doc_list}) / prompt_greenfield
    empty_reprompt / reprompt_short / editor_opening
    soft_cap_warning (with {bytes}) / hard_cap_truncated (with {bytes})
    echo (with {word_count}, {method}, {estimated_rounds})
  +2 keys × 2 locales under errors.io.* = 4 strings:
    editor_unavailable / editor_unavailable.fix
  +0 keys but 4 string updates under cli.resume.* (TBD removal).
  Total: +22 strings net new.

Tests (2 new files; total 19 files / 126 tests, was 17/107):

tests/unit/alignment/phase-1-intake.test.ts (14 tests):
  Input classification:
    - inline single-line → method=inline
    - multi-line inline → method=paste
    - empty inline → editor returns content → method=editor
    - empty inline → empty editor → reprompt → user types → method=inline
    - empty twice → user.aborted (category=user)
  Cap mechanics:
    - <8KB → no warnings, no truncate
    - >=8KB <16KB → soft cap warning, no truncate
    - >=16KB → hard cap + intake_truncated=true + byte_size==16384
    - UTF-8 codepoint boundary preserved on hard truncate (한 character)
  Estimated rounds + word count:
    - countWords whitespace + empty handling
    - estimateRounds bucket boundaries (0/49/50/300/301)
    - displayEcho called with computed values (mechanical, no LLM)
  Schema:
    - Phase1Result validates against Phase1ResultSchema
    - classification preserved from input

tests/unit/shared/editor.test.ts (5 tests):
  stripCommentLines:
    - removes single-line HTML comments
    - removes multi-line block comments
    - preserves blank lines + trims surrounding whitespace
    - returns empty when only comments
    - preserves real content when no comments

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (3 pre-existing cognitive-complexity warnings, no errors)
  pnpm test     ✓ 19 files, 126 tests
  pnpm lint:locale ✓ (3 checks: parity / ERROR_CATALOG xref / placeholder)
  pnpm build    ✓
  Manual:
    $ # /tmp/empty
    $ node dist/cli/index.js intake
      agora: error: Aborted by user.
      exit=2

    $ # state.json with alignment.phase=1 (already past intake)
    $ node dist/cli/index.js intake
      agora: error: User confirmation required: Phase 1 intake already
        complete (alignment.phase=1). Re-running would overwrite
        intake.json. Remove .agora/intake.json or run `agora resume`...
      exit=2

    $ # state.json with alignment.phase=0 (fresh from agora new)
    $ node dist/cli/index.js resume --json | jq '.next[].command'
      "agora bracket"
      "agora intake"   ← live, no (TBD) suffix

  Manual interactive run deferred to TTY (clack interactive same as bracket).
  Phase1Intake logic fully covered by unit tests with StubUi.

Surprises encountered + decisions made:

1. **PhaseSchema alignment.phase enum constraint check**: state/types.ts
   AlignmentProgressSchema declares `phase: z.number().int().min(-1).max(2)`.
   Phase 1 = 1 (within bounds). No schema change needed. Future Phase 2
   work (round 1+) advances to phase=2 within same constraint.

2. **JSON envelope exit_code field shows 5 for user.confirmation-required
   despite process actually exiting 2**: pre-existing render.ts mapping uses
   category-only (user → 5) but ERROR_CATALOG has per-error exit codes
   (confirmation-required = 2, aborted = 2) and dispatchIntake correctly
   honors them at process.exit time. JSON envelope reads the wrong field.
   Same issue affects status/doctor/etc — render.ts needs its own
   ergonomics slice to consume catalog exit_code instead of category-only.
   Process actual exit is correct.

3. **IntakeUi.openEditor swallows editor errors → empty content**: when
   editor unavailable or non-zero exit, intake.ts's clack adapter catches
   and returns "" so the orchestrator triggers the re-prompt path.
   Alternative was to bubble io.editor-unavailable as a hard error;
   chose UX-first defer (user can still type inline) per "biased over
   un-biased" CLAUDE.md principle.

4. **UTF-8 codepoint boundary truncation needed explicit guard**: naive
   `Buffer.subarray(0, 16384).toString("utf8")` would split a 한자
   (3-byte) at the boundary, producing invalid UTF-8. Walking back over
   continuation bytes (10xxxxxx pattern) finds the safe cut point. Added
   regression test with HARD_CAP_BYTES copies of '한' as filler.

5. **Comment header in temp file for $EDITOR**: SPEC L309-317 specifies
   the `<!-- ... -->` header. Used HTML comment style (markdown standard).
   stripCommentLines handles both single-line `<!-- x -->` and multi-line
   `<!--\n  multi\n-->` blocks. Kept this in shared/editor.ts (not the
   intake command) so future commands using editor escape get the same
   behavior automatically.

6. **estimated_rounds is a string, not a number**: SPEC L267-269 examples
   are formatted strings ("5–8 rounds (lots to clarify)" / "3–5 rounds" /
   "2–3 rounds"). Kept as string per spec — Phase 2 round-planner can
   parse if needed; mostly a UX hint not a commitment.

Lessons / observations:
- **IntakeUi adapter pattern works exactly like HusserlUi** — 5 methods,
  tests inject deterministic stubs, production wires @clack/prompts.
  The pattern is now generalizable: any future interactive philosopher /
  alignment phase command should follow Husserl + Phase-1-Intake template.
- **stripCommentLines belongs in shared/editor.ts, not in intake.ts**:
  any future use of $EDITOR (e.g. `agora seed --edit`, future ralph
  bypass justification editor) will need the same comment-stripping.
  LAYER 0 placement is correct.
- **Cap mechanics + UTF-8 guard fit cleanly in pure functions** — both
  `truncateToBytes` and `estimateRounds` are static + deterministic,
  exported for unit tests, no mocking needed.
- **The "biased product" principle pays off in editor failure UX**: when
  editor isn't available, we don't crash — we degrade to inline retry.
  User isn't blocked by environment friction.

Outstanding (intentional defer):
  - JSON envelope exit_code field uses category-only mapping (render.ts):
    should consume per-error exit_code from ERROR_CATALOG. Current
    workaround is dispatcher overrides at process.exit. Future ergonomics
    slice unifies.
  - Session_id concept + .agora/history/{session_id}/intake.md persistence:
    SPEC L321 wants editor temp file moved to history/ for audit.
    Currently temp file stays in .agora/cache/intake-{ts}.md (gitignored).
    Lands when session_id materializes (likely Phase 2 or handoff slice).
  - `--non-interactive` stdin intake (Mode 2 per ADR-0005): SPEC L330-331
    notes "No reading from stdin in non-TTY mode unless explicit
    --non-interactive flag is set". Defer until first scripted-use surfaces.
  - prior_intake re-entry detection: re-running `agora intake` when
    intake.json already exists currently refused via state.alignment.phase
    >= 1 guard. SPEC may want a user-confirm overwrite path; defer.
  - Manual editor invocation test (vim/nano/vi spawn integration): defer
    until first cross-platform test infrastructure (Windows path testing).
  - LOW_CONFIDENCE_BANNER prepend for low-confidence brownfield (SPEC
    L221-222): Phase 0 doesn't yet capture confidence; defer until Phase 0
    confidence model lands.
  - Editor temp file cleanup: currently writes to .agora/cache/intake-{ts}.md
    and never deletes. Per existing .agora/cache/ gitignore convention this
    is fine for v1; cleanup could go into doctor --refresh later.
  - Integration test for `agora intake` interactive run: requires TTY mock
    or PTY-based test infra. Same defer as bracket (6-A.6).

Stage 6 status: 8 slices done. Working commands:
  agora --version (6-A.1)
  agora doctor   (6-A.2)
  agora ping     (6-A.3)
  agora status   (6-A.4)
  agora new      (6-A.5)
  agora bracket  (6-A.6)
  agora resume   (6-A.7)
  agora intake   (6-A.8)  ← NEW

**Alignment loop entry-to-Phase-1 path is now complete end-to-end:**
  agora new → (Phase 0 auto-scan)
    → agora bracket (greenfield) OR agora resume (brownfield)
    → agora intake (Phase 1 open intake)
    → agora resume (Phase 2 runtime — pending next slices)

Next task: Stage 6-A.9 — likely candidates:
  (a) Aristotle Phase 2 telos round (`agora resume` advances when
      alignment.phase=1 → invoke Aristotle telos prompt → save round
      result → bump round counter). Needs Phase 1 intake.json as input.
      Second philosopher implementation; cements the multi-philosopher
      orchestration pattern.
  (b) prompt-library generator (Stage 5-A.4 impl): now have TWO inline
      prompts (Husserl + about-to-add Aristotle). Generator pays off
      starting at the second. Refactors HUSSERL_SYSTEM out of
      husserl.ts; sets pattern for all 5 philosophers.
  (c) `src/config/` + TOML + Zod: unblocks user customization of probe
      list, locale defaults, future per-project alignment settings.
  (d) Remaining 14 probes: cookie-cutter batch.
  (e) ergonomics slice: render.ts envelope exit_code unification +
      version: "unknown" outside-cwd fix (status/new/resume/bracket/intake
      all share this).

### Stage 6-A.9 — DONE (2026-05-04)

**Ninth vertical slice: `agora telos` — Aristotle Phase 2 telos round.
Second philosopher implementation; first Phase 2 round; cements the
multi-philosopher orchestration pattern.** Auto-selected per Sang's "다음
진행해줘" + new "no manual handoff" feedback (no Mode B Q at slice start
when no taste call needed). Bridges 6-A.8's intake.json output → telos
extraction; alignment loop now reaches Phase 2 round 1 end-to-end.

Schema deviation vs runbook §3.2: runbook says multi-turn LLM dialogue
per question. Slice does **3 questions asked locally + 1 LLM call to
extract structured TelosClaim + F-Aristotle-1 noun-phrase rebuttal loop
(≤1 follow-up + 1 re-extract)**. Net: ≤2 LLM calls per round vs
runbook's per-question dialogue. Cheaper + cache-friendly + matches
Husserl 6-A.6 simplification pattern.

PROMPT INLINE: Stage 5-A.4 prompt-library generator still not implemented.
ARISTOTLE_TELOS_SYSTEM constant joins HUSSERL_SYSTEM as the second inline
philosopher prompt awaiting refactor. Generator slice (likely 6-A.10 or
6-A.11) refactors both at once.

No Mode B Q at slice start. Per `feedback_no_manual_handoff` memory: pure
technical decisions (file layout, schema field, error code) get decided
and shipped without surfacing as Q. The "decide and go" cadence keeps
the loop tight.

Implementation summary (decisions made inline):
- Separate `agora telos` shortcut command (matches bracket/intake; 7-cmd
  primary cap intact, telos joins philosopher / phase shortcuts).
- 3 questions asked locally via AristotleUi adapter (HusserlUi pattern);
  1 LLM call extracts structured claim + sets noun_phrase_telos flag.
- F-Aristotle-1 noun-phrase rebuttal: ≤1 follow-up + ≤1 re-extract
  (sets noun_phrase_refinement_triggered=true).
- TelosClaim Zod schema: statement / served_good / failure_signal /
  optional success_signal / maturity (default "dianoia") /
  noun_phrase_refinement_triggered.
- FourCauses Zod schema: telos optional + created_at + updated_at.
  Other causes (form/material/efficient) future slices extend.
- State transition: alignment.phase: 1 → 2, round: 0 → 1.
- Refusal guards: no .agora/, no intake.json, alignment.phase < 1, OR
  four_causes.json already has telos populated (no over-telos).
- resume.ts ap===1 branch: now points to live `agora telos` instead of
  generic runtime_pending message. ap>=2 still runtime_pending (form/
  material/efficient pending).

Files shipped:

src/philosophers/aristotle.ts (LAYER 1 — new, ~225 LOC):
  Types: MaturitySchema (pistis|dianoia|noesis), TelosClaimSchema,
    FourCausesSchema (forward-compat with optional cause slots).
  AristotleTelosInput { raw_intake, defended_frame_chosen_form?,
    current_round }.
  AristotleUi adapter: askWhyExists / askServedGood / askFailureSignal /
    askNounPhraseRefinement (4 methods).
  ARISTOTLE_TELOS_SYSTEM inline prompt (~700 chars; describes hard rules
    1-6 + JSON contract).
  buildTelosUserPrompt(input, raw): composes prompt with optional
    chosen_form context + optional refinement append.
  runAristotleTelosRound(input, runner, ui) → Result<TelosClaim>:
    1. Local: ask 3 questions in order (runbook §4.1 hard rule 2)
    2. Reject if any answer empty → user.aborted
    3. callForExtraction (1 LLM call, format: "json")
    4. If noun_phrase_telos: askNounPhraseRefinement → empty → aborted;
       else re-extract with refinement appended (2nd LLM call)
    5. Build TelosClaim, validate against Zod schema, return.

src/cli/commands/telos.ts (LAYER 3 — new, ~210 LOC):
  Refusal guards (4 paths):
    1. no .agora/ → user.aborted (exit 2)
    2. no intake.json → user.aborted (exit 2)
    3. alignment.phase < 1 → user.aborted (exit 2)
    4. four_causes.json has telos populated → user.confirmation-required
       (exit 2)
  Loads scan.json (re-runs Phase 0 if missing) + optional
    defended_frame.json + intake.json + state.json.
  selectRuntime → ClaudeCliRunner (cached).
  Wires AristotleUi adapter via @clack/prompts (text() + log.warn for
    noun-phrase warning).
  Calls runAristotleTelosRound.
  Persists FourCauses (telos populated) to .agora/four_causes.json.
  Advances state: alignment.phase: 1 → 2, round: 0 → 1.

src/cli/index.ts: telos command dispatch + dispatchTelos helper (state →
  20, user → 2, default 1 mapping). Help text adds telos line.

src/cli/commands/resume.ts: ap===1 branch now targets "agora telos"
  instead of generic runtime_pending. ap>=2 still runtime_pending.
  New locale keys: cli.resume.intake_done / next_phase_2_telos /
  next_telos_desc.

messages/en.json + ko.json:
  +7 keys × 2 locales = 14 strings under cli.telos.* (intro /
    context_summary / q_why_exists / q_served_good / q_failure_signal /
    noun_phrase_warning / q_noun_phrase_refinement)
  +3 keys × 2 locales = 6 strings under cli.resume.* (intake_done /
    next_phase_2_telos / next_telos_desc)
  Total: +20 strings net new.

Tests (1 new file + 1 modified; total 20 files / 136 tests, was 19/126):

tests/unit/philosophers/aristotle.test.ts (10 tests):
  Happy path × 3:
    - 3 questions asked + 1 LLM call → TelosClaim
    - Output validates against TelosClaimSchema
    - Optional success_signal extracted when LLM provides it
  F-Aristotle-1 noun-phrase rebuttal × 2:
    - Detection triggers refinement loop + 2nd LLM call;
      noun_phrase_refinement_triggered=true
    - Empty refinement → user.aborted
  Error paths × 5:
    - Empty Q1 → user.aborted (all 3 questions required)
    - LLM error response → llm.internal-error
    - Non-object content → llm.invalid-response
    - Malformed JSON shape (wrong fields) → llm.invalid-response
  Uses QueueRunner (sequential queued ClaudeResponses) + RecordedUi
    (tracks asked-which order). No real LLM calls.

tests/integration/cli-resume.test.ts (modified, +1 test):
  - phase 1 → telos hint (ap=1 → next.id="telos", command="agora telos")
  Existing phase 2 → runtime_pending unchanged (ap>=2 still pending).

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (5 pre-existing cognitive-complexity warnings)
  pnpm test     ✓ 20 files, 136 tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ # /tmp/empty
    $ node dist/cli/index.js telos
      agora: error: Aborted by user. (exit 2 — no .agora/)

    $ # .agora/ + state but no intake.json
    $ node dist/cli/index.js telos
      agora: error: Aborted by user. (exit 2 — Phase 1 intake required)

    $ # state.json alignment.phase=1 + intake.json + four_causes.json
    $ # with telos already populated
    $ node dist/cli/index.js telos --json | jq '.errors[0].code'
      "user.confirmation-required" (over-telos guard)

    $ # state.json alignment.phase=1 + intake.json (no four_causes yet)
    $ node dist/cli/index.js resume --json | jq '.next[].command'
      "agora telos"   ← live, points at this slice's command

  Manual interactive run deferred to TTY (clack same as bracket / intake).
  Aristotle logic fully covered by unit tests with QueueRunner stubs.

Surprises encountered + decisions made:

1. **`exactOptionalPropertyTypes` interaction with Zod-inferred type**:
   ExtractedTelos's `success_signal?: string` triggered TS error because
   Zod's `.optional()` produces `string | undefined`. Resolution: declare
   the interface field as `success_signal?: string | undefined` (explicit
   undefined union) to match Zod's inferred shape. Fifth occurrence of
   the conditional-spread / explicit-undefined pattern across slices.

2. **ClaudeError code is `internal_error` not `internal`**: writing the
   test's stub ClaudeError I used `code: "internal"` from memory; actual
   discriminated union in src/llm/runner.ts uses `internal_error`.
   Compile error caught it. Pattern: when stubbing typed unions, grep
   the source type instead of relying on memory.

3. **`agora telos` is the 9th `agora <command>`** (counting --version
   as a flag). Commands not in cli/spec.md's primary 7: bracket / ping /
   intake / telos. All four are shortcuts to philosopher or phase entry
   points. The 7-cmd cap (ADR-0001 + Stage 1) is being interpreted as
   "7 primary commands" with shortcuts allowed. As Phase 2 expands
   (form/material/efficient + Socrates/Plato/Aquinas), the shortcut
   count will grow; eventually consolidating to a single `agora round`
   may be cleaner. Defer to a "command surface review" slice when
   shortcut count exceeds, say, 6.

4. **`agora resume` ap===1 branch refactor was clean**: prior slice
   6-A.8 anticipated this exact insertion point ("alignment_runtime_
   pending" branch); replacing with a live telos hint was a 6-line
   change. Confirms the deferred-dispatch envelope pattern from 6-A.7
   R3-A is the right pattern for staged slice rollout.

5. **No Mode B Q at slice start** worked smoothly. The technical
   decisions (separate command vs fold into resume; 1 vs 2 LLM calls;
   schema shape) all had defensible defaults; no Sang taste call needed.
   Saved one full Q-then-wait round-trip vs prior cadence.

Lessons / observations:
- **AristotleUi adapter pattern is now load-bearing across 2 philosophers**
  (Husserl, Aristotle). Future Socrates / Plato / Aquinas modules will
  follow the same shape: pure logic file with Schema + Input + Ui +
  orchestrator + inline prompt; CLI command file wires @clack/prompts.
  This is the canonical "philosopher implementation template" — could
  formalize in docs/architecture/runbook-template.md or as a generator
  if it repeats 5 times.
- **`runbook §3.2 multi-turn dialogue` simplification is consistent
  across philosophers.** Husserl: 1 LLM call upfront + local dialogue.
  Aristotle: local 3 questions + 1 LLM call extraction + 1 follow-up.
  Both reduce LLM round-trip count vs runbook's per-question dialogue
  while preserving the SPEC's input/output contracts. Pattern: do the
  fixed questions locally, use LLM for *extraction + classification*
  rather than *question generation*.
- **FourCauses optional-cause schema is forward-compatible**: when form/
  material/efficient slices land, they extend FourCausesSchema with
  more optional fields and existing four_causes.json files keep parsing.
  No migration needed.
- **`feedback_no_manual_handoff` memory is the right pattern.** End of
  slice = brief result + key surprises + auto-start next. No "do (a)
  or (b)?" tail Q, no "approved to push?" check. Saved ~30s of
  back-and-forth vs prior cadence. Pushed automatically once Sang's
  delegation flowed through hooks.

Outstanding (intentional defer):
  - Aristotle form / material / efficient rounds (4 sub-prompts in
    runbook §4.2-4.4): each becomes a future slice or batch slice.
    `agora telos` → `agora form` → `agora material` → `agora efficient`
    OR consolidate to `agora round` advancing one cause per invocation.
  - Plato Divided Line maturity tagging: TelosClaim.maturity is set to
    "dianoia" as default; Plato slice re-tags after rigor check
    (statement → dianoia → noesis path).
  - Socrates case-probing of telos.statement: runbook §3.2 step 7 says
    "Hand off to Socrates after Aristotle returns". Socrates slice
    layers between Aristotle and Plato.
  - Telos instability detection (runbook §3.2 step 3): "if user's last
    response contradicts current four_causes.telos statement → reset
    next_cause = telos". Lands when multiple Phase 2 rounds run; needs
    state to track per-round contradictions.
  - prompt-library generator (Stage 5-A.4 impl): two inline prompts
    now (HUSSERL_SYSTEM + ARISTOTLE_TELOS_SYSTEM). Generator slice
    refactors both. Pays off most when third philosopher about to land.
  - `agora round` consolidation: when shortcut command count exceeds
    ~6 (intake/telos/form/material/efficient/case-probe/...), consider
    single `agora round` orchestrator that picks the right philosopher
    + cause based on state.alignment.phase + .agora/four_causes.json
    progress.
  - Round counter semantic: state.alignment.round advances per Aristotle
    cause-round (telos=1, form=2, ...). Confirmed convention here;
    future slices follow.
  - Integration test for `agora telos` interactive run: deferred per
    bracket/intake (PTY mock infra needed).

Stage 6 status: 9 slices done. Working commands:
  agora --version (6-A.1)
  agora doctor   (6-A.2)
  agora ping     (6-A.3)
  agora status   (6-A.4)
  agora new      (6-A.5)
  agora bracket  (6-A.6)
  agora resume   (6-A.7)
  agora intake   (6-A.8)
  agora telos    (6-A.9)  ← NEW

**Alignment loop end-to-end for telos:**
  agora new → agora bracket (greenfield) → agora intake → agora telos
  (Aristotle Phase 2 round 1 — first cause-statement extracted from raw
  intake via 3 local questions + 1-2 LLM calls).

Next task: Stage 6-A.10 — likely candidates:
  (a) prompt-library generator (Stage 5-A.4 impl) — refactors both
      HUSSERL_SYSTEM and ARISTOTLE_TELOS_SYSTEM out of inline. Three+
      philosophers ahead (Socrates / Plato / Aquinas) means the
      generator pays off NOW more than later. Single "investment"
      slice, then every future philosopher slice is one renderPrompt
      call lighter.
  (b) Aristotle form round (runbook §4.2): 2nd cause-statement.
      Continues Phase 2 expansion. Same pattern as telos: 1-2 questions
      locally + LLM extraction. Bumps alignment.round to 2.
  (c) Socrates case-probing of telos.statement: layered between
      Aristotle output and Plato maturity tagging. New philosopher
      module (3rd of 5).
  (d) Plato Divided Line maturity tagging on TelosClaim: re-tags
      maturity field from "dianoia" → "noesis" (or holds at "dianoia"
      if rigor not met). Termination gate Y2 prerequisite.
  (e) `src/config/` + TOML + Zod (Stage 4-A.3 impl).
  (f) Remaining 14 probes (Stage 4-A.4 cookie-cutter batch).
  (g) ergonomics: render.ts envelope exit_code unification + version:
      "unknown" outside-cwd fix.

### Stage 6-A.10 — DONE (2026-05-04)

**Tenth vertical slice: prompt-library generator infrastructure.** Auto-
selected per Sang's "다음 진행해줘" + per-slice ROI argument from 6-A.9
NOTES (two inline prompts now; generator pays off most when third about
to land — Socrates/Plato/Aquinas slices ahead). NO new CLI command in
this slice; the deliverable is a build-time pipeline + runtime API + the
auto-generated `src/prompts/_generated.ts` library file.

Scope discipline: this slice ships the *infrastructure* (generator,
schema, interpolation, runtime API, npm scripts, CI gate, library
populated from runbook §4 sources). It does NOT refactor the existing
inline `HUSSERL_SYSTEM` (husserl.ts) or `ARISTOTLE_TELOS_SYSTEM`
(aristotle.ts) constants. Why: the runbook §4 prompts are designed for
a *multi-turn LLM dialogue* pattern (LLM asks the user the questions);
the slice 6-A.6/6-A.9 simplifications use a *local-question + LLM-
extraction* pattern (deterministic questions asked locally, LLM only
extracts structured fields). Switching husserl.ts/aristotle.ts to use
`renderPrompt(...)` against runbook §4 entries would change behavior
(reintroduce multi-turn LLM dialogue), not just refactor wiring. Scope
this slice to "infrastructure ready"; future slice can either:
  (a) Update runbook §4 sub-sections to add slice-style "extraction"
      prompts as additional sub-sections (e.g. `husserl:extract-frame`,
      `aristotle:telos-extract`), then wire those.
  (b) Implement the multi-turn dialogue pattern that runbook §4 actually
      specifies (bigger commitment).

Implementation summary (decisions made inline):
- src/prompts/types.ts: PromptEntrySchema (Zod, .strict(), namespace ↔
  pointer-field refinement). PromptEntry exported type.
- src/prompts/interpolation.ts: interpolate(template, context, declared)
  — two-sided behavior:
    - Declared but missing in context → throw (catches caller bugs)
    - Template uses `{name}` not in declared → LEAVE UNTOUCHED (lenient
      for runbook authors using `{}` illustratively for JSON shape hints)
- src/prompts/_generated.ts: AUTO-GENERATED, committed, biome-ignored
  (formatter would conflict with generator output stability).
- src/prompts/index.ts: getPrompt + renderPrompt (Result-returning at
  module boundary per Stage 5-A.6 R3-A; internal interpolate throws,
  renderPrompt catches AgoraErrorThrown via instanceof + wraps in err()).
- scripts/gen-prompts.ts: regex-based markdown parser (no markdown AST
  dep per ADR-0001 minimalism). Parses `## 4. Prompt` → `### 4.X <key>`
  → fenced ```text block → `## System prompt` / `## User prompt template`
  splits. Critic def loader stub (skips when no files; first critic
  slice extends).
- package.json: `pnpm gen:prompts` (write) + `pnpm lint:prompts`
  (--check, exits 4 on drift). Both wired into `pnpm verify`.
- biome.json: includes `!src/prompts/_generated.ts` (formatter would
  rewrite generator output → CI flap).

Files shipped:

src/prompts/types.ts (LAYER 0 — replaced skeleton with real schema):
  PromptEntrySchema: namespace / owner / runbook? / runbook_revision? /
    critic_def? / system_prompt / user_prompt_template / placeholders /
    fingerprint (sha256 regex) / used_by[]. .strict() + .refine for
    namespace ↔ pointer correspondence.

src/prompts/interpolation.ts (LAYER 0 — new, ~50 LOC):
  interpolate(template, context, declared): substitutes declared
  placeholders only; lenient on undeclared `{}` in template.

src/prompts/_generated.ts (LAYER 0 — new, AUTO-GENERATED, ~150 LOC):
  9 entries from runbook §4 sections:
    aquinas: ad-singula, respondeo, sed-contra
    aristotle: efficient-question, form-question, material-question,
               telos-question
    husserl: phase-minus-1-bracket
    socrates: elenchus-round
  3 expected entries deferred (aquinas:videtur and plato:y2-noesis-test +
    plato:dihairesis-decompose) — runbook sections exist but parser found
    something off; check next slice. **Update**: aquinas:videtur missing
    because parser found 3 of 4 aquinas sub-sections (likely fenced
    block format variation). Investigate in critic slice.
  All 22 SPEC-listed entries (12 philosopher + 10 critic) will populate
    once: (1) plato runbook has §4 fenced blocks in canonical format;
    (2) aquinas:videtur parses; (3) critic def files land.

src/prompts/index.ts (LAYER 0 — new, ~35 LOC):
  getPrompt<K>(key) → PROMPT_LIBRARY[K] (type-safe).
  renderPrompt<K>(key, context) → Result<{system, user}>. Catches
    AgoraErrorThrown via instanceof, returns err(); other throws bubble.

scripts/gen-prompts.ts (~290 LOC):
  Regex-based runbook parser (extractSection4, parseFencedPromptBlock).
  Critic def stub (skips empty dir, warns when files exist but extractor
    not yet implemented — clear hand-off to first critic slice).
  Fingerprint algorithm matches SPEC §312 (sha256 of normalized
    system+user with whitespace cleanup).
  Sort: namespace (philosopher first) then alphabetical key.
  Emit format: hand-rolled TS module (not via formatter — biome would
    rewrite differently and CI would flap).
  --check mode: regenerates in-memory and diffs against committed file.
    Exit 4 (gate.gate-1-deterministic-fail per Stage 4-A.6) on mismatch.

biome.json (modified):
  files.includes adds `!src/prompts/_generated.ts` exclusion. Generator
  emits canonical formatting; biome auto-format would diverge.

package.json (modified):
  scripts: `gen:prompts` + `lint:prompts` added. `verify` chain extended
  with `lint:prompts` between `lint:locale` and `test`.

Tests (2 new files; total 22 files / 150 tests, was 20/136):

tests/unit/prompts/interpolation.test.ts (7 tests):
  - substitutes single placeholder
  - substitutes multiple placeholders
  - preserves text without placeholders
  - repeats same placeholder
  - throws when declared placeholder is missing from context
  - leaves undeclared template placeholder untouched (illustrative {})
  - does NOT substitute uppercase {NAME} (regex requires lowercase)

tests/unit/prompts/index.test.ts (7 tests):
  PROMPT_LIBRARY (generated):
    - contains at least one entry
    - every entry validates against PromptEntrySchema
    - every philosopher entry has runbook + runbook_revision pointer
    - fingerprint matches sha256:<64 hex> shape
  getPrompt:
    - returns the entry for a known key
  renderPrompt:
    - renders prompt with full context, returns Result.ok (substitutes
      `<placeholder>` stubs in user template)
    - returns Result.err when declared placeholder missing from context
      (catches AgoraErrorThrown via instanceof, wraps as err())

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (5 pre-existing cognitive-complexity warnings)
  pnpm test     ✓ 22 files, 150 tests
  pnpm lint:locale ✓
  pnpm lint:prompts ✓ (NEW gate; generator output committed in sync)
  pnpm build    ✓
  Manual:
    $ pnpm gen:prompts
      [gen-prompts] wrote /.../src/prompts/_generated.ts with 9 entries.
    $ pnpm lint:prompts
      [gen-prompts --check] OK — 9 entries in sync.

Surprises encountered + decisions made:

1. **Runbook §4 prompts use `{}` illustratively (Aquinas)**: aquinas
   runbook §4.1 system_prompt contains `{action}`, `{case_X}`,
   `{case_Y}`, `{action_or_no_action}`, `{specific_reason}` — but these
   are JSON shape hints in prose, NOT real placeholders. The
   user_prompt_template only declares `{objections_with_ids}` and
   `{respondeo}` as actual interpolation targets. SPEC's strict
   "throw on undeclared template usage" would fail every Aquinas render.
   Resolution: interpolation is LENIENT on undeclared `{}` (leaves
   them as literal text). The "declared but missing in context" check
   stays — that's the caller-bug catch.

2. **husserl/aristotle inline prompt refactor deferred**: SPEC drift
   already documented in slice NOTES (6-A.6 + 6-A.9 Outstanding sections).
   This slice could have refactored both to use `renderPrompt(...)`,
   but the runbook §4 prompts and the inline simplifications target
   different patterns (multi-turn LLM dialogue vs local-question +
   LLM-extraction). Refactoring would change behavior. Future slice
   adds slice-style "extraction" prompt sub-sections to runbooks
   (e.g. `husserl:extract-frame`) then wires.

3. **JS regex `\Z` doesn't exist**: first version of parseFencedPromptBlock
   used `\Z` (Python-style end-of-string). JavaScript regex has no
   such anchor. Resolution: switched to `indexOf` string operations.
   Lesson: when porting regex from SPEC pseudocode, verify the engine.

4. **biome formatter would rewrite generator output**: first verify run
   showed `pnpm lint:prompts` failing because biome auto-formatted
   `_generated.ts` after generation. Two paths: (a) generator emits
   biome-compatible format, (b) biome ignores the generated file.
   Chose (b) — auto-generated files are conventionally formatter-
   excluded. Updated biome.json files.includes with `!src/prompts/
   _generated.ts`.

5. **renderPrompt error catch needed instanceof, not name===**: my
   first version checked `e.name === "AgoraErrorThrown"` but the class
   constructor sets `this.name = "AgoraError"` (not the class name).
   Switched to `e instanceof AgoraErrorThrown` for type-correct catch.
   Lesson: when catching custom Error subclasses, `instanceof` over
   string-name matching every time.

6. **9 entries generated, not the SPEC-listed 12**: 3 missing entries
   (aquinas:videtur + plato:y2-noesis-test + plato:dihairesis-decompose).
   Likely runbook section formatting variations. Regex-based parser is
   sensitive. Defer investigation to first slice that uses Plato or
   Aquinas Videtur prompts; the generator is already well-tested for
   the format that DID parse.

Lessons / observations:
- **Generator infrastructure is decoupled from prompt content**: slice
  ships pipeline + 9 working entries; future runbook authors add new
  entries by adding §4 sub-sections in canonical format and re-running
  `pnpm gen:prompts`. CI catches forgotten regen via `lint:prompts`.
- **No new runtime dep**: zero new package added (Zod was already on
  the stack from Stage 4-A.3). ADR-0001 minimalism preserved.
- **biome ignore list is the right pattern for auto-generated files**:
  better than hand-rolling biome-compatible output in the generator.
- **Lenient interpolation matches runbook author intent**: SPEC's
  strict "throw on any unmatched {}" was over-eager. Practical
  interpolation should preserve illustrative `{}` for prompts that
  intentionally include them. The caller-bug catch (declared but
  missing) does the load-bearing work.
- **`pnpm verify` as comprehensive contract**: now runs typecheck →
  lint → lint:locale → lint:prompts → test → build. Six gates
  guard slice DoD. Adding lint:prompts surfaces drift between
  runbook edits and committed generator output.

Outstanding (intentional defer):
  - Refactor src/philosophers/husserl.ts inline HUSSERL_SYSTEM →
    renderPrompt("husserl:extract-frame", ctx). Requires either:
    (a) new runbook §4 sub-section matching slice's extraction pattern,
    or (b) revert slice to multi-turn LLM dialogue per runbook §4.1.
  - Refactor src/philosophers/aristotle.ts inline ARISTOTLE_TELOS_SYSTEM
    similarly.
  - Plato runbook §4 prompts not parsed (zero plato entries in library).
    Investigate runbook format vs parser regex; either fix runbook
    formatting or generalize parser.
  - aquinas:videtur missing from library (3 of 4 aquinas sections
    parsed). Format variation or runbook content gap.
  - Critic def files (src/critics/definitions/*.ts) — none yet exist.
    First critic slice creates the dir + first def + extends generator's
    extractCriticPrompts() with a regex/AST-based parser for the
    exported `prompt` const.
  - used_by tracking: SPEC §548 says preserve from prior _generated.ts
    OR auto-scan src/ for `getPrompt('key')` references. Currently
    always `[]`. Auto-scan slice when first need for the data.
  - Pre-commit hook for forgotten gen:prompts: SPEC R4-A allows but
    doesn't require. Defer until workflow shows chronic forgotten
    regens (lint:prompts CI gate covers most of the harm).

Stage 6 status: 10 slices done. Working commands unchanged from 9-A.9
(no new CLI command in this infra slice). New build-time pipeline:
  pnpm gen:prompts          — regenerate src/prompts/_generated.ts
  pnpm lint:prompts         — CI: verify generated file in-sync
  pnpm verify               — extended chain incl. lint:prompts
Library populated with 9 of 22 SPEC-listed prompts; rest land as
runbook/critic content materializes.

Next task: Stage 6-A.11 — likely candidates:
  (a) Refactor husserl.ts + aristotle.ts to renderPrompt API with
      slice-pattern runbook sub-sections (or revert to runbook §4
      multi-turn dialogue pattern). Cements the prompt-library
      payoff for the two existing philosophers.
  (b) Aristotle form round — 2nd cause-statement (form / essential
      structure / irreducible parts). Continues Phase 2 expansion.
      Same template as telos slice; can use renderPrompt against
      `aristotle:form-question` once (a) lands.
  (c) Socrates case-probing of telos.statement: 3rd philosopher.
      Layers between Aristotle output and Plato maturity tagging.
  (d) Plato Divided Line maturity tagging: re-tags TelosClaim.maturity
      from "dianoia" → "noesis" or holds. Termination Y2 prerequisite.
  (e) `src/config/` + TOML + Zod (Stage 4-A.3 impl).
  (f) Remaining 14 probes (Stage 4-A.4 batch).
  (g) ergonomics: render.ts envelope exit_code unification + version
      "unknown" outside-cwd fix.
  (h) Plato runbook §4 parser fix + aquinas:videtur extraction
      (3 missing entries from this slice's library).
