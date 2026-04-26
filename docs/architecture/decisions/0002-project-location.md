# ADR-0002 — Project Location and Visibility

> **Status**: Accepted
> **Date**: 2026-04-26
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

Agora needs a home. Decisions:

1. Which GitHub organization / account
2. Public or private during development
3. Local path on Sang's machine
4. npm scope for future publication

## Decision

| Concern | Decision |
|---------|----------|
| GitHub org | `lazydevz-inc` |
| Repo name | `agora` |
| Visibility | **Private** during Stage 0–5 |
| Local path | `/Users/sang/Developer/agora/` |
| npm package | `@lazydevz/agora` |
| Discarded Python skeleton | Preserved at `/Users/sang/Developer/agora-draft/` (not pushed) |

The repository will be made **public** at the start of Stage 5 (Polish + Daily Use), when the philosophy and CLI surface are stable enough that public scrutiny adds value rather than confusion.

## Consequences

### Positive

- Private during foundation prevents incomplete ideas from being judged
- `lazydevz-inc` org positions Agora as a lazydevz product, not a personal experiment
- npm scope `@lazydevz` aligns with future products from the same org
- Drafts preserved locally as reference material without polluting public history

### Negative / Trade-offs

- Outside contributors cannot help during private phase (acceptable trade-off)
- Marketing momentum delayed until Stage 5

### Neutral

- Going public requires audit pass (no secrets, license clean, README complete)

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Public from day one | Premature scrutiny on incomplete ideas |
| Personal account `srhee91/agora` | Doesn't fit lazydevz brand strategy |
| Monorepo inside lazydevz hub | Agora's lifecycle differs from other lazydevz products |

## References

- Sang's other lazydevz repos for organizational conventions
