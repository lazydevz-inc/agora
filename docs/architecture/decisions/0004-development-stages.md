# ADR-0004 — Development Stages

> **Status**: Accepted
> **Date**: 2026-04-26
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

We need a phased plan that (a) avoids premature implementation, (b) produces aligned artifacts at each step, (c) allows Sang to interrupt and redirect at every stage.

## Decision

Agora is built in **seven stages** (Stage 0–6). Stages 0–5 produce documents and minimal scaffolding. Stage 6+ produces feature code.

| Stage | Goal | Done When |
|-------|------|-----------|
| **0** | Foundation | Skeleton compiles, CLI runs, GitHub repo exists, ADR-0001 to -0004 written |
| **1** | Philosophy + North Star | `MANIFESTO.md` and `docs/north-star.md` accepted by Sang. Includes hybrid interview (Ouroboros baseline + Aristotle four-cause deepening) |
| **2** | Two-Loop Specification | `docs/loops/interview-loop.md` and `docs/loops/ralph-loop.md` accepted. Includes verification-gate design (lint / functional QA / Aquinas Disputatio) |
| **3** | CLI Surface Detailed Design | `docs/cli/spec.md` covers every command, every flag, every screen mockup, JSON output mode for AI agents |
| **4** | Infrastructure + LLM Integration + Install | `docs/infra/install.md`, `docs/infra/llm-integration.md`, MCP server registration plan, AI agent friendly install (`npx`, `pnpm dlx`) |
| **5** | Internal Architecture + Philosopher Runbooks + Prompts | Module dependency graph, per-philosopher runbooks (when called, what prompt, what output), prompt library |
| **6+** | Implementation (vertical slices) | First vertical slice: `agora` (interactive default) → context scan → first interview round. Subsequent slices add: seed generation, ralph loop, evaluation gates, MCP server |

### Stage gates

A stage is "done" only when:
1. Its named documents exist and are marked `Accepted`
2. Sang has read and approved them (explicit signal, not silence)
3. No ADR is left in `Proposed` state from that stage

We **do not** start the next stage's documents until the current stage's gate clears. This prevents documents from referring to ideas that have not been agreed upon.

### Stage cadence and reporting

Within each stage, work proceeds in increments. Each increment ends with a brief sync (`📋 작업 계획 보고` style for code work, plain summary for document work).

Auto mode does not bypass gate approvals. Auto mode means *continuous execution within an approved scope*. Crossing into a new stage always requires explicit approval.

## Consequences

### Positive

- Sang can pause, redirect, or kill a stage at any boundary
- Documents written under this discipline form a coherent, interlinked spec — not a pile of notes
- The roadmap doubles as a teaching narrative IF Agora is ever made public (per ADR-0007, no longer scheduled)

### Negative / Trade-offs

- Slow start. We will produce ~30 documents before the first feature ships
- Risk: documents may go stale if we change direction mid-stream (mitigation: ADR superseding is cheap)

### Neutral

- This is essentially a waterfall-with-explicit-feedback-loops at the macro scale, with iteration inside stages

## Open Questions for Stage 1

These are the questions Stage 1 will answer:

- What is Agora's **telos** (Aristotle's final cause)?
- What does *daily use* concretely mean for Sang in 3 months?
- What is Agora's relationship to Claude Code: harness, replacement, or alternative?
- What is the long-term commercial form (open-source + service, paid CLI, SaaS)?
- What does Agora **refuse to be**?

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Single Phase 1 with everything | Too coarse; nothing to gate on |
| Sprint-style 2-week cycles | Mismatch — we have one user (Sang), not a team |
| Build first, document never | Violates ADR-0003 |

## References

- ADR-0003 (Meta Dogfooding) — the "why" behind document-first
