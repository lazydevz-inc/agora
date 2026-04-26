# Alignment Loop — Specification (Stage 2)

> **Status**: Stage 2-A in progress. Renamed from `interview-loop.md` on 2026-04-27.
> Sections marked **[SPEC]** are formally accepted Stage 2 outputs.
> Sections marked **[INHERITED]** are Stage 1 inputs preserved for traceability.
> Sections marked **[OPEN]** are Stage 2-A open questions.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 2 closes its gate.

---

## Phase Index

| Phase | Status | Notes |
|-------|--------|-------|
| Phase −1 — Husserl Epoché | [OPEN] | Stage 2-A.5 (round ordering) |
| **Phase 0 — Auto-scan** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.2) |
| **Phase 1 — Open Intake** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.3) |
| Phase 2 — Iterative Rounds | [OPEN] | Stage 2-A.4 / 2-A.5 / 2-A.6 / 2-A.7 |
| Termination Gate (Y2 + Y3) | [OPEN] | Stage 2-A.8 |
| Brownfield/Greenfield branching | [PARTIAL — see Phase 0 SPEC] | Stage 2-A.9 |
| Mini-alignment re-entry from Ralph (Z2) | [OPEN] | Stage 2-A.10 |

---

## Phase 0 — Auto-scan [SPEC] (Accepted 2026-04-27)

> **Goal**: With zero user input, produce a `Phase0Result` that classifies the project (brownfield/greenfield) and ingests the most relevant context documents and infrastructure markers, ready to feed into Phase 1.
>
> **Time budget**: ≤ 2 seconds (perceived as instant). On overrun, return a partial result with a "scan_truncated" flag and proceed.

### Algorithm (pseudo-code)

```
phase_0_scan(cwd) -> Phase0Result:

  # 1. Fast file inventory (deterministic, no LLM)
  files = walk(cwd, max_depth=3, ignore=[node_modules, .git, dist, .agora/cache, .next, .venv, target, build])

  # 2. Classification rule (R1-A)
  classification, confidence = classify(files)
    if (.git exists) AND (code_files >= 5 OR significant_md_files >= 1):
      → brownfield, high
    elif (.git exists) AND (sparse content):
      → brownfield, low      # Phase 1 confirms with one-liner
    elif (no .git, empty/near-empty):
      → greenfield, high
    else:
      → greenfield, default

  # 3. Context document ingestion in priority order (R2-A)
  context_docs = []
  for path in PRIORITY_ORDER:
    if exists(path):
      content = read(path, max_size=64KB)
      context_docs.append({path, content, priority_rank})

  PRIORITY_ORDER = [
    "CLAUDE.md",          # AI context (highest — likely most-recent SoT)
    "AGENTS.md",          # synonym
    "README.md",          # human SoT
    ".agora/seed.md",     # prior alignment result, if any
    "docs/CLAUDE.md", "docs/README.md",
    # Other root MD files: collected to detected_other_md, NOT auto-ingested
  ]
  # When CLAUDE.md and README.md are both present and SEMANTICALLY DIVERGENT,
  # surface the divergence as an explicit Socratic probe in Phase 2 (do NOT
  # silently merge). See "Cross-document divergence" below.

  # 4. Tech stack + infrastructure markers (feeds ADR-0006 material_cause)
  markers = detect_markers(files)
    package.json, pnpm-lock.yaml         → Node.js + pnpm
    package.json, yarn.lock              → Node.js + yarn
    package.json, package-lock.json      → Node.js + npm
    package.json, bun.lock(b)            → Node.js + bun
    pyproject.toml, uv.lock              → Python + uv
    pyproject.toml, poetry.lock          → Python + poetry
    requirements.txt                     → Python + pip
    Cargo.toml                           → Rust
    go.mod                               → Go
    .vercel/project.json                 → Vercel
    supabase/config.toml                 → Supabase
    .github/workflows/*.yml              → GitHub Actions
    Dockerfile, docker-compose.yml       → Docker
    package.json deps include "stripe"   → Stripe
    package.json deps include "@clerk/*" → Clerk
    package.json deps include "@anthropic-ai/*" → Anthropic SDK
    .env.example                         → declared env-var contract
    # Registry is community-extensible. Each marker → one or more probes
    # in Gate 0 (ADR-0006).

  # 5. Project size signal (informs interview default depth)
  size_signal = compute_size(files)
    files <= 5  AND  total_loc <= 200    → tiny
    files <= 50 AND  total_loc <= 5_000  → small
    files <= 500 AND total_loc <= 50_000 → medium
    otherwise                            → large

  # 6. Workspace boundary enforcement (R3-A — strict per-folder isolation)
  # cwd is the absolute boundary. Phase 0 NEVER walks above cwd.
  # Monorepo workspace expansion requires explicit user flag:
  #   `agora --workspace-root=../..`
  # Without that flag, sibling packages in a monorepo are invisible.

  # 7. Result
  return Phase0Result(
    classification: brownfield | greenfield,
    confidence: high | low | default,
    context_docs: [...],
    detected_markers: [...],
    detected_other_md: [...],   # MD files seen but not ingested
    size_signal: tiny | small | medium | large,
    cwd: absolute_path,
    scan_duration_ms: number,
    scan_truncated: bool,
  )
```

### User-facing display (R4-A — always show)

After Phase 0 completes, the result is always shown to the user, immediately
before Phase 1's open prompt. The display is concise (target ≤ 6 lines):

```
✓ Detected: brownfield TypeScript project (high confidence)
✓ Read: CLAUDE.md (12KB), README.md (4KB)
✓ Markers: Vercel, Supabase, GitHub Actions, Stripe
✓ Size: medium (~8K LoC)

What would you like to work on?
> _
```

For low-confidence brownfield, the message inserts a one-liner confirmation:

```
✓ Detected: brownfield TypeScript project (low confidence)
  ⚠ Sparse content. If this is actually a new project, type 'new project' to switch.
✓ Read: README.md (1KB)
✓ Markers: Node.js
✓ Size: tiny (~50 LoC)

What would you like to work on?
> _
```

### Cross-document divergence handling

When Phase 0 ingests two or more priority documents (e.g. CLAUDE.md and README.md) that **semantically contradict**, the divergence is **not silently merged**. Instead:

1. Phase 0 records the divergence in `Phase0Result.divergences[]` with offending claims quoted.
2. Phase 2 generates an explicit Socratic probe in an early round:
   *"README says X, but CLAUDE.md says Y. Which is the current truth?"*
3. The user's answer becomes the canonical claim; the contradicting document is flagged for later cleanup (logged to `.agora/state.json`, surfaced in `agora doctor`).

This honors F4 (questions build on prior context) and F2 (purpose is visible: "resolve documentation divergence").

### Boundaries (what Phase 0 does NOT do)

- ❌ No LLM calls. Phase 0 is fully deterministic.
- ❌ No write operations to the user's project (read-only filesystem access).
- ❌ No reading above `cwd` (R3-A strict isolation).
- ❌ No reading file contents > 64KB (truncated, flagged).
- ❌ No silent miscategorization — low-confidence brownfield always confirmed.
- ❌ No silent merging of contradictory context documents.

### Output consumed by

- **Phase 1**: uses `classification`, `context_docs`, `detected_markers`, `size_signal` to calibrate the open-intake prompt's tone and default depth.
- **Phase 2**: uses `context_docs` content for elenchus case generation; `detected_markers` for material_cause auto-population (Aristotle's third cause); `divergences[]` for explicit early-round probes.
- **Ralph Loop Gate 0** (ADR-0006): uses `detected_markers` to construct the probe checklist for pre-flight infra check.
- **`agora doctor`**: re-runs the marker portion as a standalone diagnostic.

### Failure modes specifically guarded

- **F1** (locale): N/A — Phase 0 has no LLM-generated text. The display string is templated and locale-validated.
- **F2** (purpose visible): the user-facing display shows exactly what was detected, why each piece matters (every line is a fact + implication).
- **F4** (build on prior): Phase 0 IS the prior context for Phase 1 and Phase 2.

---

## Phase 1 — Open Intake [SPEC] (Accepted 2026-04-27)

> **Goal**: Capture all the context the user is willing to give, in one turn,
> in a form that maximizes downstream Phase 2 efficiency without burdening the
> user beyond what they want to give.
>
> **Time budget**: bound by user typing/composition speed. No system-imposed
> timeout; user sets the pace.

### Algorithm (pseudo-code)

```
phase_1_open_intake(phase_0_result) -> Phase1Result:

  # 1. Compose context-aware prompt (R1-A for brownfield, R2-A for greenfield)
  prompt = compose_prompt(phase_0_result)

  if phase_0_result.classification == brownfield:
    # R1-A: explicitly reference what we already read
    prompt = """
    What would you like to work on?

    ⓘ I've read your {ingested_doc_list} ({total_kb}). You don't need to
      re-explain what the project is — just tell me what you want to do here today.

    Press Enter alone to open $EDITOR for longer thoughts.
    """

    # If low-confidence brownfield, prepend the one-liner from Phase 0 SPEC
    if phase_0_result.confidence == low:
      prompt = LOW_CONFIDENCE_BANNER + prompt

  else:  # greenfield
    # R2-A: suggest 3 dimensions (what + why + shape) without forcing
    prompt = """
    What would you like to build?

    ⓘ This looks like a fresh start. Tell me as much as you can — what
      it is, why you want it, what shape you imagine. The more you say
      now, the fewer questions later.

    Press Enter alone to open $EDITOR for longer thoughts.
    """

  # 2. Read input
  user_input = read_input(prompt)
    INPUT_RULES:
      - Single-line typed inline               → intake_method = "inline"
      - Empty Enter (no text)                  → opens $EDITOR (env $EDITOR
                                                 or vim/nano fallback);
                                                 intake_method = "editor"
      - Paste (multi-line)                     → accepted as-is;
                                                 intake_method = "paste"
      - Soft cap: 8 KB (≈ 1500 words)          → user shown gentle notice on
                                                 reaching:
                                                 "Long input — that's good.
                                                  Continue if you want, or
                                                  run `agora` again to refine."
      - Hard cap: 16 KB                        → truncated; flag set;
                                                 user notified at echo-back
      - Empty after editor open + close        → re-prompt once with
                                                 "Need at least one sentence."
      - Empty twice                            → abort Phase 1 with exit code 2
                                                 (user can `agora resume`)

  # 3. Echo back (R4-A) — mechanical confirmation, no LLM summarization
  display_echo:
    """
    OK. Captured {word_count} words via {intake_method}.
    About to ask {estimated_rounds} rounds of follow-up to align before
    we lock the seed.

    Press Enter to continue, Ctrl+C to pause.
    """
    # estimated_rounds is computed from intake_word_count + size_signal:
    #   < 50 words           → "5–8 rounds (lots to clarify)"
    #   50–300 words         → "3–5 rounds"
    #   > 300 words          → "2–3 rounds"
    #   These are estimates only, not commitments. Phase 2 may adjust.

  # 4. Return
  return Phase1Result(
    raw_intake: user_input,
    intake_method: inline | editor | paste,
    intake_word_count: int,
    intake_byte_size: int,
    intake_truncated: bool,
    intake_duration_ms: int,
    estimated_rounds: string,  # for telemetry/UI, not a commitment
  )
```

### Why each decision

- **R1-A** (brownfield prompt references read docs): Sang's existing CLAUDE.md
  and README.md represent context the user already invested in producing.
  Asking them to re-explain those is pure friction. The prompt acknowledges
  what we know so the user spends words on what we *don't* know.
- **R2-A** (greenfield prompt suggests 3 dimensions): completely-open prompts
  produce paralysis. Three dimensions (what / why / shape) cover the bulk of
  what Aristotle's four causes will need without pre-committing the user to
  any particular structuring. Phase 2 fills the remainder via Aristotle.
- **R3-A** (8 KB soft / 16 KB hard cap): 1500 words is far more than most
  users dump in one sitting; beyond that, additional words are usually
  unfocused. Hard truncate at 16 KB protects against paste accidents
  (e.g. accidentally pasting an entire doc) while still allowing large
  intentional dumps.
- **R4-A** (mechanical echo, no LLM summary): mechanical "I heard {N} words"
  builds trust without risking F4 violation (a wrong LLM summary would
  immediately damage trust). The estimated-rounds line gives the user a
  rough expectation for the Phase 2 pace.

### Editor escape contract

When user presses Enter on empty input:

1. A temp file is created at `.agora/cache/intake-{timestamp}.md`
2. Pre-populated with a comment header:
   ```
   <!--
   Type your intake below. Save and exit when done.
   - Lines starting with <!-- are ignored.
   - Save empty to abort Phase 1.
   - Press : (vim) or Ctrl-X (nano) to exit your editor.
   -->
   ```
3. `$EDITOR` env var is honored (`$EDITOR ".agora/cache/intake-*.md"`)
4. If `$EDITOR` unset, fall back order: `vim`, `nano`, `vi`. If none → error.
5. After editor closes, file is read, comment lines stripped, content used.
6. Temp file is moved to `.agora/history/{session_id}/intake.md` for audit.

### Boundaries (what Phase 1 does NOT do)

- ❌ No LLM calls during input collection.
- ❌ No LLM-generated summary of input (R4-A: mechanical echo only).
- ❌ No question dialog yet — that's Phase 2.
- ❌ No silent truncation — soft cap is shown, hard cap is announced at echo.
- ❌ No persisting input until user has confirmed (Ctrl+C before echo discards).
- ❌ No reading from stdin in non-TTY mode unless explicit `--non-interactive`
      flag is set (Mode 2 of the 3-mode I/O — see ADR-0005).

### Output consumed by

- **Phase 2**: `raw_intake` is the primary substantive context for round-1
  question generation. `intake_word_count` and `estimated_rounds` calibrate
  Aristotle's depth-of-questioning default.
- **Seed builder**: `raw_intake` is preserved verbatim in `seed.md` under a
  "Genesis" section, so the user can always see *what they originally said*
  separate from *what was distilled*.

### Failure modes specifically guarded

- **F2** (purpose visible): prompt explicitly states "the more you say now,
  the fewer questions later" — connects this turn to downstream cost.
- **F3** (no abstract questions): prompt asks about concrete project work,
  not abstract concepts.
- **F8** (free input never an option): no enumerated options here at all;
  the entire turn is free input by design.

---

## Inherited Stage-1 Inputs [INHERITED]

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

## Open Questions (Stage 2-A remaining) [OPEN]

Questions resolved are struck through. Open questions are tackled in priority order
(see `docs/stage-2/NOTES.md`).

1. ~~**Phase 0 auto-scan algorithm** (Stage 2-A.2)~~ ✅ Resolved 2026-04-27. See "Phase 0 — Auto-scan [SPEC]" above.

2. ~~**Phase 1 open intake design** (Stage 2-A.3)~~ ✅ Resolved 2026-04-27. See "Phase 1 — Open Intake [SPEC]" above.

3. **Phase 2 round structure** (Stage 2-A.4) — open
   - One round flow: question construction → presentation → answer → routing

4. **Round ordering** (Stage 2-A.5) — open
   - Which philosopher operates when, with what triggers
   - Husserl Phase −1: greenfield default-on / brownfield default-off?
   - Telos-first invariant
   - Socrates woven through every round vs gated by maturity

5. **Recommended-options generation** (Stage 2-A.6) — open
   - Drawn from auto-scan (codebase patterns)
   - Drawn from common cases (Aristotle category exemplars)
   - Drawn from the user's earlier answers (consistency check)
   - Drawn from prior similar projects (anonymized priors)

6. **Validation gates per claim** (Stage 2-A.7) — open
   - Maturity-based (Plato's Divided Line) — telos must reach Noesis
   - Implication-based (Socratic elenchus) — claim must survive case probing
   - Coverage-based (Aristotle's four causes) — all four causes addressed
   - Composition rule between the three

7. **Termination Gate Y2 + Y3** (Stage 2-A.8) — open
   - Precise algorithm for "I think we have enough to proceed"
   - Preview generation quality threshold (when to show, when to suppress)

8. **Brownfield vs greenfield branching** (Stage 2-A.9) — partially resolved
   - Phase 0 classification rule is now SPEC (R1-A)
   - Remaining: how Phase −1 and Phase 2 differ between the two

9. **Mini-alignment re-entry from Ralph (Z2)** (Stage 2-A.10) — open
   - Shorter form of alignment loop for re-entry mid-Ralph
   - How much context to re-confirm vs trust-from-prior-seed

---

*This document is being incrementally promoted from placeholder to formal spec
across Stage 2-A rounds. See `docs/stage-2/NOTES.md` for the running plan.*
