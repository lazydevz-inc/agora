<p align="center">
  <br/>
  <strong>A G O R A</strong>
  <br/>
  <sub>The alignment layer between human intent and AI execution.</sub>
  <br/><br/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lazydevz/agora"><img src="https://img.shields.io/npm/v/%40lazydevz%2Fagora" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="#status"><img src="https://img.shields.io/badge/status-alpha-orange" alt="Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-22+-blue" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript"></a>
  <a href="#"><img src="https://img.shields.io/badge/runs%20inside-Claude%20Code-8A2BE2" alt="Claude Code"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lazydevz-inc/agora/main/docs/assets/hero.png" alt="Five philosophers — Husserl, Socrates, Aristotle, Plato, Aquinas — gathered around a developer, inscribing telos on a glowing scroll" width="880">
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
A locked **Seed** is the handoff between them.

```
┌──────────────────────────────────────────────────────────────────┐
│  Alignment Loop  (Human-AI Alignment, "HAA")                       │
│  Goal: drive expected ↔ actual gap to ~0% BEFORE any code          │
│                                                                    │
│  Phase −1  Husserl Epoché   — bracket assumed frames (optional)    │
│  Phase  0  Auto-scan        — brownfield detect, ingest MD context │
│  Phase  1  Open intake      — receive all the context you can give │
│  Phase  2  Iterative rounds — Aristotle structures (4 causes),     │
│            Socrates tests, Plato measures maturity                 │
│  Terminate — user assent + structural validation + Plato Dihairesis│
│              splits the goal into atomic, verifiable pieces        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼  🔒 locked Seed (.agora/seed.json)
                           │
┌──────────────────────────────────────────────────────────────────┐
│  Ralph Loop  (verification-gated implementation)                   │
│  Goal: satisfy the Seed AND stay aligned, every iteration          │
│                                                                    │
│  Each iteration must pass the gates:                               │
│    Gate 0  Pre-flight infra   — CLIs authed, deps reachable        │
│    Gate 1  Deterministic      — lint, typecheck, build, test       │
│    Gate 2  Functional QA      — your project's Playwright tests    │
│    Gate 3  UI/UX quality      — Aquinas Disputatio                 │
│    Gate 4  Technical quality  — Aquinas Disputatio                 │
│    Gate 5  Alignment check    — output ↔ Seed telos   ◀ inviolable │
│                                                                    │
│  Loop continues until all gates pass AND you are satisfied.        │
└──────────────────────────────────────────────────────────────────┘
```

> The Alignment loop refuses to terminate until intent is settled. The Ralph loop
> refuses to ship until *every* gate passes — including the alignment gate, the one
> that can never be waived.

### What it feels like in practice

```
You: "I want a settings page."                    ← vague is fine; that's the point

[Husserl]   "A *page* — or do you actually want settings to *persist* per user?"
[Aristotle] "Why does this exist?"  → telos: users want to customize defaults
            "What's its essential structure?"  → form
            "Which stack?"  → material        "Who/when/how?"  → efficient
[Plato]     "That telos is still shallow — what *good* does customization serve?"
            → loops back until each answer is mature enough
[Plato]     splits it into atomic pieces:  ac_001  ac_002  ac_003 …

🔒 Seed locked.  Now Ralph takes over:

  ▸ implement ac_001  →  Gate 1 ✓  Gate 5 ✓ (drift 0.04)  Gate 3+4 ✓  →  done
  ▸ implement ac_002  →  Gate 1 ✓  Gate 5 ✗ (drift 0.41!) →  fix + retry
  ▸ …until every piece passes every gate.
```

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
| Socrates (Elenchus case-probing) — `agora socrates`, auto-routed by `agora round` | ✅ working |
| Gate 2 (functional QA via Playwright) — detection-gated, shells out to your project's Playwright | ✅ working |
| **In-Claude-Code plugin (MCP) mode** | ✅ working end-to-end (ADR-0010 Slices A-E): eight tools — session bootstrap (`agora_new`, `agora_intake`), read-only (status/doctor/resume/trace), **plus** stepped `agora_align_step` + `agora_ralph_step` that drive the alignment + Ralph loops via host-supplied reasoning — Agora makes zero LLM calls in this path |
| Published to npm | ✅ [`@lazydevz/agora`](https://www.npmjs.com/package/@lazydevz/agora) |

> **Note on architecture:** the in-Claude-Code plugin model (above) is now the
> primary path — all reasoning happens inside your interactive Claude Code session
> via the stepped MCP tools. Standalone CLI (subprocess) mode remains supported
> for non-plugin users but draws Anthropic's metered Agent-SDK credit pool from
> 2026-06-15 (see ADR-0009 / ADR-0010).

---

## Quick start

> Requires [Claude Code](https://claude.com/claude-code) (authenticated with a
> Claude subscription) and Node 22+.

Agora installs as a set of `agora_*` tools your Claude Code session drives —
including `agora_new`, so the whole flow (start → align → build) lives inside
Claude Code. A standalone `agora` CLI is also there if you prefer the terminal;
one install gives you both.

### Install — recommended (npm)

```bash
npm install -g @lazydevz/agora                 # installs the `agora` CLI + MCP server
claude mcp add --scope user agora -- agora mcp # register the tools in every project
```

Prefer a one-click **plugin**? It registers all eight tools, so the entire flow —
starting a session included — happens inside Claude Code:

```text
/plugin marketplace add lazydevz-inc/agora
/plugin install agora
```

### Install — from source (contributors / latest `main`)

```bash
git clone https://github.com/lazydevz-inc/agora.git
cd agora && pnpm install && pnpm build && npm link   # `npm link` puts `agora` on your PATH
claude mcp add --scope user agora -- agora mcp
```

Open a fresh Claude Code session and the eight tools appear:
`agora_status` · `agora_doctor` · `agora_resume` · `agora_new` · `agora_intake` ·
`agora_trace` · `agora_align_step` · `agora_ralph_step`.

### Use it

In your project, just talk to Claude Code:

> *"Use agora to align on a settings page, then build it."*

Claude Code calls `agora_new` to start the session, captures your raw intent via
`agora_intake`, runs the philosophers' interview via `agora_align_step`, locks a
**Seed**, then builds it through the gates via `agora_ralph_step` — re-checking
that the output still matches your intent at every iteration. No flags to
memorize; every question shows *why* it's asked. *(Prefer the terminal? `agora new my-feature` does the same first step.)*

→ **Full walkthrough with a worked example:** [`docs/getting-started.md`](docs/getting-started.md)

<details>
<summary>Or drive it entirely from the terminal (standalone CLI)</summary>

```bash
agora new my-feature
agora resume        # Agora tells you the next step, every time
```

⚠️ In standalone mode Agora calls `claude` itself, which from 2026-06-15 draws
Anthropic's metered Agent-SDK credit pool ($20–$200/mo). The in-Claude-Code
install above avoids this. Suppress the per-run reminder with
`AGORA_NO_COST_WARNING=1`.
</details>

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

Agora was partly inspired by [Ouroboros](https://github.com/Q00/ouroboros)'s
intuition that AI coding benefits from an intent-refinement phase before
implementation. Agora is an independent TypeScript implementation with its own
architecture, philosopher modules, Claude Code MCP mode, and verification gates.

See [`CREDITS.md`](CREDITS.md) for full attribution and [`MANIFESTO.md`](MANIFESTO.md)
for the philosophy behind the philosophy.

---

## License

MIT. See [`LICENSE`](LICENSE).

---

<p align="center">
  <sub>Built by <a href="https://sangrhee.com">Sang Rhee</a> · lazydevz, Inc.</sub>
</p>
