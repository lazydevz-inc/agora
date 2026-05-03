# Stage 5 — Internal Architecture + Philosopher Runbooks + Prompts

> **Status**: Active (opened 2026-05-03 after Stage 4 close)
> **Goal**: Specify the internal module organization, where every
> Stage 4 contract physically lives, how the 5 philosophers operate
> per-phase (their canonical prompts and expected outputs), and the
> shared infra (prompt library, locale catalog, Result type) that
> Stage 6 implementation depends on.
> **Done when**: `docs/architecture/module-graph.md`,
> `docs/philosophers/runbooks/<each>.md` (5 files),
> `docs/architecture/prompt-library.md`, and the locale catalog rules
> are marked Accepted.

---

## Stage 5 sub-questions (estimated 6)

```
5-A.1  Module / file-tree organization     ← where every Stage 4 contract lives
5-A.2  Per-philosopher runbook template    ← canonical structure for all 5
5-A.3  5 philosopher runbooks (batch)      ← Husserl/Socrates/Aristotle/Plato/Aquinas
5-A.4  Prompt library structure + storage  ← canonical prompts versioned + tested
5-A.5  Locale catalog content rules        ← en.json/ko.json key naming + parity CI
5-A.6  Result<T,E> adoption decision       ← carried from CLAUDE.md L327
```

Order rationale:
- 5-A.1 is the foundation — every other Stage 5 doc references the file paths it lands at
- 5-A.2 establishes the runbook DTD before producing 5 of them
- 5-A.3 batches the 5 philosophers (one round, recommended-options for each — Mode A territory since Sang has domain expertise here)
- 5-A.4 systemizes the prompts the runbooks cite
- 5-A.5 makes the Stage 4-A.6 F1 enforcement actionable
- 5-A.6 is the small-but-pervasive type decision that affects every module from Stage 6 onward

---

## What this stage settles vs defers

**Settled in Stage 5**:
- Concrete `src/` directory layout with module dependencies
- Per-philosopher runbook (when called, what prompt, what output, what tests)
- Prompt library file format + storage location + versioning
- Locale catalog naming convention + CI parity rules
- `Result<T, E>` shape + when to use vs throw

**Deferred to Stage 6**:
- Actual locale catalog content (the strings themselves)
- Actual prompt content (drafts may exist; final prompts pin in Stage 6)
- Library bindings (commander vs citty, TOML parser, MCP SDK)
- Test fixture conventions
- First vertical slice implementation

---

## Working principle for Stage 5

Stage 5 is **architecture + content templates**. SPECs lean toward "what
file lives where, what does each philosopher actually do at each phase,
what's the contract between modules" rather than "how does the user feel."

Mode mix: **Mode A** for philosopher runbooks (Sang has domain expertise
in the philosophical methods themselves — Stage 1 was driven by his deep
reading) + **Mode B** for module organization and Result<T,E> (technical
calls Sang has delegated).

Some decisions may surface a 6th-philosopher candidacy (deferred per
Stage 1, re-openable per first-real-use). If it surfaces, ADR-spawn rather
than sneaking in.

---

## Stage 5 will produce

- `docs/architecture/module-graph.md` — file tree + dependency rules
- `docs/architecture/prompt-library.md` — prompt format + storage
- `docs/philosophers/runbooks/husserl.md`
- `docs/philosophers/runbooks/socrates.md`
- `docs/philosophers/runbooks/aristotle.md`
- `docs/philosophers/runbooks/plato.md`
- `docs/philosophers/runbooks/aquinas.md`
- (Possibly) 1 ADR for `Result<T, E>` shape if non-trivial
- (Possibly) 1 ADR for module-graph layered constraints

Stage 5 close requires same gate as prior stages: deliverables Accepted,
Sang explicit approval, no Proposed ADRs.

---

## Progress Log

### Stage 5-A.1 — DONE (2026-05-03)

Module / file-tree organization specified. Five decisions accepted (all
recommended).

- **R1-A**: Direct `src/<feature>/` layout (no `src/agora/*` namespace).
  CLAUDE.md L256-274 + ADR-0006의 `src/agora/...` 예시는 illustrative
  (historical) 처리. Stage 4 SPEC convention 채택. R1-B (`src/agora/*`
  유지) rejected (redundant brand); R1-C (hybrid) rejected (two-policy
  confusion).
- **R2-A**: Feature-folder + layered rule. Top-level dirs는 feature
  (`alignment/`, `ralph/`, `probes/`, `mcp/`...), import 규칙은 layered
  (LAYER 0~3). 같은 레이어 cross-feature import은 orchestrator 파일에서만
  허용. R2-B (pure layered) rejected (alignment/ralph/handoff blob);
  R2-C (pure feature) rejected (cycle-prone).
- **R3-A**: Biome `useImportRestrictions` rule + per-area override.
  CI에서 fail. 추가 dep 없음. Biome 표현력 부족 시 ~100 LOC custom
  Biome/ESLint plugin (dev-only). R3-B (doc-only) rejected (drift);
  R3-C (Nx/Turborepo) rejected (overkill, ADR-0001 minimalism).
- **R4-A**: Separate `tests/` tree mirroring `src/` 구조. unit/ +
  integration/ + fixtures/. npm `files` 깨끗 (no exclude-glob gymnastics).
  Stage 0의 `tests/smoke.test.ts` 컨벤션 연속. R4-B (colocation)
  rejected (config gymnastics in 4+ files); R4-C (hybrid) rejected
  (two-policy confusion).
- **R5-A**: Single `@/*` → `src/*` alias. Stage 0 tsconfig에 이미
  설정됨 — 검증 완료. Biome / Vitest / tsx 모두 mirror. Within-feature
  sibling은 `./` relative 허용; cross-feature는 `@/` 강제. R5-B
  (per-area aliases) rejected (maintenance overhead); R5-C (no alias)
  rejected (CLAUDE.md L336 위반).

Layer table:
  LAYER 0: shared/ result/ errors/{types,codes} i18n/
  LAYER 1: config/ state/ llm/ probes/ critics/ philosophers/
  LAYER 2: alignment/ ralph/ handoff/ mcp/
  LAYER 3: cli/ (top sink)

Forbidden imports (12 rules):
  - cli/ imported by anything else
  - alignment/ ↔ ralph/ peer imports
  - philosophers/*.ts → llm/*
  - critics/*.ts → llm/*
  - probes/definitions/<id>.ts → outside probes/+shared/markers
  - definitions/ siblings (probe↔probe, critic↔critic)
  - Layer N → Layer M where M > N
  - same-layer cross-feature outside orchestrator file
  - anything → tests/

Notable structural decisions:
  - `src/llm/` (not `src/claude/`) — 미래 Codex/competitor adapter 여지
    (north-star + ADR-0005 일관)
  - `src/philosophers/` (5 methodology modules) vs `src/critics/`
    (10 Aquinas personas) — plurals come from one philosopher, do not
    conflate
  - `src/result/` 디렉토리는 Stage 5-A.6 결정 전에도 존재 (import path
    예약)
  - `messages/`는 repo root (npm files에 포함, runtime read)
  - `shared/`는 zero-inward-dep 강제 — god module 방지

Failure modes guarded:
  - Import cycles                  → layered rule + same-layer restriction
  - alignment/ralph hidden coupling → state/만 통과
  - Philosopher → LLM 직접 호출    → forbidden import rule
  - shared/ god module             → zero-inward-dep cap
  - Probe definition cycle         → forbidden import rule
  - cli/ as library                → forbidden inbound import
  - N-alias refactor cost          → single @/* alias

Full SPEC committed to `docs/architecture/module-graph.md` with 5 [SPEC]
sections + complete canonical tree + layer table + forbidden list +
biome.json sketch + tests/ tree + alias usage convention.

CLAUDE.md L256-274 updated:
  - File tree section replaced with summary pointing to module-graph.md
  - `src/agora/*` historical examples replaced with canonical
    `src/<feature>/` mapping
  - ADR-0006 left as-is (immutable historical record)

### Stage 5-A.2 — DONE (2026-05-03)

Per-philosopher runbook template (DTD) specified. Five decisions
accepted (all recommended).

- **R1-A**: 12-section DTD enforced for all 5 runbooks: When-called →
  Input → Method (concept/operationalize/failure-mode) → Prompt →
  Output → Quality bar → Forbidden → Test contract → File map →
  Boundaries → Examples (optional) → Revision history. Front matter +
  fixed order. R1-B (6-section short) rejected (drops quality/examples/
  revision); R1-C (free form) rejected (comparability loss across 5).
- **R2-A**: Runbook section 4 holds canonical prompt text. Stage 5-A.4's
  prompt-library.md is **indexed catalog only**, derived from runbooks
  (manual library edits forbidden — generator script in Stage 6). Key
  format: `<philosopher_name>:<prompt_id>` (e.g. `aquinas:respondeo`).
  R2-B (library canonical) rejected (philosopher-centric reading flow lost);
  R2-C (duplicate) rejected (drift).
- **R3-A**: Section 8 enumerates 4 mandatory test categories: schema
  conformance / quality-bar threshold / negative tests (forbidden behaviors
  fire) / locale parity (en/ko). Plus integration tests participated in.
  R3-B (delegate to test file) rejected (runbook loses verification intent);
  R3-C (Given/When/Then BDD) rejected (heavy for schema+threshold checks).
- **R4-A**: Section 11 (Examples / Anti-examples) **optional but
  recommended**. INCLUDE when failure mode is subtle (Aquinas, Husserl)
  or output is multi-element with non-obvious composition (Plato Dihairesis)
  or addresses an AI pattern that looks fine but isn't (Socrates leading
  questions). OMIT when method is immediately graspable from operationalization
  (Aristotle Four Causes telos extraction). R4-B (mandatory) rejected
  (contrived examples for self-evident); R4-C (forbidden) rejected
  (subtle methods need them).
- **R5-A**: `Revision: N` integer in front matter + section 12 changelog
  table (Rev/Date/Change/By). Bump REQUIRED on prompt meaningful change /
  output contract / quality bar / forbidden list / when-called trigger
  change. NOT required for typo/grammar/format/cross-ref/example/file-map
  changes. Stage 6 implementation files cite `// runbook: <name>@N`;
  CI lint warns on revision bump. R5-B (git history only) rejected
  (intent vs typo indistinguishable); R5-C (semver) rejected
  (5 × 3-tier overload).

Canonical 12 sections (in order):
  Front matter: Module / Phase / Method one-line / Inherited from /
                Status / Revision
  1. When this is called           (trigger + pre-conditions + skip)
  2. Input contract                 (TypeScript interface)
  3. Method                         (3.1 Concept / 3.2 Operationalization
                                     / 3.3 Failure mode addressed)
  4. Prompt                         (canonical text per prompt_id)
  5. Output contract                (TS interface + worked example)
  6. Quality bar                    (quantitative + qualitative)
  7. Forbidden in this runbook      (philosopher-specific F-rules)
  8. Test contract                  (4 categories + integration tests)
  9. File map                       (paths table)
  10. Boundaries                    (rejection-by-name list)
  11. Examples / Anti-examples      (optional, recommended for subtle)
  12. Revision history              (Rev/Date/Change/By table)

Why runbook-canonical, library-indexed (R2-A): runbook reading flow is
philosopher-centric — prompt belongs to the philosopher, not a flat
catalog. Library serves implementation lookup + CI fingerprint check.
Single source of truth — edits in runbook, library auto-regen.

Why optional examples (R4-A): aligns with Stage 1 user feedback
("examples 필요한 상황이나 유저가 원하는 경우는 있으면 좋겠지만, 대부분
유저는 어떤 느낌을 원하는지는 있지만..."). Same principle for runbooks:
examples that don't earn their place become noise. Author judgment per
runbook.

Why integer revision, not semver (R5-A): the question dependent code
asks is "did this change enough that I must reverify?" — integer maps
directly. Semver would force major/minor/patch decisions per runbook
that don't carry distinct meaning in this domain.

Boundaries enforced (12 rejections by name).

Failure modes guarded:
  - Reading-experience drift across 5 runbooks → fixed 12-section DTD
  - Prompt drift runbook ↔ library             → runbook canonical, library auto-derived
  - Verification gaps in unit tests             → 4 mandatory categories
  - Subtle method becomes black box             → examples included when warranted
  - Untracked method changes                    → revision bump rules
  - Stale impl against revised runbook          → // runbook: <name>@N + CI lint

Full SPEC committed to `docs/architecture/runbook-template.md` with 6
[SPEC] sections + canonical template.

Companion `docs/philosophers/runbooks/_template.md` (leading underscore
= not a runbook itself) committed for Stage 5-A.3 copy-paste.

Next task: Stage 5-A.3 — 5 philosopher runbooks (batch instantiation of
template). Husserl / Socrates / Aristotle / Plato / Aquinas — each at
`docs/philosophers/runbooks/<name>.md`. Possibly multi-round given
domain depth (Mode A territory — Sang's expertise drives content).
