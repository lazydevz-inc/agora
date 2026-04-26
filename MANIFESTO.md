# The Agora Manifesto

> *AI surpassed us in execution.*
> *What remains is taste.*
> *Philosophy makes taste articulate.*

---

## I — The Bet

When AI surpasses human intellectual capability in execution, the territory that remains uniquely human is **taste** — the inner sense of what is wanted, what is right, what is *yours*.

Taste is not vague. It is precise. But it is precise in a register that lives inside human beings, not on disk. The discipline that has spent 2,500 years building techniques for drawing taste out of the inner self into articulable form is **philosophy** — particularly the methods refined in ancient Greece.

**Agora's bet: in the age of AI, philosophy is no longer a humanities subject. It is the missing technology layer between human intent and machine execution.**

We do not use philosophy because it sounds intellectual. We use it because it is the only proven technology, validated across 2,500 years of scrutiny, for *reliably articulating taste at the level of fidelity machines now demand*.

---

## II — The Math That Makes This Urgent

Suppose each iteration of an AI-driven implementation loop drifts the actual output 10% from the intended output.

After 10 iterations:

```
0.9^10 ≈ 0.3487
```

The result resembles the intent by **34.87%**.

It does not matter how powerful the underlying model is. If alignment between expected output and actual output is not closed *before* iteration begins, the iterations themselves compound the gap into oblivion.

**The leverage point in AI-assisted software is not generation power. It is alignment fidelity.**

This is not a polish argument. It is mathematics.

---

## III — The Definition

**Agora is a Human-AI Alignment (HAA) harness.**

It exists to drive `expected_output ↔ actual_output` divergence to ~0% **before** any implementation iteration begins, and to verify alignment is preserved *during* every iteration of implementation.

We propose **HAA** as a discipline term, in the lineage of HCI (Human-Computer Interaction). HCI asked: *how do humans communicate with machines?* HAA asks: *how do humans align with machines that now generate, decide, and act?*

---

## IV — Two Loops

Agora's runtime is two loops, in sequence.

### The Alignment Loop

Closes the gap between human intent and AI specification.

```
Phase −1 (optional): Husserl Epoché — bracket assumptions before asking
Phase 0 (auto):      Scan folder, detect brownfield, ingest existing context
Phase 1 (open):      Receive all context the user is willing to give in one turn
Phase 2 (iterative): Philosopher-led rounds with quoted-prior-answer continuity
Termination:         User assent + structural validation + (optional) preview quality
Output:              A locked seed (structured + prose) — Agora's artifact of alignment
```

### The Ralph Loop

Drives implementation against the locked seed. Every iteration must pass five gates:

1. **Deterministic** — lint, typecheck, build, test
2. **Functional QA** — Playwright CLI tests
3. **UI/UX expert review** — taste/quality judgment
4. **Technical Quality** — Aquinas Disputatio (per-objection ruling)
5. **Alignment Check** — output's fit to the seed (the only inviolable gate)

Gate 5 failure escalates: self-correct → mini-Alignment re-entry → never silent override.

---

## V — The Five Who Run It

| Philosopher | Method | Where in the loop |
|-------------|--------|-------------------|
| **Husserl**  | Epoché — bracket the user's assumed solution-frame | Alignment Loop, Phase −1 |
| **Socrates** | Elenchus — surface assumptions through case-probing | Alignment Loop conductor |
| **Aristotle**| Four Causes — telos primary, then form/material/efficient | Alignment Loop structuring |
| **Plato**    | Divided Line (knowledge maturity) + Dihairesis (natural division) | Termination gate + AC decomposition |
| **Aquinas**  | Disputatio — per-objection verdict instead of vote | Ralph Loop verification gates |

These five are not collectible badges. Each is the single best-known method for one irreducible function. Adding a sixth requires demonstrating that no current philosopher covers the function — at the level of justification we hold ourselves to.

---

## VI — The Augmentation Bet

> *Agora is to AI coding agents what Linux distros are to the Linux kernel.*

As the kernel becomes more capable, every distro built on it inherits the gain. Distros do not compete with the kernel. They harness kernel improvements into shapes humans can use.

When opus 6 ships, when Claude Code adds a new tool, when a smarter agent appears — Agora absorbs the gain. We are anti-fragile to AI progress.

This means we bet *on* AI improvement, not against it. We do not build features that compete with what the underlying agents will do better next quarter. We build the alignment layer that makes whatever they do **be what was wanted**.

---

## VII — What Agora Refuses to Be

1. **Not a tool for non-developers.** Senior dev / CTO / Technical Product Owner is the persona ceiling.
2. **Not a general agent platform.** Constrained to spec-first → implementation flow.
3. **Not an IDE.** CLI primary; TUI for standalone runs; GUI later. Editing happens elsewhere.
4. **Not stop-at-spec.** Implementation is part of the responsibility.
5. **Not a customizable framework.** Best defaults are forced; per-folder *use* is independent.
6. **Not a cloud SaaS.** Local-first; user data stays on the user's machine.
7. **Not a marketplace of philosophers.** Five only, until justified otherwise.

---

## VIII — One Folder, One Project, One Agora

Agora's settings are global and biased. Best defaults are baked in at the system level — there is no "configure to your taste" surface.

Agora's *use* is per-folder and isolated. A new folder is a new project is a new Agora session. Cross-folder context bleed is forbidden. Within-folder context accumulation across multiple Agora invocations is welcomed.

This is the inverse of most tools. We are biased at the system, scoped at the project.

---

## IX — Built by the Method We Teach

Agora is being built using Agora's own discipline. No coding without an Architecture Decision Record. No ADR without an interview question that produced it. The first attempt at a code skeleton was rolled back the moment it preceded alignment.

The product itself is the proof.

---

## X — The Promise

When Agora succeeds, the user will say:

> *"This is what I meant."*

Not for the first iteration. For *every* iteration.

That is the entire point.

---

*Sang Rhee, lazydevz, Inc. — 2026-04-27*
