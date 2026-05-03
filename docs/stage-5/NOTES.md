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

### Stage 5-A.3 — DONE (2026-05-03)

5 philosopher runbooks completed in batch (Sang chose Option A).
Each follows the 12-section DTD from Stage 5-A.2.

**Husserl** (`docs/philosophers/runbooks/husserl.md`):
  Phase −1 Epoché. Greenfield default-on, brownfield default-off + skip
  rules. Single prompt (multi-step: Software/Form/Audience brackets +
  surprising_findings). DefendedFrame output. Failure mode: solution-
  frame contamination. F-rules: ritual brackets (50-char follow-up),
  over-bracketing, generic brackets, never propose solutions, never
  affirm/deny frame. Examples included (subtle method).

**Socrates** (`docs/philosophers/runbooks/socrates.md`):
  Phase 2 conductor — every load-bearing claim. Single prompt
  (case construction + probing). ElenchedClaim output. Failure mode:
  confidence-without-test (sycophantic paraphrase). F-rules: user-restate
  patterns, decorative-claim probing, strawman cases, zero-aporia rate
  trigger, multiple questions per turn, context-free questions after
  round 1. Quality bar includes brownfield-grounding ≥ 60% + aporia rate
  ≥ 1-in-5. Examples included (leading-question failure subtle).

**Aristotle** (`docs/philosophers/runbooks/aristotle.md`):
  Phase 2 structuring. 4 separate prompts (telos with 3 sub-questions /
  form / material / efficient). FourCauses output. Failure mode: telos
  collapse (gravitates to material/form). F-rules: noun-phrase as telos,
  material-leading interview, efficient-skip for solo, telos-Pistis
  override, user-configurable order, combined sub-questions, skipping
  failure_signal. Telos instability interrupt. Examples omitted (clear
  method per R4-A guidance — add in rev 2 if calibration needed).

**Plato** (`docs/philosophers/runbooks/plato.md`):
  TWO operations in one runbook (Divided Line at Phase 2 + Y2 termination,
  Dihairesis at handoff). Two prompts (y2-noesis-test + dihairesis-decompose).
  Two outputs (PlatoDLOutput + PlatoDHOutput). Failure modes: optimistic
  maturity (DL) + convenient-cuts vs natural-cuts (DH). Concept doc
  rationale for keeping both in one runbook honored (Plato is one
  philosopher with two methods — not two philosophers). Examples
  included for both DL (Noesis on form) and DH (natural cut: trust
  vs charge execution; anti-example: feature-aligned credit-card vs
  subscription).

**Aquinas** (`docs/philosophers/runbooks/aquinas.md`):
  Ralph Gates 3 + 4. 4 prompts (videtur orchestration + sed-contra +
  respondeo + ad-singula). Critic prompts owned by `critics/`, NOT
  Aquinas — Aquinas orchestrates. Verdict output (per-objection ruling
  map, never vote). Failure modes: F-Aquinas-1..5 (clustering oblivion,
  Sed-contra rationalization, Respondeo summarizing, Ad-singula skipping
  minor, overhead exceeds change). Skip condition for trivial diffs
  (< 10 lines). Examples included (Respondeo first-paragraph anti-example
  shows F-Aquinas-3 detection; Ad-singula silent-skip anti-example shows
  F-Aquinas-4 detection).

Common patterns across all 5:
  - Layer rule honored: every runbook section 7 includes "❌ Calling
    llm/* directly" — orchestrator routes to ClaudeRunner per Stage 5-A.1
  - All 5 cite Stage 1 concept doc (`docs/philosophy/0X-...md`) in front
    matter "Inherited from"
  - All 5 explicitly cross-reference Stage 2 SPECs by name + line
  - Each prompt includes Hard rules numbered + per-rule mitigation
  - Each output contract is full TypeScript interface (Zod-ready for
    Stage 4-A.3 R1-A validation pattern)
  - Test contract section 8 has 4 mandatory categories per Stage 5-A.2 R3
  - All forbidden lists extend the global F1-F8 with philosopher-specific
    F-rules (e.g. F-Husserl-1, F-Socrates-1..4, F-Aristotle-1..4,
    F-Plato-DL-1..2 + F-Plato-DH-1..3, F-Aquinas-1..5)

Cross-philosopher integration verified in each runbook:
  Husserl → Aristotle (defended_frame → telos extraction starts on
                       examined frame)
  Aristotle → Socrates (cause-statement → case probe)
  Socrates → Plato (ElenchedClaim → maturity tag)
  Plato (DL) → Aristotle interrupt (when telos slips below floor mid-round)
  Plato (DH) → Aquinas (rejected_alternatives → Sed contra criterion;
                        ac_tree → Aquinas's relevant_ac_node_ids)
  Aquinas does NOT see Husserl/Socrates outputs directly — alignment
    is settled before Ralph; Aquinas reads the locked seed only.

Boundaries enforced (collectively ~50 rejections by name across 5).

Failure modes guarded across all 5: comprehensive coverage of the AI-
coding pipeline failure surfaces — solution-frame contamination,
confidence-without-test, telos collapse, optimistic maturity, convenient
cuts, vote-driven consensus, and silent overruling.

Next task: Stage 5-A.4 — Prompt library structure + storage location.
Indexes runbook section 4 prompts by `<philosopher_name>:<prompt_id>`
key. Library is auto-derived from runbooks (manual edits forbidden per
Stage 5-A.2 R2-A). Must define: file format (YAML/JSON/TS), generation
mechanism, fingerprint check, library file location.

All 5 runbook prompt IDs declared (count: 12 total prompts — Aristotle has 4 sub-prompts; original draft mentioned 11 in error):
  husserl:phase-minus-1-bracket
  socrates:elenchus-round
  aristotle:telos-question, aristotle:form-question,
  aristotle:material-question, aristotle:efficient-question
  plato:y2-noesis-test, plato:dihairesis-decompose
  aquinas:videtur (orchestration), aquinas:sed-contra,
  aquinas:respondeo, aquinas:ad-singula

(Aquinas videtur is orchestration — actual critic prompts live in
critics/definitions/ per Stage 5-A.1 module layout. Stage 5-A.4 will
clarify whether critic prompts also flow into prompt-library.md.)

### Stage 5-A.3 Rev 2 (post-review fixes, 2026-05-03)

Sang requested independent review after batch commit (Option A regret).
Spawned a fresh-eyes review agent against authoritative SPECs (concept
docs Stage 1, alignment-loop.md, ralph-loop.md, handoff.md, module-graph.md,
llm-integration.md). Agent found 3 CRITICAL + 5 HIGH + 5 MEDIUM issues
concentrated in Plato (3 critical), Aristotle (2 high), Socrates (2 medium),
Husserl (2 medium), Aquinas (1 medium grammar). Verified each finding
against cited SPEC line numbers before fixing.

**Plato Rev 2** — most damage:
  C1: REQUIRED_FLOORS dict was paraphrased (collapsed telos.* to single
      Noesis floor when failure_signal is DIANOIA per R2-A; called field
      `evaluation_principles` when SPEC says `ontology`). Now verbatim
      from alignment-loop.md L1202-1212.
  C2: 3-AND atomicity criteria were "single file / single concern / one
      Claude session" (invented). Now verbatim per Stage 2-C.1 R1-A
      `is_atomic()` (handoff.md L118-131): `llm_session_judgment AND
      estimated_file_touches ≤ 3 AND conjunction_count ≤ 1`.
  C3: ACNode TypeScript shape used nested `binary_split: { principle,
      alternatives_considered, children }` — actual SPEC (handoff.md
      L92-108) uses flat `split_principle, split_defense, alternatives_considered,
      arity, children`. Rewrote interface + section 5 worked example +
      section 6 quality bar + section 7 forbidden + section 8 test contract
      to match SPEC shape.
  M1: Cross-ref "Stage 2-C.1 R1-A (atomicity + 0.6 defense)" conflated
      two rules. Split: R1-A (atomicity), R3-A (DEFENSE_THRESHOLD).
  M5: `evaluation_principles` ghost in skip-conditions section also fixed
      via C1 propagation.
  H3: `--skip-dihairesis` flag mention dropped (no SPEC defines it) →
      Stage 2-B.7 bypass language with TBD note.

**Aristotle Rev 2**:
  H2: `5th cause...would require ADR superseding ADR-0006` — wrong ADR.
      ADR-0006 is Gate 0 infrastructure, not philosopher cap. Removed.
  H5: §1 cross-ref claimed "Stage 2-B.3 (Gate 4 critics use telos as
      criterion for Sed contra)" — Stage 2-B.3 actually defines a
      `telos_alignment` critic at Videtur (not Sed-contra). Reworded.

**Husserl Rev 2**:
  H3: `--skip-bracket` flag mention dropped (does not exist in any SPEC)
      → Stage 2-B.7 bypass language with TBD note.
  M4: §8 test #3 cited `buildAgoraError("config.invalid-toml" or new
      "user.aborted")` — uncertain. Replaced with existing `user.aborted`
      + note re Stage 4-A.6 catalog gap for `validation.*` family.

**Socrates Rev 2**:
  H4: §1 cross-ref claimed "Stage 2-B.4 case-construction sharing" —
      invented. Stage 2-B.4 is drift_score, no case construction shared.
      Dropped.
  H3: `--skip-elenchus` flag dropped → bypass-mechanism language.
  M3: PriorClaim.outcome enum was `"refined"`, but ElenchedClaim.outcome
      uses `"refined_with_addition"`. Misalignment meant Socrates outputs
      could not flow back as prior_round_history without translation.
      Aligned.

**Aquinas (NO Rev bump per R5-A typo rule)**:
  M2: §4 lead paragraph had broken grammar ("see X.md is for Y, not Z").
      Reworded for clarity. R5-A: typo/grammar fixes do not require
      revision bump.

**Template SPEC update**:
  Stage 5-A.4 prompt library will index against runbook IDs. Updated
  `docs/architecture/runbook-template.md` example prompt-id list to
  reflect runbook reality (Aristotle 4 sub-prompts; Plato y2-noesis-test
  not y2-divided-line-check). Total prompt count corrected: 11 → 12.

**Layer rule, F-rule completeness, locale parity, examples policy**:
  All verified clean by review agent. No fixes needed.

**Cross-philosopher type flow**:
  Husserl → Aristotle: DefendedFrame matches (verified clean).
  Aristotle → Socrates: orchestrator transforms FourCauses into per-claim
    SocratesInput (implicit; documented as orchestrator's job).
  Socrates → Plato: ElenchedClaim matches (verified clean).
  Plato (DH) → Aquinas: rejected_alternatives + ac_tree flow verified.

Outstanding (not blocking 5-A.4):
  - Stage 4-A.6 ERROR_CATALOG missing `validation.*` family — surface
    in next round of catalog evolution
  - Stage 2-B.7 lacks per-phase bypass flags — surface if/when CLI
    needs `--skip-{bracket,elenchus,dihairesis}` per real use case

Verdict from review agent: "fix before 5-A.4" — addressed. Proceeding
to Stage 5-A.4 (prompt library structure) on the corrected runbooks.

### Stage 5-A.4 — DONE (2026-05-03)

Prompt library structure + storage specified. Five decisions accepted
(all recommended).

- **R1-A**: Auto-generated TypeScript module at `src/prompts/_generated.ts`.
  `as const satisfies Record<string, PromptEntry>` gives compile-time key
  safety + literal types + Zod-validated shape. Zero runtime parse, zero
  new deps. PromptKey literal union derived from object keys — typo in
  lookup fails compile. R1-B (YAML) rejected (parser dep + parse cost +
  no compile-time check); R1-C (JSON) rejected (multi-line strings ugly,
  no compile-time check).
- **R2-A**: New feature folder `src/prompts/` (LAYER 0 — zero inward dep
  on src/<feature>/). Files: `_generated.ts` / `types.ts` / `index.ts`
  / `interpolation.ts` + `scripts/gen-prompts.ts`. Auto-bundled into
  `dist/`; no npm `files` array change needed. Module-graph LAYER 0 list
  extended in this commit. R2-B (yaml at repo root) rejected (parser
  dep, parse cost, npm files change); R2-C (markdown) rejected (still
  needs conversion script).
- **R3-A**: Hybrid library — both philosopher (12) AND critic (10) prompts
  in same library, namespaced keys. Philosopher keys: `<owner>:<prompt_id>`
  (e.g. `husserl:phase-minus-1-bracket`). Critic keys: `critic:<critic_id>`
  (e.g. `critic:tech-solid`). Total: 22 entries. Single SoT, uniform
  Stage 6 lookup, no two-system drift. Source-of-truth split preserved:
  philosopher prompts canonical in runbooks, critic prompts canonical
  in `src/critics/definitions/<id>.ts` exported `prompt` const. R3-B
  (philosopher only) rejected (drift, doubled lookup paths); R3-C
  (separate critic library) rejected (two libraries to sync).
- **R4-A**: Manual `pnpm gen:prompts` + CI `pnpm lint:prompts` (regen
  → diff against committed → fail on mismatch). Pre-commit hook deferred
  to Stage 6 (add only if real workflow shows chronic forgotten regens).
  Fingerprint algorithm: sha256 of normalized (system + user) text,
  whitespace-normalized so editor auto-format doesn't trigger spurious
  changes. R4-B (forced pre-commit) rejected (friction without need,
  ADR-0001 minimalism); R4-C (build-time only) rejected (dev mode goes
  stale silently).
- **R5-A**: Two-function API — `getPrompt(key)` (raw entry) and
  `renderPrompt(key, context)` (interpolation + system/user split).
  Compile-time key safety via PromptKey literal union. Two-sided
  interpolation validation: (1) declared placeholder missing from
  context → throw `internal.invariant-violation`; (2) template uses
  `{name}` not declared → throw same. Programming errors caught
  immediately, never silently filled. R5-B (direct named imports per
  prompt) rejected (22 exports clutter, dynamic critic lookup broken);
  R5-C (both APIs) rejected (surface duplication).

Library Entry schema (Zod):
  PromptEntrySchema = {
    namespace: "philosopher" | "critic",
    owner: kebab-case identifier,
    runbook?: string + runbook_revision?: int,    // iff philosopher
    critic_def?: string,                           // iff critic
    system_prompt: string,
    user_prompt_template: string,
    placeholders: string[],
    fingerprint: "sha256:<64-hex>",
    used_by: string[],                             // src/ files importing this prompt
  }
  .strict() rejects unknown keys (generator typo guard)
  .refine() enforces namespace ↔ pointer field correspondence

Generator algorithm specified (Stage 6 contract):
  1. Discover sources (runbook .md + critic .ts)
  2. Parse runbook section 4 + sub-sections (### 4.X <prompt_id>)
  3. Extract critic prompts via TS compiler API or strict regex
  4. Preserve `used_by` from prior _generated.ts
  5. Validate against PromptEntrySchema
  6. Sort (philosopher first, then critic, alphabetical within)
  7. Emit single file
  8. Run `pnpm typecheck --noEmit` to verify compiles

Module-graph update (in same commit):
  LAYER 0 list now includes `prompts/` as 6th entry
  Tree section adds full src/prompts/ subtree

Boundaries enforced (16 rejections by name).

Failure modes guarded:
  - Library out of sync with source         → CI lint regen + diff
  - Manual edit slipping in                 → header banner + CI catches
  - Typo in lookup key                      → compile-time PromptKey check
  - Missing placeholder at runtime          → throw with structured context
  - Undeclared placeholder used in template → throw same
  - Critic added but library forgotten      → CI lint fails
  - Runbook revised but library forgotten   → fingerprint mismatch
  - Whitespace-only edit changing fingerprint → normalization prevents
  - Cross-namespace key collision           → namespace prefixes disjoint
  - src/prompts/ becoming god module        → LAYER 0 zero-inward-dep

Cross-references for downstream:
  - Stage 5-A.5 (locale catalog) may extend generator to validate
    placeholder ↔ catalog key relationships if surfaced as need
  - Stage 5-A.6 (Result<T,E>) may convert renderPrompt's throw to
    Result.err in one place if adopted
  - Stage 6 generator (scripts/gen-prompts.ts) — picks markdown parser
    (likely lightweight per ADR-0001)

Full SPEC committed to `docs/architecture/prompt-library.md` with 7
[SPEC] sections + library entry schema + generator algorithm + boundaries
+ failure modes + output consumers.

### Stage 5-A.5 — DONE (2026-05-03)

Locale catalog content rules specified. Five decisions accepted (all
recommended).

- **R1-A**: JSON files at `messages/en.json` + `messages/ko.json` (repo
  root, per Stage 4-A.1). Build-time TypeScript JSON import via relative
  path `../../messages/<locale>.json` from `src/i18n/catalog.ts`. Native
  parse, zero new deps, i18n-tool compatible. R1-B (TS modules) rejected
  (build pipeline complexity, tool incompat); R1-C (TOML/YAML) rejected
  (dep + no native benefit).
- **R2-A**: Dot-segmented namespace, snake_case within. 7 reserved
  top-namespaces: `errors.*` (mirrors Stage 4-A.6 ERROR_CATALOG),
  `philosophers.*` (mirrors runbook owner), `cli.*` (per command +
  `cli.global.*`), `probes.*` (per probe id), `gates.*` (gate failures),
  `alignment.*` (phase user prompts), `ralph.*` (Ralph orchestrator
  user-facing). Max segment depth 4. `.fix` is the ONLY reserved suffix
  at v1 (Stage 4-A.6 R5-A pattern). New top-namespace requires SPEC update.
  R2-B (flat keys) rejected (lose namespace visibility); R2-C (camelCase)
  rejected (i18n convention mismatch).
- **R3-A**: Hybrid JSON structure — nested object for sections, but
  `.fix` paired keys stored as **flat leaf with dots in name**
  (e.g. `"missing_version.fix": "..."` directly under `errors.config`,
  not nested as `{ missing_version: { fix: "..." } }`). Lookup algorithm
  walks nested object trying remaining-segments-as-flat-key at each
  depth. Best of both: visual grouping + natural-reading dot path.
  R3-B (pure flat) rejected (no orientation for translators); R3-C
  (pure nested) rejected (`.fix` boilerplate per entry).
- **R4-A**: `pnpm lint:locale` runs 3 checks:
    1. en/ko keyset parity (load-bearing F1 enforcement — exits 4 on
       any missing key in either direction)
    2. ERROR_CATALOG cross-ref (every message_key/fix_key exists in
       both catalogs)
    3. Placeholder consistency (en/ko strings for same key use same
       `{placeholder}` set — translator can't drop or add)
  All three exit code 4 (Stage 4-A.6 ERROR_CATALOG `gate.gate-1-deterministic-fail`).
  Runs alongside typecheck/lint/test in CI. R4-B (TS typed-key Record)
  rejected (fights R1-A JSON); R4-C (runtime check) rejected (too-late
  discovery).
- **R5-A**: Catalog (user-facing) and prompt library (LLM-facing) are
  separate concerns; almost no overlap. **Prompts are English-only at v1**
  (LLM most capable in English; multi-locale prompts explode fingerprint +
  revision tracking). LLM responses flow through render layer; user-facing
  parts come from catalog when locale-dependent.

  **Small overlap**: prompt placeholders MAY carry catalog-resolved values
  (e.g. ko user gets a Korean alternative phrased to fit Husserl's bracketing
  pattern, embedded in English prompt template — Claude handles mixed-language
  fine).

  Boundary table:
    Catalog: error messages, CLI text, banner/status, doctor output,
             phase intros, locale-aware placeholder values
    Library: LLM system + user templates, critic prompts, Aquinas stage
             prompts, prompt structural rules, placeholder shapes

  R5-B (multi-locale prompts) rejected (fingerprint × locale, no evidence);
  R5-C (placeholder injection as primary mechanism) rejected (overlap is
  exception, not primary).

Lookup API (`src/i18n/index.ts`):
  setLocale(locale: Locale) / getLocale() / SUPPORTED_LOCALES
  localized(key, ctx?) → string
    Looks up key in current-locale catalog; throws on missing key
    (no silent en fallback for ko — F1 enforcement)
    Interpolates {name} via context Record
  loadCatalog(locale) → catalog object

Circular dep resolution (i18n ↔ errors):
  i18n imports `@/errors/types` ONLY (types, no logic)
  i18n does NOT import `@/errors/build` (which imports i18n)
  Missing-key error self-throws bare AgoraErrorThrown inline with
    HARDCODED ENGLISH MESSAGE — documented as the ONE F1 exception
    (developer-facing internal bug; user never sees in normal operation)

Initial catalog scaffold inventory (Stage 6 contract):
  errors.*       ~30 keys (mirrors ERROR_CATALOG entries)
  philosophers.* ~40 keys (mirrors runbook section 9 namespaces)
  cli.*          ~25 keys (per Stage 3-B command SPECs)
  probes.*       ~38 keys (.fix + .detail per 19 probes)
  gates.*        ~5 keys
  alignment.*    ~10 keys (phase intros/summaries)
  ralph.*        ~5 keys
  Total v1: ~150 keys × 2 locales = ~300 strings (manageable single-session
  population per locale)

Boundaries enforced (16 rejections by name).

Failure modes guarded:
  - Korean user sees English fallback           → CI Check 1 keyset parity
  - Code references key not in catalog          → CI Check 2 ERROR_CATALOG ref
  - Translator breaks placeholder set           → CI Check 3 placeholder check
  - Catalog itself broken at runtime            → hardcoded-en self-throw
  - Circular i18n ↔ errors dependency           → types-only one-way import
  - Locale not resolved at startup              → setLocale() in CLI entry
  - Multi-line prompt translation drift         → prompts English-only

Cross-references for downstream:
  - Stage 5-A.6 (Result<T,E>) — if adopted, localized() return signature
    converts to Result<string, AgoraError> in one place
  - Stage 6 implementation — populates messages/en.json + ko.json per
    Initial Scaffold inventory; adds pnpm lint:locale to CI

Full SPEC committed to `docs/architecture/locale-catalog.md` with 7
[SPEC] sections + lookup API + initial scaffold + boundaries +
failure modes + output consumers.

### Stage 5-A.6 — DONE (2026-05-03)

Result<T, E> adoption specified. Five decisions accepted (all
recommended). Final Stage 5 sub-question.

- **R1-A**: **Adopt Result<T, E> as canonical at module boundaries**.
  CLAUDE.md L327 deferred decision closes as YES. Marginal cost is zero
  (empty codebase — only placeholder src/cli/index.ts). Marginal benefit
  is high (Stage 6 vertical slices compose deeply across alignment +
  ralph + LLM + Aquinas). 0.9^10 thesis applies to error drift too —
  implicit handling is the same compounding problem as alignment drift.
  R1-B (no adoption, throw-only) rejected: explicit error flow is cheap
  discipline; "small codebase" argument flips at Stage 6.
  R1-C (partial adoption — Result for validation only) rejected: boundary
  ambiguity outweighs flexibility.

- **R2-A**: **Custom inline ~50 LOC** at `src/result/index.ts`. No
  external lib. ADR-0001 minimalism. Surface controlled (only what we
  use). Interop with AgoraErrorThrown native. neverthrow ~10KB +
  larger API surface.
  R2-B (neverthrow) rejected: dep + surplus surface.
  R2-C (ts-results / effect) rejected: same reasoning.

- **R3-A**: **Module boundary is Result; internal helpers may throw**.
  Pure validation (Zod) throws natively, lifted with `tryFrom()` at
  module boundary. CLI top-level uses `unwrap()` for final emit (uncaught
  → top-level handler from Stage 4-A.6). Hybrid pragmatic — composable at
  the right layer, no internal Result fatigue.
  R3-B (Result everywhere) rejected: boilerplate explosion at trivial paths.
  R3-C (Throw everywhere) rejected: equivalent to R1-B.

- **R4-A**: **Stage 6 implementation Result-first from first commit**.
  No migration phase needed (codebase essentially empty; only placeholder
  CLI + smoke test). Stage 4-5 SPEC sketches with throw signatures get
  reinterpreted at Stage 6 as `Promise<Result<T, AgoraErrorThrown>>`
  for module exports — interface as written = success-branch type, Result
  wraps it.
  R4-B (big-bang migration) rejected: nothing to migrate.
  R4-C (lazy migration) rejected: equivalent to R1-B; defeats consistency.

- **R5-A**: **Special-case throw retention** for 6 categories:
    1. `localized(key, ctx?)` STAYS throw (inline call ergonomic — wrapping
       every site with `unwrap()` defeats it; missing-key is internal bug
       caught by `pnpm lint:locale`)
    2. `buildAgoraError(code, opts)` is a constructor, not a fallible
       function — Result has nothing to wrap
    3. `unwrap(result)` BY DEFINITION converts Result to throw
    4. Zod `parse()` and other external lib calls — wrapped at module
       boundary, not per-call
    5. `interpolate()` (i18n + prompts) — same reasoning as `localized`
    6. Internal helpers within any module — module's exported wrapper
       does the `tryFrom()` lift

  Reconciliations:
  - Stage 5-A.4 R5-A note ("renderPrompt converts to Result if 5-A.6
    adopts") → CONFIRMED. renderPrompt becomes Result-returning module
    export; internal `interpolate` stays throw.
  - Stage 5-A.5 closing note ("localized() converts to Result") →
    SUPERSEDED by R5-A. localized stays throw. Stage 5-A.5 closing
    note is explicitly reversed by this SPEC's R5-A.

  R5-B (Result everywhere — localized too) rejected: inline-call
  ergonomic regression.
  R5-C (case-by-case throw vs Result per function) rejected: inconsistency
  cost outweighs flexibility.

Canonical surface (`src/result/index.ts`):
  Type:     Result<T, E = AgoraErrorThrown>
  Ctors:    ok(value), err(error)
  Combinators: map, flatMap, flatMapAsync, mapErr, unwrap, unwrapOr
  Lift:     tryFrom(syncFn), tryFromAsync(asyncFn)
  8 exports + 1 type alias + 1 internal type guard.

What's NOT included at v1:
  - match / fold (TS discriminated union narrowing is enough)
  - andThen / orElse (flatMap covers; renaming is style)
  - pipeable / curried versions (inflicts style)
  - Result.all() / Result.collect() (add when first concrete need)

CLAUDE.md L327 updated:
  Was: "Result 패턴은 `Result<T, E>` 헬퍼 도입 검토 (Stage 5)"
  Now: "Result<T, E>는 Stage 5-A.6에서 **도입 결정됨** — `src/result/`.
        모듈 boundary는 Result return, 내부 helper는 throw 자유. CLI
        top-level만 unwrap. 자세한 정책: docs/architecture/result-type.md."

Boundaries enforced (16 rejections by name).

Failure modes guarded:
  - Forgotten error handling                  → TS discriminated union exhaustiveness
  - Mixed throw + Result fatigue              → R3-A pins boundary
  - Result fatigue at trivial paths           → internal helpers stay throw
  - unwrap() proliferation                    → docs limit to CLI top-level / tests
  - External library exception leakage        → tryFrom at module boundary
  - Result library API divergence             → ADR required to extend surface
  - localized() Result conversion (5-A.5 note)→ explicitly reversed by R5-A

Module-graph note: src/result/ already declared LAYER 0 in Stage 5-A.1.
This SPEC resolves the "decided 5-A.6" marker; no module-graph update.

Full SPEC committed to `docs/architecture/result-type.md` with 6 [SPEC]
sections + canonical types + combinators + boundaries + failure modes +
output consumers.

---

## Stage 5 — All sub-questions complete

| # | Topic | Path |
|---|-------|------|
| 5-A.1 | Module / file-tree organization | `docs/architecture/module-graph.md` ✅ |
| 5-A.2 | Per-philosopher runbook template | `docs/architecture/runbook-template.md` ✅ |
| 5-A.3 | 5 philosopher runbooks (Rev 2) | `docs/philosophers/runbooks/{husserl,socrates,aristotle,plato,aquinas}.md` ✅ |
| 5-A.4 | Prompt library structure | `docs/architecture/prompt-library.md` ✅ |
| 5-A.5 | Locale catalog content rules | `docs/architecture/locale-catalog.md` ✅ |
| 5-A.6 | Result<T, E> adoption | `docs/architecture/result-type.md` ✅ |

Stage 5 close requires (per ADR-0004):
  1. All named deliverables exist and committed ✅
  2. Sang explicit approval — pending close declaration
  3. No ADR left in Proposed state — none introduced in Stage 5 ✅

Awaiting Sang's "Stage 5 close 선언" → then create
`docs/stage-5/CLOSED.md`, tag `v0.5.0-stage-5`, open `docs/stage-6/NOTES.md`
(first vertical slice).
