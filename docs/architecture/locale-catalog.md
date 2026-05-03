# Locale Catalog — Specification (Stage 5)

> **Status**: Stage 5-A.5 (Accepted 2026-05-03).
> Sections marked **[SPEC]** are formally accepted Stage 5 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 5
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **File Format + Storage** (5-A.5 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Key Naming Convention** (5-A.5 R2) | **[SPEC]** Accepted 2026-05-03 |
| **JSON Structure** (5-A.5 R3) | **[SPEC]** Accepted 2026-05-03 |
| **CI Parity Assertion** (5-A.5 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Prompt Library Boundary** (5-A.5 R5) | **[SPEC]** Accepted 2026-05-03 |
| **Lookup API + Catalog Loading** (5-A.5) | **[SPEC]** Accepted 2026-05-03 |
| **Initial Catalog Scaffold (Stage 6 contract)** (5-A.5) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope vs Inherited Decisions

| Inherited | Source |
|-----------|--------|
| Two locales (en + ko) bundled at v1 | Stage 3-A.1 R5-A |
| `--locale=<code>` CLI flag, `AGORA_LOCALE` env var | Stage 3-A.3 |
| F1 forbidden pattern — locale validation, no Korean typos | Stage 1 (alignment-loop.md) |
| All error messages + fix instructions live in catalog | Stage 4-A.6 R5-A |
| `localized(key, ctx)` lookup with `{var}` interpolation | Stage 4-A.6 R5-A (sketched; this SPEC pins the contract) |
| CI must assert en/ko keysets identical | Stage 4-A.6 R5-A |
| **No silent English fallback for ko locale** (F1 enforcement) | Stage 4-A.6 R5-A + Boundaries |
| ERROR_CATALOG entries reference `message_key` + `fix_key` strings | Stage 4-A.6 R1-A |
| `messages/` directory at repo root, ships in npm `files` | Stage 4-A.1 |
| `src/i18n/` module is LAYER 0 (zero inward dep) | Stage 5-A.1 |
| Dependency minimalism — no i18next or heavy i18n lib | ADR-0001 |
| Single `@/*` path alias only — no per-area aliases | Stage 5-A.1 R5-A |

This SPEC pins:
- Exact JSON structure + key conventions
- Exact `localized()` algorithm + missing-key behavior
- Exact CI lint script (`pnpm lint:locale`) checks
- Boundary between user-facing catalog content and LLM-facing prompt library

---

## File Format + Storage [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: JSON at repo root. Native parse, zero new deps, sane bundling.

### Decision

```
messages/                                # repo root (per Stage 4-A.1 install.md)
├── en.json                              # English (default fallback locale only via setLocale)
└── ko.json                              # Korean (Sang's primary)
```

Both files are bundled into `dist/` at build time via TypeScript JSON
import (`resolveJsonModule: true` is already set in `tsconfig.json`).
The relative import path from `src/i18n/catalog.ts` is `../../messages/en.json`
and `../../messages/ko.json`.

Stage 4-A.1's `npm files: ["dist", "messages", "probes", ...]` array
is preserved unchanged. `messages/` continues to ship in the npm
package — even though dist/ already contains the bundled content,
shipping the source JSON gives users a clear file to reference for
locale customization (out-of-scope at v1; documented for future).

### Why JSON

- **Native parse** — `JSON.parse` is Node stdlib. Zero new deps.
- **Build-time import** — `import enCatalog from "../../messages/en.json"`
  works with TypeScript `resolveJsonModule: true`. No runtime FS read,
  no startup cost beyond the bundled object literal.
- **i18n-tool compatible** — community translation tools (Crowdin, Lokalise,
  Transifex) all accept JSON natively. Future-proof for non-Sang
  translators.
- **Diff-friendly** — string changes show as standard string-literal diffs.
- **Multi-line minor pain** — error messages are typically short; the
  occasional long string uses `\n` escape. Acceptable trade-off.

### Why repo root, not `src/i18n/messages/`

- Stage 4-A.1 already committed to `messages/` at repo root (npm files
  + first-run banner reads it for env-check messaging).
- Repo-root visibility makes locale files discoverable for human readers
  who scan top-level structure.
- Single new path alias was rejected by Stage 5-A.1 R5-A (no per-area
  aliases). Relative path `../../messages/<locale>.json` from
  `src/i18n/catalog.ts` is the simpler answer.

R1-B (TypeScript modules, e.g. `messages/en.ts` exporting nested object)
rejected: type-safe but build pipeline complicates with each locale
addition; community translation tools don't speak TS; locked in to TS
runtime even for tools that just want strings.
R1-C (TOML / YAML) rejected: parser dep + no native parse benefit.

---

## Key Naming Convention [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Dot-segmented namespace; snake_case within segments;
> hierarchy mirrors source-of-truth structure.

### Format

```
<top_namespace>.<sub_namespace>.<key>
[<top_namespace>.<sub_namespace>.<key>.fix]   ← convention for fix-instruction pairs
```

### Top-namespace allocations (v1)

| Top-namespace | Sub-namespace pattern | Used by |
|---------------|------------------------|---------|
| `errors` | `errors.<category>.<code>` (mirrors Stage 4-A.6 ERROR_CATALOG) | Every `buildAgoraError` call |
| `philosophers` | `philosophers.<owner>.<key>` (mirrors runbook owner) | Stage 5-A.3 runbook section 9 file maps |
| `cli` | `cli.<command>.<key>` for per-command + `cli.global.<key>` for shared | All CLI commands per Stage 3-B |
| `probes` | `probes.<probe_id>.<key>` | Probe doctor output, fix instructions |
| `gates` | `gates.gate_<n>.<key>` | Ralph gate failure messages |
| `alignment` | `alignment.<phase>.<key>` | Alignment Loop phase prompts to user |
| `ralph` | `ralph.<key>` | Ralph orchestrator user-facing strings |

### Naming rules

- Segments are `snake_case` (lowercase + underscores between words).
  `errors.config.missing_version` ✓ / `errors.config.missingVersion` ✗
- No camelCase or kebab-case in segments.
- `.fix` is the **only reserved suffix** at v1 — actionable fix paired
  with a main message (Stage 4-A.6 R5-A pattern).
  - Example: `errors.config.missing_version` + `errors.config.missing_version.fix`
- Segment depth max 4 (`a.b.c.d`). Beyond that, flatten — depth signals
  over-organization.
- Reserved top-namespaces (do not introduce siblings without ADR):
  `errors`, `philosophers`, `cli`, `probes`, `gates`, `alignment`, `ralph`
- New top-namespace requires SPEC update + this section additions.

### Examples (canonical inventory will land in Stage 6)

```
errors.config.missing_version
errors.config.missing_version.fix
errors.llm.auth_failed
errors.llm.auth_failed.fix
errors.gate.gate_1_fail
errors.internal.uncaught
errors.internal.uncaught.fix

philosophers.husserl.bracket_intro
philosophers.husserl.bracket_software_alt_prompt
philosophers.aristotle.telos_q1
philosophers.aristotle.telos_q2
philosophers.aristotle.telos_q3

cli.global.help_intro
cli.global.version_format
cli.doctor.banner_title
cli.doctor.universal_section
cli.doctor.project_section
cli.doctor.disabled_section
cli.ralph.gate_passing
cli.ralph.gate_failing

probes.claude.fix
probes.gh.fix
probes.vercel.fix

gates.gate_5.fail_summary

alignment.phase_minus_1.intro
alignment.phase_2.round_n_intro

ralph.iteration_n_intro
ralph.complete_summary
```

R2-B (flat keys without dot-namespace, e.g. `errors_config_missing_version`)
rejected: search for "all errors.config.*" requires regex; namespace lost
visually.
R2-C (camelCase or PascalCase keys) rejected: i18n convention is
snake_case or dot.case; mixing camelCase loses tooling compat.

---

## JSON Structure [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Nested object structure for human readability, with `.fix`
> as flat leaf string key (not nested deeper).

### Decision

```json
// messages/en.json
{
  "errors": {
    "config": {
      "missing_version": "Config file at {file} has no `version` field. v1 requires `version = 1`.",
      "missing_version.fix": "Add `version = 1` at the top of {file}.",
      "version_mismatch": "Config schema version mismatch in {file}: found {found}, expected {expected}.",
      "version_mismatch.fix": "Run `agora doctor --explain-config` to see migration steps, or read https://github.com/lazydevz-inc/agora/blob/main/docs/infra/config.md#migrations",
      "unknown_key": "Unknown config key `{path}` in {file} (line {line}).",
      "threshold_inversion": "Section {section} thresholds must satisfy ok < warn < fail. Saw {values}.",
      "disabled_forced_overlap": "[probes].disabled and [probes].forced must be disjoint. Overlap: {overlap_ids}.",
      "invalid_toml": "Failed to parse TOML in {file} (line {line}, column {column}): {parser_message}",
      "path_not_found": "Config path {file} does not exist."
    },
    "llm": {
      "auth_failed": "Claude authentication failed: {detail}",
      "auth_failed.fix": "Run `claude login` to authenticate, or set ANTHROPIC_API_KEY for SDK fallback.",
      "rate_limited": "Rate limited by Claude API: {detail}",
      "timeout": "Claude call exceeded {timeout_ms}ms timeout.",
      "invalid_response": "Claude returned invalid response: {detail}",
      "no_runner_available": "Neither claude CLI nor ANTHROPIC_API_KEY is available.",
      "no_runner_available.fix": "Install Claude Code (https://claude.com/claude-code) OR set ANTHROPIC_API_KEY.",
      "internal_error": "Internal error in LLM runner: {detail}"
    },
    "...": "..."
  },
  "philosophers": { "...": "..." },
  "cli": { "...": "..." }
}
```

### Why hybrid (nested + flat-leaf-with-dots)

- **Nested for sections** — `errors.config.*` group under `{ errors: { config: {...} } }`.
  Easy to scan visually.
- **`.fix` as flat leaf string key** — `"missing_version.fix": "..."` is
  stored as a leaf with the literal `.fix` in the key name, NOT as
  `{ missing_version: { fix: "..." } }`.
- **Why this hybrid** — the convention `errors.config.missing_version.fix`
  reads naturally, but storing it as a nested object requires the message
  itself to live at `missing_version.message` (or similar), bloating every
  entry. Flat leaf preserves the natural-reading dot path while keeping
  the JSON structure clean.

### Lookup algorithm with this hybrid

```typescript
function lookupKey(catalog: any, dottedKey: string): string | undefined {
  // First try: full dotted key as flat leaf at the deepest possible level.
  // Walk the nested object until we either find the leaf or exhaust segments.
  const segments = dottedKey.split(".");
  let cursor: any = catalog;
  for (let i = 0; i < segments.length; i++) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    // Try matching the rest as a flat leaf key.
    const remainingKey = segments.slice(i).join(".");
    if (typeof cursor[remainingKey] === "string") return cursor[remainingKey];
    // Otherwise descend.
    cursor = cursor[segments[i]!];
  }
  return undefined;
}
```

Worked examples:
- `errors.config.missing_version` → `catalog.errors.config["missing_version"]` ✓
- `errors.config.missing_version.fix` → tried at depth 3 as `catalog.errors.config["missing_version.fix"]` ✓
- `errors.config.foo.bar` → not found, returns `undefined`

R3-B (pure flat keys: `{ "errors.config.missing_version": "..." }`) rejected:
JSON object with 200+ flat keys at top level loses visual grouping;
human translators have no orientation.
R3-C (pure nested without flat-leaf-with-dots): `.fix` would have to be
under each message (`{ missing_version: { message: "...", fix: "..." } }`),
adding boilerplate to every entry; deviates from Stage 4-A.6's natural
convention `<key>.fix`.

---

## CI Parity Assertion [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: One lint script verifies en/ko parity + ERROR_CATALOG cross-ref +
> placeholder consistency.

### Command

```bash
pnpm lint:locale     # CI step; also locally invokable
```

### Three checks

#### Check 1: en/ko keyset parity (F1 enforcement)

```
1. Load both messages/en.json and messages/ko.json
2. Recursively flatten to dotted-key lists:
   - Nested object descent
   - Flat-leaf-with-dots preserved as single key (`missing_version.fix`)
3. set_diff_a = keys_in_en - keys_in_ko
4. set_diff_b = keys_in_ko - keys_in_en
5. If either set_diff is non-empty:
   exit 4 with structured listing:
     "Missing in ko.json (N keys): <list>"
     "Missing in en.json (M keys): <list>"
6. Else: pass.
```

This is the **load-bearing F1 check**. Korean users must never see English
fallback — every key must exist in both.

#### Check 2: ERROR_CATALOG cross-reference

```
1. Import ERROR_CATALOG from src/errors/codes.ts
2. For every entry, collect (message_key, fix_key) pairs (fix_key optional)
3. For each message_key/fix_key:
   - Verify it exists in en.json
   - Verify it exists in ko.json
4. If any missing:
   exit 4 with:
     "ERROR_CATALOG references key '<key>' (from code '<code>') not in <locale>.json"
```

Stage 4-A.6 catalog cannot reference keys that don't exist in catalogs.

#### Check 3: Placeholder consistency

```
1. For each key present in both locales:
2. Extract {placeholder} names from both en and ko strings
3. Compute set difference
4. If non-empty:
   exit 4 with:
     "Placeholder mismatch at '<key>':
        en uses: {placeholder_set_en}
        ko uses: {placeholder_set_ko}
        diff: <added/removed>"
```

A Korean translator who drops `{file}` or adds `{날짜}` (a placeholder
not declared in en) breaks runtime interpolation.

### Exit code semantics

All three checks share exit code 4 (gate failure per Stage 4-A.6 ERROR_CATALOG
`gate.gate-1-deterministic-fail`). Output is structured (one section per
failed check) so PR reviewer sees all issues in one run.

### When to run

- CI per pull request (alongside `pnpm typecheck`, `pnpm lint`, `pnpm test`)
- Locally before commit (developer responsibility; not enforced as
  pre-commit hook at v1 — same minimalism rationale as Stage 5-A.4 R4-A)

R4-B (TypeScript-level catalog with typed-key Record) rejected: requires
build step to generate typed catalogs from JSON; fights R1-A JSON choice.
R4-C (runtime check on app startup) rejected: production discovery is
too late; dev iteration on locale changes becomes slow because errors
surface only on first execution.

---

## Prompt Library Boundary [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Catalog and prompt library are separate concerns. Catalog =
> user-facing strings. Prompt library = LLM-facing strings. They almost
> never overlap.

### Decision

**Prompts are English-only at v1.** Stage 5-A.4's `PROMPT_LIBRARY` entries
have `system_prompt` and `user_prompt_template` as English strings. LLMs
are most capable in English; multi-locale prompt sets would explode the
fingerprint check + revision tracking complexity.

LLM responses (which DO get rendered to the user) flow through the render
layer; user-facing portions come from the catalog when locale-dependent
formatting is needed.

### Where they intersect (the small overlap)

Prompt placeholders may carry catalog-resolved values:

```typescript
// src/alignment/phase-minus-1.ts
import { renderPrompt } from "@/prompts";
import { localized } from "@/i18n";

const { system, user } = renderPrompt("husserl:phase-minus-1-bracket", {
  raw_intent: input.raw_intent,
  software_alternative_for_this_intent: localized(
    "philosophers.husserl.bracket_software_alt_prompt",
    { intent_topic: input.topic },
  ),
  // ... other placeholders
});
```

The English prompt template stays English; the Korean user gets a Korean
alternative phrased to fit Husserl's bracketing pattern. The LLM still
receives English-structured prompt with one Korean string embedded as
content (Claude handles mixed-language content fine).

### Boundary rules

| Lives in catalog | Lives in prompt library |
|------------------|--------------------------|
| Error messages user sees | LLM system + user templates |
| CLI help text, banner, status output | Critic objection prompts |
| Doctor output sections + headers | Aquinas Disputatio stage prompts |
| Locale-aware placeholder values for prompts | Prompt structural rules ("Hard rules: 1...") |
| Phase intro / outro user-facing strings | Prompt placeholders' SHAPE (the `{name}` markers) |

### Boundary rejections

- ❌ Translating prompt templates to ko (R5-B): fingerprint × 2, revision
  tracking complicated, no evidence Claude responds better to ko prompts.
- ❌ Splitting prompt content between catalog and library (R5-C): blurs
  the source-of-truth boundary; reviewer can't tell which file canonical.
- ❌ Catalog containing LLM prompt structural text: catalog is not the
  place to define `system_prompt` content.
- ❌ Prompt library entries with localized template text: explicitly
  English-only at v1; revisit only if real evidence ko prompts perform
  better.

R5-B (multi-locale prompts) rejected (above).
R5-C (placeholder-injected localized prompts as primary mechanism) rejected:
that's R5-A's *exception case* (small overlap), not the *primary mechanism*.
The primary mechanism is the strict separation.

---

## Lookup API + Catalog Loading [SPEC] (Accepted 2026-05-03)

> **Goal**: Pin the exact `localized()` contract that Stage 4-A.6 sketched
> + handle the missing-key edge case without circular dependency.

### Module shape

```typescript
// src/i18n/catalog.ts
import enCatalog from "../../messages/en.json";
import koCatalog from "../../messages/ko.json";

const CATALOGS = { en: enCatalog, ko: koCatalog } as const;

export type Locale = keyof typeof CATALOGS;
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ko"];

export function loadCatalog(locale: Locale) {
  return CATALOGS[locale];
}

export function lookupKey(
  catalog: unknown,
  dottedKey: string,
): string | undefined {
  // (per Section "JSON Structure" algorithm)
}
```

```typescript
// src/i18n/index.ts
import { CATALOGS, type Locale, lookupKey } from "./catalog.ts";

let currentLocale: Locale = "en";   // default; CLI entry overrides per
                                     // Stage 3-A.3 precedence

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function localized(
  key: string,
  ctx?: Record<string, string>,
): string {
  const catalog = CATALOGS[currentLocale];
  const template = lookupKey(catalog, key);
  if (template === undefined) {
    // Missing-key edge case — see "Circular dependency note" below
    throw makeMissingKeyError(key, currentLocale);
  }
  return interpolate(template, ctx ?? {});
}

function interpolate(
  template: string,
  ctx: Record<string, string>,
): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_match, name) => {
    if (!(name in ctx)) {
      throw makeMissingPlaceholderError(name, template);
    }
    return ctx[name]!;
  });
}
```

### Circular dependency note

`localized()` and `buildAgoraError()` (Stage 4-A.6) potentially circular:
- `errors/build.ts` → `i18n/index.ts` (to resolve message_key)
- `i18n/index.ts` → `errors/build.ts` (to throw on missing key)

Resolution: `i18n/index.ts` does NOT import `errors/build.ts`. The
missing-key and missing-placeholder cases throw a **bare `AgoraErrorThrown`**
constructed inline with hardcoded English message:

```typescript
// src/i18n/index.ts (continued)
import { AgoraErrorThrown } from "@/errors/types";  // types only, no build

function makeMissingKeyError(key: string, locale: Locale): AgoraErrorThrown {
  return new AgoraErrorThrown({
    code: "internal.invariant-violation",
    category: "internal",
    message: `i18n: missing locale key "${key}" in catalog "${locale}.json"`,
    message_key: "internal.invariant_violation",  // referential, not used here
    context: { kind: "missing_locale_key", key, locale },
  });
}

function makeMissingPlaceholderError(name: string, template: string): AgoraErrorThrown {
  return new AgoraErrorThrown({
    code: "internal.invariant-violation",
    category: "internal",
    message: `i18n: missing placeholder "${name}" in context for template`,
    message_key: "internal.invariant_violation",
    context: { kind: "missing_placeholder", placeholder: name, template_excerpt: template.slice(0, 100) },
  });
}
```

The hardcoded English message in `makeMissingKeyError` is the **one
documented exception** to F1 (no English fallback for ko). Justification:
this is a developer-facing internal bug message — the user would never
see this in normal operation. If the catalog itself is broken, we cannot
look up its own broken-state message; English is the only safe fallback.

`errors/build.ts` (which imports `i18n/index.ts` to resolve user-facing
error message_keys) operates on the **assumption** that ERROR_CATALOG's
referenced keys exist in catalogs — guaranteed by `pnpm lint:locale`
Check 2. If a runtime missing-key happens, it means CI was bypassed or
the catalog file was tampered post-CI; the i18n self-throw correctly
surfaces the bug.

### Layer compliance

`src/i18n/` is LAYER 0 (per Stage 5-A.1). It depends on:
- `messages/*.json` (repo-root data, not code) — relative `../../messages/<locale>.json`
- `@/errors/types` (LAYER 0 — types only, no logic)
- `zod` (external, already in stack)

It does NOT depend on `@/errors/build` (which depends on `@/i18n`). The
import direction is one-way: `errors/build → i18n`, never reverse.

`messages/` import from outside `src/` is permitted: it is data, not code.
The layer rule (Stage 5-A.1) governs `src/<feature>/` imports; loading
data from repo-root paths is not a layer concern.

---

## Initial Catalog Scaffold (Stage 6 Contract) [SPEC]

> **Goal**: Stage 5 closes with the SPEC; Stage 6 populates the actual
> en/ko strings. This section enumerates the **minimum keys** Stage 6
> must provide.

### Mandatory keys at Stage 6 v1 ship

#### `errors.*` (from Stage 4-A.6 ERROR_CATALOG — every entry needs message_key + optional fix_key)

```
errors.config.missing_version            (+ .fix)
errors.config.version_mismatch           (+ .fix)
errors.config.unknown_key
errors.config.threshold_inversion
errors.config.disabled_forced_overlap
errors.config.invalid_toml
errors.config.path_not_found
errors.llm.auth_failed                   (+ .fix)
errors.llm.rate_limited
errors.llm.timeout
errors.llm.invalid_response
errors.llm.no_runner_available           (+ .fix)
errors.llm.internal_error
errors.probe.timeout
errors.probe.internal_error
errors.probe.unknown_id
errors.gate.gate_1_fail
errors.gate.gate_2_fail
errors.gate.gate_3_fail
errors.gate.gate_4_fail
errors.gate.gate_5_fail
errors.user.forbidden_flag_combo
errors.user.confirmation_required
errors.user.aborted
errors.state.corrupt
errors.state.unreadable
errors.io.permission_denied
errors.io.disk_full
errors.internal.uncaught                 (+ .fix)
errors.internal.invariant_violation
```

#### `philosophers.*` (from Stage 5-A.3 runbook section 9 declarations)

```
philosophers.husserl.*       (bracket prompts user-visible variants)
philosophers.socrates.*      (case-probe intro variants)
philosophers.aristotle.*     (4 cause question intros)
philosophers.plato.*         (Y2 Noesis question + Dihairesis decomposition intro)
philosophers.aquinas.*       (Stage 3/4 disputatio user-facing intro/summary)
```

Stage 5-A.3 runbooks declare `philosophers.<name>.*` namespace usage;
Stage 6 populates the exact keys based on what user sees in TUI/JSON
output during alignment + ralph loops.

#### `cli.*` (from Stage 3-B per-command SPECs)

```
cli.global.help_intro
cli.global.version_format
cli.global.locale_resolved          (banner: "Locale: ko")
cli.default.status_summary
cli.new.intro
cli.resume.intro
cli.seed.view_header
cli.seed.edit_intro
cli.ralph.iteration_start
cli.ralph.gate_passing
cli.ralph.gate_failing
cli.ralph.complete
cli.status.leaf_view
cli.status.history_view
cli.doctor.banner_title
cli.doctor.universal_section
cli.doctor.project_section
cli.doctor.disabled_section
cli.doctor.fail_summary
```

#### `probes.*` (from Stage 4-A.4 19-probe inventory)

```
probes.<probe_id>.fix         (one per probe — 19 entries)
probes.<probe_id>.detail      (descriptions in agora doctor output)
```

#### `gates.*` (from Stage 2-B + Stage 4-A.6 cross-references)

```
gates.gate_5.drift_threshold_explanation
gates.gate_5.z1_attempt_count_warning
gates.gate_5.z2_escalation
```

#### `alignment.*` (from Stage 2-A phase user prompts)

```
alignment.phase_minus_1.intro
alignment.phase_minus_1.completion
alignment.phase_2.round_n_intro
alignment.phase_2.philosopher_handoff
alignment.termination.y2_summary
alignment.termination.y3_preview
```

#### `ralph.*` (from Stage 2-B + Stage 3-B.6)

```
ralph.iteration_intro
ralph.gate_summary
ralph.complete_summary
ralph.bypass_warning
```

### Rough volume estimate

- `errors.*`: ~30 entries × 2 locales = 60 strings
- `philosophers.*`: ~40 entries × 2 = 80
- `cli.*`: ~25 entries × 2 = 50
- `probes.*`: ~38 entries × 2 = 76
- `gates.*`: ~5 × 2 = 10
- `alignment.*`: ~10 × 2 = 20
- `ralph.*`: ~5 × 2 = 10

**Total v1**: roughly 150 keys × 2 locales = 300 strings.

This is a manageable scope for one focused session per locale (Sang
writes ko himself; en is canonical — Sang or AI-assisted).

### Stage 6 implementation steps

```
1. Create empty messages/en.json + messages/ko.json with top-level
   namespaces declared as empty objects
2. For each Stage 4-A.6 ERROR_CATALOG entry, populate the corresponding
   message_key + fix_key in en.json
3. Translate every en.json key to ko.json (Sang owns; AI-assisted draft OK)
4. Run pnpm lint:locale — must pass
5. As Stage 6 vertical slices land, populate philosophers.*, cli.*,
   probes.*, gates.*, alignment.*, ralph.* incrementally
6. Each PR adding new keys must add to BOTH locales (CI enforces)
```

---

## Boundaries

- ❌ TypeScript module catalog (R1-B rejected): build pipeline complexity, tooling fight.
- ❌ TOML / YAML (R1-C rejected): parser dep, no native parse benefit.
- ❌ Flat keys without nesting (R2-B rejected): visual grouping lost.
- ❌ camelCase / PascalCase keys (R2-C rejected): i18n convention mismatch.
- ❌ Pure flat JSON `{ "errors.config.x": "..." }` (R3-B rejected): no orientation for translators.
- ❌ Pure nested without flat-leaf-with-dots (R3-C rejected): `<key>.fix` boilerplate.
- ❌ TypeScript typed-key catalog (R4-B rejected): fights R1-A.
- ❌ Runtime-only parity check (R4-C rejected): too-late discovery.
- ❌ Multi-locale prompts (R5-B rejected): fingerprint × locale, no evidence of need.
- ❌ Catalog ↔ prompt blended source of truth (R5-C rejected): boundary erosion.
- ❌ Silent English fallback for missing ko key: F1 violation (Stage 4-A.6 forbidden).
- ❌ More than one English-fallback exception: only `makeMissingKeyError` self-throw is allowed (when catalog itself is broken).
- ❌ Per-area path alias `@messages/*`: forbidden by Stage 5-A.1 R5-A (single `@/*` only).
- ❌ Loading messages from FS at runtime (vs build-time JSON import): unnecessary FS surface; build-time bundle is bundled.
- ❌ Catalog top-namespace beyond declared 7 without ADR: prevents sprawl.
- ❌ `.fix` as nested object (`{ missing_version: { fix: "..." } }`): deviates from natural `<key>.fix` reading.
- ❌ Translator dropping `{placeholder}` or adding new ones: caught by Check 3.

## Failure modes specifically guarded

- **Korean user sees English fallback**: Check 1 (keyset parity) prevents at CI.
- **Code references key not in catalog**: Check 2 (ERROR_CATALOG cross-ref) prevents at CI; runtime self-throw catches if catalog tampered.
- **Translator breaks placeholders**: Check 3 (placeholder consistency) prevents at CI.
- **Catalog itself broken at runtime**: hardcoded-English self-throw via `makeMissingKeyError` (documented F1 exception).
- **Circular i18n ↔ errors dependency**: i18n imports `errors/types` only (types, not logic); throws bare `AgoraErrorThrown` inline.
- **Locale not resolved at startup**: CLI entry per Stage 3-A.3 precedence (`--locale > AGORA_LOCALE > LANG > "en"`); `setLocale()` called once before any `localized()` invocation.
- **Multi-line prompt translation drift**: prompts are English-only (R5-A); only short user-facing strings need translation.

## Output consumed by

- **Stage 4-A.6 `buildAgoraError`**: every error built calls `localized(message_key, ctx)` for the resolved message; no string literals at throw sites.
- **Stage 3-B per-command output**: TUI/JSON renderers call `localized()` for all user-facing copy.
- **Stage 5-A.3 runbook section 9 declarations**: `philosophers.<name>.*` namespace usage tracked here.
- **Stage 5-A.4 prompt library**: prompts are NOT in catalog; placeholder-context values MAY come from catalog.
- **Stage 4-A.4 probe doctor output**: `probes.<id>.fix` keys per probe.
- **Stage 6 implementation**: `src/i18n/catalog.ts` + `src/i18n/index.ts` populated per algorithm above; `messages/en.json` + `messages/ko.json` populated per Initial Scaffold inventory.
- **CI pipeline**: `pnpm lint:locale` runs alongside typecheck/lint/test; PR can't merge on failure.

---

## Module-graph note

`src/i18n/` is already LAYER 0 (declared in Stage 5-A.1 module-graph).
This SPEC adds:
- `src/i18n/index.ts` → public API: `localized`, `setLocale`, `getLocale`, `SUPPORTED_LOCALES`
- `src/i18n/catalog.ts` → JSON imports + `lookupKey` algorithm
- Both depend on `@/errors/types` (types only) — does NOT depend on `@/errors/build`

No module-graph update needed (layer assignment was already pinned).

---

## Next sections (still OPEN in Stage 5)

- Stage 5-A.6 — `Result<T, E>` adoption decision (CLAUDE.md L327 carry-over). Final Stage 5 sub-question.
