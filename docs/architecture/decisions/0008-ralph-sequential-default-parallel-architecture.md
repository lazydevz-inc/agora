# ADR-0008 — Ralph: Sequential Default with Parallel-Ready Architecture

> **Status**: Accepted
> **Date**: 2026-05-03
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

Ralph (the implementation loop) can iterate sequentially (one in-progress
implementation at a time) or in parallel (N candidate implementations per
iteration step, with Aquinas Disputatio selecting the best at each step).

Sequential is the simpler model — every Stage 2-A and Stage 2-B SPEC so far
has implicitly assumed it. But sequential leaves potential value on the table:
when one implementation hits a dead end, parallel siblings might not.

The question: do we ship parallel from v1, ship sequential and add parallel
later, or design for parallel but default to sequential?

## Decision

**Architecture supports parallel from v1. Default behavior is sequential.
Parallel is opt-in via flag or config.**

This is R1-B from Stage 2-B.6's interview.

### Architecture-level

The Ralph engine, state store, and Aquinas Disputatio infrastructure are
designed from day one to support N-way parallel iteration. Specifically:

1. **State**: each in-progress iteration has its own isolated workspace
   (e.g. `.agora/iterations/{iteration_id}/`) and history record. State
   coordination assumes N >= 1 from the start.

2. **Disputatio**: in addition to the per-gate Disputatio specified in
   Stage 2-B.3 (critics within one iteration), an **inter-iteration
   Disputatio** capability is defined for choosing among N parallel
   candidates. Implementation may be deferred but the API is reserved.

3. **History**: `.agora/history/` records iterations as a tree, not a list.
   Each iteration carries `parent_iteration_id` and `sibling_ids` fields
   for parallel runs.

4. **Cap interaction**: each parallel candidate counts as one iteration
   against the hard_iteration_count cap (Stage 2-B.5). Token budget
   counts the sum across siblings.

### Default behavior at v1

```
agora ralph                   → sequential (parallelism = 1)
agora ralph --parallel=N      → N-way parallel
.agora/config.toml [ralph] parallelism = N → project-level default
```

The unflagged invocation always produces sequential behavior at v1. This:
- Honors Sang's *biased-product principle* (best default is the proven path)
- Aligns with R5-C's *minimal-addition* spirit (architecture exists, default is conservative)
- Keeps test surface manageable (sequential is the path every Stage 2 SPEC validated)

### Reasons NOT to go parallel-default at v1

- Token cost N-fold per iteration (Sang's Max plan absorbs $ cost, but wall time still increases)
- Inter-iteration Disputatio is unproven in practice; default-on exposes it to every Ralph session
- Future parallel-vs-sequential calibration data is hard to gather if everyone always runs parallel
- Every Stage 2-A and 2-B SPEC was written assuming sequential — going default-parallel risks subtle assumption violations

### Reasons NOT to go sequential-only (no parallel architecture)

- Adding parallel later requires retrofit of state, history, Disputatio, cap interaction — significant rework
- Architecture-ready costs ~1 week of upfront work; retrofit costs ~3 weeks plus risk of breaking sequential path
- Some Stage 2-B SPECs (e.g. iteration cap) are easier to design correctly when parallel is in mind from start

## Future re-evaluation triggers [R2-A]

Switch parallel from opt-in to default (or adjust the parallelism N) when
ANY of these become true:

1. **Operational dead-end pattern**: Sang accumulates 30+ Ralph sessions of
   real use, and the pattern *"3 attempts in a row converge to the same
   dead-end (Z2 mini-alignment recommended)"* fires 5+ times. This signals
   that single-candidate iteration genuinely loses value, justifying
   parallel as default.

2. **Explicit user requests for parallel**: 3+ documented instances where
   a user (Sang or future contributors) wishes parallel had been on for
   a specific case. Captured in `.agora/history/` notes or feature requests.

3. **Hard iteration cap saturation**: average Ralph session reaches the
   25-iteration hard cap (Stage 2-B.5) more than 20% of the time. This
   suggests sequential isn't converging fast enough.

ANY of these triggers a new ADR considering: change default? raise default
parallelism? adjust inter-iteration Disputatio?

The triggers are intentionally **measurable signals**, not hand-wavy "when
it feels right." Per ADR-0003 (meta-dogfooding), we use data to make
decisions even on our own product.

## Consequences

### Positive

- Architecture investment up-front; no painful retrofit later
- Sequential default = stable, validated, low-risk first user experience
- Parallel is a clear opt-in for users who want it (CLI flag or config)
- Triggers for future default change are explicit, not vague
- Honors biased-product principle while preserving optionality

### Negative / Trade-offs

- ~1 week extra engineering at v1 vs sequential-only
- Parallel code path exists but is rarely exercised — risk of bit-rot
  unless tested explicitly
- Inter-iteration Disputatio API reserved but not finalized; flexibility
  cost during evolution
- Documentation must explain "parallel exists but default is sequential" —
  small UX cost for users discovering the feature

### Neutral

- v1 ships with sequential as the documented happy path. Parallel is
  a power-user feature with its own section in `agora help`.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Sequential-only at v1 (no parallel architecture) | Retrofit cost dwarfs upfront cost; design-time corrections to sequential SPECs benefit from parallel awareness anyway |
| Parallel default at v1 (R1-C) | Default-on exposes unproven inter-iteration Disputatio to every session; data on whether parallel actually helps is harder to gather; cost-time UX immediately N×; subtle violations of sequential-assumed Stage 2 SPECs |
| Defer parallel question entirely | Without architectural reservation, retrofit later is 3× more work; some Stage 2-B SPECs benefit from designing-for-N rather than designing-for-1 |

## Implementation Notes (for Stage 6)

When implementing in Stage 6:

1. State store schema includes `iteration_id`, `parent_iteration_id`,
   `sibling_ids` from day one.
2. Workspace isolation is per-iteration even for sequential (parallelism = 1)
   — sequential is just the N=1 case.
3. Inter-iteration Disputatio API is defined but a noop for N=1 (returns
   the single candidate trivially).
4. Hard iteration cap (Stage 2-B.5) counts each sibling as 1 iteration.
   Token budget counts cumulative across all siblings.
5. CLI: `--parallel=N` flag on `agora ralph` (validated 1 ≤ N ≤ 5;
   higher N requires `--parallel-force=N` confirmation).
6. Default `parallelism = 1` is hardcoded; project-level config can override.

## References

- ADR-0003 (Meta Dogfooding) — measurable triggers, not vibes
- ADR-0006 (Pre-Ralph Infrastructure Gate) — Gate 0 runs once per session
  regardless of parallelism
- Stage 2-A.10 (Mini-alignment Z2) — Z2 trigger logic operates on the
  *failing iteration*, parallel siblings independently track Z1 counters
- Stage 2-B.3 (Critic personas) — Aquinas Disputatio per-gate is unchanged
  by parallelism; inter-iteration Disputatio is a separate (currently API-reserved) layer
- Stage 2-B.5 (Iteration cap) — cap counts each sibling; token budget cumulative
