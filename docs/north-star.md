# North Star

> *Where Agora is going, why now, and what success looks like at each horizon.*

This document is **not** a roadmap of features. Roadmaps belong in issues and milestones. This document captures the **direction** that all roadmap decisions must serve.

---

## The North Star, in one sentence

> **Agora is the alignment layer between human intent and AI execution — and it grows stronger as AI grows stronger.**

If a future decision contradicts that sentence, the decision is wrong.

---

## The Strategic Position

### What we are

A **Human-AI Alignment (HAA) harness**. Not an IDE. Not a generic agent. Not a code generator. A *discipline* — encoded as a CLI tool — that closes the gap between what a human meant and what AI produces.

### What we bet on

> **Linux kernel → Linux distros.**
> As the kernel becomes more capable, every distro built on it inherits the gain. Distros do not compete with the kernel; they harness kernel improvements into shapes humans can actually use.

Agora bets the same way against frontier AI:
- When **opus 6** ships, Agora gets stronger.
- When **Claude Code** adds new tools, Agora gets stronger.
- When **a smarter agent appears**, Agora gets stronger.

We do not build features that compete with what frontier agents will do better next quarter. We build the **alignment layer that makes whatever they do *be what was wanted*.**

### Why this position is defensible

1. **Alignment is not improving with model scale.** Bigger models still get the wrong answer when the question was unclear. The bottleneck is upstream of generation.
2. **Taste is not commoditized.** Each user's inner sense of what is "right" is unique. A general-purpose alignment layer that personalizes per project is not something a foundation model can ship — it would be the wrong abstraction for them.
3. **The math compounds against the alternatives.** Tools that compete with AI lose 10% of their relevance per model release. Tools that compound with AI gain.

---

## Three-Month Horizon (2026-07)

### What success looks like

> *"I cannot imagine doing quality development without Agora anymore."* — Sang

Concrete operational checks:

- Sang uses Agora **daily** across at least 3 projects (e.g. dexter-player, screenflow, a new idea)
- Every active lazydevz project has its own `.agora/` folder with active alignment seed
- A new feature in dexter-player goes from "vague idea" → "alignment seed accepted" → "Ralph implementation passing all 5 gates" → "merged" with **measurably less rework** than the same feature would have taken without Agora
- When opus 4.7 → 4.8 (or 5.0) ships, Sang upgrades and Agora **automatically benefits** — no Agora-side changes required

### What failure would look like

- Sang opens his terminal and reaches for `claude` instead of `agora`. *We were not the first move.*
- Sang feels the alignment loop is slower than just talking to Claude directly. *The structure became overhead, not leverage.*
- Sang silently turns off a gate ("just skip the Disputatio this time"). *The gates were too rigid, not too valuable.*

### Stage targets

To reach the 3-month horizon, Stages 2–5 must close in roughly two weeks of focused work each. Stage 6+ (implementation) is where most of the timeline lives.

---

## One-Year Horizon (2027-04)

### What success looks like

- **Adoption inside lazydevz**: 2–3 senior devs in Sang's circle adopt Agora and report similar dependency
- **Commercial form decided and shipped**: open-source CLI + paid tier (TBD what the paid tier provides — see *Deferred decisions*)
- **HAA term begins to appear** in technical discourse outside lazydevz (blog posts, conference talks). We don't need to coin it — we need to use it consistently and let the work speak.
- **A second AI backend works**: when Codex CLI or a future Anthropic competitor reaches Claude-Code parity, Agora supports it. The augmentation thesis was real, not Anthropic-specific.

### What failure would look like

- Agora is still only-Sang. *The biased-product framing was a private aesthetic, not a transferable value.*
- Other senior devs try it and bounce off. *We mistook our own taste for the genre's taste.*
- Cursor or Devin ships an alignment-loop feature that closes the gap differently and is easier to adopt. *We were too philosophical, not pragmatic enough.*

### Deferred decisions for this horizon

1. **Commercial form**: open-source + paid tier? open-core? hosted variant? This decision blocks itself until 3-month adoption data exists. Decide in 2026-Q3.
2. **Public release**: Stage 5 close = repo goes public. (Codified in ADR-0002.)
3. **Foundation model abstraction**: when to add adapters beyond Claude. Driven by user demand, not preemptively.

---

## Three-Year Horizon (2029-04)

### What success looks like

- **HAA becomes a recognized discipline term**, in the lineage of HCI. Universities teach it. Enterprises hire for it. Foundation model providers list "HAA-friendly" as a feature.
- **Agora is the reference implementation** of HAA. Other tools cite us the way modern web frameworks cite React's hook model.
- **Agora makes lazydevz the company that ships**. The thing that distinguishes lazydevz products (dexter-player, screenflow, future ones) from competitors is not what they do — it is the speed × quality compound that comes from using Agora to build them.
- **Every model release feels like a tailwind**, not a threat. opus 6, opus 7, gpt-6, gemini-3 — each one strengthens our position.

### What failure would look like

- Agora is a small niche tool used by Sang and a dozen others. *Honest, but not the bet we made.*
- HAA gets coined by someone else and we are seen as a derivative implementation. *We undersold the discipline framing.*
- Foundation model providers absorb alignment into their core products and Agora becomes redundant. *We were a feature, not a product.*

The third failure is the most concerning and the one we must architect against. Mitigation: Agora's value must increasingly come from things foundation models structurally **cannot** do — per-user taste capture, philosophical method composition, project-scoped state — not from interview UX that any chat model could replicate.

---

## What "growing with AI" Concretely Means

A claim is hollow without operational definition. What does it mean for Agora to *grow with* AI?

| AI improves at | Agora's response | How Agora benefits |
|----------------|------------------|---------------------|
| Code generation quality | None — Ralph delegates more | Less Ralph iteration needed; user satisfaction up |
| Long-context reasoning | None — feed bigger seeds | Alignment Loop can carry richer history |
| Tool use | Add new tools to Claude Code mode | Agora orchestrates more capable agents |
| Multi-modal (image, video) | Add input/output adapters | Alignment can include design references |
| Reasoning quality | None — Disputatio gets sharper | Quality gates become more discriminating |
| Speed / latency | None | User waits less per round |
| Cost per token | None | Same alignment, lower bills |

In every column, Agora's response is either *nothing* or *trivial integration*. We never **fight** an AI improvement. We always **inherit** it.

---

## Living Structure

This document is itself **temporal**. Per Sang's site convention (씨앗 → 새싹 → 묘목 → 꽃 → 열매), this north-star is currently **새싹 (sapling)**: the direction is set but the branches are still soft.

Re-read this document at the start of every Stage. If it no longer feels true, we revise it explicitly via ADR. If we are not living up to it, we course-correct. **The north star is not a constraint — it is a check.**

---

## Decisions Deliberately Not Made Here

- Specific feature lists (lives in issues / milestones)
- Exact pricing or paid-tier shape (deferred to 2026-Q3)
- Specific timeline for going public (codified in ADR-0002 and ADR-0004)
- Whether to support languages beyond TypeScript for Agora itself (ADR-0001 settled)
- Whether to add a 6th philosopher (deferred until concrete need)

---

*Sang Rhee, lazydevz, Inc. — 2026-04-27*
*To be re-read at every Stage close.*
