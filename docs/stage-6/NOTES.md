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

Next task: Stage 6-A.3 — pick third vertical slice. Likely candidates:
  (a) Remaining 14 probes (Tier 1+2 + Tier 3-partial) — fast follow on
      6-A.2 pattern
  (b) `src/config/` + TOML loader (Stage 4-A.3 implementation) — unblocks
      [probes].disabled wiring + many other features
  (c) `ClaudeRunner` + cli-runner subprocess (Stage 4-A.2) — unblocks
      first philosopher (Husserl) + drift_score
  (d) `src/state/` + `state.json` reader/writer (Stage 2-C.3) — needed
      before alignment loop touches phase pointer
Q3 framing follows the same Mode B pattern.
