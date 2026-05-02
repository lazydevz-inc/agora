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

(empty — Stage 5 just opened)
