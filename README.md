<p align="center">
  <br/>
  <strong>A G O R A</strong>
  <br/>
  <sub>The marketplace where ancient philosophers harness modern agents.</sub>
  <br/><br/>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="#status"><img src="https://img.shields.io/badge/status-Stage%200-orange" alt="Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-22+-blue" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript"></a>
</p>

---

> **One command. Five philosophers. Two loops. Zero ceremony.**
>
> Agora sits between you and your AI coding agent. Before any code is written,
> five ancient philosophers question, classify, and evaluate intent. Then a
> verification-gated loop drives implementation until it actually meets the spec.

---

## Why Agora exists

Modern AI coding agents are powerful. They fail at the same place every time:
**the gap between what you said and what you meant.**

Existing tools try to close this gap with prompts, plans, or specifications. Agora closes it with **the most refined methods of inquiry humanity ever produced** — operationalized as code.

| Philosopher  | Era         | What they bring                                    |
|--------------|-------------|----------------------------------------------------|
| **Husserl**  | 1859–1938   | Epoché — bracket all assumptions before asking anything |
| **Socrates** | 470–399 BCE | Elenchus — questions that expose hidden assumptions |
| **Aristotle**| 384–322 BCE | Four Causes — material, formal, efficient, **final (telos)** |
| **Plato**    | 428–348 BCE | Divided Line (knowledge maturity), Dihairesis (natural division) |
| **Aquinas**  | 1225–1274   | Disputatio — structured deliberation that beats simple voting |

These aren't decorative. Each is a 1급 시민 module driving real decisions.

---

## The Two Loops

Agora's runtime alternates between two loops, each with a distinct purpose:

```
┌──────────────────────────────────────────────────────────────────┐
│  Interview Loop                                                  │
│  Goal: total alignment between human intent and AI's spec        │
│                                                                  │
│  1. Auto-scan folder (brownfield detection, MD file ingestion)   │
│  2. Open question — receive all the context the user can give    │
│  3. Iterative rounds with the five philosophers                  │
│  4. Recommended-options UX (reduce typing burden)                │
│  5. Exit when telos reaches Noesis-level maturity                │
└──────────────────────────────────────────────────────────────────┘
                           ↓ (validated seed)
┌──────────────────────────────────────────────────────────────────┐
│  Ralph Loop                                                      │
│  Goal: drive implementation to satisfy the seed, not just exit   │
│                                                                  │
│  Each iteration must pass every gate:                            │
│    Deterministic   — lint, typecheck, build, tests               │
│    Functional QA   — Playwright CLI tests run green              │
│    UI/UX Quality   — expert persona review                       │
│    Technical Quality — Aquinas Disputatio (per-objection ruling) │
│                                                                  │
│  Loop continues until all gates pass AND user is satisfied.      │
└──────────────────────────────────────────────────────────────────┘
```

The Interview Loop refuses to terminate early; it keeps looping until intent is settled. The Ralph Loop refuses to ship until verification is settled. Together they implement the full Agora promise.

---

## Status

**Stage 0 of 6.** TypeScript skeleton stands. CLI runs (placeholder). Real product lands stage by stage. See `docs/architecture/decisions/0004-development-stages.md` for the gate plan.

This is a **biased product**. We choose the best option so you don't have to. Per-project configuration is the default. Brownfield/greenfield is auto-detected. The CLI tells you what to do next.

---

## The Promise (Once Stage 6 Lands)

```bash
$ agora
Welcome to Agora. Scanning current folder...
✓ Detected: brownfield Node.js project
✓ Found: README.md, CLAUDE.md (ingested as context)

What would you like to work on?
> I want to add a settings page that persists per-user.

[Aristotle] One question first — what is this for?
  1. Users want to customize defaults (preferences)
  2. Users want privacy controls (visibility)
  3. Users want operational toggles (feature flags)
  4. Other / I'll type ▸
```

That's it. No flags to memorize. Recommended options for speed; free input always available.

---

## Design Principles

- **One command, not fifteen.** `agora` is the entire surface area.
- **Biased over un-biased.** We choose the best option so you don't have to.
- **Per-project config first.** Global settings are a fallback, not the default.
- **Auto-detect everything detectable.** We never ask what we can already know.
- **Recommended options + free input.** Reduce typing burden without limiting expression.
- **Internal flexibility, external rigidity.** SOLID inside, opinionated outside.
- **Built by the method it teaches** — see [ADR-0003](docs/architecture/decisions/0003-meta-dogfooding.md).

---

## Inspirations & Credits

Agora is inspired by [Ouroboros](https://github.com/Q00/ouroboros) (MIT, © 2025 Q00) and selectively borrows its concepts. Where Agora differs sharply: one CLI command instead of ~15, per-project configuration as the default, five focused philosopher modules instead of 21 generic agents, telos as the primary axis of evaluation.

See [`CREDITS.md`](CREDITS.md) for full attribution.

---

## License

MIT. See [`LICENSE`](LICENSE). Original Q00 copyright preserved per MIT terms.

---

<p align="center">
  <sub>Built by <a href="https://sangrhee.com">Sang Rhee</a> · lazydevz, Inc.</sub>
</p>
