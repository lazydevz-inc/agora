# ADR-0003 — Meta Dogfooding: Build Agora the Agora Way

> **Status**: Accepted
> **Date**: 2026-04-26
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

Agora exists because most software fails at specification, not at execution. Building Agora itself by jumping straight to code would violate the very thesis Agora is selling.

In our first attempt at Phase 1, Claude wrote ~3000 lines of skeleton based on four interview answers. Sang flagged this as the exact anti-pattern Agora is meant to prevent. The draft was preserved at `/Users/sang/Developer/agora-draft/` as a teaching reference.

We need an explicit principle that prevents this from happening again.

## Decision

**Agora is built by the method Agora teaches. No coding without a documented decision. No decision without an interview question that produced it.**

### Operational rules

1. **Every architectural decision is an ADR** in `docs/architecture/decisions/`. ADR template lives at `0000-template.md`.

2. **Code is forbidden during Stage 1–5 except** when:
   - The code is required to validate an ADR (proof-of-concept)
   - The code is a placeholder that the build pipeline depends on (e.g. CLI entrypoint)
   - Sang explicitly requests it

3. **The two-loop concept Agora is selling** (Interview Loop → Ralph Loop) is the same process used to build Agora itself:
   - Stage 1–5 is the **Interview Loop** for Agora (we are clarifying what Agora *is*)
   - Stage 6+ is the **Ralph Loop** for Agora (implementation iterations against a settled spec)

4. **Recursion stop**: We do not infinitely re-interview. Once an ADR is `Accepted`, it is treated as settled until explicitly superseded by a new ADR.

5. **Every code change references an ADR or an open question.** Commits cite ADR numbers when the change implements one.

### Sang's project conventions retained

The `📋 작업 계획 보고` template from Sang's other CLAUDE.md files remains the standard for any non-trivial change during Stage 6+. It is not redundant with ADRs — ADRs capture *decisions*, the report template captures *executions*.

## Consequences

### Positive

- The product itself becomes evidence that the method works (or doesn't)
- Sang can later showcase Agora with the line: *"Agora was built using Agora."*
- Discipline around ADRs creates a permanent record of "why" — outlasting any contributor's memory
- We catch bad ideas at the document stage (cheap) rather than at the code stage (expensive)

### Negative / Trade-offs

- Slower throughput during Stage 1–5
- Risk of ADR ceremony becoming bureaucratic (mitigation: ADRs are concise, ≤ 1 page)
- Some decisions are too small for ADRs and may slip through (acceptable)

### Neutral

- ADR culture is not unique to Agora; widely used in mature engineering orgs

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Just code and document later | Documents written after the fact rationalize, not justify |
| Full RFC process per change | Too heavy for a one-person project |
| No formal docs, rely on commit messages | Commits scale poorly as the rationale store |

## References

- Sang's CLAUDE.md files (hanpark-admin, screenflow, love-virtually): the `작업 계획 보고` template
- Michael Nygard's original ADR proposal: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
