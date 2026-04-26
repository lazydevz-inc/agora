# 04 — Plato's Divided Line & Dihairesis

> *"We must distinguish things according to their natural joints,
> and not break any limb in half as a bad carver might."*
> — Plato, *Phaedrus* 265e

Plato contributes **two** distinct methods to Agora. They operate at different points and serve different purposes.

---

## Part 1 — The Divided Line: Knowledge Maturity

### What Plato noticed

In *Republic* VI, Plato divides knowledge into four ascending levels:

| Level | Greek | What it is | Agora analog |
|-------|-------|-------------|---------------|
| 4 | *Noesis* | Direct understanding of forms | "I know *why* this is the right design — and why the alternatives are not" |
| 3 | *Dianoia* | Reasoning from premises | "I can justify this design with logic" |
| 2 | *Pistis* | Belief without justification | "I think this is what we need" |
| 1 | *Eikasia* | Imagination, shadows | "Something kinda like a blog" |

Most software requirements live at **Pistis** or **Dianoia**. They are *specified* but not *understood*. The author can state them but cannot defend them against alternatives.

The 0.9^10 problem compounds because Pistis-level requirements drift faster — each Ralph iteration interpreting an underspecified requirement adds variance, and the user has no anchor to correct against (because the user themselves did not understand it).

### What Agora extracts

A **maturity tag on every claim** in the seed. Different fields have different maturity floors:

| Field | Required maturity | Why this floor |
|-------|---------------------|----------------|
| `four_causes.telos` | **Noesis** | The most load-bearing field; drift here destroys everything |
| `four_causes.form` | **Dianoia** | Justifiable structure required |
| `four_causes.material` | **Pistis** | Tech choices can mature later, often via auto-scan |
| `four_causes.efficient` | **Pistis** | Process can be discovered, not specified up-front |
| `acceptance_criteria.*` | **Dianoia** | Each AC must be defensible |
| `evaluation_principles.*` | **Dianoia** | Why-this-matters required |

A seed cannot lock if any field is below its floor. The user can override only by explicit flag, and the override is recorded.

### The Noesis test

Noesis is the only level Agora can measure rigorously. The test:

> **"What alternative did you consider for this claim, and why did you reject it?"**

A user at Noesis can answer in two sentences. A user at Dianoia struggles. A user at Pistis says *"I just thought it was the right way."*

The Noesis test is built into Phase 2 — when Aristotle's telos question is answered, Socrates probes the answer, and **then** Plato asks the Noesis question. If the user cannot articulate a rejected alternative, the claim drops back to Dianoia and the loop re-iterates.

This sounds painful. It is. The 0.9^10 math is more painful.

### Connection to Sang's writing maturity model

Sang's personal site uses a five-stage maturity for writing: 씨앗 → 새싹 → 묘목 → 꽃 → 열매. The Divided Line is the same idea applied to claims rather than essays. Both encode: **ideas grow, and we should mark where they are.**

---

## Part 2 — Dihairesis: Cutting at Natural Joints

### What Plato noticed

When dividing a thing into parts, the *natural* division differs from the *convenient* division. A bad carver cuts limbs in half because that is where his knife happens to land. A good carver cuts at the joints because *that is where the animal actually divides*.

Plato's method of **dihairesis** (διαίρεσις) is systematic division: at each step, find the **single most fundamental binary**, and cut there. Continue until you reach an indivisible kind.

### Why MECE-by-LLM-judgment fails

Most decomposition tools (Ouroboros included) ask an LLM to break a task into 2–5 children using MECE as a guideline. This produces *plausible* cuts, not *natural* cuts.

A "user authentication" task LLM-decomposed:
- "login form, registration form, password reset"

Convenient. Feature-aligned. Wrong.

Dihairesis-decomposed:
- First binary: **identity verification** vs **session management** (the natural joint)
- Under identity verification: **first-time identity claim** (registration) vs **returning identity claim** (login)
- Under session management: **session establishment** vs **session continuation**

The Dihairesis cuts produce a tree where each branch is defensible as *the* binary at that level. The MECE-by-LLM cuts produce a tree where each branch is *one possible feature* at that level.

When Ralph implements from the Dihairesis tree, refactoring the auth system later means swapping a leaf without touching the trunk. When Ralph implements from the MECE-LLM tree, refactoring means redesigning the whole thing.

### What Agora extracts

A decomposition algorithm that **forces the LLM to articulate the binary first**, then defend it as natural, before generating children.

```
For each parent AC needing decomposition:
  1. LLM proposes one binary distinction that divides the parent
  2. LLM justifies the binary as more fundamental than 2 alternative binaries
  3. If the justification holds, decompose into the two halves
  4. Recurse on each half, until atomic
  5. If no defensible binary exists, the AC stays undivided
```

**Better an undivided AC than a badly divided one.**

## Where in the loop

The two Plato methods operate at different points:

```
Alignment Loop:
  Phase −1   (Husserl)
  Phase 0    (auto-scan)
  Phase 1    (open intake)
  Phase 2    (iterative rounds)
                ↑
                Plato Divided Line tags maturity per claim
                Plato Divided Line gates termination
  Termination
                ↓
  ─────── HANDOFF ───────
                ↓
  Plato Dihairesis decomposes the seed's acceptance criteria
  into the AC tree
                ↓
Ralph Loop:
  Iterates over the dihairesis-decomposed tree
```

Plato is the **only philosopher who bridges both loops**. The Divided Line operates inside Alignment; Dihairesis operates at the boundary.

## What output it produces

### Maturity tagging output

Every claim in the seed carries a `maturity` field:

```yaml
four_causes:
  telos:
    statement: "Help me remember what I read so I can connect ideas later"
    maturity: noesis
    rejected_alternatives:
      - alternative: "build for sharing with others"
        why_rejected: |
          "Audience changes what I write — self-edits away the half-formed
          thoughts that are most valuable for connection-making."
      - alternative: "use existing tools (Notion, Obsidian)"
        why_rejected: |
          "Tested both. Friction in capture step kills the habit. I want
          a custom shape that fits my reading flow."
```

### Dihairesis decomposition output

The AC tree:

```yaml
ac_tree:
  - id: ac_001
    parent: null
    content: "Notes are durable, retrievable, and connectable across time"
    binary_split:
      principle: "persistence vs association"
      children:
        - id: ac_002
          content: "Notes persist with sufficient context to be re-understood"
          binary_split:
            principle: "internal context vs external context"
            ...
        - id: ac_003
          content: "Notes are associated to other notes by user-meaningful links"
          ...
```

The `binary_split.principle` field is the dihairesis justification — *why this cut at this level*.

## How it integrates with the others

- **Husserl** bracketed the frame; **Aristotle** identified the four causes; **Socrates** tested each claim. **Plato** measures whether each claim is mature enough to ship, and decomposes acceptance criteria into a tree Ralph can iterate on.
- **Aquinas** operates on Ralph's outputs. Plato's Dihairesis structures *what* Ralph operates on; Aquinas judges *whether the output succeeded*.

## How it can fail

### Divided Line failures

**F-Plato-DL-1 — Maturity tagged optimistically.**
LLM defaults to "this seems mature enough" rather than rigorous maturity check.
*Mitigation*: maturity tagging requires the rejected-alternative test for Noesis. No alternative articulated → not Noesis. Period.

**F-Plato-DL-2 — User overrides maturity floor without examination.**
The `--accept-low-telos-maturity` flag becomes a habit.
*Mitigation*: every override is recorded in the seed metadata and shown to Ralph as a "trust warning" at start. After 3 such overrides on a project, Agora suggests a Phase −1 re-bracket.

### Dihairesis failures

**F-Plato-DH-1 — Binary forced where ternary is natural.**
Some concepts genuinely divide into 3 (rock-paper-scissors), not 2.
*Mitigation*: allow 2–3-way splits if the LLM defends the n-ary as natural. 4+ defaults to "you should re-binarize."

**F-Plato-DH-2 — Decomposition stops too early.**
A node still has internal structure but the LLM declares it atomic.
*Mitigation*: atomicity has a checklist (single file, single concern, executable in one Claude session). Failing any → continue decomposing.

**F-Plato-DH-3 — Decomposition goes too deep.**
A simple AC gets shattered into a 4-level tree.
*Mitigation*: max depth 5 (Ouroboros's heuristic). Beyond that, prefer larger atomic leaves.

---

*Plato is the only philosopher in Agora who plays two distinct roles. The Divided Line measures whether you understand what you said you understand. Dihairesis cuts the work along its natural seams. Together they produce a seed that is both deep and well-shaped — the precondition for Ralph to succeed.*
