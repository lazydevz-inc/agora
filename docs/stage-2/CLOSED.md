# Stage 2 — CLOSED

> **Status**: Closed
> **Closed on**: 2026-05-03
> **Closed by**: Sang Rhee (explicit approval)
> **Tagged as**: `v0.2.0-stage-2`

---

## What Stage 2 was

Per ADR-0004, Stage 2 was the **Two-Loop Specification** stage. Its goal:
promote the Alignment Loop and Ralph Loop documents from Stage-1 placeholders
to formal specifications detailed enough that Stage 6+ implementation can
follow without re-arguing the design.

Stage 2 was conducted as a sequence of focused interview rounds between Sang
and Claude, organized into three sub-stages (2-A, 2-B, 2-C). Each round
produced a SPEC section that was committed individually for traceability.

---

## Deliverables (all accepted)

### Stage 2-A — Alignment Loop full spec (10 sub-questions, 2026-04-27/28)

| # | Sub-question | Result |
|---|--------------|--------|
| 2-A.1 | Rename interview-loop → alignment-loop | mechanical rename + reference update |
| 2-A.2 | Phase 0 auto-scan algorithm | classification + ingestion + isolation + display |
| 2-A.3 | Phase 1 open intake design | brownfield/greenfield prompts + 8KB cap + mechanical echo |
| 2-A.4 | Phase 2 round structure | 4 TUI mockups, 12-section layout contract |
| 2-A.5 | Round ordering | Conductor (Socrates) + Contributor model, telos-first hard gate |
| 2-A.6 | Recommended-options generation | 4-source ranking with weights |
| 2-A.7 | Validation gates per claim | 3-axis composition by min |
| 2-A.8 | Termination Gate Y2 + Y3 | 3-condition Y2, preview quality threshold 0.75, never-silent rule |
| 2-A.9 | Brownfield/greenfield branching | per-phase divergence table, 4-case state branching |
| 2-A.10 | Mini-alignment re-entry from Ralph (Z2) | escalation algorithm + 3-option dialog |

Path: `docs/loops/alignment-loop.md` (Status: Accepted)

### Stage 2-B — Ralph Loop full spec (7 sub-questions + 1 ADR, 2026-04-28/05-03)

| # | Sub-question | Result |
|---|--------------|--------|
| 2-B.1 | Gate 0 probe registry | 19 v1 probes, 5min TTL cache, user disable |
| 2-B.2 | Gate 2 test regeneration | trigger = AC tree change only, incremental, git-tracked |
| 2-B.3 | Gates 3+4 critic personas | 10 critics (4 UI + 5 Tech + 1 universal), trigger-based |
| 2-B.4 | Gate 5 drift score threshold | LLM judgment + 3-tier (0.15/0.30/0.60) |
| 2-B.5 | Engine iteration cap | 3-layer (10/25/1M), no wall-clock per Sang R5-C |
| 2-B.6 | Engine parallel iterations | sequential default, parallel-ready architecture (+ ADR-0008) |
| 2-B.7 | Cross-cutting bypass UX | 3 categories (NO/Conditional/YES) |

Path: `docs/loops/ralph-loop.md` (Status: Accepted)
Plus: `docs/architecture/decisions/0008-ralph-sequential-default-parallel-architecture.md`

### Stage 2-C — Handoff ceremony (3 sub-questions, 2026-05-03)

| # | Sub-question | Result |
|---|--------------|--------|
| 2-C.1 | Plato Dihairesis decomposition | 3-AND atomicity, 0.6 defense threshold, max depth 5, mandatory user review |
| 2-C.2 | AC tree → Ralph state init | DFS leftmost-first, parallel batch logic, R3-B no manual skip/reorder |
| 2-C.3 | Handoff metadata + audit | single state.json pointer, append-only events.jsonl, immutable handoff metadata |

Path: `docs/loops/handoff.md` (Status: Accepted)

---

## What was decided in Stage 2

Beyond what's in the SPEC documents, several cross-cutting positions consolidated:

1. **Two-Loop architecture is fully algorithmic**: every gate, every transition, every algorithm has pseudo-code; no hand-waving remains.

2. **5+1 Ralph gates with strict bypass policy**: Gate 1 and Gate 5 cannot be bypassed (escape valve = `agora ralph abort`); Gates 2/3/4 conditional with mandatory `--reason`; Gate 0 and iteration cap free with audit.

3. **10 critic personas** (Aquinas Disputatio): 4 UI/UX + 5 Technical + 1 Universal (telos_alignment). Trigger-based selection. PR-only addition path.

4. **19 Gate 0 probes** ship in v1: covers Sang's lazydevz stack 100% (Vercel, Supabase, GitHub Actions, Stripe, Clerk, gcloud, AWS, Bun, Upstash, Cloudflare, Docker, Railway, PostHog, etc.).

5. **Drift scoring is LLM-only at v1** (R1-A in 2-B.4). Hybrid heuristic deferred to operational evolution. Future-trigger criteria specified.

6. **Sequential default + parallel architecture-ready** (ADR-0008). Three measurable triggers for future default change.

7. **Plato Dihairesis decomposition with mandatory user review** (Stage 2-C.1): no Ralph starts without user accepting the decomposed tree.

8. **No manual skip/reorder commands** (R3-B in 2-C.2): engine auto-skips only after 3 Z2 attempts + 2 user aborts. Reorder = re-decompose at alignment level.

9. **Single .agora/state.json phase pointer** (R1-A in 2-C.3): one source of truth for `agora resume` dispatch.

10. **Append-only events.jsonl audit log** (R2-A in 2-C.3): every meaningful event recorded for replay and analysis.

---

## Deliberately deferred

These items Stage 2 chose **not** to settle. Some are routed to Stage 3-5; some are operational evolution targets.

| Item | Stage / Trigger |
|------|------|
| CLI command UX detail (every screen, flag, output format) | Stage 3 |
| Install / distribution mechanics | Stage 4 |
| MCP server design | Stage 4 |
| Module / file-tree implementation organization | Stage 5 |
| Per-philosopher prompt library (canonical prompts for each persona) | Stage 5 |
| Hybrid drift scoring (R1-C in 2-B.4) | Operational evolution after 30+ Ralph sessions |
| Parallel-default switch (per ADR-0008 triggers) | Operational evolution per measurable triggers |
| 6th philosopher addition | Operational evolution after first real use |
| Probe registry expansion (Tier 3 community) | Per-PR after v1 |
| Critic persona expansion | Per-PR after v1 |
| Public release | Sang's strategic decision, no schedule (per ADR-0007) |

---

## Verification of close

A stage closes only when (per ADR-0004):
1. All named deliverables exist and are committed ✅
2. Sang has read and approved them ✅ (explicit approvals throughout 2-A, 2-B, 2-C rounds)
3. No ADR is left in Proposed state from this stage ✅ (ADR-0008 is Accepted)

All three conditions met.

---

## Next stage

**Stage 3 — CLI Surface Detail** opens here. See `docs/stage-3/NOTES.md`
(to be created on Sang's approval to enter Stage 3) for the entry plan.

The full set of 7 (or fewer, with caps) `agora` subcommands needs detailed
spec including every flag, every screen mockup, every output format,
auto-suggest behavior, and JSON output mode.

---

*This document is immutable. Stage 2 is over.*
