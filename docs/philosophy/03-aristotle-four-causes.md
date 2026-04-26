# 03 — Aristotle's Four Causes

> *"We do not have knowledge of a thing until we have grasped its why,
> that is to say, its cause."*
> — Aristotle, *Physics* II.3

## What Aristotle noticed

To truly understand any thing, you must understand it from **four angles** — not one, not three. Modern thought collapses these into a single "purpose" or "function" and loses the other three.

| Cause | Greek | Question |
|-------|-------|----------|
| **Material** | *hyle* | What is it made of? |
| **Formal** | *eidos* | What is its essential structure or form? |
| **Efficient** | *kinoun* | What process brings it into being? |
| **Final (Telos)** | *telos* | What is it ultimately *for*? |

Aristotle held the **Final Cause (telos)** as primary. The acorn becomes an oak *because that is what acorns are for*. Without telos, the other three are mere description.

## Why this matters for software

Most requirements documents capture the **formal cause**: *"build a button that does X."*
Some capture **material**: *"use React."*
Even fewer capture **efficient**: *"team of 2 over 4 weeks."*

**Almost none capture telos.**

Compare:
- Formal: *"Build a comment system."*
- Telos: *"Help authors hear from readers without becoming targets for harassment."*

These produce *radically different* implementations. Without telos, an AI agent will optimize the formal cause and may produce something technically correct but spiritually wrong.

The 0.9^10 math from the manifesto compounds particularly hard here: each iteration drifts in the direction of the formal cause, and after 10 iterations the result is technically a comment system but no longer serves the telos.

## What Agora extracts

A four-cause framework that **structures the entire Phase 2 of the Alignment Loop**, with telos questioned first.

```yaml
seed:
  four_causes:
    telos:                  # Final Cause — primary
      statement: ""
      served_good: ""       # the good this serves
      success_signal: ""    # how we know it worked
      failure_signal: ""    # how we know it didn't
      maturity: noesis      # MUST be noesis (per Plato Divided Line)
    form:                   # Formal Cause
      essential_structure: ""
      irreducible_parts: []
      maturity: dianoia     # at least dianoia
    material:               # Material Cause
      tech_stack: []
      data_shape: ""
      infrastructure: ""
      maturity: pistis      # pistis acceptable
    efficient:              # Efficient Cause
      who: ""
      when: ""
      how: ""               # process, tools, sequence
      maturity: pistis      # pistis acceptable
```

Each cause is its own typed sub-object — never a string blob. This forces the cause to have shape.

## Where in the loop

```
Alignment Loop:
  Phase −1   (Husserl, optional)
  Phase 0    (auto-scan)
  Phase 1    (open intake)
  Phase 2    (iterative rounds)  ◀── Aristotle structures the order here
  Termination
```

Aristotle is the **structuring principle of Phase 2**. Each round picks one cause to investigate. The order is intentional and not user-configurable:

1. **Telos first** — always. If the user cannot articulate telos to Noesis-level, no other question is valuable.
2. **Form second** — once telos is settled, what shape carries it?
3. **Material third** — what is it made of? (often partially answered by auto-scan in brownfield)
4. **Efficient fourth** — who/when/how? (often delegated to project tooling, not deeply interviewed)

When telos is unstable mid-round, Aristotle **interrupts** the round and returns to telos — the rest is moot until telos holds.

## The Telos Question — interrogated

Telos is so important that Agora asks **multiple questions** to triangulate it. Three are mandatory:

1. **Why does this exist?** — The base statement.
2. **What good does it serve?** — Forces the user to name the goodness, not just the activity.
3. **What is the failure signal?** — How will you know if you built the thing but it failed at its purpose? (This often surfaces a different telos than the user first stated.)

A telos with no `failure_signal` is not Noesis. It is Pistis — a belief without specification.

## What output it produces

Every alignment seed has a `four_causes` section. Telos is non-optional and must reach Noesis. Form, material, efficient may be partially specified at lower maturities — the seed records each cause's maturity.

Ralph's gates use telos directly:

- **Gate 5 (Alignment Check)** measures whether the implementation serves the telos. Not whether tests pass, not whether AC are met — whether the *served good* is being served.
- **Gate 4 (Aquinas Disputatio)** uses telos as the criterion for *Sed contra* — the strongest objection is the one that argues "this implementation is technically correct but does not serve the telos."

Without Aristotle, both gates have no anchor.

## How it integrates with the others

- **Husserl** brackets the frame; **Aristotle** classifies what is found inside the frame
- **Socrates** tests each cause's claim through case-probing
- **Plato (Divided Line)** tags each cause's maturity; telos must reach Noesis
- **Aquinas** uses telos as the criterion for verdict in Ralph

If Aristotle were removed, the alignment loop would become a free-form interview — the depth-from-structure that distinguishes Agora from "just chat with Claude" would disappear.

## How it can fail

**F-Aristotle-1 — Telos collapsed into formal cause.**
The user states *"I want a comment system"* and the system records that as telos. It is not. It is form.
*Mitigation*: explicit telos questions never accept a noun-phrase that names the artifact. They ask *"what good does the [user's noun] serve?"* until a verb-phrase about the served good emerges.

**F-Aristotle-2 — Material cause leading.**
The user is excited about a tech stack and the interview anchors on material. *"I want to build something with WebSockets."*
*Mitigation*: when material is offered before telos, Agora rebuts: *"Noted. WebSockets are a material cause. What is the telos that you believe needs WebSockets?"*

**F-Aristotle-3 — Efficient cause skipped.**
The user is solo so efficient feels trivial. But "solo, evenings, 30 minutes per session" is a real efficient cause that constrains the implementation. Skipping it leads to over-engineered specs.
*Mitigation*: even for solo projects, capture efficient cause as a one-liner. It informs Ralph's verbosity, gate strictness, and over-engineering tolerance.

**F-Aristotle-4 — Telos at Pistis declared "good enough."**
User says *"I think I want X for the user"* and pushes to move on.
*Mitigation*: termination gate (Plato Divided Line) refuses to close if telos is below Noesis. The user can override with explicit `--accept-low-telos-maturity` flag, but the seed is tagged with the override and Ralph displays a warning at start.

## When Aristotle steps back

After Phase 2 closes and the seed is locked, Aristotle no longer operates. Ralph uses the four-cause artifact but does not re-interview. New material/efficient discoveries during Ralph go into a "deviations" log, not into the seed — until the user explicitly re-enters Alignment Loop.

This is a discipline boundary: the four causes are a contract. Ralph does not re-negotiate the contract while building.

---

*Aristotle's contribution to Agora is the discipline of asking what something is FOR before asking what it does. The other three causes serve the first.*
