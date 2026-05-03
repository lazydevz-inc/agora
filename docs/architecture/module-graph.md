# Module Graph — Specification (Stage 5)

> **Status**: Stage 5-A in progress (opened 2026-05-03 after Stage 4 close).
> Sections marked **[SPEC]** are formally accepted Stage 5 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 5
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Top-Level Layout** (5-A.1 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Feature-Folder + Layered Rule** (5-A.1 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Dependency Enforcement** (5-A.1 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Test File Organization** (5-A.1 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Path Alias Configuration** (5-A.1 R5) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope

This document is the **canonical file-tree + dependency contract** for
Agora. Every Stage 4 SPEC referenced module paths (`src/probes/`,
`src/config/`, `src/errors/`, `src/i18n/`, `src/mcp/`, etc.); this
document consolidates those into one source of truth and resolves a
documented conflict with CLAUDE.md L256-274 + ADR-0006 (which used
`src/agora/*` namespace prefix).

When this document and CLAUDE.md / ADR-0006 disagree, **this document
wins** for file paths. CLAUDE.md is updated to point here. ADR-0006 is
preserved as historical record (its file-path examples are now
illustrative, not normative).

---

## Top-Level Layout [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Pin the canonical `src/` tree. No `src/agora/*` namespace
> middle (package name `@lazydevz/agora` already encodes the brand;
> doubling it in import paths is redundant).

### Decision

**Direct `src/<feature>/` layout.** No middle namespace. Imports look
like `import { ConfigSchema } from "@/config/schema"`, not
`"@/agora/config/schema"`.

R1-B (`src/agora/*` namespace per CLAUDE.md/ADR-0006) rejected: deepens
import paths for zero readability gain; the package metadata already
declares the brand.
R1-C (hybrid: `src/agora/` for core, `src/cli/` top-level) rejected:
two-policy confusion; "is this an agora-internal or top-level concern?"
becomes a question on every new file.

### Canonical tree

```
src/
├── cli/                        # CLI entry + per-command handlers
│   ├── index.ts                # process.argv → dispatch + global error handler
│   ├── render.ts               # TUI emit + JSON emit + MCP emit (Stage 3-A.1)
│   ├── flags.ts                # global flag parsing + forbidden combo validation
│   └── commands/
│       ├── default.ts          # agora (default) — Stage 3-B.7
│       ├── new.ts              # Stage 3-B.4
│       ├── resume.ts           # Stage 3-B.5
│       ├── seed.ts             # Stage 3-B.3
│       ├── ralph.ts            # Stage 3-B.6
│       ├── status.ts           # Stage 3-B.2
│       └── doctor.ts           # Stage 3-B.1 + --explain-config + --explain-crash
│
├── alignment/                  # Alignment Loop (Stage 2-A)
│   ├── orchestrator.ts         # phase progression + termination gate (Y2/Y3)
│   ├── phase-0-scan.ts         # auto-scan (markers shared with probes/markers.ts)
│   ├── phase-1-intake.ts       # open intake (8KB cap)
│   ├── phase-2-rounds.ts       # philosopher rounds with quoted-prior continuity
│   ├── recommendations.ts      # 4-source ranking (Stage 2-A.6)
│   ├── seed-builder.ts         # X3 structured + prose seed
│   └── preview.ts              # Y3 preview quality gate (≥ 0.75)
│
├── ralph/                      # Ralph Loop (Stage 2-B + ADR-0008)
│   ├── orchestrator.ts         # iteration loop + gate sequencing
│   ├── workspace.ts            # .agora/iterations/{id}/ isolation per ADR-0008
│   ├── gate-1-deterministic.ts # lint/typecheck/build/test
│   ├── gate-2-functional.ts    # Playwright CLI tests + regen trigger (Stage 2-B.2)
│   ├── gate-3-uiux.ts          # Aquinas Disputatio (UI/UX critics)
│   ├── gate-4-tech.ts          # Aquinas Disputatio (Tech critics)
│   ├── gate-5-alignment.ts     # drift score + Z1/Z2 escalation
│   └── disputatio.ts           # shared Disputatio engine (per-objection ruling)
│
├── handoff/                    # Alignment → Ralph handoff (Stage 2-C)
│   ├── dihairesis.ts           # Plato decomposition (3-AND atomicity, 0.6 defense)
│   ├── ac-tree.ts              # ac_tree.json read/write
│   ├── state-machine.ts        # single phase pointer (state.json) per Stage 2-C.3
│   └── audit.ts                # append-only events.jsonl writer
│
├── philosophers/               # 5 philosopher operational modules (1급 시민)
│   ├── husserl.ts              # Epoché — bracket assumptions (Phase −1)
│   ├── socrates.ts             # Elenchus — case-probing (Phase 2 conductor)
│   ├── aristotle.ts            # Four Causes (Phase 2 structuring)
│   ├── plato.ts                # Divided Line + Dihairesis (Y2 + handoff)
│   └── aquinas.ts              # Disputatio (Ralph Gate 3 + 4)
│
├── critics/                    # Aquinas critic personas (Stage 2-B.3)
│   ├── registry.ts             # 10 critics (4 UI + 5 Tech + 1 universal)
│   ├── selection.ts            # trigger-based selection (Stage 2-B.3 R2-A)
│   └── definitions/
│       ├── ui-typography.ts        ├── ui-spacing.ts
│       ├── ui-color.ts             ├── ui-interaction.ts
│       ├── tech-solid.ts           ├── tech-naming.ts
│       ├── tech-error-handling.ts  ├── tech-perf.ts
│       ├── tech-test-coverage.ts
│       └── universal-telos-alignment.ts
│
├── probes/                     # Stage 4-A.4 (path matches that SPEC verbatim)
│   ├── types.ts                # Probe interface, ProbeResult, ProbeContext
│   ├── runner.ts               # executeProbes + bounded concurrency + timeout
│   ├── registry.ts             # ALL_PROBES static array
│   ├── cache.ts                # gate0_results.json read/write + 5min TTL
│   ├── markers.ts              # shared detect helpers (memoized per process+cwd)
│   └── definitions/
│       ├── claude.ts ├── node.ts ├── pnpm.ts                        # Tier 1 always
│       ├── git.ts ├── gh.ts ├── vercel.ts ├── supabase.ts ├── anthropic-api-key.ts
│       ├── stripe.ts ├── clerk.ts ├── openai-api-key.ts             # Tier 1+2
│       ├── docker.ts ├── railway.ts ├── posthog-key.ts
│       └── gcloud.ts ├── aws.ts ├── bun.ts ├── upstash.ts ├── cloudflare.ts
│
├── llm/                        # Stage 4-A.2 (renamed from ad-hoc references)
│   ├── runner.ts               # ClaudeRunner interface + ClaudeCallOptions
│   ├── cli-runner.ts           # ClaudeCliRunner (subprocess primary)
│   ├── sdk-runner.ts           # ClaudeSdkRunner (fallback)
│   ├── cached-runner.ts        # CachedRunner wrapper
│   ├── cache.ts                # LLMCache (.agora/cache/llm_responses.json)
│   └── selection.ts            # runtime selection algorithm (per ADR-0005)
│
├── config/                     # Stage 4-A.3
│   ├── schema.ts               # Zod ConfigSchema + Config type (single source of truth)
│   ├── loader.ts               # 5-layer deep merge + validation
│   ├── env.ts                  # AGORA_* env var parsing + coercion
│   └── explain.ts              # --explain-config rendering with provenance
│
├── mcp/                        # Stage 4-A.5
│   ├── server.ts               # --mcp-server entry, MCP protocol loop
│   ├── tools.ts                # 7 tool definitions (input schemas + handlers)
│   └── host-action.ts          # host_action_required protocol helpers
│
├── errors/                     # Stage 4-A.6
│   ├── types.ts                # AgoraError + AgoraErrorThrown
│   ├── codes.ts                # ERROR_CATALOG (single source of truth)
│   ├── build.ts                # buildAgoraError(code, opts)
│   ├── crash.ts                # ~/.agora/crashes/ writer + secret redaction
│   └── handlers.ts             # uncaught/unhandledRejection handlers
│
├── i18n/                       # Stage 3-A.1 R5-A + Stage 4-A.6 R5-A
│   ├── index.ts                # localized(key, ctx) lookup + interpolation
│   └── catalog.ts              # en/ko load + key parity CI hook
│
├── state/                      # .agora/state.json + bypass records (Stage 2-C.3)
│   ├── reader.ts
│   ├── writer.ts               # atomic write-temp-then-rename
│   └── bypass.ts               # reset/persist for Stage 2-B.7
│
├── result/                     # Result<T, E> helper (CLAUDE.md L327; decided 5-A.6)
│   └── index.ts
│
├── prompts/                    # Stage 5-A.4 (generated PROMPT_LIBRARY + lookup)
│   ├── _generated.ts           # auto-generated, CI-verified in-sync
│   ├── types.ts                # PromptEntry Zod schema + PromptKey type
│   ├── index.ts                # public API: getPrompt, renderPrompt
│   └── interpolation.ts        # internal: {placeholder} → value substitution
│
└── shared/                     # cross-cutting utils only (small, no inward dep)
    ├── path.ts                 # cwd resolution, .agora/ root finding
    ├── io.ts                   # atomic file ops, JSON read/write helpers
    └── fingerprint.ts          # sha256 helpers for cache keys

messages/                       # Stage 6 fills, locale catalog (Stage 4-A.6 R5-A)
├── en.json
└── ko.json

tests/                          # Separate tree, mirrors src/ (R4-A)
├── unit/                       # mirrors src/ structure 1:1
│   ├── probes/runner.test.ts
│   ├── config/loader.test.ts
│   └── ...
├── integration/                # cross-module flows
│   ├── alignment-loop.test.ts
│   ├── ralph-loop.test.ts
│   └── ...
└── fixtures/
    ├── projects/               # synthetic project layouts for probe tests
    └── seeds/                  # canonical .agora/seed.json fixtures
```

### Notes on the tree

- **`src/llm/`** (not `src/claude/`): leaves room for future runner adapters
  per ADR-0005 + north-star ("when Codex CLI or future Anthropic
  competitor reaches Claude-Code parity, Agora supports it").
- **`src/philosophers/`** vs **`src/critics/`**: philosophers are
  *operational methodology modules* (Husserl/Socrates/Aristotle/Plato/
  Aquinas — the 5 first-class). Critics are Aquinas's per-gate persona
  roster (10 personas executing his Disputatio method). Plural critics
  come from one philosopher; do not conflate.
- **`src/result/`** is a single-file area for the Result<T,E> helper.
  Stage 5-A.6 finalizes its shape; the directory exists from the
  beginning so other modules can prepare their import paths.
- **`messages/`** is at repo root, NOT inside `src/`. It ships in npm
  `files: ["dist", "messages", ...]` (Stage 4-A.1 install spec) and is
  read at runtime, not bundled.
- **`shared/`** rule: only utilities with **zero inward dep on `src/<feature>/`**.
  If a helper needs to know about probes or config, it belongs to that
  feature, not shared.

---

## Feature-Folder + Layered Rule [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Top-level directories are organized by feature (`alignment/`,
> `ralph/`, `probes/`, `mcp/`) but import rules are layered. Two
> paradigms, each playing to its strength: feature for navigation, layer
> for isolation.

### Layers

```
LAYER 0 (no deps within src/, only stdlib + zod/commander/clack/picocolors):
  shared/            (path / io / fingerprint helpers)
  result/            (Result<T, E>)
  errors/types.ts    (AgoraError type only — codes.ts is layer 0 too)
  errors/codes.ts    (ERROR_CATALOG, no runtime deps)
  i18n/              (catalog lookup with no other src/ dep)
  prompts/           (generated PROMPT_LIBRARY + lookup API — Stage 5-A.4)

LAYER 1 (depends on Layer 0):
  config/            (schema + loader + env + explain)
  state/             (reader + writer + bypass)
  llm/               (runner + cli-runner + sdk-runner + cached-runner + cache + selection)
  probes/            (types + runner + registry + cache + markers + definitions/*)
  critics/           (registry + selection + definitions/*)
  philosophers/      (husserl + socrates + aristotle + plato + aquinas)

LAYER 2 (depends on Layer 0+1):
  alignment/         (orchestrator + phases + recommendations + seed-builder + preview)
  ralph/             (orchestrator + workspace + gates + disputatio)
  handoff/           (dihairesis + ac-tree + state-machine + audit)
  mcp/               (server + tools + host-action)

LAYER 3 (top — depends on all):
  cli/               (index + render + flags + commands/*)
```

### Forbidden imports (strict)

| Forbidden | Rationale |
|-----------|-----------|
| `cli/` imported by anything else | Top is sink; commands are leaves |
| `alignment/` ↔ `ralph/` peer imports | Decoupled via `state/` (single phase pointer) |
| `philosophers/*.ts` imports `llm/` | Philosophers describe methods; runners call them |
| `critics/*.ts` imports `llm/` | Same — critics are personas; gate code calls runner |
| `probes/definitions/<id>.ts` imports outside `probes/` + `shared/markers` boundary | Each probe is self-contained except for markers helper |
| `definitions/` siblings (probe ↔ probe, critic ↔ critic) | Single-file scope; avoid cycles |
| Layer N imports Layer M where M > N | Standard layered rule |
| Anything imports `tests/` | Tests are sinks |

### Allowed dependencies (representative)

```
cli/commands/ralph.ts
  → ralph/orchestrator.ts          (layer 3 → 2)
  → state/reader.ts                (layer 3 → 1)
  → render.ts                      (sibling)
  → errors/build.ts                (layer 3 → 0)

ralph/orchestrator.ts
  → ralph/gate-1-deterministic.ts  (sibling within feature)
  → handoff/state-machine.ts       (layer 2 → 2 same-layer cross-feature OK)
  → llm/runner.ts                  (layer 2 → 1)
  → philosophers/aquinas.ts        (layer 2 → 1)
  → critics/selection.ts           (layer 2 → 1)
  → probes/runner.ts               (layer 2 → 1, for Gate 0)
  → result/index.ts                (layer 2 → 0)

probes/definitions/vercel.ts
  → probes/types.ts                (sibling)
  → probes/markers.ts              (sibling)
  ✗ probes/definitions/gh.ts      (forbidden: definition siblings)
  ✗ config/schema.ts               (forbidden: probes are layer 1, config is layer 1, but
                                    cross-feature same-layer is allowed only at orchestrator
                                    level — definitions are leaf)
```

### Same-layer cross-feature rule

Layer N modules **can** import other Layer N modules across features
ONLY at orchestrator level (top file in each feature folder):

- ✅ `alignment/orchestrator.ts` → `handoff/state-machine.ts`
- ✅ `ralph/orchestrator.ts` → `handoff/dihairesis.ts`
- ❌ `alignment/phase-0-scan.ts` → `ralph/workspace.ts`

This keeps cross-feature coupling explicit and reviewable.

R2-B (pure layered: `src/domain/`, `src/infra/`, `src/cli/`) rejected:
alignment + ralph + handoff would all blob into `domain/`, losing
navigability of the two-loop structure that defines Agora.
R2-C (pure feature, no layered enforcement) rejected: cycles inevitable
at scale; Stage 6+ would need layer rules anyway, retrofitted.

---

## Dependency Enforcement [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Layered + forbidden rules enforced by the linter, not by
> reviewer attention. CI fails on violation.

### Mechanism: Biome import-restriction rules

Biome 2 (already in stack per CLAUDE.md L221) supports
`useImportRestrictions` rule via `biome.json`. Configuration sketch:

```jsonc
// biome.json (additions for Stage 6 implementation)
{
  "linter": {
    "rules": {
      "nursery": {
        "useImportRestrictions": "error"
      }
    }
  },
  "overrides": [
    {
      "include": ["src/cli/**"],
      "linter": { "rules": { /* cli is sink — no extra restriction */ } }
    },
    {
      "include": ["src/alignment/**"],
      "linter": {
        "rules": {
          "nursery": {
            "useImportRestrictions": {
              "level": "error",
              "options": {
                "deny": [
                  "@/ralph/*",     // peer feature
                  "@/cli/*"        // upward layer
                ]
              }
            }
          }
        }
      }
    },
    {
      "include": ["src/philosophers/**", "src/critics/**"],
      "linter": {
        "rules": {
          "nursery": {
            "useImportRestrictions": {
              "options": { "deny": ["@/llm/*"] }
            }
          }
        }
      }
    },
    {
      "include": ["src/probes/definitions/**"],
      "linter": {
        "rules": {
          "nursery": {
            "useImportRestrictions": {
              "options": {
                "allow": ["@/probes/types", "@/probes/markers", "@/shared/*"]
              }
            }
          }
        }
      }
    }
    // ... per-layer overrides for ralph, handoff, mcp, config, state, llm, probes/runner, etc.
  ]
}
```

If Biome's `useImportRestrictions` rule turns out to lack expressiveness
(e.g. can't represent "same-layer cross-feature only at orchestrator
file"), Stage 6 falls back to a small custom Biome / ESLint plugin
(~100 LOC) that walks `import` declarations against the layer table
above. No new runtime dep — dev-only.

### CI hook

```bash
pnpm lint  # already in package.json — Biome runs all rules including imports
```

PR fails if any import violates the table.

R3-B (documentation only, no lint enforcement) rejected: drift inevitable
once codebase grows past ~20 files; reviewer attention is not a guarantee.
R3-C (Nx / Turborepo monorepo tooling) rejected: overkill for a single
package; ADR-0001 minimalism violated.

### Migration note

Existing `src/cli/index.ts` placeholder has no imports yet — no migration
needed. Stage 6 first vertical slice will be the first code subject to
the rule; the rule comes online in lockstep with the first imports.

---

## Test File Organization [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Tests live under `tests/`, mirror `src/` structure, separate
> from shippable source.

### Decision

**Separate `tests/` tree** (extends Stage 0's `tests/smoke.test.ts`
convention).

```
tests/
├── unit/                       # mirrors src/ structure 1:1
│   ├── alignment/
│   │   ├── orchestrator.test.ts
│   │   ├── phase-0-scan.test.ts
│   │   └── ...
│   ├── probes/
│   │   ├── runner.test.ts
│   │   ├── markers.test.ts
│   │   └── definitions/
│   │       ├── claude.test.ts
│   │       └── ...
│   ├── config/
│   │   ├── loader.test.ts
│   │   └── ...
│   └── (every src/ file with non-trivial logic gets a *.test.ts here)
│
├── integration/                # cross-module flows
│   ├── alignment-loop.test.ts          # full Phase −1 → Phase 2 → Y2/Y3
│   ├── ralph-loop.test.ts              # Gate 0 → Gate 5 → Z1/Z2
│   ├── handoff.test.ts                 # alignment seed → handoff → ralph start
│   ├── cli-default.test.ts             # `agora` (no args) end-to-end
│   ├── cli-doctor.test.ts              # `agora doctor` end-to-end
│   ├── mcp-server.test.ts              # MCP protocol roundtrip via stdin/stdout
│   └── config-precedence.test.ts       # CLI > env > project > global > default
│
└── fixtures/
    ├── projects/               # synthetic project layouts for probe + scan tests
    │   ├── greenfield-empty/
    │   ├── brownfield-react-vercel/
    │   ├── brownfield-supabase/
    │   └── ...
    ├── seeds/                  # canonical .agora/seed.json fixtures
    │   ├── minimal.json
    │   ├── full-three-phase.json
    │   └── ...
    └── llm-responses/          # canonical claude --print outputs for runner tests
        ├── ping-success.json
        ├── auth-failed.txt
        └── ...
```

### npm `files` field stays clean

Stage 4-A.1's npm package shape:

```jsonc
"files": ["dist", "messages", "probes", "README.md", "LICENSE", "CREDITS.md"]
```

`tests/` is **not** in `files`. No exclude-glob gymnastics in
`package.json`. `dist/` is built from `src/` only (`tsconfig.build.json`'s
`include: ["src/**/*"]`).

### Vitest config alignment

```typescript
// vitest.config.ts (already exists from Stage 0)
{
  test: {
    include: ["tests/**/*.test.ts"],     // tests live under tests/
  },
  resolve: {
    alias: { "@": "./src" },             // mirror tsconfig path alias
  },
}
```

Existing config already does this — no change needed.

R4-B (colocation: `src/probes/runner.test.ts`) rejected: requires
exclude-glob in `files`, build configs, vitest configs; one source-of-
truth-per-file is nicer to read but the cost shows up in 4+ config files.
R4-C (hybrid: unit colocated, integration separate) rejected: two
policies → "where does this test go?" becomes a recurring question.

---

## Path Alias Configuration [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Single `@/*` alias maps to `src/*`. Already configured in
> `tsconfig.json`. CLAUDE.md L336 unchanged.

### Verified existing configuration

```jsonc
// tsconfig.json (verified 2026-05-03)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

This configuration was set in Stage 0 and is **canonical**. Stage 5-A.1
codifies it as SPEC.

### Required mirroring

Every other tool that resolves modules MUST mirror this alias. v1
inventory:

| Tool | Config file | Required alias entry |
|------|-------------|----------------------|
| TypeScript | `tsconfig.json` | `"@/*": ["src/*"]` ✅ already set |
| Biome | `biome.json` | `useImportRestrictions` references use `@/` paths |
| Vitest | `vitest.config.ts` | `resolve.alias = { "@": "./src" }` (Stage 6 verifies) |
| Tsx (dev runtime) | `tsx` reads `tsconfig.json` natively | no extra config needed |

### Usage convention

```typescript
// ✅ Source files (src/) — relative imports with .js extension
//    Required because tsc + Node ESM (NodeNext) does NOT rewrite path
//    aliases at build time. Stage 6-A.1 implementation discovered this
//    during first slice. Adding tsc-alias would be a new dev-dep
//    (ADR-0001 minimalism); relative imports work natively.
import { localized } from "../i18n/index.js";              // cross-feature
import { Probe } from "./types.js";                         // same-feature

// ✅ Test files (tests/) — `@/*` alias works (vitest config provides it)
import { runVersionCommand } from "@/cli/commands/version.js";
import type { Probe } from "@/probes/types.js";

// ❌ forbidden — non-aliased absolute path
import { ConfigSchema } from "/Users/sang/Developer/agora/src/config/schema";
```

**Source vs test asymmetry rationale**:
- Source files compile to `dist/` and run on Node. Node's ESM resolver
  cannot follow path aliases without a build step (tsc-alias) — added
  dev-dep cost. Stage 6-A.1 picked relative imports for source.
- Test files run via vitest, which has its own resolver. `vitest.config.ts`
  provides `resolve.alias = { "@": "./src" }`, so tests use `@/*`
  comfortably.
- typecheck (`tsc --noEmit`) honors `tsconfig.json` paths for both, so
  authoring is identical from a type perspective. Only the import-path
  string at runtime differs.

`.js` extensions in source imports are mandatory under NodeNext —
TypeScript resolves `.js` to `.ts` source at compile time, then emits
`.js` for Node to load.

### No per-area aliases

`@probes/*`, `@cli/*`, `@errors/*` etc. are intentionally **not**
introduced. Reasons:

- Alias proliferation makes refactor (move file across folders) require
  alias config edits in addition to import edits
- Single `@/*` is sufficient at any scale (the `src/` prefix in `@/probes/runner`
  is one extra path segment, not a readability problem)
- Multiple aliases proliferate across each tool's config (TS + Biome +
  Vitest + tsx) — single alias keeps maintenance to one place per tool

R5-B (per-area aliases) rejected: maintenance overhead without benefit.
R5-C (no alias, all relative) rejected: violates CLAUDE.md L336;
cross-feature deep-relative paths become unreadable at depth.

---

## Boundaries

- ❌ `src/agora/*` namespace middle (R1-B rejected): redundant package brand.
- ❌ Pure layered `src/domain/...` (R2-B rejected): blobs alignment + ralph + handoff.
- ❌ Pure feature without layer rules (R2-C rejected): cycle-prone at scale.
- ❌ Doc-only enforcement (R3-B rejected): drift inevitable.
- ❌ Monorepo tooling (R3-C rejected): overkill, ADR-0001 minimalism.
- ❌ Test colocation (R4-B rejected): config gymnastics in 4+ files.
- ❌ Hybrid test layout (R4-C rejected): two-policy confusion.
- ❌ Per-area aliases (R5-B rejected): maintenance overhead.
- ❌ No alias (R5-C rejected): CLAUDE.md L336 violation.
- ❌ Definition siblings importing each other (probe ↔ probe, critic ↔ critic).
- ❌ Same-layer cross-feature import outside orchestrator file.
- ❌ Anything importing `cli/` (top is sink).
- ❌ Test files importing `tests/` siblings across features (use fixtures).

## Failure modes specifically guarded

- **Import cycles**: layered rule + same-layer cross-feature restricted
  to orchestrators makes cycles structurally impossible at the layer
  level.
- **Hidden coupling between alignment and ralph**: peer features
  communicate ONLY through `state/`; direct import forbidden.
- **Philosopher modules accidentally calling LLM directly**: forbidden
  import rule blocks `philosophers/*.ts` → `llm/*`. Runners are the
  only LLM callers.
- **`shared/` becoming a god module**: rule "zero inward dep on `src/<feature>/`"
  caps it at primitives.
- **Probe definition siblings cycling**: forbidden import rule.
- **Top-level `cli/` reused as a library**: forbidden inbound import
  forces a clean entry-point boundary.
- **Refactor moving a file requires N alias edits**: single `@/*` alias
  means refactor edits are import paths only, not config.

## Output consumed by

- **Stage 5-A.2 ~ 5-A.6**: every subsequent Stage 5 SPEC references
  paths from this tree (philosopher runbooks live at
  `docs/philosophers/runbooks/<name>.md` referencing `src/philosophers/<name>.ts`).
- **Stage 6 implementation**: every new file lands somewhere in this
  tree; layer rule enforced by Biome from the first commit.
- **CLAUDE.md L256-274**: file tree section to be updated with a
  cross-reference to this SPEC (canonical) + the historical CLAUDE.md
  examples kept as illustrative.
- **ADR-0006**: file paths inside (`src/agora/infra/probes/`) are
  preserved as historical record; this SPEC supersedes them for
  implementation.
- **`tsconfig.build.json`** (Stage 6): `include: ["src/**/*"]`,
  `exclude: ["**/*.test.ts"]` (no tests in shipped dist, since tests
  live in `tests/` not `src/` — exclude line is defensive).
- **`biome.json`** (Stage 6): `useImportRestrictions` rule with per-area
  overrides per the layer table.

---

## CLAUDE.md alignment

CLAUDE.md L256-274 (the project structure tree) was written in Stage 0
with `src/agora/` examples. This SPEC supersedes those paths.
CLAUDE.md is updated to:

1. Replace the `src/agora/...` tree examples with the canonical tree
   from this document (or a short summary + link here).
2. Reference this SPEC as the authoritative file-tree source.
3. Keep ADR-0006 unchanged (immutable record).

That update happens in the same commit as this SPEC.
