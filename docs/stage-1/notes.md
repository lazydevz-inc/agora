# Stage 1 — Live Interview Notes

> Compressed essence of the live interview between Sang and Claude on 2026-04-26
> through 2026-04-27. These notes are the raw material from which MANIFESTO,
> north-star, and the five philosophy docs are written.
>
> Originals live in the conversation transcript; this is the distillation.

---

## The Strategic Foundation

### The Telos — restated

Agora exists to close the gap between **expected output** and **actual output** to ~0% by way of a structured Human-AI Alignment loop, **before** Ralph implementation begins.

**Why this gap is the right thing to fix** — the math:

> If each Ralph iteration drifts the output 10% from intent, after 10 iterations
> the actual output resembles the intended output by only 0.9^10 ≈ 34.87%.
> However powerful the underlying AI model becomes, output that diverges from
> intent is *worthless*. Therefore the leverage point is alignment, not raw
> generation power.

This is not a polish argument. It is a **mathematical compounding argument** that justifies why alignment is the entire game in the AI age.

### Why philosophy — the deeper "why"

When AI surpasses human intellectual capability in execution, what remains for humans is **taste** — the inner sense of what is wanted, what is right, what is *theirs*. The discipline that has spent 2,500 years developing the techniques for drawing taste out of the inner self into articulable form is **philosophy** — particularly the methods refined in ancient Greece.

Therefore: **Agora uses philosophy not because philosophy sounds intellectual, but because philosophy is the only proven technology for articulating human taste at the level of fidelity AI now demands.**

This is the manifesto's thesis sentence.

### The augmentation thesis

> *"이들을 증강 시켜줄 수 있는 제품이 되면 좋겠어... 그들과 경쟁하다가 대체되는
> 그런 존재가 아니라 이들이 좋아지면 우리거까지 같이 좋아지는."*

Pattern: **Linux kernel → Linux distros**. As the kernel improves, all distros built on top improve. The distro doesn't compete with the kernel; it harnesses kernel improvements into shapes humans can use.

Agora is to AI coding agents (Claude Code, Cursor, future opus 6+) what Linux distros are to the Linux kernel: a layer that gets stronger as the underlying primitive gets stronger. **Anti-fragile to AI progress.**

This means Agora should bet *on* AI improvement, not *against* it.

---

## The Two-Loop Architecture

### Naming

- **Interview Loop** is renamed → **Alignment Loop** (Interview is the means, Alignment is the end)
- Field-level term proposal: **HAA (Human-AI Alignment)** — analogous to HCI

### Alignment Loop structure

```
Phase −1 (optional): Husserl Epoché
Phase 0 (auto):      folder scan, brownfield detect, MD ingestion
Phase 1 (open):      "what would you like to work on?" — dump all context
Phase 2 (iterative): philosopher-led rounds with quoted-prior-answer continuity
Termination gate:    Y2 (user assent + structural validation)
                     + Y3 (preview shown if quality threshold met)
Output:              X3 — structured seed (SoT) + auto-generated prose summary
```

### Ralph Loop structure

Each iteration must pass **five gates**:

1. **Deterministic** — lint, typecheck, build, test
2. **Functional QA** — Playwright CLI tests (LLM-generated, deterministically run)
3. **UI/UX expert review** — taste/quality judgment
4. **Technical Quality** — Aquinas Disputatio (per-objection ruling)
5. **Alignment Check** — output's fit to the seed (the most important gate)

If gate 5 fails:
- **Z1**: self-correct in next iteration
- **Z2**: after N attempts of Z1 failure, pause Ralph, re-enter mini Alignment Loop

Z3 (ignore alignment, push forward) is **forbidden** — Ralph definitionally includes alignment-verification as part of its 작업→검증→개선 cycle.

---

## The Five Philosophers — Synthesis Table

| # | Philosopher | Method extracted | When in workflow | Output |
|---|-------------|------------------|------------------|--------|
| 1 | Husserl | Epoché — bracket assumptions | Alignment Loop Phase −1 | DefendedFrame (frame examined explicitly) |
| 2 | Socrates | Elenchus — question→case→aporia | Alignment Loop Phase 2 (conductor) | Refined claims surviving case-probing |
| 3 | Aristotle | Four Causes (Telos primary) | Alignment Loop Phase 1→2 (structuring) | Four-cause structured seed |
| 4-a | Plato | Divided Line (Eikasia→Noesis) | Alignment Loop termination gate | Maturity-tagged claims; Telos must reach Noesis |
| 4-b | Plato | Dihairesis (natural division) | Alignment → Ralph handoff | AC tree decomposed at natural joints |
| 5 | Aquinas | Disputatio (Videtur→Sed contra→Respondeo→Ad singula) | Ralph Loop gates 3 & 4 | Per-objection verdict map |

Distribution: 4 philosophers in Alignment, Plato bridges the boundary, Aquinas in Ralph. The asymmetry (4 vs 1) is intentional — most of the leverage is in alignment.

**6th philosopher candidacy**: deferred. Will revisit after first real use exposes a concrete gap. Multiple candidates (Popper, Confucius, Lao Tzu, Wittgenstein) are noted but no addition until justified.

---

## Anti-goals (the seven Agora refuses to be)

1. **P1** — Not for non-developers. Senior dev / CTO / Technical Product Owner is the persona ceiling. UX must be approachable for that level (not guru-obscure).
2. **P2** — Not a general agent platform. Constrained to spec-first → implementation flow.
3. **P3** — Not an IDE. CLI primary; TUI for standalone runs; GUI later. Editing happens elsewhere.
4. **P4** — Not stop-at-spec. Ralph implementation is part of the responsibility. Internally may delegate to Claude Code / opus 4.7+.
5. **P5** — Not a customizable framework. Best defaults are forced at the system level (global = biased). Per-folder *use* is independent.
6. **P6** — Not a cloud SaaS. Local-first. Data stays on the user's machine.
7. **P7** — Not 6+ philosophers (current commit). Re-openable when a concrete need emerges.

Per-folder isolation rule (refinement of P5): cross-folder context bleed is **forbidden**. Within-folder context accumulation across multiple Agora invocations is **welcomed**.

---

## The User Identity

- **Sang Rhee** (lazydevz, Inc.) — primary user, sole user during Stage 1–5
- Senior developer / former Linux kernel contributor / now CTO+founder
- **NOT** the "guru / wizard" persona — comfortable with Vercel/Notion-level UX
- Builds daily: dexter-player, screenflow.pro, love-virtually, hanpark-admin
- Aesthetic: minimalist, Linux kernel mental model, SOLID-disciplined, taste-driven

User-identity rule: Agora's UX is calibrated to "approachable senior" — not "expert obscure", not "non-tech accessible".

---

## Three-Month Vision (excerpted from Sang's narrative)

> *"3개월 후에 내가 agora를 헤비하게 사용하고 이거 없이는 퀄리티 있는 개발을
> 못한다고 느끼면 좋겠고. AI 모델이 좋아지고 claude code가 더 고도화가 되어도
> 여전히 유의미한 존재이면서 ai 모델이 opus 6.0이 나와서 좋아지고 claude code가
> 좋아지면 우리도 자연스럽게 같이 좋아지는? 그들과 경쟁하다가 대체되는 그런
> 존재가 아니라 이들이 좋아지면 우리거까지 같이 좋아지는. 이들을 증강 시켜줄 수
> 있는 제품이 되면 좋겠어."*

Operational checks at 3 months:
- Sang uses Agora daily, on multiple projects (dexter-player, screenflow, new ideas)
- A new opus / claude-code release **strengthens** Agora rather than threatens it
- Sang feels quality-loss if forced to work without Agora
- Other senior devs (lazydevz inner circle) can adopt without onboarding pain

---

## Technical Decisions Made

These decisions were captured during the interview but await formal ADRs.

### `.agora/` folder structure (R)

```
.agora/
├── seed.md            # Human-readable SoT (X3 prose part)
├── seed.json          # Machine-readable structure (X3 structured part)
├── state.json         # Current phase / progress / last-active timestamp
├── history/           # Previous workflow runs (alignment + ralph)
├── cache/             # gitignored
└── logs/              # gitignored
```

SQLite event store (Ouroboros pattern, R3) is **deferred** until file-based proves insufficient.

### CLI command surface (S)

Seven commands max (per Stage-0 cap):

```
agora                  # Status + suggested next action (Enter to execute)
agora new [name]       # Start a new alignment workflow
agora resume           # Resume in-progress workflow
agora seed             # View / edit current seed
agora ralph            # Start / resume implementation loop
agora status           # Detailed status
agora doctor           # Environment diagnosis
```

Plus global flags: `--help`, `--json`, `--version`.

References: `gh`, `vercel`, `supabase`, `stripe` CLIs.

### Claude Code integration (T) — REVISED 2026-04-27

> **Original recommendation retracted.** The Claude Agent SDK cannot use Claude Max
> subscription auth — it requires API billing. For Max users (Sang included) this
> would mean double-paying. See ADR-0005 for full reasoning.

**Revised decision** (codified in ADR-0005):

- **Primary path**: `claude --print --output-format json` subprocess
  - Uses Claude Code CLI's existing auth → Max subscription works
  - `--output-format json` is the official structured programmatic interface, NOT fragile parsing
- **Fallback path**: Claude Agent SDK with `ANTHROPIC_API_KEY` (only when no Claude Code CLI installed)
- **Auto-detect on startup**, prefer Max-using subprocess

### Three I/O Modes (driven by subprocess decision)

Agora must support three operating modes because it's invoked from three contexts:

1. **Interactive TUI** — human in terminal — `@clack/prompts` UI + `claude --print` subprocess
2. **JSON / Scripted** — Claude Code Bash, CI, other AI agents — JSON I/O + `claude --print` only when LLM judgment needed
3. **MCP Server** — Claude Code calling Agora as native MCP tool — host session generates LLM responses, Agora provides structured data only (no nested LLM call)

Mode 3 specifically prevents the nested-LLM-call waste that would happen if Agora always called its own subprocess regardless of context.

---

## Live Failure Modes Observed (Stage 2 hard constraints)

See `docs/loops/interview-loop.md` Failure Modes section. Eight modes (F1–F8) captured with concrete observations. These are the hard constraints Stage 2 must encode.

---

## What's Settled vs. Open

### Settled (move to MANIFESTO / north-star)
- Telos (alignment to ~0%)
- Augmentation thesis (Linux kernel analogy)
- Why philosophy (taste articulation tech)
- Anti-goals (7 items)
- HAA term
- Five philosophers + roles
- Two-loop architecture with gates
- Alignment Loop renamed
- User identity

### Open (Stage 2+ inputs)
- Exact alignment-check threshold (numerical)
- How "preview quality" is judged (Y3 condition)
- 6th philosopher candidacy (deferred)
- TUI design (post-CLI)
- GUI roadmap (post-TUI)
- Commercial form specifics (long-term)

---

*Live interview considered closed at this point. Drafting MANIFESTO and north-star next.*
