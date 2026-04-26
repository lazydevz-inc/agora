<p align="center">
  <br/>
  <strong>A G O R A</strong>
  <br/>
  <sub>The marketplace where ancient philosophers harness modern agents.</sub>
  <br/><br/>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="#status"><img src="https://img.shields.io/badge/status-Stage%201%20closing-orange" alt="Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-22+-blue" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript"></a>
</p>

---

> **One command. Five philosophers. Two loops. Zero ceremony.**
>
> Agora sits between you and your AI coding agent. Before any code is written,
> five ancient philosophers question, classify, and evaluate intent. Then a
> verification-gated loop drives implementation until it actually meets the
> spec — and an alignment check at every iteration ensures the output stays
> what was wanted.

---

## Why Agora exists

Modern AI coding agents are powerful. They fail at the same place every time:
**the gap between what you said and what you meant.**

> *"AI surpassed us in execution. What remains is taste. Philosophy makes taste articulate."* — MANIFESTO.md

Existing tools try to close the intent–output gap with prompts, plans, or specifications. Agora closes it with **the most refined methods of inquiry humanity ever produced** — operationalized as code.

| Philosopher  | Era         | What they bring                                    |
|--------------|-------------|----------------------------------------------------|
| **Husserl**  | 1859–1938   | Epoché — bracket all assumptions before asking anything |
| **Socrates** | 470–399 BCE | Elenchus — questions that expose hidden assumptions |
| **Aristotle**| 384–322 BCE | Four Causes — material, formal, efficient, **final (telos)** |
| **Plato**    | 428–348 BCE | Divided Line (knowledge maturity), Dihairesis (natural division) |
| **Aquinas**  | 1225–1274   | Disputatio — structured deliberation that beats simple voting |

These aren't decorative. Each is a 1급 시민 module driving real decisions. Each operates at a specific point in one of the two loops.

---

## The Math That Makes Alignment Non-Negotiable

If each implementation iteration drifts the actual output 10% from intent:

```
0.9^10 ≈ 0.3487
```

After 10 iterations, the result resembles the intent by **34.87%**.

It does not matter how powerful the underlying AI is. **Alignment is the leverage point, not generation power.** Agora bets the entire architecture on this.

---

## The Two Loops

Agora's runtime alternates between two loops, each with a distinct purpose:

```
┌──────────────────────────────────────────────────────────────────┐
│  Alignment Loop (Human-AI Alignment, "HAA")                      │
│  Goal: drive expected ↔ actual gap to ~0% before any iteration   │
│                                                                  │
│  Phase −1  Husserl Epoché — bracket assumed frames (optional)    │
│  Phase  0  Auto-scan — brownfield detect, ingest MD context      │
│  Phase  1  Open intake — receive all context the user can give   │
│  Phase  2  Iterative rounds — Aristotle structures, Socrates     │
│            tests, Plato measures maturity                        │
│  Termination — user assent + structural validation + (optional)  │
│                preview if quality threshold is met               │
└──────────────────────────────────────────────────────────────────┘
                           ↓ (locked seed)
┌──────────────────────────────────────────────────────────────────┐
│  Ralph Loop                                                      │
│  Goal: drive implementation to satisfy the seed AND stay aligned │
│                                                                  │
│  Each iteration must pass FIVE gates:                            │
│    Gate 0  Pre-flight Infra Check  (CLIs auth, deps reachable)   │
│    Gate 1  Deterministic           (lint, typecheck, build, test)│
│    Gate 2  Functional QA           (Playwright CLI tests green)  │
│    Gate 3  UI/UX Quality           (Aquinas Disputatio)          │
│    Gate 4  Technical Quality       (Aquinas Disputatio)          │
│    Gate 5  Alignment Check         (output ↔ seed telos)         │
│                                                                  │
│  Loop continues until all gates pass AND user is satisfied.      │
└──────────────────────────────────────────────────────────────────┘
```

The Alignment Loop refuses to terminate early; it keeps looping until intent is settled. The Ralph Loop refuses to ship until **every** gate passes — including alignment, which is the inviolable one. Together they implement the full Agora promise.

---

## The Augmentation Bet

> **Agora is to AI coding agents what Linux distros are to the Linux kernel.**

As the kernel becomes more capable, every distro built on it inherits the gain. Distros do not compete with the kernel; they harness kernel improvements into shapes humans can use.

When opus 6 ships, when Claude Code adds new tools, when a smarter agent appears — Agora absorbs the gain. **Anti-fragile to AI progress.**

We bet *on* AI improvement, not against it. We do not build features that compete with what frontier agents will do better next quarter. We build the alignment layer that makes whatever they do *be what was wanted*.

---

## Status

**Stage 1 closing.** Foundation, philosophy, and direction documents are landed. CLI runs (placeholder). Real product implementation begins at Stage 6.

See `docs/architecture/decisions/0004-development-stages.md` for the full gate plan.

This is a **biased product**. We choose the best option so you don't have to. Per-project configuration is the default. Brownfield/greenfield is auto-detected. The CLI tells you what to do next.

---

## The Promise (Once Stage 6 Lands)

```bash
$ agora
Welcome to Agora. Scanning current folder...
✓ Detected: brownfield Node.js project
✓ Found: README.md, CLAUDE.md (ingested as context)
✓ Claude Code: authenticated (Max plan)

What would you like to work on?
> I want to add a settings page that persists per-user.

[Aristotle · Telos]
Why does this exist? What good does it serve?
ⓘ  Fills: seed.telos.statement (currently empty)
  ◯  Users want to customize defaults (preferences)
  ◯  Users want privacy controls (visibility)
  ◯  Users want operational toggles (feature flags)
  ◉  Other (free input below)
> _
```

That's it. No flags to memorize. Recommended options for speed; free input always available; every question shows *why it's being asked*.

---

## Design Principles

- **One command, not fifteen.** `agora` is the entire surface area (≤ 7 subcommands cap).
- **Biased over un-biased.** We choose the best option so you don't have to.
- **Per-project config first.** Global settings are a fallback, not the default.
- **Per-folder isolated.** Cross-folder context bleed is forbidden; same-folder accumulation is welcomed.
- **Auto-detect everything detectable.** We never ask what we can already know.
- **Recommended options + free input.** Reduce typing burden without limiting expression.
- **Internal flexibility, external rigidity.** SOLID inside, opinionated outside.
- **Built by the method it teaches** — see [ADR-0003](docs/architecture/decisions/0003-meta-dogfooding.md).

---

## Authentication: Uses Your Existing Subscription

Agora uses your existing Claude Code authentication via `claude --print` subprocess — meaning **Claude Max subscription is honored**, not double-billed.

If you don't have Claude Code installed, Agora falls back to the Claude Agent SDK with `ANTHROPIC_API_KEY`. See [ADR-0005](docs/architecture/decisions/0005-claude-integration-via-subprocess.md) for the full rationale.

---

## Inspirations & Credits

Agora is inspired by [Ouroboros](https://github.com/Q00/ouroboros) (MIT, © 2025 Q00) and selectively borrows its concepts. Where Agora differs sharply: one CLI command instead of ~15, per-project configuration as the default, five focused philosopher modules instead of 21 generic agents, telos as the primary axis of evaluation, claude subprocess instead of API-billed SDK.

See [`CREDITS.md`](CREDITS.md) for full attribution.

---

## License

MIT. See [`LICENSE`](LICENSE). Original Q00 copyright preserved per MIT terms.

---

<p align="center">
  <sub>Built by <a href="https://sangrhee.com">Sang Rhee</a> · lazydevz, Inc.</sub>
</p>
