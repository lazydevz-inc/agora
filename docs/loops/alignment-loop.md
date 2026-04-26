# Alignment Loop — Specification (Stage 2)

> **Status**: Stage 2 in progress. Renamed from `interview-loop.md` on 2026-04-27
> (Interview is the means; Alignment is the end). Inherited Stage-1 inputs and
> failure modes are preserved below; Stage 2 promotes them into a formal spec.
>
> Per ADR-0004, this document is not "Accepted" until Stage 2 closes its gate.

---

## Inherited Stage-1 Inputs

### Input 1 — Phase structure (2026-04-26)

The Alignment Loop has three observable phases:

**Phase 0 — Auto-scan (no user input)**
- Scan current working directory for files
- Detect brownfield vs greenfield (presence of `.git`, code files, lockfiles)
- Read all relevant Markdown context: `README.md`, `CLAUDE.md`, `AGENTS.md`,
  any `*.md` files at the project root, plus inferred work-related notes
- Use this scan as initial context for subsequent phases

**Phase 1 — Open intake (one large turn)**
- Ask the user what they want to work on, openly
- Receive *all* the context the user is willing to provide in one round
- No fragmenting questions yet — let them dump

**Phase 2 — Iterative interview (loop)**
- Use the accumulated context (auto-scan + open intake + each round's answers)
- Multi-perspective rounds: each iteration applies one or more philosopher lenses
- Validation/order/iteration logic is **not yet finalized**
  → Stage 2-A will design this through structured exploration

### Input 2 — UX: expertise-aware question shape (2026-04-26 + 2026-04-27 refinement)

The user dislikes verbose typing burden. The form a question takes depends on **whether the user has domain expertise in the area being questioned**:

**Mode A — User has domain expertise** (e.g. business goals, telos, taste, anti-goals)
- Provide **recommended options** the user can pick by label
- Free input always available as a parallel channel (not as an option labeled "free")
- The user is the expert; we surface plausible structurings for speed

**Mode B — User lacks domain expertise** (e.g. CLI best practices, MCP integration shape, lower-level technical decisions)
- Forced multiple choice causes paralysis ("what should I pick? I don't know.")
- Instead: **single confident recommendation + rationale + 1–2 alternatives + invitation to push back**
- The user reviews and confirms or asks why; they don't have to choose blind

The interview engine must track which areas the current user is expert in, and switch modes accordingly. Expertise can be:
- Declared explicitly by the user
- Inferred from prior answers
- Defaulted (e.g. for the project owner, business decisions = expert)

**Free input is never an "option" with a label like "Other" or "자유".** It is always available as a parallel response channel. Putting it in the option list is meaningless to the user (F8).

### Input 3 — End-of-interview UX (2026-04-26)

When Agora internally determines that the interview can end (e.g. telos has reached
Noesis, all four causes are sufficiently mature, no fresh ambiguity surfaces in the
last N rounds), it must **not** terminate silently.

**Always ask first**: *"I think we have enough to proceed. Anything else you want
to refine before we lock the seed?"*

- If the user has more to discuss → continue the loop, no penalty
- If the user has nothing more → cleanly close and produce the seed

**Why this matters**:
- The user is the source of truth on intent. Agora's internal "we're done" signal
  is a hypothesis; the user's "yes I'm done" is the confirmation.
- It prevents the failure mode where the system declares completion but the user
  was about to bring up a critical concern.
- It respects the user's autonomy — Agora suggests, the user decides.

This is a **structural rule** of the loop, not a polish feature. Stage 2 design
must encode it as the only valid termination path (no auto-terminate).

---

## Observed Failure Modes — Live Ouroboros Baseline (2026-04-26)

These failure modes were captured from a live `ooo interview` session run on the
Agora project itself (session `interview_20260426_081950`). They are baseline
evidence; Stage 2 design must explicitly prevent each one.

### F1 — Korean output incorrect (typos, encoding artifacts)

Observed: MCP returned questions with Korean grammar errors ("뭔는지" instead of
"뭔지") and occasional character corruption.

Root cause hypothesis: model responses for non-English locales are not validated
before being shown to the user.

Agora rule: **i18n correctness is a quality gate.** Every user-facing string
must pass a locale-correctness check before being rendered. Garbled output is
treated as a bug, not a quirk.

### F2 — "Why this question?" is invisible

Observed: questions felt arbitrary. Sang said *"이 질문을 왜 하는거지? 이 질문을
해서 플랜의 어떤 부분이 도대체 개선이 된다는건지 도저히 모르겠음."*

Root cause hypothesis: questions are generated without binding them to a
specific seed field or open ambiguity that they will resolve.

Agora rule: **every question declares its purpose.** When a question is shown,
the system must show *what seed slot it fills* or *what ambiguity it resolves*.
Examples: "필요한 정보: 시드의 telos 필드 (현재 비어있음)" or "해소할 모호점:
brownfield 자동 감지가 충돌함."

### F3 — Abstract abstraction (the "tell me about your experience" trap)

Observed: questions like *"진짜 telos가 뭔가요?"* or *"인터뷰가 telos를 놓치는
패턴을 드러내기 위해…"* require the user to translate vague meta-language
back into concrete terms before they can even answer.

Root cause hypothesis: the question-generator drifts into self-referential
philosophical territory because that's where the prompt's own vocabulary lives.

Agora rule: **no abstract questions about abstract things.** Every question must
be answerable with concrete reference to (a) a file, (b) a person, (c) an event
that occurred, (d) a measurable outcome. If a question can only be answered
abstractly, it is malformed and must be rewritten.

### F4 — Chatbot-feel: questions don't follow from prior answers

Observed: each new question feels like a fresh start; the prior answer's
specifics aren't woven into the next question.

Root cause hypothesis: the question generator uses the *summary state* (e.g.
"ambiguity score") rather than the *substance* of the prior answer.

Agora rule: **every question quotes or references the last substantive answer.**
"You said X. Given X, the next thing I need to know is Y because…" Continuity
must be visible to the user.

### F5 — False binary (forces choice when user provided compound input)

Observed: Sang listed three pain points; Ouroboros asked "which is the most
important?" Sang's reaction: *"이 세가지 중 뭐가 가장 큰가요? 이런 질문을 하는데,
이게 왜 중요하고 왜 내가 세가지 이슈 다 필요해서 언급한건데 그 중 하나를 꼭
최우선으로 답해야 하는지 이유를 모르겠어."*

Root cause hypothesis: the question generator defaults to ranking/forcing
selection because that produces structured data the model can index. But it
violates the user's actual semantic — they meant "all three matter."

Agora rule: **never ask the user to rank what they presented as compound,**
unless ranking serves a *concrete downstream decision* and that decision is
shown to the user. Compound input stays compound.

### F6 — One-dimensional questions

Observed: Sang summarized the overall feel as *"질문이 너무 1차원적이야."*
Most questions probe a single attribute (which? what? when?) without exploring
the surrounding semantic neighborhood (why this attribute matters, what depends
on it, what alternatives exist).

Agora rule: **multidimensional probes preferred over single-attribute lookups.**
A good question opens a small space of related sub-questions the user can
respond to selectively, rather than narrowing to one slot.

### F7 — Single proposal without comparable alternatives (2026-04-27)

Observed: Claude proposed Karl Popper as a 6th philosopher, alone, without
comparison candidates. Sang's reaction: *"popper말고 더 적합한 사람은없나? 이런
생각이 들었음."* — the user had no basis to evaluate the proposal.

Root cause hypothesis: presenting a single addition makes the user the
comparison engine, but they don't have the search space loaded. Decision
paralysis follows.

Agora rule: **when proposing a new addition (philosopher, library, pattern,
mechanism), always present 2–3 comparable candidates with rationale for each
and a recommendation.** Single proposals are forbidden unless the user
explicitly asked for one specific evaluation.

### F8 — Vague free-input option labels (2026-04-27)

Observed: Claude included options labeled `R_free: 자유` and `S_free: 자유`.
Sang's reaction: *"R_free: 자유 는 뭔 옵션인지 감이 안와."* The label
communicates nothing; "자유" is the absence of a structured option, not a
distinct choice.

Agora rule: **free input is never an option in the choice list.** It is always
available as a parallel response channel, communicated separately ("자유서술도
가능합니다" or similar). Pretending it's an enumerated option dilutes the real
options and confuses the user.

---

## Forbidden Patterns (derived from F1–F8)

Stage 2 spec must encode these as hard constraints:

1. ❌ Korean (and any non-English) output without locale validation
2. ❌ Questions without an attached "purpose / fills which seed slot" label
3. ❌ Abstract questions about abstract concepts
4. ❌ Questions that don't quote or build on the prior answer
5. ❌ Forcing rank/selection on user-provided compound input
6. ❌ Single-attribute drill questions when a multi-dimensional probe is available
7. ❌ Proposing additions without 2–3 comparable alternatives
8. ❌ Free-input as a listed option (it is a parallel channel, not a choice)

---

## Open Questions (to be answered in Stage 2)

These questions will be resolved during Stage 2-A:

1. **Validation gates** — How does Agora know a claim is settled?
   - Maturity-based (Plato's divided line) — telos must reach Noesis?
   - Implication-based (Socratic elenchus) — claim must survive case probing?
   - Coverage-based (Aristotle's four causes) — all four causes must be addressed?
   - Combination of the above with weights?

2. **What gets re-asked, when, and why** — When does an answer trigger a follow-up?
   - When new information contradicts an earlier answer
   - When maturity is below threshold for a load-bearing field
   - When an alternative is implied but not considered

3. **Round ordering** — Which philosopher acts when?
   - Husserl Phase −1 (greenfield only? always optional?)
   - Aristotle four causes — telos first, always
   - Socrates elenchus — woven through, on every claim
   - Plato dihairesis — when AC decomposition starts (handoff to Ralph Loop)

4. **Recommended-options generation** — How does the system propose options?
   - Drawn from auto-scan (codebase patterns)
   - Drawn from common cases (Aristotle category exemplars)
   - Drawn from the user's earlier answers (consistency check)

5. **Brownfield vs greenfield branch** — Where do they diverge?
   - Greenfield: Husserl Phase −1 may be more useful (frame-questioning)
   - Brownfield: Phase 0 auto-scan is critical; existing code constrains telos

---

*This document will be expanded during Stage 2 with the resolved spec.*
