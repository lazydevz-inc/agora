# Config Loading — Specification (Stage 4)

> **Status**: Stage 4-A in progress (opened 2026-05-03 after Stage 3 close).
> Sections marked **[SPEC]** are formally accepted Stage 4 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 4
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Config File Schema** (4-A.3) | **[SPEC]** Accepted 2026-05-03 |
| **Validation Library: Zod** (4-A.3 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Loader Algorithm + Merge** (4-A.3 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Global Config Location** (4-A.3 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Edit UX** (4-A.3 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Schema Versioning + Migration** (4-A.3 R5) | **[SPEC]** Accepted 2026-05-03 |
| **State vs Config Boundary** (4-A.3) | **[SPEC]** Accepted 2026-05-03 |
| **Environment Variable Mapping** (4-A.3) | **[SPEC]** Accepted 2026-05-03 |

---

## Config File Schema [SPEC] (Accepted 2026-05-03, Stage 4-A.3)

> **Goal**: Define the complete v1 set of config sections and keys with
> their types, defaults, and constraints. Every knob exposed by prior
> SPEC stages routes through here.

### File locations

```
.agora/config.toml         ← project (optional, git-trackable per ADR-0002)
~/.agora/config.toml       ← global (optional, R3-A)
```

Both files are **optional**. Absence is equivalent to "all defaults."

### v1 inventory (TOML)

```toml
# Top-level
version = 1                   # required when file exists, mismatch → exit 20
locale  = "en"                # "en" | "ko" (Stage 3-A.1 R5-A)

[ralph]
parallelism   = 1             # int 1..5; >5 needs --parallel-force (ADR-0008)
iteration_cap = 25            # int >= 1, hard cap default (Stage 2-B.5)

[gate_5]
threshold_ok    = 0.15        # float, 0 ≤ ok < warn < fail ≤ 1 (Stage 2-B.4)
threshold_warn  = 0.30
threshold_fail  = 0.60
z1_max_attempts = 3           # int >= 1, Z1 self-correct cap before Z2 (Stage 2-A.10)

[gates.3.critics]             # UI/UX gate (Stage 2-B.3)
enabled  = []                 # array of critic IDs to force on
disabled = []                 # array of critic IDs to suppress

[gates.4.critics]             # Tech quality gate (Stage 2-B.3)
enabled  = []
disabled = []

[probes]                      # Gate 0 probe registry (Stage 2-B.1, ADR-0006)
disabled = []                 # probe IDs to skip (e.g. ["stripe"])
forced   = []                 # probe IDs to always run regardless of detect()

[bypass_alerts]
stale_bypass_threshold_iterations = 5    # surface reminder after N iters

[preview_quality]
threshold = 0.75              # Y3 preview-quality gate (Stage 2-A.8)

[llm]                         # Defaults for ClaudeCallOptions (Stage 4-A.2)
cache_ttl_seconds = 300       # default LLMCache TTL
timeout_ms        = 60000     # default per-call timeout
retries           = 2         # default; 3 total attempts
```

### Validation rules

| Rule | Enforcement |
|------|-------------|
| `version` is `1` when file exists | required, mismatch → exit 20 (R5-A) |
| `locale ∈ {"en", "ko"}` | enum, mismatch → exit 20 (Stage 3-A.1 R5-A) |
| `[ralph].parallelism ∈ [1, 5]` | range check; >5 requires CLI `--parallel-force` (ADR-0008) |
| `[ralph].iteration_cap >= 1` | min check |
| `[gate_5]`: `0 ≤ ok < warn < fail ≤ 1` | ordered triple invariant |
| `[gate_5].z1_max_attempts >= 1` | min check |
| `[probes].disabled` ∩ `[probes].forced = ∅` | mutual exclusion |
| `[preview_quality].threshold ∈ [0, 1]` | range check |
| `[llm].timeout_ms >= 1000` | min 1s |
| `[llm].retries ∈ [0, 5]` | range check |
| Unknown keys (typos) | **rejected** by `.strict()` (Zod) — exit 20 |

All violations produce exit code 20 with the offending path + line number
(when TOML parser provides position info).

### What this schema does NOT cover

These knobs intentionally live elsewhere (see "State vs Config Boundary"):

- Bypass entries (`--skip-gate-2 --reason="..."`): persist in `.agora/state.json`
- Iteration history: `.agora/history/{session}/events.jsonl`
- Cache contents: `.agora/cache/*.json`
- Per-iteration workspaces: `.agora/iterations/{id}/`

Config holds **policy** (thresholds, defaults). State holds **history** (what
actually happened). Cache holds **memoized computation** (what was already done).

---

## Validation Library: Zod [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Single source of truth for config schema. Runtime parse +
> TypeScript type inference automatic. Unknown keys rejected.

### Decision

**Adopt Zod for config validation in Stage 4.** This brings forward the
"Zod adoption" decision that CLAUDE.md L324 had marked as "도입은 Stage 5
결정." Justification: config is the first place that needs runtime-validated
external input, and using a different library here than Stage 5+ domain
models would create dual-stack overhead.

### Schema shape

```typescript
// src/config/schema.ts
import { z } from "zod";

export const ConfigSchema = z.object({
  version: z.literal(1),
  locale: z.enum(["en", "ko"]).default("en"),

  ralph: z.object({
    parallelism: z.number().int().min(1).max(5).default(1),
    iteration_cap: z.number().int().min(1).default(25),
  }).default({}),

  gate_5: z.object({
    threshold_ok: z.number().min(0).max(1).default(0.15),
    threshold_warn: z.number().min(0).max(1).default(0.30),
    threshold_fail: z.number().min(0).max(1).default(0.60),
    z1_max_attempts: z.number().int().min(1).default(3),
  }).refine(
    g => g.threshold_ok < g.threshold_warn && g.threshold_warn < g.threshold_fail,
    { message: "gate_5 thresholds must satisfy ok < warn < fail" },
  ).default({}),

  gates: z.object({
    "3": z.object({
      critics: z.object({
        enabled: z.array(z.string()).default([]),
        disabled: z.array(z.string()).default([]),
      }).default({}),
    }).default({}),
    "4": z.object({
      critics: z.object({
        enabled: z.array(z.string()).default([]),
        disabled: z.array(z.string()).default([]),
      }).default({}),
    }).default({}),
  }).default({}),

  probes: z.object({
    disabled: z.array(z.string()).default([]),
    forced: z.array(z.string()).default([]),
  }).refine(
    p => p.disabled.every(id => !p.forced.includes(id)),
    { message: "probes.disabled and probes.forced must be disjoint" },
  ).default({}),

  bypass_alerts: z.object({
    stale_bypass_threshold_iterations: z.number().int().min(1).default(5),
  }).default({}),

  preview_quality: z.object({
    threshold: z.number().min(0).max(1).default(0.75),
  }).default({}),

  llm: z.object({
    cache_ttl_seconds: z.number().int().min(0).default(300),
    timeout_ms: z.number().int().min(1000).default(60_000),
    retries: z.number().int().min(0).max(5).default(2),
  }).default({}),
}).strict();   // ← unknown top-level keys rejected

export type Config = z.infer<typeof ConfigSchema>;
```

`.strict()` at the top level rejects typos (`[ralh]` → error) so misspelled
sections cannot silently fall through to defaults. Inner objects are also
strict via Zod's default behavior on `z.object`.

### When validation runs

- **Once per process**, eagerly, immediately after the merge step
- Result is cached for the process duration (re-load requires restart)
- Validation failure → `exit(20)` with structured error message

### Error output format

```
agora: error: config validation failed
  file: .agora/config.toml (line 8 if available)
  path: gate_5.threshold_warn
  issue: must be > gate_5.threshold_ok (0.15)
  saw:   0.10
  hint:  See https://github.com/lazydevz-inc/agora/blob/main/docs/infra/config.md
```

JSON mode (`--json`) emits the same data as the standard JSON envelope's
`errors[]` entry with `code = "config_invalid_state_json"` (per Stage 3-B.5).

### Result type

Loader **throws** on validation failure (caught by CLI entry point → exit 20).
Stage 5 may introduce `Result<T, E>` (per CLAUDE.md L327 deferral); when it
lands, the loader's throw is converted to `Result.err` in one place.

R1-B (defer to Stage 5 with placeholder type-guard) rejected: would require
rewriting the loader twice and exposes a 4-stage validation gap to users.
R1-C (no validation, best-effort coercion) rejected: silent default
fall-through is the exact failure mode Sang's biased-product principle exists
to prevent.

---

## Loader Algorithm + Merge [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Combine the 5 layers (default / global / project / env / CLI)
> using key-level deep merge so partial overrides survive.

### Algorithm

```
load_config(opts):
  layers = [
    DEFAULTS,                                              // ConfigSchema.parse({})
    read_toml_or_empty(~/.agora/config.toml),              // global, R3-A
    read_toml_or_empty(opts.config_path
                       ?? cwd/.agora/config.toml),         // project (or --config override)
    parse_env(process.env, prefix = "AGORA_"),             // env vars, see mapping below
    cli_flags_normalized(opts.parsed_argv),                // already parsed
  ]
  merged = deep_merge_per_section(...layers)
  return ConfigSchema.parse(merged)                        // throw → exit 20
```

### `deep_merge_per_section` semantics [R2-A]

```
deep_merge_per_section(...layers):
  result = {}
  for layer in layers (in order, lowest → highest priority):
    for top_key in layer:
      if top_key is a table (e.g. [ralph]):
        result[top_key] = { ...result[top_key], ...layer[top_key] }
      else:
        result[top_key] = layer[top_key]
  return result
```

Worked example:

```
DEFAULTS:        ralph = { parallelism: 1, iteration_cap: 25 }
~/.agora/...:    ralph = { iteration_cap: 30 }                    # global override
.agora/...:      ralph = { parallelism: 3 }                       # project override
env:             (AGORA_RALPH_PARALLELISM unset)
cli:             (no --parallel)

→ merged.ralph = { parallelism: 3, iteration_cap: 30 }
```

Both keys survive because each higher-priority layer only overrode one key.

### Why per-section, not whole-section replace

R2-B (section-level replace) would mean: a project file with just
`[ralph] parallelism = 3` would wipe out the global's `iteration_cap = 30`.
That violates user expectation: "I'm changing parallelism, not erasing my
other settings."

R2-C (top-level replace) is even more destructive — global config becomes
inert the moment any project config exists.

### Arrays

Arrays do NOT deep-merge. Higher-priority layer's array **replaces** lower's:

```
~/.agora/...:    probes.disabled = ["stripe"]
.agora/...:      probes.disabled = ["clerk"]

→ merged.probes.disabled = ["clerk"]    # project replaces global
```

To union across layers, the user explicitly lists both:
`.agora/...: probes.disabled = ["stripe", "clerk"]`.

This avoids the silent-accumulation surprise where a global setting
permanently leaks into every project.

---

## Global Config Location [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Predictable, single global config path. No XDG indirection.

### Decision

```
~/.agora/config.toml      ← global config, always
```

No XDG_CONFIG_HOME respect. Rationale:

- Stage 4-A.1 install banner already commits to `~/.agora/.first_run`
  marker and `~/.agora/cache/` for non-project caches → keeping `config.toml`
  in the same parent directory is consistent.
- Predictability: one path to remember, document, and grep for.
- macOS (Sang's primary platform) does not use XDG conventions natively.

### Override mechanism

Per-invocation override is via `--config=<path>` (Stage 3-A.3 spec). That
flag replaces the **project** slot only — global is still consulted.

To suppress global config entirely, use a project file containing
`version = 1` and nothing else (loader still reads global, but every
project-level key wins via merge).

R3-B (XDG respect) rejected: macOS divergence, two-path complexity, and
no concrete user benefit at v1.
R3-C (try both, first wins) rejected: hardest to debug ("why is my config
ignored?" → answer requires explaining lookup order).

---

## Edit UX [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Edit config without adding an 8th `agora` subcommand.

### Decision: direct file edit + `agora doctor` validation

```bash
$ $EDITOR .agora/config.toml          # any editor; we don't wrap
$ agora doctor                        # validates + reports issues
$ agora doctor --explain-config       # shows merged effective config
```

**No `agora config` subcommand.** The 7-cmd cap (ADR-0001 + Stage 1) is
hard. `$EDITOR` already does file editing better than any wrapper Agora
could ship.

### `agora doctor --explain-config` output

Subflag added to existing `agora doctor` (Stage 3-B.1). Renders:

- Merged effective config (post-validation)
- Per-key provenance: which layer (default / global / project / env / cli)
  contributed each value
- Validation status (or first error if invalid)

Example:

```
Config (effective after merge):

  version           = 1                  [project]
  locale            = "ko"               [env: AGORA_LOCALE]
  ralph.parallelism = 3                  [project]
  ralph.iteration_cap = 30               [global]
  gate_5.threshold_ok = 0.15             [default]
  gate_5.threshold_warn = 0.30           [default]
  gate_5.threshold_fail = 0.60           [default]
  ...
  probes.disabled   = ["stripe"]         [global]
  llm.timeout_ms    = 60000              [default]

Sources:
  default                                 (baked in)
  ~/.agora/config.toml                    (loaded)
  /Users/sang/Developer/foo/.agora/config.toml  (loaded)
  env: AGORA_LOCALE=ko                    (1 var)
  cli: (no overrides for this invocation)
```

### Forbidden

R4-B (add `agora doctor --edit-config` subflag that spawns `$EDITOR`)
rejected: redundant with `$EDITOR .agora/config.toml`. We are not adding
ergonomic wrappers around shell built-ins.

R4-C (8th command `agora config get/set/edit`) rejected: breaks 7-cmd cap.
Adding it requires a new ADR superseding Stage 1's hard cap. Not justified
at v1 scale.

---

## Schema Versioning + Migration [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Make schema evolution safe without auto-rewriting user files.

### Required `version` field

Every config file MUST contain `version = 1` at the top level. Files without
`version` (or with mismatch) fail validation:

```
agora: error: config schema version mismatch
  file:    .agora/config.toml
  found:   (no version field)  OR  version = 2
  expected: version = 1
  hint:    Run 'agora doctor --explain-config' to see migration steps,
           or read https://github.com/lazydevz-inc/agora/blob/main/docs/infra/config.md#migrations
```

Exit code 20.

### Future migration policy

When a future Agora release introduces v2:

1. `agora doctor` detects v1 file + emits **structured migration diff**:

   ```
   Config schema migration: v1 → v2

   Required changes to .agora/config.toml:
     - rename [gate_5].threshold_ok  →  [gate_5].drift_threshold_ok
     - remove [bypass_alerts].stale_bypass_threshold_iterations
     - add    [bypass_alerts].stale_after_iterations = <new_default>

   Apply manually, then run 'agora doctor' to verify.
   ```

2. **Manual rewrite required**. Agora does not auto-migrate at v1.
3. After Sang applies the diff, validation passes and `agora <command>`
   resumes normal operation.

### Why manual

R5-B (auto-migrate, in-place rewrite) rejected:
- Surprise behavior: user sees a git diff they didn't author
- Failure modes (partial write, format drift, comment loss) too costly when
  the user base is one person
- Once user count grows past Sang, an `agora migrate` flow can be added with
  full ADR justification

R5-C (no version field, silent best-effort merge) rejected: defeats the
entire purpose of having a schema. Schema drift would compound silently
across releases.

### Bumping `version` (Agora release process — Stage 6+)

When breaking schema changes ship:
- Bump `ConfigSchema.version` literal in code
- Document the migration in this file's "Migrations" appendix (added when
  v2 ships)
- Release notes call out the migration prominently

---

## State vs Config Boundary [SPEC] (Accepted 2026-05-03)

> **Goal**: Clarify which files the config loader owns vs which belong to
> other subsystems (state machine, cache layer, history log).

### Owned by Config Loader (this SPEC)

```
.agora/config.toml      ← project config (this SPEC)
~/.agora/config.toml    ← global config (this SPEC)
```

### NOT owned by Config Loader

| File | Owner | Defined in |
|------|-------|------------|
| `.agora/seed.md` / `seed.json` | Alignment Loop | Stage 2-A.8 (X3 output) |
| `.agora/ac_tree.json` | Plato Dihairesis | Stage 2-C.1 |
| `.agora/state.json` | Single phase pointer + bypass records | Stage 2-C.3 R1-A |
| `.agora/ralph_state.json` | Ralph engine | Stage 2-B / ADR-0008 |
| `.agora/iterations/{id}/` | Per-iteration workspace | ADR-0008 |
| `.agora/history/{session}/events.jsonl` | Append-only audit | Stage 2-C.3 R2-A |
| `.agora/cache/gate0_results.json` | Probe cache (5min TTL) | Stage 2-B.1 |
| `.agora/cache/drift_scores.json` | Drift cache (1h TTL) | Stage 2-B.4 |
| `.agora/cache/llm_responses.json` | LLM response cache | Stage 4-A.2 |
| `.agora/logs/` | Session logs | (gitignored) |

### Bypass records — interesting boundary

`--skip-gate-2 --reason="..."` (Stage 2-B.7) creates a **bypass record**.
That record persists across Ralph sessions (re-displayed at every Ralph
start with stale-bypass alerts). Where does it live?

**It lives in `.agora/state.json` metadata**, NOT in `config.toml`.

Config is for **policy** (thresholds, defaults). State is for **history**
(what the user did, what gates were skipped, what was bypassed and why).

`config.toml`'s `[bypass_alerts]` only holds the **threshold** (when to
remind), not the **records** (what bypasses are active).

Reset commands (`--reset-bypasses`, `--reset-bypass=<id>`, `--reset-cap`)
mutate state, not config.

### Cache TTLs — config vs cache layer

`config.toml [llm].cache_ttl_seconds` is the **default** TTL for
`ClaudeCallOptions` (Stage 4-A.2). Per-call overrides via
`opts.cache_ttl_seconds` win. The cache file itself
(`.agora/cache/llm_responses.json`) is owned by the LLM cache layer
(Stage 4-A.2), not the config loader.

Probe cache TTL (`gate0_results.json`, 5min) is currently hardcoded
(Stage 2-B.1). It is intentionally **not exposed to config.toml** at v1 —
the 5-minute window is part of Gate 0's contract; opening it to user
override would surface "why are my probes stale?" debugging cases.

---

## Environment Variable Mapping [SPEC] (Accepted 2026-05-03)

> **Goal**: Standardize how `AGORA_*` env vars map onto config keys.

### Naming convention

```
config key                     env var
────────────────────────────────────────────────────────────
locale                         AGORA_LOCALE              (Stage 3-A.3)
ralph.parallelism              AGORA_RALPH_PARALLELISM
ralph.iteration_cap            AGORA_RALPH_ITERATION_CAP
gate_5.threshold_ok            AGORA_GATE_5_THRESHOLD_OK
gate_5.threshold_warn          AGORA_GATE_5_THRESHOLD_WARN
gate_5.threshold_fail          AGORA_GATE_5_THRESHOLD_FAIL
preview_quality.threshold      AGORA_PREVIEW_QUALITY_THRESHOLD
llm.cache_ttl_seconds          AGORA_LLM_CACHE_TTL_SECONDS
llm.timeout_ms                 AGORA_LLM_TIMEOUT_MS
llm.retries                    AGORA_LLM_RETRIES
```

Algorithm: replace `.` with `_`, uppercase, prefix with `AGORA_`.

### Type coercion

TOML values are typed; env values are strings. Coercion rules:

| Schema type | Env handling |
|-------------|--------------|
| `number` | `Number(value)` — fail validation if NaN |
| `boolean` | `"true"`, `"1"` → true; `"false"`, `"0"` → false; else fail |
| `string` | as-is |
| `enum` | as-is, validated against enum |
| `array` | `value.split(",")`, then per-element coercion |

### What env CANNOT set

Sections containing only complex/array fields are best edited via TOML, not
env. The env interface intentionally covers **scalar overrides** (numbers,
strings, enums) — the cases where ad-hoc CI overrides matter.

For `[probes].disabled` etc., use TOML in CI:
`agora ralph --config=./ci.config.toml`.

### Existing non-AGORA conventions preserved

| Variable | Meaning | Source |
|----------|---------|--------|
| `NO_COLOR` | Disable ANSI color | Standard (no-color.org), Stage 3-A.3 |
| `AGORA_JSON` | Force JSON output | Stage 3-A.3 |
| `AGORA_QUIET` | Suppress warnings | Stage 3-A.3 |
| `AGORA_VERBOSE` | Extra debug output | Stage 3-A.3 |
| `LANG` | Locale fallback (read by `--locale` resolution) | Stage 3-A.3 |
| `ANTHROPIC_API_KEY` | SDK fallback runtime selection | ADR-0005 |
| `EDITOR` / `VISUAL` | Used by user when editing config | (system) |

These are **not** mirrored into `config.toml`. They are CLI/runtime
conventions, not project policy.

---

## Boundaries

- ❌ Schema validation deferred to Stage 5 (R1-B rejected): too long a gap
  for users to hit silent typos.
- ❌ No validation (R1-C rejected): silent default fall-through is the
  exact failure mode Sang's biased-product principle prevents.
- ❌ Section-level or top-level replace (R2-B/C rejected): partial overrides
  must survive; merge granularity is per key.
- ❌ XDG_CONFIG_HOME (R3-B rejected): macOS divergence + no concrete benefit.
- ❌ Try-both global paths (R3-C rejected): debugging nightmare.
- ❌ `agora doctor --edit-config` subflag (R4-B rejected): redundant with `$EDITOR`.
- ❌ 8th command `agora config get/set/edit` (R4-C rejected): breaks 7-cmd cap.
- ❌ Auto-migration on schema version bump (R5-B rejected): surprise rewrite.
- ❌ No `version` field (R5-C rejected): silent schema drift.
- ❌ Array deep-merge across layers: silent accumulation surprise; arrays replace.
- ❌ Bypass records in `config.toml`: those are state, not policy.
- ❌ Probe cache TTL config knob: 5-minute window is contract, not preference.

## Failure modes specifically guarded

- **Silent typo (`[ralh]` instead of `[ralph]`)**: `.strict()` rejection at
  validation — exit 20 with the offending key name.
- **Threshold inversion (warn < ok)**: refined Zod check, exit 20 with the
  invariant message.
- **Schema drift across releases**: `version` field required, mismatch fails
  fast with migration hint.
- **Global setting permanently leaking into every project**: array replace
  semantics; user must explicitly include the global value if they want it.
- **Surprise auto-rewrite**: explicitly forbidden — migration is manual at v1.
- **Bypass records vanishing on config reset**: bypass records live in
  state.json, not config.toml; resetting config does not clear bypasses
  (and vice-versa: `--reset-bypasses` does not touch config).
- **Process-mid config change ignored without warning**: load happens once
  per process — no in-process re-load. To pick up a new config, restart.
  This matches Stage 4-A.2's runtime-selection-once-per-process semantics.

## Output consumed by

- **Every Stage 2 SPEC's tunable**: `[ralph]`, `[gate_5]`, `[gates.3.critics]`,
  `[gates.4.critics]`, `[probes]`, `[bypass_alerts]`, `[preview_quality]` —
  all read their defaults from here.
- **Stage 4-A.2 LLM runtime**: `[llm].cache_ttl_seconds / timeout_ms / retries`
  populate `ClaudeCallOptions` defaults.
- **Stage 3-A.3 precedence chain**: this loader IS the project + global
  config layer in `CLI > env > project > global > default`.
- **Stage 3-B.1 `agora doctor`**: `--explain-config` subflag renders merged
  config + provenance.
- **Stage 3-B.5 `agora resume`**: exit code 20 on corrupt state includes
  config validation failures.
- **Stage 6 implementation**: TypeScript module `src/config/` exposes
  `loadConfig(opts) → Config` and the Zod schema.

---

## Next sections (still OPEN in this document)

This document covers Stage 4-A.3 (Config Loading). Other Stage 4 sub-questions
land in adjacent infra docs:

- `docs/infra/probes.md` — Stage 4-A.4 (probe registry implementation)
- `docs/infra/llm-integration.md` — Stage 4-A.5 (MCP server design — adds
  to existing 4-A.2 doc)
- (Cross-cutting) — Stage 4-A.6 (error handling + telemetry) — likely
  woven into the above

### Migrations appendix (added when v2 schema ships)

(currently empty — v1 is the active schema)
