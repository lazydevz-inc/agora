# Philosopher Runbook Template — Specification (Stage 5)

> **Status**: Stage 5-A.2 (Accepted 2026-05-03).
> Sections marked **[SPEC]** are formally accepted Stage 5 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 5
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Runbook Section Structure (12-section DTD)** (5-A.2 R1) | **[SPEC]** Accepted 2026-05-03 |
| **Prompt Body Location** (5-A.2 R2) | **[SPEC]** Accepted 2026-05-03 |
| **Test Contract Format** (5-A.2 R3) | **[SPEC]** Accepted 2026-05-03 |
| **Examples / Anti-examples Policy** (5-A.2 R4) | **[SPEC]** Accepted 2026-05-03 |
| **Versioning Convention** (5-A.2 R5) | **[SPEC]** Accepted 2026-05-03 |
| **Canonical Template** (5-A.2) | **[SPEC]** Accepted 2026-05-03 |

---

## Scope

This document is the **DTD** (template + rules) for the 5 per-philosopher
runbook files that Stage 5-A.3 will produce in batch. It does NOT contain
any specific philosopher's content; it defines the structure every runbook
MUST follow.

The 5 runbooks (Stage 5-A.3 deliverable) live at:
- `docs/philosophers/runbooks/husserl.md`
- `docs/philosophers/runbooks/socrates.md`
- `docs/philosophers/runbooks/aristotle.md`
- `docs/philosophers/runbooks/plato.md`
- `docs/philosophers/runbooks/aquinas.md`

Each must use the template defined here verbatim (in section + ordering).

---

## Inherited from / cross-references

| Inherited from | Implication for runbooks |
|----------------|--------------------------|
| Stage 1 / MANIFESTO V | 5 first-class philosopher modules; 6th requires ADR |
| `docs/philosophy/0X-...md` (5 concept docs) | Runbook section 3.1 (Concept) cites these for deep treatment |
| Stage 2-A / 2-B / 2-C | When-called sections cite specific phase + gate |
| Stage 3-A.1 R5-A | Locale F1 — prompts in en, ko parity tested |
| Stage 4-A.2 | All LLM calls go through `ClaudeRunner.call(opts)` |
| Stage 4-A.6 | Errors thrown via `buildAgoraError(code, opts)` (catalog-pinned) |
| Stage 5-A.1 | Modules at `src/philosophers/<name>.ts`; LAYER 1; cannot import `llm/*` directly (orchestrators do that) |
| Stage 5-A.4 (upcoming) | Prompt library indexes runbook prompts by `<name>:<prompt-id>` key |

---

## Runbook Section Structure (12-section DTD) [SPEC] (Accepted 2026-05-03, R1-A)

> **Goal**: Every runbook follows the same 12 sections in the same order.
> Comparability across the 5 + reviewability + Stage 6 implementation
> mapping all hinge on this discipline.

### Required sections (in order)

| # | H2 Heading | What it contains |
|---|------------|------------------|
| 1 | When this is called | Trigger conditions: phase / gate, pre-conditions in `.agora/`, skip conditions if any. Cross-reference Stage 2 SPEC sections by name. |
| 2 | Input contract | TypeScript `<Name>Input` interface; each field annotated with its source SPEC. |
| 3 | Method | Three subsections: 3.1 Concept (one paragraph, cite philosophy/0X-...md), 3.2 Operationalization (pseudocode, plain English + steps), 3.3 Failure mode it specifically addresses. |
| 4 | Prompt | Exact prompt text(s) sent to ClaudeRunner. System prompt + user-prompt template with `{placeholders}`. Multi-prompt philosophers (e.g. Aquinas: videtur/sed contra/respondeo/ad singula) get one labeled subsection per prompt. |
| 5 | Output contract | TypeScript `<Name>Output` interface + one synthetic worked example end-to-end. |
| 6 | Quality bar | How "did this philosopher do its job" is measured: quantitative thresholds (cite Stage 2 where set) + qualitative tells specific to this philosopher. |
| 7 | Forbidden in this runbook | Philosopher-specific MUST-NOTs extending the global F1-F8. |
| 8 | Test contract | What `tests/unit/philosophers/<name>.test.ts` MUST verify (4 categories, see R3 below). |
| 9 | File map | Path table: implementation / concept doc / runbook / unit tests / locale catalog keys. |
| 10 | Boundaries (philosopher-specific rejections) | `❌ <alternative>` rejection-by-name list (same pattern as other Stage SPECs). |
| 11 | Examples / Anti-examples | Optional but recommended (see R4 below). |
| 12 | Revision history | `Revision: N` table (Rev/Date/Change/By). See R5 below. |

### Front matter (before section 1)

```markdown
# <Philosopher Name> — Runbook

> **Module**: `src/philosophers/<name>.ts`
> **Phase**: <when in the two loops this is called>
> **Method (one line)**: <Husserl: Epoché / Socrates: Elenchus / ...>
> **Inherited from**: `docs/philosophy/0X-<name>-<concept>.md` (concept doc, Stage 1)
> **Status**: [SPEC] (Accepted yyyy-mm-dd, Stage 5-A.3)
> **Revision**: 1 (changelog at end)
```

### Why 12, not fewer

R1-B (6-section short form: When / Method / Prompt / Output / Test /
Forbidden) rejected: drops Quality bar, Examples, and Revision history,
which are the hardest-to-recover sections later. Adding them per-runbook
ad-hoc would re-introduce the variance R1-A exists to prevent.

R1-C (free-form, philosopher-by-philosopher) rejected: 5 runbooks become
5 unique reading experiences; cross-comparison ("how does Husserl's
quality bar relate to Plato's?") becomes impossible.

### Why this order

Reading flows top-to-bottom answer the questions a reader has in order:

1. **When** — am I in the right place for this philosopher?
2. **Input** — what arrives at the door?
3. **Method** — what happens inside (concept → operationalize → why-it-matters)?
4. **Prompt** — what specifically goes to the LLM?
5. **Output** — what leaves the door?
6. **Quality bar** — how do I know it worked?
7. **Forbidden** — what must I never do?
8. **Test contract** — how is the implementation verified?
9. **File map** — where do I find the actual code/docs/tests?
10. **Boundaries** — what alternatives were considered and rejected?
11. **Examples** — show me one good and one bad case.
12. **Revision** — has this changed, and why?

---

## Prompt Body Location [SPEC] (Accepted 2026-05-03, R2-A)

> **Goal**: Each prompt has exactly ONE canonical text. Decide where that
> canonical text lives; everywhere else is reference.

### Decision

**Runbook holds the canonical prompt text in section 4.** Stage 5-A.4's
`prompt-library.md` is an **indexed catalog** that references runbook
prompts by stable key:

```
Key format:  <philosopher_name>:<prompt_id>

Canonical inventory (from Stage 5-A.3 runbooks; total = 12):
  husserl:phase-minus-1-bracket
  socrates:elenchus-round
  aristotle:telos-question
  aristotle:form-question
  aristotle:material-question
  aristotle:efficient-question
  plato:y2-noesis-test
  plato:dihairesis-decompose
  aquinas:videtur            (orchestration; per-critic prompts in src/critics/definitions/)
  aquinas:sed-contra
  aquinas:respondeo
  aquinas:ad-singula
```

Prompt library entry shape:

```yaml
husserl:phase-minus-1-bracket:
  runbook: docs/philosophers/runbooks/husserl.md#section-4
  revision: 1
  used_by:
    - src/alignment/phase-2-rounds.ts (when phase === -1)
  fingerprint: sha256(<prompt body>)
```

### Why runbook-canonical, library-indexed

- Runbook reading flow is **philosopher-centric** ("what does Aquinas do?").
  The prompt belongs to the philosopher, not to a flat catalog.
- Library serves implementation lookup ("what's the canonical text for
  `aquinas:respondeo`?") and CI consistency checks (fingerprint mismatch
  flag).
- Single source of truth — edits land in runbook, library auto-updates
  on next regen (Stage 6 implementation: a script reads runbook, emits
  library entries).

### When library wins

Never. Library is always derived. Manual edits to library are forbidden
(comment in library file: "Generated from runbooks — DO NOT EDIT
DIRECTLY").

R2-B (library canonical, runbook references by ID) rejected: reading a
runbook requires opening a second file to see the prompt; loses
philosopher-centric flow.
R2-C (duplicate in both places) rejected: drift inevitable; no clear
"which copy is right?"

---

## Test Contract Format [SPEC] (Accepted 2026-05-03, R3-A)

> **Goal**: Each runbook's section 8 explicitly enumerates 4 verification
> categories the unit test MUST cover. No runbook says "tests are in
> tests/unit/philosophers/<name>.test.ts" without further detail.

### Required test categories per runbook

| # | Category | Example assertion |
|---|----------|-------------------|
| 1 | **Schema conformance** | `<Name>Input` accepts valid shapes from fixture; rejects malformed via Zod (Stage 4-A.3 R1-A). `<Name>Output` matches declared interface. |
| 2 | **Quality-bar threshold** | Fixture inputs produce output meeting section 6's quantitative thresholds (e.g. Plato: ≥ 0.6 defense per AC; Aquinas: ≥ 1 sed contra per critic). |
| 3 | **Negative tests (forbidden behaviors fire)** | When the LLM response violates section 7's forbidden list, the runbook detects it and rejects rather than silently accepting (e.g. Husserl: detects "solution proposal during bracketing" and re-prompts). |
| 4 | **Locale parity** | Same fixture in en + ko produces equivalent quality (output schema identical; semantic content equivalent up to translation). Honors Stage 3-A.1 R5-A F1 enforcement. |

### Cross-philosopher integration

Section 8 also lists the `tests/integration/<phase>.test.ts` files where
this philosopher participates in cross-module flows:

```markdown
## 8. Test contract

### Unit tests (tests/unit/philosophers/husserl.test.ts)
1. Schema conformance: ...
2. Quality-bar threshold: ...
3. Negative: ...
4. Locale parity: ...

### Integration tests participated in
- `tests/integration/alignment-loop.test.ts` (Phase −1 entry/exit)
- `tests/integration/cli-default.test.ts` (default flow when phase === -1)
```

### Why explicit categories

R3-B (delegate to test file, mention only path) rejected: runbook loses
verification intent; reviewer can't tell if test file actually covers
the runbook's claims.
R3-C (Given/When/Then BDD scenarios) rejected: BDD prose works for
business-logic flows but feels heavy for "schema + threshold" technical
checks; 5 runbooks would each invent their own BDD style.

---

## Examples / Anti-examples Policy [SPEC] (Accepted 2026-05-03, R4-A)

> **Goal**: Examples help calibrate "what does done-right look like."
> But not every philosopher needs them — some methods are self-evident
> from operationalization.

### Decision

**Section 11 is optional but RECOMMENDED**. Author judgment per runbook.

### When to include

INCLUDE examples + anti-examples when ANY of:
- The failure mode is **subtle** (Aquinas Disputatio: vote-vs-judgment
  distinction is easy to miss; Husserl Epoché: "bracket" is abstract)
- The output shape is **multi-element** with non-obvious composition
  (Plato Dihairesis: AC tree decomposition has many ways to be wrong)
- The philosopher addresses an **AI-coding pattern** that looks fine but
  isn't (Socrates: leading questions look like good questions to most
  reviewers)

OMIT examples when:
- The method is **immediately graspable** from operationalization (Aristotle
  Four Causes: telos extraction reads as a structured extraction)
- The output is **single-shape primitive** (a bool, a score, etc.)

### Format when included

Each runbook's section 11 follows:

```markdown
## 11. Examples / Anti-examples

### Good example
Input:        { ... }
Method trace: 1. ... 2. ... 3. ...
Output:       { ... }
Why this is right: <one sentence>

### Anti-example
Input:        { same as above }
Output:       { wrong shape or content }
Why this is wrong: <which forbidden rule (section 7) it violates>
Detection:    <how the unit test catches it (cross-ref section 8 #3)>
```

### Why optional, not mandatory

Mandatory examples (R4-B) would force contrived examples for
self-evident philosophers. Stage 1 user feedback: "examples 필요한
상황이나 유저가 원하는 경우는 있으면 좋겠지만, 대부분 유저는 어떤
느낌을 원하는지는 있지만 실제 결과물이 어떤 모습이였으면 좋겠는지
구체적으로 상상을 하지는 못해" — this was about user-facing UX, but
the same principle applies to runbooks: examples that don't earn their
place become noise.

R4-B (mandatory examples) rejected: contrived examples for self-evident
philosophers add noise.
R4-C (forbidden examples) rejected: subtle methods (Aquinas, Husserl)
become hard to grok without one good case.

---

## Versioning Convention [SPEC] (Accepted 2026-05-03, R5-A)

> **Goal**: Track meaningful runbook changes so Stage 6 implementation
> files can declare which revision they were built against.

### Revision field

Every runbook front matter contains:

```markdown
> **Revision**: N
```

`N` starts at `1` when the runbook is first SPEC-accepted (Stage 5-A.3)
and increments on each meaningful change.

### Section 12 changelog table

```markdown
## 12. Revision history

| Rev | Date       | Change                                    | By         |
|-----|------------|-------------------------------------------|------------|
| 1   | 2026-05-XX | Initial Stage 5-A.3 SPEC                  | Sang Rhee  |
| 2   | 2026-06-XX | Tightened quality bar threshold to 0.7    | Sang Rhee  |
| 3   | 2026-07-XX | Added "no leading questions" forbidden    | Sang Rhee  |
```

### When a revision bump is REQUIRED

Bump (and add changelog row) when ANY of:
- Prompt text changes meaningfully (not whitespace, not typo correction)
- Output contract shape changes (field added/removed/renamed/retyped)
- Quality bar thresholds change (numeric value or qualitative criterion)
- Forbidden list adds or removes entries
- When-called trigger conditions change (phase/gate/skip-conditions)

### When a revision bump is NOT required

- Typo / grammar / formatting fixes
- Cross-reference link updates (paths changed elsewhere)
- Examples added/removed/improved (section 11 only)
- File map updates (path moves elsewhere in repo)

### Stage 6 implementation references

Implementation files cite the runbook revision they were built against:

```typescript
// src/philosophers/husserl.ts
//
// runbook: husserl@1
// (regenerate when runbook revision bumps)
```

When a runbook revision bumps, a CI lint warning surfaces every file
referencing the old revision. Sang reviews each one and either:
- Updates the implementation + bumps the comment to `husserl@2`
- Leaves the comment as-is if the implementation is intentionally on
  the old revision (e.g. parallel rollout)

R5-B (git history only, no changelog) rejected: cannot distinguish
"intentional method change" from "typo fix" without spelunking diffs.
R5-C (semver per runbook: 1.0.0, 1.1.0, 2.0.0) rejected: 5 runbooks ×
3-tier semver = compounding cognitive load; integer revision matches the
"this changed enough that dependent code must reverify" question
directly.

---

## Canonical Template [SPEC] (Accepted 2026-05-03)

> **Goal**: A copy-paste-ready template for Stage 5-A.3 to instantiate
> 5 times.

### File: `docs/philosophers/runbooks/_template.md` (committed but
> not loaded as a runbook)

```markdown
# <Philosopher Name> — Runbook

> **Module**: `src/philosophers/<name>.ts`
> **Phase**: <when in the two loops this is called>
> **Method (one line)**: <Husserl: Epoché / Socrates: Elenchus / ...>
> **Inherited from**: `docs/philosophy/0X-<name>-<concept>.md`
> **Status**: [SPEC] (Accepted yyyy-mm-dd, Stage 5-A.3)
> **Revision**: 1

---

## 1. When this is called

<Trigger conditions: phase / gate / pre-conditions / skip conditions.
Cross-reference Stage 2 SPEC sections by name + line.>

## 2. Input contract

```typescript
export interface <Name>Input {
  // ... fields, each annotated with source SPEC
}
```

## 3. Method

### 3.1 Concept

<One paragraph. Cite docs/philosophy/0X-<name>-<concept>.md for deep
treatment. State the philosopher's idea in software terms.>

### 3.2 Operationalization

<Pseudocode + plain-English steps. NO TypeScript here (Stage 6
implementation owns the actual code).>

```
1. Receive input ...
2. Construct prompt ...
3. Call ClaudeRunner via orchestrator (philosophers/* never call llm/* directly)
4. Validate response shape
5. Return output
```

### 3.3 Failure mode it specifically addresses

<Which AI-coding failure mode this philosopher prevents. Concrete, not
abstract.>

## 4. Prompt

### 4.X <prompt_id>

```text
## System prompt
<text>

## User prompt template
<text with {placeholders}>
```

<Repeat 4.X for each distinct prompt this philosopher fires.>

## 5. Output contract

```typescript
export interface <Name>Output {
  // ... fields
}
```

### Worked example

Input: `{ ... }`
Output: `{ ... }`

## 6. Quality bar

<Quantitative thresholds (cite Stage 2) + qualitative tells specific to
this philosopher.>

## 7. Forbidden in this runbook

- ❌ <forbidden behavior 1>
- ❌ <forbidden behavior 2>

<Extends global F1–F8 with philosopher-specific F-rules.>

## 8. Test contract

### Unit tests (tests/unit/philosophers/<name>.test.ts)

1. **Schema conformance**: <specific assertions>
2. **Quality-bar threshold**: <specific assertions>
3. **Negative (forbidden behaviors)**: <specific assertions>
4. **Locale parity**: <specific assertions>

### Integration tests participated in

- `tests/integration/<phase>.test.ts` — <what's verified>

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/<name>.ts` | Implementation |
| `docs/philosophy/0X-<name>-<concept>.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/<name>.md` | This runbook |
| `tests/unit/philosophers/<name>.test.ts` | Unit tests |
| `messages/{en,ko}.json` keys | `philosophers.<name>.*` |

## 10. Boundaries

- ❌ <alternative considered and rejected, with reason>

## 11. Examples / Anti-examples

<Optional. Include if section 7's failure modes are subtle. Format per
R4 SPEC.>

## 12. Revision history

| Rev | Date       | Change                          | By         |
|-----|------------|---------------------------------|------------|
| 1   | yyyy-mm-dd | Initial Stage 5-A.3 SPEC        | Sang Rhee  |
```

This template file is committed at `docs/philosophers/runbooks/_template.md`
in the same commit as this SPEC. The leading underscore signals "not a
runbook itself" to readers and any future tooling that walks the
runbooks directory.

---

## Boundaries

- ❌ 6-section short form (R1-B rejected): drops Quality bar, Examples,
  Revision history.
- ❌ Free-form per-philosopher structure (R1-C rejected): comparability
  loss.
- ❌ Library-canonical prompt (R2-B rejected): philosopher-centric
  reading flow lost.
- ❌ Duplicate prompt in runbook AND library (R2-C rejected): drift.
- ❌ Test category delegation to test file (R3-B rejected): runbook
  loses verification intent.
- ❌ BDD scenarios as test contract format (R3-C rejected): heavy for
  schema+threshold checks.
- ❌ Mandatory examples for every runbook (R4-B rejected): contrived
  examples for self-evident philosophers.
- ❌ Forbidden examples (R4-C rejected): subtle methods need them.
- ❌ Git-history-only versioning (R5-B rejected): can't distinguish
  intent vs typo.
- ❌ Semver per runbook (R5-C rejected): cognitive overload, integer
  matches the question.
- ❌ Implementation files importing runbooks at runtime: runbooks are
  human docs; types/contracts in TypeScript live in `src/philosophers/`.
- ❌ Section reordering per runbook: 12 sections in fixed order; deviation
  fails review.

## Failure modes specifically guarded

- **Reading-experience drift across 5 runbooks**: fixed 12-section DTD.
- **Prompt drift between runbook and library**: runbook canonical;
  library auto-derived; manual library edits forbidden.
- **Verification gaps in unit tests**: 4 mandatory categories; reviewer
  can audit at a glance.
- **Subtle method becomes black box**: examples included where failure
  mode warrants.
- **Untracked method changes**: revision bump rules pin when Sang must
  acknowledge a meaningful change.
- **Stale implementation against revised runbook**: Stage 6
  `// runbook: <name>@N` comment + CI lint surface drift.

## Output consumed by

- **Stage 5-A.3**: 5 batched runbooks instantiate this template.
  Husserl / Socrates / Aristotle / Plato / Aquinas each become one file
  under `docs/philosophers/runbooks/`.
- **Stage 5-A.4 (prompt-library.md)**: indexes runbook section 4 prompts
  by `<name>:<prompt-id>` keys.
- **Stage 5-A.5 (locale catalog content rules)**: `philosophers.<name>.*`
  namespace conventions land here.
- **Stage 6 implementation**: each `src/philosophers/<name>.ts` is built
  against its runbook revision, with `// runbook: <name>@N` header
  comment.
- **Stage 6 tests**: `tests/unit/philosophers/<name>.test.ts` verifies
  the 4 categories declared in section 8.

---

## Next sections (still OPEN in Stage 5)

- Stage 5-A.3 — 5 philosopher runbooks (batch instantiation of this template)
- Stage 5-A.4 — Prompt library structure (indexes runbook prompts)
- Stage 5-A.5 — Locale catalog content rules (en/ko parity, naming)
- Stage 5-A.6 — Result<T, E> adoption decision
