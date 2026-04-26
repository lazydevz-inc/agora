# Ralph Loop — Specification (Stage 2)

> **Status**: Pre-Stage-2 placeholder + foundational decisions captured.
> Per ADR-0004, this document is not "Accepted" until Stage 2 closes its gate.
>
> What's already decided here: the 5+1 gate structure (Gate 0 from ADR-0006,
> Gates 1–5 from MANIFESTO and stage-1 interview) and Z1/Z2 escalation rules.

---

## What Ralph Is

Ralph is the **implementation loop**. It takes a locked alignment seed (the output of the Alignment Loop) and drives implementation iterations against it until **every gate passes** AND **the user confirms satisfaction**.

Ralph is **not** "AI generates code and we hope." It is "AI generates code, six gates verify it, the gate that fails determines what happens next."

Ralph's name is borrowed from the "ralph loop" pattern in AI agent discourse — the discipline of running self-referential implementation loops until verification passes. We adopt the term and harden it with explicit gates.

---

## The Six Gates

Every Ralph iteration's output must pass all six gates. The gates are ordered by **cost and dependency** — cheap deterministic checks first, expensive judgment-based checks later.

### Gate 0 — Pre-flight Infrastructure Check

**When**: Once per Ralph session (at start), and conditionally between iterations if probe-relevant changes occur.
**Owner**: Agora's infra probe registry (per ADR-0006)
**Criterion**: All probes derived from `seed.material_cause` pass, OR the user has explicitly bypassed with `--skip-gate-0=<list>` (recorded as trust warning).
**Output**: Pass / Fail with structured remediation list per failure.

This gate exists because every other gate's result is meaningless if the environment can't actually do what the seed describes. See [ADR-0006](../architecture/decisions/0006-pre-ralph-infrastructure-gate.md).

### Gate 1 — Deterministic

**When**: Every iteration.
**Owner**: External tooling (lint, typecheck, build, test runners)
**Criterion**: All of the following pass:
- Linter (project-detected: biome, eslint, ruff, etc.)
- Type checker (tsc, mypy, etc.)
- Build (project-detected build command)
- Test suite (vitest, pytest, etc.)
- Coverage threshold (default 70%, project-overridable)

**Output**: Pass / Fail. On fail, the iteration is marked "broken" and the next iteration must address the failures.

This is the cheapest gate ($0 cost, no LLM calls). All Ralph iterations must clear it.

### Gate 2 — Functional QA (Playwright CLI)

**When**: Every iteration where UI / web behavior changed.
**Owner**: Playwright CLI (test files generated once by LLM from the seed's acceptance criteria, then run deterministically)
**Criterion**: Generated tests pass.

**Why Playwright CLI, not MCP**: deterministic, fast, version-controlled, zero token cost per run. See `docs/loops/interview-loop.md` for the rationale (originally captured during the Stage 1 interview).

The LLM generates the Playwright test files **once** during Alignment-Ralph handoff, based on the seed's AC. Subsequent Ralph iterations run them via `npx playwright test`. New AC may trigger new test generation.

### Gate 3 — UI/UX Quality (Aquinas Disputatio)

**When**: Every iteration that touches user-facing surfaces.
**Owner**: Aquinas Disputatio applied with UI/UX critic personas.
**Criterion**: Disputatio verdict is `approved` or `conditional_approved`. `rejected` blocks the iteration.

This is a judgment gate. Critics raise objections about visual hierarchy, interaction clarity, accessibility, taste consistency with the project's design tokens. Each objection gets a per-objection ruling (Concedo / Distinguo / Nego). See [05-aquinas-disputatio.md](../philosophy/05-aquinas-disputatio.md).

### Gate 4 — Technical Quality (Aquinas Disputatio)

**When**: Every iteration that adds or modifies non-trivial code.
**Owner**: Aquinas Disputatio applied with code-quality critic personas (SOLID, naming, test coverage, performance).
**Criterion**: Same as Gate 3 — Disputatio verdict.

This gate is where the *senior-developer-vs-non-developer* distinction is enforced (per Stage 1 telos: SOLID-level structural quality is non-negotiable).

### Gate 5 — Alignment Check (the inviolable gate)

**When**: Every iteration. **Always.**
**Owner**: Alignment-check engine (uses seed.telos, seed.acceptance_criteria, seed.evaluation_principles).
**Criterion**: The implementation's behavior aligns with the seed's telos AND meets the relevant AC. Drift score below threshold.

**This is the gate that prevents 0.9^10 compounding.** If alignment drifts, every subsequent gate's success becomes meaningless.

---

## Failure Escalation (Gate 5 specifically)

When Gate 5 fails, the response is **not** "stop and ask user." It is a graduated escalation:

### Z1 — Self-correction (default)

The iteration's diff is compared to the seed. The misalignment is summarized as a delta (which AC drifted, by how much, in which direction). The next iteration is launched with the delta as additional context: *"Last iteration drifted from telos in direction X. This iteration must correct toward Y."*

Z1 does not modify the seed. The seed remains the truth.

### Z2 — Mini Alignment Loop re-entry

If Z1 fails to close the gap after **N consecutive iterations** (default N=3, project-overridable), Ralph **pauses** and re-enters a mini Alignment Loop. The user is told:

```
⚠ Gate 5 (Alignment Check) failed 3 iterations in a row.
  The implementation appears to have drifted from the seed's telos in a way
  Ralph cannot self-correct.

  Specific drift: [summary]

  Next step: a mini-alignment session (5–10 questions) to either:
  (a) update the seed to reflect a refined understanding, or
  (b) clarify which alignment claim was always going to be unrealistic.

  Run `agora resume` to start the mini-alignment session.
```

The mini-alignment is shorter than a full alignment (uses the existing seed as ground, asks only about the drift). On completion, Ralph resumes from where it paused.

### Z3 — Forbidden

There is no "ignore Gate 5 and push forward." This was explicitly rejected during Stage 1 interview. Ralph definitionally includes alignment verification.

---

## What Triggers Re-running Gates

| Change | Gate 0 | Gate 1 | Gate 2 | Gate 3 | Gate 4 | Gate 5 |
|--------|--------|--------|--------|--------|--------|--------|
| New env var added | ✓ | — | — | — | — | — |
| Code change | — | ✓ | conditional | conditional | ✓ | ✓ |
| New AC added | ✓ if infra-relevant | — | regen tests | — | — | ✓ |
| Telos refined (mini-alignment) | — | — | — | — | — | ✓ (recompute) |
| Material cause expanded | ✓ | — | — | — | — | — |

`conditional` = runs only if the change touched the gate's domain (UI changes → Gate 2 + 3; backend changes → only Gate 4).

---

## Open Questions for Stage 2-B

These resolve in Stage 2-B (full Ralph spec):

1. **Probe registry initial coverage** — which CLIs/tools ship with v1? Likely: gh, vercel, supabase, stripe, claude, node, git. Others added per demand.
2. **Drift score threshold** — what numeric value triggers Z1 vs Z2? (Currently: Z1 every fail, Z2 after 3 consecutive Z1 fails.)
3. **Critic persona selection** — which UI/UX and code-quality personas run for Gate 3 and 4? Project-overridable?
4. **Test regeneration trigger** — when do Playwright tests get regenerated vs. updated incrementally?
5. **Iteration cap** — should Ralph have a hard cap on iterations per session? (Default 10? 20? Or unlimited with token budget instead?)
6. **Parallel iterations** — can Ralph run multiple iteration paths in parallel and pick the best (Disputatio between paths)? Or strictly sequential?
7. **Bypass UX** — `--skip-gate-0=<list>` is documented; what about other gates? (Lean toward: only Gate 0 is bypassable; others have lower-cost equivalents but no full bypass.)

---

## Pre-Stage-2 Inputs from Sang (captured during interview)

### Input 1 — Quality is non-negotiable; velocity is a side-effect of AI capability (2026-04-27)

> *"내가 봤을 때 ai의 성능이 좋아지면 quality와 velocity 양쪽 다 자동으로 올라가. 그래서 우리는 quality에 베팅하면 됨. velocity는 따라온다."*

Operational rule: gate strictness defaults are **strict**. There is no option to "loosen gates for faster iteration." If gates are wrong, fix the gates; don't loosen them.

### Input 2 — SOLID-level technical quality is the senior-vs-non-senior differentiator (2026-04-27)

Gate 4's critic personas must include SOLID-discipline checks. This is what distinguishes Agora's output from a generic AI code generator's. A non-developer using AI can ship MVP; only a senior-quality system ships maintainable production code.

### Input 3 — UI/UX quality is taste-area, sync with user (2026-04-27)

Gate 3's checks must respect the project's design tokens (if defined) and remain minimal otherwise. Critics do not impose taste; they verify consistency with the project's stated taste.

### Input 4 — Pre-Ralph infra check is required (2026-04-27)

> *"ralph loop execution 하기 전에 인프라 관련 cli들이나 기타 사용하는 것들 중 계정 연동 확인같은거 필요한것들 있으면 미리 체크를 해주는게 필요할텐데"*

Gate 0 is the answer. ADR-0006 captures the full design.

---

*This document will be expanded during Stage 2-B with the resolved spec. The 5+1 gate structure and Z1/Z2 escalation are committed and unlikely to change. Probe registry, persona selection, and threshold tuning are the remaining open work.*
