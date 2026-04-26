# Stage 2 — Two-Loop Specification

> **Status**: Active (opened 2026-04-27)
> **Goal**: Promote `docs/loops/interview-loop.md` (renamed to `alignment-loop.md`) and `docs/loops/ralph-loop.md` from placeholder to formal spec.
> **Done when**: Both docs are marked `Accepted`. All open questions inherited from Stage 1 are resolved or explicitly deferred to Stage 3+.

---

## Entry plan

Stage 2 splits into three sub-stages. They are sequential because each builds on the previous.

### Stage 2-A — Alignment Loop full spec

Resolve the open questions inherited from Stage 1's interview-loop placeholder:

1. **Rename**: `docs/loops/interview-loop.md` → `docs/loops/alignment-loop.md`. Update all references. (Mechanical, low-risk, do first.)
2. **Phase 0 auto-scan algorithm**: what is scanned, in what order, how is brownfield/greenfield decided, how is the result fed to Phase 1.
3. **Phase 1 open intake design**: what prompt, what format, how long can the input be, how is editor escape handled.
4. **Phase 2 round structure**: how does a single round flow, who picks the philosopher, how is the question constructed, how is the answer routed.
5. **Round ordering**: which philosopher operates when, with what triggers.
6. **Recommended-options generation**: where do the suggested options come from (codebase, Aristotle exemplars, prior answers).
7. **Validation gates per claim**: when is a claim "settled" — maturity floor + Socratic survival + coverage.
8. **Termination gate Y2 + Y3**: precise algorithm for when the loop can ask "anything else?", and when preview generation is offered (quality threshold).
9. **Brownfield vs greenfield branching**: where do the two paths diverge (Phase −1 default-on/off, Phase 0 emphasis, etc.).
10. **Mini-alignment re-entry from Ralph (Z2)**: shorter form of the alignment loop for re-entry mid-Ralph.

### Stage 2-B — Ralph Loop full spec

Resolve the open questions inherited from Stage 1's ralph-loop placeholder:

1. **Probe registry initial coverage**: which CLIs/tools ship with v1.
2. **Drift score numeric threshold**: what triggers Z1 (per-iteration self-correct) vs Z2 (mini-alignment re-entry).
3. **Critic persona selection**: which UI/UX and code-quality personas run Disputatio at Gates 3 and 4.
4. **Test regeneration trigger**: when do Playwright tests get regenerated vs incrementally updated.
5. **Iteration cap**: hard cap or token-budget-based stopping.
6. **Parallel iterations**: should Ralph try multiple iteration paths and Disputatio between them.
7. **Bypass UX**: details of `--skip-gate-0=<list>` and whether other gates have any bypass at all.

### Stage 2-C — Handoff ceremony

The transition from Alignment Loop to Ralph Loop is itself a structural moment:

1. **Locked seed format**: exact YAML schema for the seed (extends `docs/philosophy/03-aristotle-four-causes.md` and `04-plato-divided-line-and-dihairesis.md` artifacts).
2. **Plato Dihairesis decomposition algorithm**: how the seed's acceptance criteria become the AC tree Ralph operates on.
3. **State carry-over**: what context does Ralph receive from Alignment beyond the seed (history, deferred questions, preview-vs-actual log).

---

## Working principle for Stage 2

Stage 2 is the **most algorithmic stage so far**. Stage 1 was philosophy + direction. Stage 2 is "how does this actually work, step by step, deterministically enough for Stage 6 implementation to follow without re-arguing the design."

Stage 2 still uses the Alignment Loop to make decisions (meta-dogfooding per ADR-0003), but each round produces **algorithmic specification**, not philosophical commitment. Less prose, more pseudocode and decision trees.

UX expectation: Mode B (single confident recommendation + alternatives) will dominate Stage 2 because most of these are technical choices Sang has delegated.

---

## Open question priority

Tackle in this order (each unblocks the next):

```
2-A.1  Rename                             ◀── do first (mechanical)
2-A.2  Phase 0 auto-scan algorithm        ◀── unblocks Phase 1
2-A.3  Phase 1 open intake design         ◀── unblocks Phase 2
2-A.5  Round ordering                     ◀── unblocks Phase 2
2-A.4  Phase 2 round structure
2-A.6  Recommended-options generation
2-A.7  Validation gates per claim
2-A.8  Termination Y2 + Y3
2-A.9  Brownfield vs greenfield branching
2-A.10 Mini-alignment re-entry

(Then Stage 2-C handoff, then Stage 2-B Ralph spec)
```

Estimated rounds per sub-question: 1–2. Total Stage 2 work: ~15–20 focused rounds.

---

## Stage 2 will produce

- `docs/loops/alignment-loop.md` — full spec, Status: Accepted
- `docs/loops/ralph-loop.md` — full spec, Status: Accepted
- `docs/loops/handoff.md` — Alignment → Ralph handoff specification (new doc)
- Possibly 1–3 new ADRs for any structural decisions that emerge

Stage 2 close requires the same gate as Stage 1: deliverables exist, Sang explicitly approves, no Proposed ADRs.

---

## Stage 2-A.1 — DONE

Rename `interview-loop.md` → `alignment-loop.md` completed at Stage 2 open. All references updated. The file's internal title and inherited input headings now use "Alignment Loop" terminology.

Next task: Stage 2-A.2 — Phase 0 auto-scan algorithm (the first substantive design question).
