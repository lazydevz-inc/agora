<p align="center">
  <br/>
  <strong>A G O R A</strong>
  <br/>
  <sub>The alignment layer between human intent and AI execution.</sub>
  <br/><br/>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="#status"><img src="https://img.shields.io/badge/status-alpha-orange" alt="Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-22+-blue" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript"></a>
  <a href="#"><img src="https://img.shields.io/badge/runs%20inside-Claude%20Code-8A2BE2" alt="Claude Code"></a>
</p>

---

> **Your AI agent doesn't fail at writing code. It fails at understanding what you meant.**
>
> Agora is the missing layer that sits between you and your AI coding agent. Before
> a single line is written, five ancient philosophers interrogate your intent until
> it's unambiguous. Then a verification-gated loop builds it — checking at *every
> iteration* that the output still matches what you actually wanted.

---

## The problem every AI-coding developer knows

You ask for a feature. The agent confidently builds *something*. It compiles, it
runs — and it's subtly, frustratingly **not what you meant.** You correct it. It
drifts somewhere else. Five iterations later you're further from your intent than
when you started.

This isn't a model-quality problem. It's an **alignment** problem. And it compounds:

```
If each iteration drifts just 10% from intent:   0.9¹⁰ ≈ 0.35

After 10 iterations, the result resembles your intent by ~35%.
```

It does not matter how powerful the underlying model is. **Alignment is the
leverage point, not raw generation power.** Agora bets its entire architecture on
closing the gap *before* the loop starts — and policing it *during* every iteration.

---

## Why philosophy (and not more prompts)

Everyone tries to close the intent gap with better prompts, plans, or templates.
Agora closes it with the **most refined methods of inquiry humanity has ever
produced** — operationalized as code. Each philosopher is a real module that drives
a real decision at a specific point in the workflow:

| Philosopher  | Era         | What they do in Agora                                          |
|--------------|-------------|----------------------------------------------------------------|
| **Husserl**  | 1859–1938   | *Epoché* — strips your hidden assumptions before any question  |
| **Socrates** | 470–399 BCE | *Elenchus* — probes your answers with cases to expose gaps     |
| **Aristotle**| 384–322 BCE | *Four Causes* — why (telos), what (form), with-what (material), by-whom (efficient) |
| **Plato**    | 428–348 BCE | *Divided Line* (is this answer mature enough?) + *Dihairesis* (split the goal into atomic, verifiable pieces) |
| **Aquinas**  | 1225–1274   | *Disputatio* — per-objection structured ruling, not crude majority voting |

---

## How it works: two loops

Agora runs two loops back to back. The first makes sure you're building the **right
thing**. The second makes sure you build it **right** — and that it **stays** right.

### Loop 1 — Alignment (Human-AI Alignment, "HAA")

> Goal: drive the gap between *what you said* and *what you meant* to ~0% **before
> any code is written.**

```
You: "I want a settings page."          ← vague is fine; that's the point
  │
  ├─ Husserl (optional)   strip assumptions: "a *page*, or settings *persistence*?"
  ├─ Auto-scan            detect brownfield/greenfield, ingest existing docs
  ├─ Aristotle 4 Causes   WHY does this exist (telos)?  ← the primary axis
  │                       WHAT is its essential structure (form)?
  │                       WITH WHAT stack (material)?  BY WHOM/HOW (efficient)?
  ├─ Socrates             probe each answer with concrete cases to surface gaps
  ├─ Plato (maturity)     is each answer well-thought-out? too shallow → loop back
  └─ Plato (Dihairesis)   split the goal into small, atomic, verifiable pieces
  │
  ▼
🔒 Seed locked  (.agora/seed.json) — an unambiguous, machine-readable spec
```

### Loop 2 — Ralph (verification-gated implementation)

> Goal: satisfy the Seed **and** stay aligned at every step.

```
Pick the next atomic piece
  │
  ▼
Claude Code implements it      ← the host AI writes the code; Agora orchestrates
  │
  ▼
Run the gates:
  Gate 1  Deterministic   — does it typecheck / lint / test / build?
  Gate 5  Alignment       — does the output still match the original telos?  ◀ inviolable
  Gate 3+4 Quality        — Aquinas Disputatio: "is this actually good?", ruled point-by-point
  │
  ├─ all pass → mark piece done → next piece
  └─ fail     → fix + retry, with explicit drift correction
  │
  ▼
Repeat until every piece is done and every gate passes.
```

**The key idea:** the Alignment loop refuses to terminate until intent is settled.
The Ralph loop refuses to ship until *every* gate passes — including the alignment
gate, which is the one that can never be waived.

---

## Runs inside Claude Code — zero extra billing

Agora is designed to run **as a layer inside Claude Code.** It contributes the
*method* (the philosophers) and the *gates* (verification); Claude Code contributes
the *intelligence*.

Crucially, **Agora itself makes no LLM calls.** When reasoning is needed, it's your
existing Claude Code session doing the thinking — which means:

- ✅ Your **interactive Claude subscription** is used (no separate API bill)
- ✅ No `ANTHROPIC_API_KEY`, no metered Agent-SDK credit pool
- ✅ Agora stays a thin, fast alignment/verification layer — anti-fragile to model upgrades

> **The augmentation bet:** *Agora is to AI coding agents what Linux distros are to
> the kernel.* When the next model ships, every workflow built on Agora inherits the
> gain. We bet **on** AI progress, not against it.

---

## Status

Agora is **alpha** and under active development. We believe an honest status beats a
polished lie — here's exactly what works today.

| Capability | State |
|---|---|
| Alignment loop: Husserl → Aristotle (4 causes) → Plato (maturity + Dihairesis) | ✅ working |
| Acceptance-criteria capture + Seed lock (`seed.json`) | ✅ working |
| Ralph loop: leaf selection + Gate 1 (deterministic) | ✅ working |
| Gate 5 (alignment drift score) | ✅ working |
| Gate 3+4 (Aquinas Disputatio, per-objection ruling) | ✅ working |
| Audit log + `agora trace` viewer (`--follow` tail mode) | ✅ working |
| Status dashboard with drift trend + sparkline | ✅ working |
| Non-interactive / agent-driven mode (JSON, no TTY prompts) | ✅ working |
| **Socrates** (Elenchus case-probing) | 🚧 planned |
| **Gate 2** (functional QA via Playwright) | 🚧 planned |
| **In-Claude-Code plugin (MCP) mode** | 🚧 in progress — today Agora runs as a standalone CLI that drives Claude Code as a subprocess |
| Published to npm | 🚧 not yet |

> **Note on architecture:** today Agora invokes Claude as a subprocess. We are
> migrating to an in-Claude-Code plugin model (above) so that all reasoning happens
> inside your interactive session. This is the project's near-term priority.

---

## Quick start

> Requires Node 22+ and [Claude Code](https://claude.com/claude-code) authenticated
> with a Claude subscription.

```bash
git clone https://github.com/lazydevz-inc/agora.git
cd agora
pnpm install
pnpm build

# Start a session in any project folder:
pnpm dev new my-feature      # auto-detects brownfield/greenfield
pnpm dev resume              # Agora tells you the next step, every time
```

You mostly just run `agora` and follow what it suggests next — recommended options
for speed, free input always available, and every question shows *why it's being
asked.* No flags to memorize.

---

## What makes Agora different

- **One command, guided flow.** You rarely think about subcommands — `agora` tells
  you what to do next at every step.
- **Biased over un-biased.** We pick the best option so you don't have to.
- **Per-folder isolated.** Cross-folder context bleed is forbidden; same-folder
  accumulation is welcomed.
- **Auto-detect everything detectable.** We never ask what we can already know.
- **Telos-first.** Purpose (the *final cause*) is the primary axis of every
  evaluation — not features, not file counts.
- **Built by the method it teaches** — see [ADR-0003](docs/architecture/decisions/0003-meta-dogfooding.md).

---

## Inspirations & credits

Agora is inspired by [Ouroboros](https://github.com/Q00/ouroboros) (MIT, © 2025 Q00)
and selectively borrows *concepts* (not code). Where Agora differs: one guided CLI
instead of ~15 subcommands, per-project configuration as the default, five focused
philosopher modules instead of 21 generic agents, telos as the primary axis of
evaluation, and an in-Claude-Code architecture instead of an API-billed SDK.

See [`CREDITS.md`](CREDITS.md) for full attribution and [`MANIFESTO.md`](MANIFESTO.md)
for the philosophy behind the philosophy.

---

## License

MIT. See [`LICENSE`](LICENSE). Original Q00 copyright preserved per MIT terms.

---

<p align="center">
  <sub>Built by <a href="https://sangrhee.com">Sang Rhee</a> · lazydevz, Inc.</sub>
</p>
