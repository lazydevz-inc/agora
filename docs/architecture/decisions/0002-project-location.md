# ADR-0002 — Project Location and Visibility

> **Status**: Accepted (visibility section partially superseded by ADR-0007 on 2026-04-27)
> **Date**: 2026-04-26
> **Last Revised**: 2026-04-27 (visibility commitment withdrawn — see ADR-0007)
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
| Visibility | **Private indefinitely** (no scheduled public-release; see ADR-0007) |
| Local path | `/Users/sang/Developer/agora/` |
| npm package | `@lazydevz/agora` |
| Discarded Python skeleton | Preserved at `/Users/sang/Developer/agora-draft/` (not pushed) |

> **Update (2026-04-27, ADR-0007)**: The original commitment to make the repo public at the start of Stage 5 has been **withdrawn**. Sang's revised position: *"우선은 private repo로 두고 내가 쓸 용도로 만드는거야. 나중에 public repo로 가는게 의미가 생긴다면 그때 검토해볼 수 있을거같아."* Public release is now an open option triggered by an explicit strategic decision, not a Stage milestone.

## Consequences

### Positive

- Private during foundation prevents incomplete ideas from being judged
- `lazydevz-inc` org positions Agora as a lazydevz product, not a personal experiment
- npm scope `@lazydevz` aligns with future products from the same org
- Drafts preserved locally as reference material without polluting public history

### Negative / Trade-offs

- Outside contributors cannot help during private phase (acceptable — Sang's personal-tool framing does not require contributors)
- Marketing momentum is not pre-scheduled — public release happens only when there is a strategic reason

### Neutral

- Going public requires audit pass (no secrets, license clean, README complete)

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Public from day one | Premature scrutiny on incomplete ideas |
| Personal account `srhee91/agora` | Doesn't fit lazydevz brand strategy |
| Monorepo inside lazydevz hub | Agora's lifecycle differs from other lazydevz products |

## References

- ADR-0007 — License Choice (which formally withdrew this ADR's Stage-5 public commitment)
- Sang's other lazydevz repos for organizational conventions
