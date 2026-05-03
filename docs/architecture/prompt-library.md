# Prompt Library — Specification (Stage 5)

> **Status**: Stage 5-A.4 (Accepted 2026-05-03).
> Sections marked **[SPEC]** are formally accepted Stage 5 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 5
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Library File Format** (5-A.4 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Storage Location + Module Layout** (5-A.4 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Critic Prompt Inclusion** (5-A.4 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Generation + Validation Mechanism** (5-A.4 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Runtime Lookup API** (5-A.4 R5) | **[SPEC]** Accepted 2026-05-03 |
| **Library Entry Schema** (5-A.4) | **[SPEC]** Accepted 2026-05-03 |
| **Generator Algorithm** (Stage 6 contract) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope vs Inherited Decisions

This document specifies **how the prompt library physically exists** in
the codebase: file format, location, generation mechanism, runtime API.
The **canonical source** of every prompt is its runbook (philosopher) or
critic-definition file (critic) — the library is a derived artifact.

Inherited and not reopened here:

| Inherited | Source |
|-----------|--------|
| Runbook section 4 holds canonical philosopher prompt text; library is auto-derived | Stage 5-A.2 R2-A |
| Manual library edits forbidden (generator is only writer) | Stage 5-A.2 R2-A |
| Library entries include `runbook` path + `revision` int + `fingerprint` (sha256) | Stage 5-A.2 R5-A |
| Key format `<owner>:<prompt_id>` with namespace in entry shape | This SPEC R3-A extends with `philosopher:` / `critic:` namespace |
| 12 philosopher prompt IDs (after Stage 5-A.3 Rev 2 reconciliation) | Stage 5-A.3 |
| 10 critic personas (4 UI + 5 Tech + 1 universal) | Stage 2-B.3 |
| Zod adoption + `.strict()` for runtime validation | Stage 4-A.3 R1-A |
| Dependency minimalism — no new runtime deps without justification | ADR-0001 |
| Layer rule: `src/prompts/` is new — must declare LAYER assignment | Stage 5-A.1 (extended in this SPEC) |
| Module file naming: kebab-case files / camelCase exports / snake_case ids | CLAUDE.md + module-graph.md |

---

## Library File Format [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Single source of truth at runtime. Type-safe. Tree-shakable.
> No new runtime deps.

### Decision

**Auto-generated TypeScript module** at `src/prompts/_generated.ts`. The
file is committed to git. CI verifies it stays in sync with runbooks +
critic definitions.

```typescript
// src/prompts/_generated.ts
//
// AUTO-GENERATED FROM RUNBOOK + CRITIC DEFINITION SECTIONS.
// DO NOT EDIT DIRECTLY. Run `pnpm gen:prompts` to regenerate.
// Source:
//   - docs/philosophers/runbooks/*.md  (section 4 of each runbook)
//   - src/critics/definitions/*.ts    (each critic's exported `prompt` const)
// CI validates in-sync via `pnpm lint:prompts`.

import type { PromptEntry } from "./types.ts";

export const PROMPT_LIBRARY = {
  "husserl:phase-minus-1-bracket": { /* ... */ },
  "socrates:elenchus-round":       { /* ... */ },
  "aristotle:telos-question":      { /* ... */ },
  "aristotle:form-question":       { /* ... */ },
  "aristotle:material-question":   { /* ... */ },
  "aristotle:efficient-question":  { /* ... */ },
  "plato:y2-noesis-test":          { /* ... */ },
  "plato:dihairesis-decompose":    { /* ... */ },
  "aquinas:videtur":               { /* ... */ },
  "aquinas:sed-contra":            { /* ... */ },
  "aquinas:respondeo":             { /* ... */ },
  "aquinas:ad-singula":            { /* ... */ },
  "critic:ui-typography":          { /* ... */ },
  "critic:ui-spacing":             { /* ... */ },
  "critic:ui-color":               { /* ... */ },
  "critic:ui-interaction":         { /* ... */ },
  "critic:tech-solid":             { /* ... */ },
  "critic:tech-naming":            { /* ... */ },
  "critic:tech-error-handling":    { /* ... */ },
  "critic:tech-perf":              { /* ... */ },
  "critic:tech-test-coverage":     { /* ... */ },
  "critic:universal-telos-alignment": { /* ... */ },
} as const satisfies Record<string, PromptEntry>;

export type PromptKey = keyof typeof PROMPT_LIBRARY;
```

### Rationale

- **Type-safe**: `PromptKey` is a literal-union type derived from object
  keys. Compile-time error on typo. `getPrompt("husserl:phase-minus-2")`
  fails build, never silently returns undefined.
- **Tree-shakable**: bundlers eliminate unused entries when the Stage 6
  CLI is built. Mode 3 (MCP) builds may have a different shake profile
  than Mode 1 (TUI).
- **Zero runtime parse**: the library is just an object literal. No YAML
  parser, no JSON.parse boundary, no I/O.
- **Zero new deps**: TypeScript native. Zod (already adopted Stage 4-A.3)
  validates at generator time.
- **Diff-friendly**: prompt text changes show up in normal git diffs as
  string literal changes. Reviewers see exactly what changed.

### What about `as const satisfies`

`as const` makes the object's keys + literal string values part of the
type. `satisfies Record<string, PromptEntry>` ensures every entry shape
matches `PromptEntry` without widening the inferred narrow types. Both
guarantees apply: keys are exact literals AND values are well-formed.

R1-B (YAML) rejected: adds yaml parser dep (e.g. `yaml` package, ~50KB),
incurs runtime parse cost on every cold start, loses compile-time key
safety.
R1-C (JSON) rejected: native parse but multi-line strings require `\n`
escapes (ugly + error-prone for prompts), no compile-time key safety,
no top-level interpolation (hard to express system + user template
relationship cleanly).

---

## Storage Location + Module Layout [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: New `src/prompts/` feature folder under existing module-graph
> rules. LAYER 0 (no inward dep on `src/<feature>/`).

### Tree

```
src/prompts/
├── _generated.ts      # auto-generated, committed, CI-verified in-sync
├── types.ts           # PromptEntry Zod schema + PromptKey type re-export
├── index.ts           # public API: getPrompt, renderPrompt
└── interpolation.ts   # internal: {placeholder} → value substitution

scripts/
└── gen-prompts.ts     # generator (Stage 6) — reads runbooks + critic defs,
                       # emits src/prompts/_generated.ts
```

### Layer assignment (extends Stage 5-A.1 module-graph)

`src/prompts/` is **LAYER 0** — zero inward dep on `src/<feature>/`.

| Layer 0 (existing + this SPEC adds prompts/) |
|----------------------------------------------|
| `shared/` `result/` `errors/types.ts` `errors/codes.ts` `i18n/` `prompts/` |

`prompts/` depends only on:
- `zod` (external — already in stack per Stage 4-A.3)
- TypeScript stdlib

**Why LAYER 0 even though prompts contain critic content (LAYER 1)?**
The library holds prompt text as **string constants** (data), not as
imports from `src/critics/`. The generator script reads critic def files
at build time, but at runtime `src/prompts/_generated.ts` has no import
from `src/critics/` — only the embedded string content. Boundaries
preserved.

### npm package shape impact

Stage 4-A.1 install spec ships `files: ["dist", "messages", "probes", ...]`.
`src/prompts/` compiles into `dist/prompts/` automatically. **No change
to npm `files` array required.**

R2-B (`prompts/library.yaml` at repo root, like `messages/`) rejected:
runtime YAML parse cost + new dep + must add `"prompts"` to npm files +
loses compile-time type safety.
R2-C (`docs/architecture/prompt-library.md` markdown) rejected: requires
build script to convert markdown → ts/json anyway. Just emit ts directly.

---

## Critic Prompt Inclusion [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Single library covers BOTH philosopher and critic prompts.
> Namespace prefix differentiates.

### Decision

**Hybrid: library includes both, namespaced.** Key format:

```
<namespace>:<owner>[:<prompt_id>]

philosopher:
  husserl:phase-minus-1-bracket
  socrates:elenchus-round
  aristotle:telos-question
  aristotle:form-question
  aristotle:material-question
  aristotle:efficient-question
  plato:y2-noesis-test
  plato:dihairesis-decompose
  aquinas:videtur
  aquinas:sed-contra
  aquinas:respondeo
  aquinas:ad-singula
  (12 total)

critic:
  critic:ui-typography
  critic:ui-spacing
  critic:ui-color
  critic:ui-interaction
  critic:tech-solid
  critic:tech-naming
  critic:tech-error-handling
  critic:tech-perf
  critic:tech-test-coverage
  critic:universal-telos-alignment
  (10 total — each critic has exactly one prompt: their videtur objection)

TOTAL: 22 entries.
```

The `namespace` field on each entry confirms philosopher vs critic. Keys
are themselves prefixed with the namespace so collision is structurally
impossible (philosopher namespaces are owner-prefixed without a literal
"philosopher:" prefix per Stage 5-A.2 R2-A's earlier example list;
critic keys ARE prefixed with `critic:` literal).

### Why hybrid

- **Single SoT**: one library, one fingerprint check, one locale parity
  CI hook covers all 22 prompts.
- **Uniform Stage 6 lookup**: orchestrator code uses `getPrompt(key)` for
  both philosopher and critic prompts. Aquinas Videtur orchestration
  iterates `selected_critics` and calls `getPrompt('critic:' + critic.id)`
  uniformly with how Plato Y2 calls `getPrompt('plato:y2-noesis-test')`.
- **No drift between two systems**: critic prompts and philosopher prompts
  go through the same generator pipeline, same Zod validation, same CI.
- **Adding a critic** = add one critic def file → re-run generator →
  library entry appears. No "remember to also update the library" step.

### Source-of-truth split (still preserved)

| Type | Canonical source | Library role |
|------|------------------|--------------|
| Philosopher prompt | `docs/philosophers/runbooks/<name>.md` § 4 | Indexed entry pointing back to runbook |
| Critic prompt | `src/critics/definitions/<id>.ts` exported `prompt` const | Indexed entry pointing back to def file |

Generator reads from both kinds of sources; emits one library file.

R3-B (philosopher only, critic prompts stay only in `critics/definitions/`)
rejected: prompt validation/fingerprint logic gets duplicated; Stage 6
lookup API would need two paths.
R3-C (separate `critic-library.ts`) rejected: two libraries to keep in
sync; lookup API surface doubled.

---

## Generation + Validation Mechanism [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Manual regenerate + CI in-sync verification. No forced
> pre-commit hook at v1.

### Commands

```bash
pnpm gen:prompts      # regenerate src/prompts/_generated.ts from sources
pnpm lint:prompts     # CI: regen to temp, diff against committed; fail on mismatch
```

`pnpm gen:prompts` algorithm:
1. Read all runbook files: `docs/philosophers/runbooks/*.md` (skip `_template.md`)
2. For each, parse the `## 4. Prompt` section + sub-sections (`### 4.X <prompt_id>`)
3. Extract: system_prompt block, user_prompt_template block, declared placeholders
4. Read all critic def files: `src/critics/definitions/*.ts`
5. For each, evaluate the file in isolated TS context to extract the exported `prompt` const
6. Compute SHA-256 fingerprint of canonical normalized prompt text (system + user, whitespace-normalized)
7. Validate every entry against `PromptEntrySchema` (Zod `.strict()`)
8. Emit `src/prompts/_generated.ts` with sorted entries (philosopher first, then critic, alphabetical within each namespace)
9. Run `pnpm typecheck` to verify the generated file compiles

`pnpm lint:prompts` algorithm:
1. Run `pnpm gen:prompts --dry-run` (writes to `_generated.ts.tmp`)
2. `diff src/prompts/_generated.ts src/prompts/_generated.ts.tmp`
3. Exit 0 if identical; exit 4 (gate failure per Stage 4-A.6 ERROR_CATALOG `gate.gate-1-deterministic-fail`) if not, with structured message naming the drifted entry

### When to regenerate (developer workflow)

- After editing any runbook section 4
- After editing any critic def's `prompt` export
- After bumping a runbook revision (Stage 5-A.2 R5-A bump conditions)
- After adding/removing a critic from `src/critics/definitions/`

CI catches forgotten regen via `pnpm lint:prompts` in the PR check.

### Pre-commit hook: deferred to Stage 6

R4-A explicitly allows but does not mandate a pre-commit hook. Stage 6
implementation may add one if real workflow shows the regen step is
chronically forgotten. Decision deferred — start manual + CI-only.

R4-B (mandatory pre-commit hook) rejected: friction without proof of
need; ADR-0001 minimalism. Add only if Stage 6 surfaces forgotten regens.
R4-C (build-time only — `pnpm build` regens) rejected: dev mode
(`pnpm dev` / `tsx`) doesn't trigger build, so prompts go stale silently
during development; surprise on `pnpm build` is too late.

### Fingerprint algorithm

```typescript
// scripts/gen-prompts.ts (Stage 6 implementation contract)
import { createHash } from "node:crypto";

function fingerprint(systemPrompt: string, userPromptTemplate: string): string {
  const normalized = (systemPrompt + "\n---\n" + userPromptTemplate)
    .replace(/\r\n/g, "\n")        // line ending normalize
    .replace(/[ \t]+$/gm, "")      // trim trailing whitespace
    .replace(/\n{3,}/g, "\n\n")    // collapse 3+ newlines to 2
    .trim();
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `sha256:${hash}`;
}
```

Whitespace normalization avoids spurious fingerprint changes on editor
auto-format. Semantic prompt changes (word changes, rule changes) always
change the fingerprint.

---

## Runtime Lookup API [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Type-safe key-based lookup + template interpolation. Compiles
> to direct object access (zero overhead).

### Public API

```typescript
// src/prompts/index.ts
import { PROMPT_LIBRARY, type PromptKey } from "./_generated.ts";
import { interpolate } from "./interpolation.ts";

/**
 * Get the raw prompt entry by key. Type-safe — invalid key fails compile.
 */
export function getPrompt<K extends PromptKey>(key: K): typeof PROMPT_LIBRARY[K] {
  return PROMPT_LIBRARY[key];
}

/**
 * Render the prompt with placeholder interpolation. Returns system + user
 * pair ready to feed ClaudeRunner.call().
 *
 * Throws AgoraError "internal.invariant-violation" if context is missing
 * a declared placeholder.
 */
export function renderPrompt<K extends PromptKey>(
  key: K,
  context: Record<string, string>,
): { system: string; user: string } {
  const entry = getPrompt(key);
  return {
    system: interpolate(entry.system_prompt, context, entry.placeholders),
    user:   interpolate(entry.user_prompt_template, context, entry.placeholders),
  };
}

export type { PromptKey, PromptEntry } from "./types.ts";
```

### `interpolation.ts` (internal)

```typescript
import { buildAgoraError } from "@/errors/build.ts";

export function interpolate(
  template: string,
  context: Record<string, string>,
  declaredPlaceholders: readonly string[],
): string {
  // Validate every declared placeholder is present in context.
  for (const placeholder of declaredPlaceholders) {
    if (!(placeholder in context)) {
      throw buildAgoraError("internal.invariant-violation", {
        context: { kind: "missing_placeholder", placeholder, declaredPlaceholders },
      });
    }
  }
  // Replace {placeholder} with context value.
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/g, (match, name) => {
    if (!(name in context)) {
      throw buildAgoraError("internal.invariant-violation", {
        context: { kind: "undeclared_placeholder_used", placeholder: name },
      });
    }
    return context[name]!;
  });
}
```

The validation is two-sided:
- Declared placeholders that the context misses → throw
- Template uses `{name}` but `name` not in context → throw

Either case is a programming error caught immediately, never silently
filled with empty string.

### Call site example

```typescript
// src/alignment/phase-minus-1.ts
import { renderPrompt } from "@/prompts";
import { runner } from "@/llm/cached-runner";

async function runHusserlBracket(input: HusserlInput): Promise<HusserlOutput> {
  const { system, user } = renderPrompt("husserl:phase-minus-1-bracket", {
    raw_intent:                       input.raw_intent,
    cwd_signal_summary:               summarize(input.cwd_signal),
    invocation:                       input.invocation,
    prior_frame_diff_if_present:      diffPriorFrame(input.prior_frame),
    software_alternative_for_this_intent: pickSoftwareAlt(input.raw_intent),
    form_alternative_for_this_intent: pickFormAlt(input.raw_intent),
    audience_alternative_for_this_intent: pickAudienceAlt(input.raw_intent),
  });
  const response = await runner.call({ system, prompt: user, format: "json" });
  // ... parse response into HusserlOutput
}
```

R5-B (direct import per prompt — `import { husserlPhaseMinus1Bracket } from "@/prompts"`)
rejected: 22 named exports clutter the API; dynamic lookup (Aquinas
Videtur iterating critic IDs) would need both an export AND a runtime
map; doubled surface.
R5-C (both APIs) rejected: same surface duplication; one canonical way
is better.

---

## Library Entry Schema [SPEC] (Accepted 2026-05-03)

> **Goal**: Zod schema as single source of truth for entry shape.
> Generator validates, runtime trusts.

```typescript
// src/prompts/types.ts
import { z } from "zod";

export const PromptEntrySchema = z.object({
  // ── identity ──
  namespace: z.enum(["philosopher", "critic"]),
  owner: z.string().regex(/^[a-z][a-z0-9_-]*$/),  // husserl, socrates, ui-typography, ...

  // ── source-of-truth pointer (one of these depending on namespace) ──
  runbook: z.string().optional(),         // present iff namespace === "philosopher"
                                          // format: "docs/philosophers/runbooks/<name>.md#<section-anchor>"
  runbook_revision: z.number().int().min(1).optional(),  // present iff namespace === "philosopher"
  critic_def: z.string().optional(),      // present iff namespace === "critic"
                                          // format: "src/critics/definitions/<id>.ts"

  // ── canonical content ──
  system_prompt: z.string().min(1),
  user_prompt_template: z.string().min(1),
  placeholders: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)),

  // ── integrity ──
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),

  // ── usage tracking (informational; updated by generator) ──
  used_by: z.array(z.string()),  // src/ file paths importing this prompt
                                  // empty initially; populated as Stage 6 lands
}).strict()
  .refine(
    e => (e.namespace === "philosopher")
         ? (e.runbook !== undefined && e.runbook_revision !== undefined && e.critic_def === undefined)
         : (e.critic_def !== undefined && e.runbook === undefined && e.runbook_revision === undefined),
    { message: "namespace must match source-of-truth pointer fields" },
  );

export type PromptEntry = z.infer<typeof PromptEntrySchema>;
```

`.strict()` rejects unknown keys (typo in generator output → CI fails).
The refinement enforces namespace ↔ pointer field correspondence (a
philosopher entry pointing to a critic_def is rejected).

---

## Generator Algorithm (Stage 6 contract)

> **Goal**: Specify exactly what `scripts/gen-prompts.ts` must do, so
> Stage 6 implementation has a 1:1 mapping.

### Inputs

```
docs/philosophers/runbooks/*.md          (excluding _template.md)
src/critics/definitions/*.ts
```

### Output

```
src/prompts/_generated.ts                (single file, fully replaces previous)
```

### Steps

```
1. Discover sources:
   philosopher_runbooks = glob("docs/philosophers/runbooks/[a-z]*.md")
   critic_defs          = glob("src/critics/definitions/*.ts")

2. For each philosopher runbook:
   a. Parse markdown → AST (use existing TS markdown parser e.g. marked or
      remark — Stage 6 picks one, ADR-0001 minimalism may favor a
      lightweight option)
   b. Locate "## 4. Prompt" heading
   c. Iterate sub-headings "### 4.<N> <prompt_id>"
   d. For each sub-section:
      - Extract `## System prompt` fenced block
      - Extract `## User prompt template` fenced block
      - Extract placeholder names from {placeholder} regex matches in user template
      - Read runbook front matter for "Revision: N"
      - Build PromptEntry:
        {
          namespace: "philosopher",
          owner: <philosopher_name>,
          runbook: "docs/philosophers/runbooks/<name>.md#4-<N>",
          runbook_revision: N,
          system_prompt: <text>,
          user_prompt_template: <text>,
          placeholders: <derived>,
          fingerprint: <computed>,
          used_by: <preserved from prior _generated.ts>,  // see step 4
        }
      - Key: `<owner>:<prompt_id>`

3. For each critic def file:
   a. Use TypeScript compiler API (or simple regex if format is strict)
      to extract the exported `prompt` const
   b. The const must be `{ system: string; user_template: string; placeholders: string[] }`
   c. Build PromptEntry with namespace="critic", critic_def=<path>, key=`critic:<critic_id>`

4. Preserve `used_by` arrays from previous _generated.ts:
   a. Read prior file (if exists), extract `used_by` per key
   b. New entries: `used_by = []` (Stage 6 manually populates as code
      lands; or a separate "scan src/ for getPrompt('key') usage" pass
      can auto-populate — TBD per Stage 6)

5. Validate every entry against PromptEntrySchema (throw on validation fail)

6. Sort entries:
   a. By namespace (philosopher first, then critic)
   b. Within namespace: alphabetical by key

7. Emit src/prompts/_generated.ts with header comment + import + const + type export

8. Run `pnpm typecheck --noEmit` on the generated file to verify it compiles
```

### Failure handling

- Runbook missing section 4 → clear error message naming the runbook
- Critic def missing exported `prompt` const → clear error message
- Duplicate key across sources → fail with both source paths
- Schema validation failure → fail with the offending entry + Zod issue
- TypeScript compile failure on emit → fail (regression in generator)

All generator errors throw structured `AgoraError` per Stage 4-A.6 if
the script imports `@/errors`; otherwise plain Error for build scripts
(decision deferred to Stage 6 — script may run before `@/errors` is
loadable).

---

## Boundaries

- ❌ YAML / JSON library file (R1-B/C rejected): runtime parse + dep + lost type safety.
- ❌ `prompts/library.yaml` at repo root (R2-B rejected): dep + npm files change + no compile-time check.
- ❌ Markdown library file (R2-C rejected): requires conversion script anyway.
- ❌ Critic prompts only in `critics/definitions/` (R3-B rejected): drift across two systems.
- ❌ Separate `critic-library.ts` (R3-C rejected): two libraries to sync.
- ❌ Forced pre-commit hook (R4-B rejected): friction without proof of need.
- ❌ Build-time-only regen (R4-C rejected): dev mode goes silently stale.
- ❌ Direct named imports for every prompt (R5-B rejected): 22-export clutter, dynamic dispatch broken.
- ❌ Both lookup APIs (R5-C rejected): surface duplication.
- ❌ Manual edit to `_generated.ts`: header banner + CI lint catches; PR rejected.
- ❌ Library entry without fingerprint: schema requires it.
- ❌ Library entry with namespace ↔ pointer field mismatch: schema refinement rejects.
- ❌ Placeholder declared but missing from context at runtime: throws `internal.invariant-violation`.
- ❌ Placeholder used in template but not declared: throws `internal.invariant-violation`.
- ❌ `src/prompts/` importing from `src/<feature>/`: violates LAYER 0 boundary.
- ❌ Generator reading prompt source from anywhere except runbooks + critic defs: extension requires this SPEC update.

## Failure modes specifically guarded

- **Library out of sync with source**: CI `pnpm lint:prompts` regens + diffs.
- **Manual edit slipping in**: header banner + CI diff catches.
- **Typo in lookup key**: compile-time error via PromptKey literal union.
- **Missing placeholder at runtime**: thrown `internal.invariant-violation` with structured context.
- **Undeclared placeholder used**: same.
- **Critic added but library forgotten**: CI lint fails.
- **Runbook revised but library forgotten**: fingerprint mismatch in CI lint.
- **Whitespace-only edit changing fingerprint**: normalization in fingerprint algorithm prevents.
- **Cross-namespace key collision**: `philosopher` and `critic` namespaces use disjoint key prefixes (philosopher uses raw owner, critic prefixes with `critic:`).
- **`src/prompts/` becoming a god module**: LAYER 0 rule + zero-inward-dep prevents.

## Output consumed by

- **Stage 5-A.3 runbooks**: section 4 prompts are the canonical source.
  When runbooks bump revisions, library auto-updates on next regen.
- **Stage 2-B.3 critics**: `src/critics/definitions/<id>.ts` files own
  the canonical critic prompt as exported `prompt` const.
- **Stage 6 implementation files**: `src/alignment/`, `src/ralph/`,
  `src/handoff/`, `src/philosophers/` orchestrators call `renderPrompt(key, context)`.
  `src/critics/` files call `renderPrompt('critic:' + id, context)` from Aquinas Videtur.
- **CI pipeline**: `pnpm lint:prompts` runs alongside `pnpm typecheck` /
  `pnpm lint`. Failure blocks merge.
- **Stage 5-A.5 (locale catalog content rules)**: prompt placeholders may
  reference locale-specific keys; generator may extend to validate
  placeholder ↔ catalog key relationships if Stage 5-A.5 surfaces this need.
- **Stage 5-A.6 (Result<T, E>)**: `renderPrompt` currently throws on
  validation failure; if Stage 5-A.6 adopts Result type, signature
  changes to `Result<{ system, user }, AgoraError>` in one place.

---

## Module-graph update

This SPEC adds `src/prompts/` to the module-graph LAYER 0. Update
`docs/architecture/module-graph.md` Section "Feature-Folder + Layered
Rule [SPEC] (Accepted 2026-05-03, R2-A)" Layer 0 entry:

```
LAYER 0 (no deps within src/, only stdlib + zod/commander/clack/picocolors):
  shared/            (path / io / fingerprint helpers)
  result/            (Result<T, E>)
  errors/types.ts    (AgoraError type only)
  errors/codes.ts    (ERROR_CATALOG)
  i18n/              (catalog lookup)
  prompts/           ◀── NEW (Stage 5-A.4): generated PROMPT_LIBRARY + lookup API
```

That update happens in the same commit as this SPEC.

---

## Next sections (still OPEN in Stage 5)

- Stage 5-A.5 — Locale catalog content rules (en/ko parity, key naming, CI parity assertion)
- Stage 5-A.6 — `Result<T, E>` adoption decision
