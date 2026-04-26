# Stage 1 — CLOSED

> **Status**: Closed
> **Closed on**: 2026-04-27
> **Closed by**: Sang Rhee (explicit approval)
> **Tagged as**: `v0.1.0-stage-1`

---

## What Stage 1 was

Per ADR-0004, Stage 1 was the **Philosophy + North Star** stage. Its goal: produce the strategic and philosophical foundation against which all subsequent work would be measured.

Stage 1 was conducted as a live Alignment Loop on the Agora project itself — meta-dogfooding per ADR-0003. The interview ran across multiple sessions between Sang and Claude, captured in real time, and is preserved as the primary source material in `docs/stage-1/notes.md`.

---

## Deliverables (all accepted)

| # | Deliverable | Path | Form |
|---|-------------|------|------|
| 1 | Manifesto | `MANIFESTO.md` | Living thesis document |
| 2 | North Star | `docs/north-star.md` | Three-horizon direction |
| 3 | Why Philosophy (meta) | `docs/philosophy/00-why-philosophy.md` | Justification for the 5 |
| 4 | Husserl's Epoché | `docs/philosophy/01-husserl-epoche.md` | Operational module spec |
| 5 | Socrates's Elenchus | `docs/philosophy/02-socrates-elenchus.md` | Operational module spec |
| 6 | Aristotle's Four Causes | `docs/philosophy/03-aristotle-four-causes.md` | Operational module spec |
| 7 | Plato's Divided Line + Dihairesis | `docs/philosophy/04-plato-divided-line-and-dihairesis.md` | Operational module spec |
| 8 | Aquinas's Disputatio | `docs/philosophy/05-aquinas-disputatio.md` | Operational module spec |
| 9 | Live interview synthesis | `docs/stage-1/notes.md` | Compressed transcript essence |

Plus three ADRs that landed during Stage 1:

| # | ADR |
|---|-----|
| 0005 | Claude Integration via Subprocess (not Agent SDK) |
| 0006 | Pre-Ralph Infrastructure Gate (Gate 0) |
| 0007 | License Choice: MIT (Provisional), Public Release Deferred |

Plus two structural docs that were partially seeded during Stage 1 and complete in Stage 2:

| # | Doc | Status |
|---|-----|--------|
| — | `docs/loops/alignment-loop.md` (renamed from `interview-loop.md` at Stage-2 open) | Placeholder + F1–F8 + UX rules captured. To be promoted to full Alignment Loop spec in Stage 2-A. |
| — | `docs/loops/ralph-loop.md` | Placeholder + 5+1 gate structure captured. To be completed in Stage 2-B. |

---

## What was decided in Stage 1

The committed positions Agora carries forward:

1. **Telos**: Close `expected_output ↔ actual_output` divergence to ~0% via Human-AI Alignment loop, before any Ralph iteration begins.
2. **The math**: 0.9^10 ≈ 34.87% — alignment compounds, generation power does not save it.
3. **HAA term**: Human-AI Alignment, in the lineage of HCI. Adopted as a discipline term.
4. **Augmentation thesis**: Linux-kernel-to-distros pattern. We grow with AI improvements, not against them.
5. **Five philosophers**: Husserl, Socrates, Aristotle, Plato, Aquinas. Each with a distinct, irreducible operational role. Sixth requires explicit ADR justification.
6. **Two-loop architecture**: Alignment Loop (closes intent–spec gap) → Ralph Loop (drives implementation through 6 gates).
7. **Six gates of Ralph**: Pre-flight Infra (Gate 0) → Deterministic → Functional QA → UI/UX Disputatio → Technical Disputatio → Alignment Check (Gate 5, inviolable).
8. **Anti-goals**: 7 things Agora refuses to be (P1–P7) — captured in MANIFESTO Section VII.
9. **One-folder, one-project, one-Agora**: per-folder isolation; cross-folder context bleed forbidden.
10. **Persona ceiling**: senior dev / CTO / Technical Product Owner. Not for non-developers; not guru-obscure.
11. **8 forbidden interview patterns** (F1–F8): hard constraints captured in `docs/loops/alignment-loop.md`.
12. **Expertise-aware UX split**: Mode A (recommended options + free input) for expert questions; Mode B (single confident recommendation + alternatives) for non-expert questions.
13. **Claude integration via subprocess**: `claude --print --output-format json` to honor Max subscription. SDK is fallback only. Three I/O modes (Interactive TUI / JSON / MCP).
14. **License**: MIT (provisional, ADR-0007). Public release decision deferred.
15. **Visibility**: Private indefinitely. Public release is an explicit strategic decision, not a Stage milestone.

---

## What was deliberately deferred

These are the items Stage 1 chose **not** to settle. They wait for the Stage that has the right context.

| Item | Stage |
|------|-------|
| Sixth philosopher consideration | Open (re-examine after first real use) |
| Probe registry initial coverage | Stage 2-B |
| Drift score numeric thresholds | Stage 2-B |
| Critic persona selection (Gates 3, 4) | Stage 2-B |
| Recommended-options generation algorithm | Stage 2-A |
| Phase 0 auto-scan exact algorithm | Stage 2-A |
| Round ordering (philosopher schedule) | Stage 2-A |
| Brownfield vs greenfield decision branch | Stage 2-A |
| Preview generation (Y3 condition) | Stage 2-A |
| Iteration cap and parallelism | Stage 2-B |
| Commercial form | 2026-Q3 (only if relevant) |
| Sixth-philosopher addition | After 30 days of real use |

---

## Verification of close

A stage closes only when:
1. All named deliverables exist and are committed ✅
2. Sang has read and approved them ✅ (explicit approval 2026-04-27)
3. No ADR is left in `Proposed` state from this stage ✅ (all 0001–0007 are `Accepted`)

All three conditions met.

---

## Next stage

**Stage 2 — Two-Loop Specification** opens here. See `docs/stage-2/NOTES.md` for the entry plan.

---

*This document is immutable. Stage 1 is over.*
