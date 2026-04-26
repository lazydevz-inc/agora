# Interview Loop — Specification (Stage 2)

> **Status**: Pre-Stage-2 placeholder. This document accumulates inputs from Sang
> that will be formalized into the full Interview Loop spec when Stage 2 begins.
>
> Per ADR-0004, this document is not "Accepted" until Stage 2 closes its gate.

---

## Pre-Stage-2 Inputs from Sang

### Input 1 — Phase structure (2026-04-26)

The Interview Loop has three observable phases:

**Phase 0 — Auto-scan (no user input)**
- Scan current working directory for files
- Detect brownfield vs greenfield (presence of `.git`, code files, lockfiles)
- Read all relevant Markdown context: `README.md`, `CLAUDE.md`, `AGENTS.md`,
  any `*.md` files at the project root, plus inferred work-related notes
- Use this scan as initial context for subsequent phases

**Phase 1 — Open intake (one large turn)**
- Ask the user what they want to work on, openly
- Receive *all* the context the user is willing to provide in one round
- No fragmenting questions yet — let them dump

**Phase 2 — Iterative interview (loop)**
- Use the accumulated context (auto-scan + open intake + each round's answers)
- Multi-perspective rounds: each iteration applies one or more philosopher lenses
- Validation/order/iteration logic is **not yet finalized**
  → Stage 2-A will design this through structured exploration

### Input 2 — UX: recommended options + free input (2026-04-26)

The user dislikes verbose typing burden. Every interview question should provide:

- **Recommended options** — multiple choices the user can pick by number
- **Always available**: free input. The user can type their own answer at any time

This is non-negotiable. Verbose context-only interviews are the Ouroboros pain point we explicitly fix.

### Input 3 — End-of-interview UX (2026-04-26)

When Agora internally determines that the interview can end (e.g. telos has reached
Noesis, all four causes are sufficiently mature, no fresh ambiguity surfaces in the
last N rounds), it must **not** terminate silently.

**Always ask first**: *"I think we have enough to proceed. Anything else you want
to refine before we lock the seed?"*

- If the user has more to discuss → continue the loop, no penalty
- If the user has nothing more → cleanly close and produce the seed

**Why this matters**:
- The user is the source of truth on intent. Agora's internal "we're done" signal
  is a hypothesis; the user's "yes I'm done" is the confirmation.
- It prevents the failure mode where the system declares completion but the user
  was about to bring up a critical concern.
- It respects the user's autonomy — Agora suggests, the user decides.

This is a **structural rule** of the loop, not a polish feature. Stage 2 design
must encode it as the only valid termination path (no auto-terminate).

---

## Open Questions (to be answered in Stage 2)

These questions will be resolved during Stage 2-A:

1. **Validation gates** — How does Agora know a claim is settled?
   - Maturity-based (Plato's divided line) — telos must reach Noesis?
   - Implication-based (Socratic elenchus) — claim must survive case probing?
   - Coverage-based (Aristotle's four causes) — all four causes must be addressed?
   - Combination of the above with weights?

2. **What gets re-asked, when, and why** — When does an answer trigger a follow-up?
   - When new information contradicts an earlier answer
   - When maturity is below threshold for a load-bearing field
   - When an alternative is implied but not considered

3. **Round ordering** — Which philosopher acts when?
   - Husserl Phase −1 (greenfield only? always optional?)
   - Aristotle four causes — telos first, always
   - Socrates elenchus — woven through, on every claim
   - Plato dihairesis — when AC decomposition starts (handoff to Ralph Loop)

4. **Recommended-options generation** — How does the system propose options?
   - Drawn from auto-scan (codebase patterns)
   - Drawn from common cases (Aristotle category exemplars)
   - Drawn from the user's earlier answers (consistency check)

5. **Brownfield vs greenfield branch** — Where do they diverge?
   - Greenfield: Husserl Phase −1 may be more useful (frame-questioning)
   - Brownfield: Phase 0 auto-scan is critical; existing code constrains telos

---

*This document will be expanded during Stage 2 with the resolved spec.*
