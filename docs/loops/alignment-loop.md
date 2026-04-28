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
| **Phase −1 — Husserl Epoché** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.5: greenfield default-on / brownfield default-off / `agora bracket` always available) |
| **Phase 0 — Auto-scan** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.2) |
| **Phase 1 — Open Intake** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.3) |
| **Phase 2 — Iterative Rounds** | **[SPEC]** | Both ordering and structure accepted (Stage 2-A.5 + 2-A.4) |
| **Phase 2 — Round Ordering** | **[SPEC]** | Accepted 2026-04-27 (Stage 2-A.5) |
| **Phase 2 — Round Structure** | **[SPEC]** | Accepted 2026-04-28 (Stage 2-A.4) |
| **Phase 2 — Recommended-options Generation** | **[SPEC]** | Accepted 2026-04-28 (Stage 2-A.6) |
| **Validation Gates per Claim** | **[SPEC]** | Accepted 2026-04-28 (Stage 2-A.7) |
| **Termination Gate (Y2 + Y3)** | **[SPEC]** | Accepted 2026-04-28 (Stage 2-A.8) |
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

## Phase 2 — Round Ordering [SPEC] (Accepted 2026-04-27)

> **Goal**: Decide which philosopher leads each Phase 2 round, with what trigger,
> in what order. The shape of any individual round (question construction, options
> generation, etc.) is Stage 2-A.4's territory. This section answers *which round
> happens next*, not *what that round looks like in detail*.
>
> **Mental model**: Conductor + Contributor.

### Conductor + Contributor model

The five philosophers do not all run in parallel. Each occupies a specific
moment with a specific role.

| Role | Philosopher | When |
|------|-------------|------|
| **Conductor** | Socrates | Every Phase 2 round (no exceptions). Wraps each round's substantive question with case-probing → response → potential aporia. The *rhythm* of the loop. |
| **Contributor (Lead)** | Aristotle / Plato (Divided Line) | Decides the *topic* of each round (which cause is being investigated, which maturity check is due). |
| **One-shot pre-Phase-2** | Husserl (Phase −1) | Runs once, before Phase 2 begins, when conditions warrant (greenfield default; brownfield only via `agora bracket`). |
| **One-shot at handoff** | Plato (Dihairesis) | Runs once, after Alignment Loop closes, decomposing acceptance criteria into the AC tree Ralph will iterate over. (Stage 2-C territory.) |
| **Not in Alignment Loop** | Aquinas | Ralph Loop only (Gates 3 and 4). |

**Implication**: a single Phase 2 round always has Socrates as conductor,
plus exactly one contributor providing the substantive topic. There are
never two contributors leading the same round.

### Round-planner algorithm

```
phase_2_round_planner(seed_state, phase_0_result, history) -> NextRound | TerminationCheck:

  # 0. Pre-check: Husserl Phase −1 runs ONCE before Phase 2 begins.
  #    NOT a Phase 2 round. Logic shown here for completeness.
  if not history.has_husserl AND should_run_husserl(phase_0_result):
    return PRE_PHASE2_HUSSERL

  # 1. TELOS-FIRST INVARIANT (R2-A: hard gate)
  #    Until telos reaches NOESIS, no other contributor leads.
  if seed.telos.maturity < NOESIS:
    return Round(
      conductor: Socrates,
      contributor: pick_telos_subroutine(seed.telos),
      purpose_label: f"Reaching telos.{next_empty_or_immature_field}",
    )
    # Sub-routine progression:
    #   telos.statement empty             → Aristotle Q1 ("why does this exist?")
    #   statement set, served_good empty  → Aristotle Q2 ("what good does it serve?")
    #   above set, failure_signal empty   → Aristotle Q3 ("how do we know it didn't work?")
    #   all set, maturity < NOESIS        → Plato Q (rejected-alternative test)

  # 2. After telos NOESIS, FORM next
  if seed.form.maturity < DIANOIA:
    return Round(
      conductor: Socrates,
      contributor: Aristotle.form,
      purpose_label: "Reaching form.essential_structure",
    )

  # 3. MATERIAL — auto-populated from Phase 0 markers, user confirms (R3-A)
  if seed.material.maturity < PISTIS:
    if not history.material_auto_proposed:
      return Round(
        conductor: Socrates,
        contributor: Aristotle.material,
        purpose_label: "Confirming material from auto-detection",
        prefill: phase_0_result.detected_markers,  # Mode A — recommended options
      )
    # If auto-proposed and not yet confirmed → re-prompt with same prefill

  # 4. EFFICIENT — usually one-liner for solo projects
  if seed.efficient.maturity < PISTIS:
    return Round(
      conductor: Socrates,
      contributor: Aristotle.efficient,
      purpose_label: "Capturing efficient cause (who/when/how)",
    )

  # 5. ACCEPTANCE CRITERIA generation (R4-A: LLM drafts 3-5, user edits)
  if seed.acceptance_criteria is empty:
    return Round(
      conductor: Socrates,
      contributor: Aristotle.ac_drafter,
      purpose_label: "Drafting acceptance criteria",
      mode: A,  # recommended options + free input
      payload: {
        action: "draft 3-5 AC from current telos + form",
        instruction_to_user: "Edit / add / remove. Each AC will then be probed.",
      },
    )

  # 6. AC PROBING — every AC must reach DIANOIA
  ac_to_probe = next(ac for ac in seed.acceptance_criteria if ac.maturity < DIANOIA)
  if ac_to_probe:
    return Round(
      conductor: Socrates,
      contributor: Plato.divided_line,
      purpose_label: f"Probing AC: {ac_to_probe.id}",
    )

  # 7. CROSS-DOCUMENT DIVERGENCE resolution (from Phase 0 R2-A)
  divergence = next(d for d in phase_0_result.divergences if not d.resolved)
  if divergence:
    return Round(
      conductor: Socrates,
      contributor: Socrates.divergence_resolver,
      purpose_label: f"Resolving doc divergence: {divergence.summary}",
    )

  # 8. NO MORE WORK — TERMINATION CHECK
  return TERMINATION_CHECK
    # → Stage 2-A.8 logic (Y2 + Y3) decides whether to ask
    #   "anything else?" and offer preview, or loop again.
```

### Husserl Phase −1 invocation conditions [R1-A]

```
should_run_husserl(phase_0_result) -> bool:
  if user invoked `agora bracket` (mid-project explicit):
    → True
  if phase_0_result.classification == greenfield:
    → True (default-on for greenfield)
  if phase_0_result.classification == brownfield:
    → False (default-off; user can override with `agora bracket`)
```

**Why**: Brownfield code IS the frame. Bracketing an already-committed frame
is over-application of the technique. Greenfield has no frame yet, so
bracketing the user's mental frame BEFORE Aristotle's telos question
maximizes value.

The `agora bracket` command is always available — even mid-Ralph — for the
user to explicitly invoke a re-bracketing when something feels wrong.

### Telos-first invariant [R2-A]

The hardest rule in Round Ordering: **until telos reaches NOESIS, no
other contributor leads a round.**

This is enforced at the planner level. The planner cannot return a Round
with a non-telos contributor while `seed.telos.maturity < NOESIS`. There is
no override flag, no "skip telos for now" option in the standard flow.

Override path (if absolutely needed):

- `--accept-low-telos-maturity` flag at `agora new` invocation.
  Recorded in `seed.metadata.overrides[]` as a permanent trust warning.
  Surfaced at every subsequent `agora ralph` start and in Gate 5 (Alignment Check).

### Material auto-fill [R3-A]

When the planner reaches step 3 (material cause), it does NOT ask the user
to type the material from scratch. Instead:

1. Pull `detected_markers` from `phase_0_result`
2. Present as Mode A (recommended options + free input):
   ```
   ⓘ Detected from your project files:
     ◉ Vercel        (.vercel/project.json)
     ◉ Supabase      (supabase/config.toml)
     ◉ GitHub Actions (.github/workflows/)
     ◉ Stripe        (package.json deps)

   Confirm these as material cause, or edit:
     [Enter] to confirm all
     [number] to toggle one off
     [+] to add what's missing (free text)
   ```
3. User's choice is recorded as `seed.material` directly.

This honors the *biased product* principle (we did the detection work) while
keeping the user as the source of truth.

### AC generation [R4-A]

When acceptance_criteria is empty (step 5), the contributor is `Aristotle.ac_drafter`.
The LLM is invoked with:
- Current `seed.telos` (NOESIS-level)
- Current `seed.form` (DIANOIA-level)
- `phase_0_result.context_docs` for project-specific phrasing

It produces **3 to 5 draft AC**. Each draft AC is shown to the user with:
- `[Enter]` to accept all
- `[number]` to edit one
- `[d]` followed by number to delete
- `[+]` to add a new one (free text)

Once the user is satisfied with the AC list, each AC enters step 6 for
Socratic case-probing until reaching DIANOIA.

The 3-5 range is intentional:
- Less than 3 → suggests insufficient telos/form coverage; planner refuses to draft.
- More than 5 → suggests AC is being decomposed too early (Plato Dihairesis territory).

### User backtrack [R5-A]

The user can return to a previously settled field at any point in Phase 2.
Two paths:

1. **Explicit command**: `agora seed --edit telos.statement` (or any field path)
2. **In-round natural language**: when answering a round, prefix with
   *"actually, let me change my earlier answer about X"* — the round planner
   detects the intent, halts the current round, and re-enters the named field.

In both paths:
- The named field's maturity is reset to `eikasia`.
- All downstream fields that *depend on* the changed field are flagged as
  "potentially-stale" (history preserved, but their maturity is reset to one
  level lower than before, requiring re-confirmation in subsequent rounds).
- The change event is appended to `.agora/history/` with a "backtrack" marker.

This honors how human thought actually works — *iterative, recursive, not
linear*. But silent backtracking is forbidden; the user must signal explicit intent.

### Boundaries

- ❌ Multiple contributors per round (only one leads; Socrates always conducts).
- ❌ Skipping telos to NOESIS (R2-A).
- ❌ Husserl on brownfield without explicit invocation.
- ❌ Material auto-fill without user confirmation step (R3-A).
- ❌ More than 5 AC drafts at once (forces Dihairesis territory prematurely).
- ❌ Silent backtracking (R5-A: explicit intent required).

### Output consumed by

- **Phase 2 round structure** (Stage 2-A.4 — next): receives a `NextRound`
  object and renders the actual question, options, and answer-routing.
- **Termination Gate** (Stage 2-A.8): receives `TERMINATION_CHECK` signal
  and runs the Y2/Y3 logic.
- **Plato Dihairesis (handoff)** (Stage 2-C): receives the locked AC list
  for decomposition into the AC tree.

### Failure modes specifically guarded

- **F2** (purpose visible): every Round carries a `purpose_label` explicitly.
- **F4** (build on prior): planner reads `history` and seeds it back into the
  round; round structure (2-A.4) renders the prior context.
- **F5** (no false binary): material confirmation is multi-select, AC is
  multi-edit; nothing forces ranking of compound input.

---

## Phase 2 — Round Structure [SPEC] (Accepted 2026-04-28)

> **Goal**: Define exactly how a single Phase 2 round is rendered, how the user
> interacts, and how the answer flows back into the seed. The Round Ordering
> SPEC (above) decides *which* round comes next; this SPEC defines what *that*
> round looks like and how it behaves.
>
> **Three I/O modes** (per ADR-0005): the same round engine renders to
> Interactive TUI, JSON CLI, or MCP host depending on context.

### Engine algorithm

```
phase_2_round(next_round: NextRound, ui_mode: tui|json|mcp) -> RoundResult:

  # 1. Render per ui_mode (single engine, three facades)
  if ui_mode == tui:
    rendered = render_tui_round(next_round)        # @clack/prompts
  elif ui_mode == json:
    rendered = render_json_round(next_round)       # stdout structured payload
  elif ui_mode == mcp:
    return mcp_payload(next_round)                 # host LLM renders + responds

  # 2. Collect answer (with backtrack detection)
  answer = collect_answer(rendered, ui_mode)
  if is_backtrack_intent(answer):                  # R5-A from Round Ordering
    return BacktrackRequest(target_field=detect_field(answer))

  # 3. Socratic case-probe (R3-A: load-bearing fields only)
  if next_round.target_field in LOAD_BEARING_FIELDS:
    case = generate_implied_case(answer, current_seed_state)
    probe_response = present_probe_to_user(case, ui_mode)
    answer, aporia = refine_via_probe(answer, case, probe_response)

  # 4. Update seed + history
  apply_to_seed(next_round.target_field, answer)
  append_to_history(round_id, next_round, answer, probe_metadata)

  return RoundResult(
    answer,
    maturity_after,
    aporia_count: 0|1,
    time_taken_ms,
  )

LOAD_BEARING_FIELDS = [
  "telos.statement", "telos.served_good", "telos.failure_signal",
  "form.essential_structure",
  "acceptance_criteria.*",
  # NOT: material.*, efficient.*  (R3-A: probe overhead not justified)
]
```

### TUI rendering — exact mockups

These mockups define the visual contract. The implementation in
`@clack/prompts` must match this layout. Whitespace, dividers, icon
choices, and label placement are all spec, not suggestion.

#### Mockup A: Mode A round (user is expert in this domain)

```
─────────────────────────────────────────────────────────────────
  Round 3 of ~5  ·  Aristotle · Telos
─────────────────────────────────────────────────────────────────

  ⓘ  Why this question?
     Filling: seed.telos.statement (currently empty)
     Without telos, every other choice has no anchor.

  📎 Building on your last answer:
     "I want to remember what I read with a few people occasionally engaging"
                           ↑ from Phase 1 intake

  ?  Why does this exist? What good does it serve?

     ◯  Help me remember and connect ideas (self-knowledge tool)
     ◯  Build a personal brand / professional credibility
     ◯  Have small-circle conversations with thoughtful people
     ◯  Serve a specific external audience (clients, students)

     [Enter a number to pick] · [type your own answer to override] · [Ctrl+C pause]

  > _
─────────────────────────────────────────────────────────────────
```

#### Mockup B: Mode B round (user lacks expertise; recommended path)

```
─────────────────────────────────────────────────────────────────
  Round 7 of ~9  ·  Aristotle · Material
─────────────────────────────────────────────────────────────────

  ⓘ  Why this question?
     Filling: seed.material from your project's detected stack
     Material cause feeds Gate 0 pre-flight checks.

  📎 Detected from your project (Phase 0):
     ◉ Vercel        (.vercel/project.json found)
     ◉ Supabase      (supabase/config.toml found)
     ◉ GitHub Actions (.github/workflows/ found)
     ◉ Stripe        (package.json deps include "stripe")

     [Enter] confirm all  ·  [number] toggle one  ·  [+] add free-form item

  > _
─────────────────────────────────────────────────────────────────
```

#### Mockup C: Socratic case-probe (after a load-bearing answer)

```
─────────────────────────────────────────────────────────────────
  Round 3 · case probe
─────────────────────────────────────────────────────────────────

  📎 You said:
     "I want to remember what I read so I can connect ideas later"

  🔍 Quick test:
     If no one ever read your notes — not even one person — would you
     still write them?

     ◯  Yes — the writing IS the remembering, audience irrelevant
     ◯  No — having even one reader changes what's worth writing
     ◯  Yes but less consistently (audience adds discipline, not direction)

     [Enter a number] · [type to elaborate]  ·  [skip]

  > _
─────────────────────────────────────────────────────────────────
```

#### Mockup D: Aporia detected — refinement proposal (R5-A)

```
─────────────────────────────────────────────────────────────────
  🔄 Aporia detected
─────────────────────────────────────────────────────────────────

  Your answer suggests audience is part of telos.

  Proposed refinement of telos.statement:
     "...remember what I read AND have a small audience to ground it"

     [Enter] accept refined version
     [e]     edit the wording yourself
     [k]     keep the original (mark as deliberately retained despite tension)

  > _
─────────────────────────────────────────────────────────────────
```

### Layout contract (every round)

Every TUI round MUST include, in this order from top to bottom:

1. **Divider** (`─` line, terminal width)
2. **Round header**: `Round {N} of ~{estimate}  ·  {Contributor} · {sub-topic}`
3. **Empty line**
4. **Purpose block** (`ⓘ  Why this question?`) — R1-A
   - Line 1: `Filling: seed.{field} ({current_state})` — what this round resolves
   - Line 2: one-sentence rationale tying to telos or to a prior settled claim
5. **Empty line**
6. **Continuity block** (`📎 Building on your last answer:` OR `📎 Detected from your project:` OR `📎 You said:`) — R2-A
   - Quoted prior answer or detected fact, with provenance arrow
7. **Empty line**
8. **Question block** (`?  {question text}`)
9. **Options block** (when applicable):
   - `◯` for single-select (Mode A); `◉/◯` for multi-select with checkboxes (Mode B material flow)
   - Always 2–4 options when shown (per Mode A rules)
   - **Free-input is NEVER an option** — it's a parallel channel announced in the action line below (F8)
10. **Action line** with bracketed shortcuts: `[Enter] ... · [number] ... · [type] ... · [Ctrl+C]`
11. **Input prompt**: `> _`
12. **Bottom divider**

### Round header — progress display [R4-A]

The `~{estimate}` is intentional:

- `~5` (with tilde) signals **estimated, not promised**
- The estimate is computed at the start of each round from:
  - Current `seed_state` maturity coverage
  - `phase_0_result.size_signal` (informs typical depth)
  - `phase_1_result.intake_word_count` (longer intakes → fewer rounds typically)
- The estimate may *increase* or *decrease* between rounds. When it changes by
  >2, a one-line note is shown: `(estimate revised — current state suggests
  more depth needed)`.
- Never displayed as exact `Round 3 of 5` — that creates false-promise pressure.

### Socratic case-probe trigger [R3-A]

A round triggers a case-probe IFF:

```
should_probe(next_round.target_field, answer) -> bool:
  if target_field in LOAD_BEARING_FIELDS:
    return True
  if target_field is custom AND user explicitly opted-in via `--probe-all`:
    return True
  return False
```

Load-bearing = `telos.*`, `form.essential_structure`, `acceptance_criteria.*`.
Material and efficient are confirm/edit, no probe — over-probing is F-Socrates-2.

The case is generated by the LLM with a strict prompt:
- Use the user's own answer as the input
- Construct ONE concrete scenario the answer *implies*
- Draw scenarios from `phase_0_result.context_docs` if brownfield, else
  generic-but-specific
- NEVER strawman; the implied case must be a fair extension of what the
  user said

### Aporia handling [R5-A]

When the user answers a probe in a way that contradicts their original claim:

1. The contradiction is detected (LLM judgment + structural check on whether
   the implied scenario was rejected)
2. A **refined version** is proposed (LLM rewrite of the original claim,
   accommodating the contradiction)
3. The refined version is shown to the user with three explicit options:
   - `[Enter] accept refined` — refined version replaces the original
   - `[e] edit yourself` — opens inline editor with refined version pre-loaded
   - `[k] keep original` — original claim preserved, but tagged with
     `tension_acknowledged: true` in the seed (the user knows about the
     tension and chose to keep the original anyway)
4. `aporia_count` for the round is incremented (telemetry that surfaces
   in the Y3 termination preview)

**Never auto-apply** the refinement. User control is preserved at every step.

### JSON / MCP rendering — schema

For Mode 2 (JSON) and Mode 3 (MCP), the same round payload is serialized:

```json
{
  "round_id": "round_003",
  "round_number": 3,
  "estimated_total": "~5",
  "contributor": "aristotle",
  "subtopic": "telos.statement",
  "purpose": {
    "filling": "seed.telos.statement",
    "current_state": "empty",
    "rationale": "Without telos, every other choice has no anchor."
  },
  "continuity": {
    "type": "prior_answer",
    "quote": "I want to remember what I read with a few people occasionally engaging",
    "provenance": "phase_1_intake"
  },
  "question": "Why does this exist? What good does it serve?",
  "options": [
    {"id": 1, "label": "Help me remember and connect ideas (self-knowledge tool)"},
    {"id": 2, "label": "Build a personal brand / professional credibility"},
    {"id": 3, "label": "Have small-circle conversations with thoughtful people"},
    {"id": 4, "label": "Serve a specific external audience (clients, students)"}
  ],
  "input_modes": ["select", "free_text"],
  "actions": {
    "select_by_number": "Pick by option ID",
    "free_text": "Type your own answer to override",
    "pause": "Ctrl+C or send {action: 'pause'}"
  }
}
```

In MCP mode, this payload is returned to the host LLM, which renders the
question to the human user and submits the answer back via a follow-up
MCP call. No nested LLM cost (host session does the work).

### Boundaries

- ❌ Free input as a listed option (F8). Always a parallel channel.
- ❌ Purpose label hidden behind a flag (R1-A: always top).
- ❌ Continuity block missing (F4: always present, even round 1 references intake).
- ❌ Options count > 4 in Mode A (forces user to scan; degrades to text dump).
- ❌ Options count = 1 (a "pick this" with no alternative is not a question).
- ❌ Auto-applied aporia refinement (R5-A: user always confirms).
- ❌ Probe on non-load-bearing field by default (R3-A; opt-in only).
- ❌ Exact `Round X of Y` (R4-A: always `~estimate`).

### Output consumed by

- **Round Ordering planner**: receives `RoundResult` to update `seed_state`
  for the next round's planning input.
- **Termination Gate** (Stage 2-A.8): reads `aporia_count` aggregate to
  inform Y3 preview decision.
- **History store** (`.agora/history/{session}/rounds/`): every round's full
  payload + answer is appended for audit and backtrack.

### Failure modes specifically guarded

- **F1** (locale): templated layout strings are locale-validated; question
  text is LLM-generated and must pass locale check before rendering.
- **F2** (purpose): top of every round, mandatory.
- **F3** (no abstract): every question must reference at least one of: a file,
  a prior answer, a detected marker, or a measurable outcome.
- **F4** (build on prior): continuity block required.
- **F5** (no false binary): compound input stays compound; the multi-select
  Mode B round demonstrates this directly.
- **F6** (multidim): each round opens a small space (3-4 options), not a
  single yes/no slot.
- **F7** (no single proposal without alts): aporia refinement always offers
  three explicit responses (accept / edit / keep).
- **F8** (free input not as option): action line announces free input as a
  *channel*, not as a listed option.

---

## Phase 2 — Recommended-options Generation [SPEC] (Accepted 2026-04-28)

> **Goal**: Define how Mode A round options are produced — where they come from,
> in what priority, with what fallbacks. Option quality directly determines
> alignment efficiency: good options = single-keystroke accuracy, bad options =
> constant fallback to free input (defeats the UX promise).
>
> **Constraint**: Round Structure SPEC requires 2–4 options per Mode A round.
> Below 2 → automatic Mode B fallback (R5-A).

### Algorithm

```
generate_options(round: NextRound, seed_state, phase_0_result, history) -> Options:

  candidates = []

  # ─── SOURCE 1 — Project-specific (highest weight) ───
  # LLM extracts candidates from auto-scanned context docs (R1-A)
  if phase_0_result.context_docs:
    project_candidates = llm_extract_from_context(
      target_field: round.target_field,
      docs: phase_0_result.context_docs,
      mode: "extract semantic units relevant to target_field",
    )
    candidates += [tag(c, source=PROJECT_SPECIFIC) for c in project_candidates]

  # ─── SOURCE 2 — Aristotle exemplars (universal categories) ───
  # Curated YAML library, version-controlled (R2-A)
  exemplars = load_exemplars(
    path: f"src/agora/philosophers/aristotle/exemplars/{round.cause}.yaml",
    field: round.target_field,
  )
  candidates += [tag(e, source=EXEMPLAR) for e in exemplars]

  # ─── SOURCE 3 — Prior consistency (LLM-derived from recent history) ───
  # LLM reads last N=3 answers and derives 1-2 candidates that maintain
  # semantic consistency with the user's emerging shape (R3-A)
  if len(history.recent_answers) >= 1:
    prior_candidates = llm_derive_consistent(
      target_field: round.target_field,
      recent_answers: history.recent_answers[-3:],
      seed_state: seed_state,
    )
    candidates += [tag(c, source=PRIOR) for c in prior_candidates]

  # ─── SOURCE 4 — LLM creative fill (only if needed) ───
  # Trigger ONLY when sources 1-3 produced fewer than 3 candidates (R4-A)
  if len(candidates) < 3:
    needed = 3 - len(candidates)
    creative = llm_generate_novel(
      target_field: round.target_field,
      existing: candidates,
      target_count: needed,
    )
    candidates += [tag(c, source=CREATIVE) for c in creative]

  # ─── RANK + DEDUP ───
  ranked = score_and_dedup(candidates)
    score = (
      0.5 * is_source(PROJECT_SPECIFIC)
      + 0.2 * is_source(EXEMPLAR)
      + 0.2 * is_source(PRIOR)
      + 0.1 * is_source(CREATIVE)
    )
    # Dedup by semantic similarity (cosine on embeddings or LLM judgment),
    # preserving the highest-scored representative.

  # ─── COUNT ENFORCEMENT ───
  # Round Structure SPEC: Mode A = 2-4 options
  options = ranked[:4]

  if len(options) < 2:
    # Mode A → Mode B automatic fallback (R5-A)
    return convert_to_mode_b(round, ranked, original_intent="too_few_options")

  return Options(
    items: options,
    source_breakdown: {p: count for source p in candidates},
    mode: A,
  )
```

### Source priority rationale

| Source | Weight | Why this rank |
|--------|--------|----------------|
| 1. Project-specific | 0.5 | The user's own materials → highest trust. F4 (build on prior) naturally satisfied. The user can recognize the option immediately because they wrote (or live with) the source. |
| 2. Aristotle exemplars | 0.2 | Universal-category fallback that guarantees we always have *something* sensible. Curated, deterministic, inspectable. |
| 3. Prior consistency | 0.2 | F4 reinforcement + builds a coherent seed. Catches the pattern "if you said X about telos, the natural form would be Y." |
| 4. LLM creative | 0.1 | Bridge only when sources 1–3 are thin. Pure invention has hallucination risk and no anchor in user materials. Last resort. |

### Source 1 extraction details (R1-A)

LLM is invoked with a strict prompt:

```
You are extracting candidate options for a Phase 2 alignment round.

Target field: {round.target_field}
Field meaning: {field_definition_from_4_causes_or_AC}

Read the following project documents:
{phase_0_result.context_docs}

Identify 0-4 candidate options for the target field that are PRESENT or
IMPLIED in these documents. Each candidate must be:
- A single-clause statement (the user will see it as a one-line option)
- Concretely traceable to a passage in the source docs
- NOT a paraphrase that adds meaning the source did not contain

Respond in JSON:
[
  {"label": "<option label>", "source_passage": "<verbatim quote from source>"},
  ...
]

If the source documents do not contain or imply candidates for this field,
return an empty array. NEVER fabricate.
```

The `source_passage` is verified against the actual document content
(string match) before being added to candidates. Hallucinated passages are
rejected silently.

### Source 2 — Aristotle exemplar library (R2-A)

Lives in `src/agora/philosophers/aristotle/exemplars/` with one file per cause:

```
exemplars/
├── telos.yaml         # canonical telos category exemplars
├── form.yaml          # canonical form exemplars
├── material.yaml      # canonical tech-stack archetypes
├── efficient.yaml     # canonical process patterns
└── acceptance_criteria.yaml  # AC archetype templates
```

Example `telos.yaml`:

```yaml
field: telos.statement
exemplars:
  - label: "self-knowledge tool — primarily for the user themselves"
    archetype: introspective
  - label: "audience-relationship tool — connection with specific others"
    archetype: relational
  - label: "external-impact tool — change something in the world"
    archetype: instrumental
  - label: "credibility / brand tool — public visibility for trust building"
    archetype: reputational
  - label: "operational tool — automate or streamline existing work"
    archetype: utilitarian
```

The library is **community-extensible**. New exemplars require:
1. PR with the candidate exemplar
2. Justification: why is this NOT covered by existing exemplars
3. Maintainer review for redundancy

The library starts small (5–8 exemplars per field) and grows only on demand.

### Source 3 — Prior consistency LLM prompt (R3-A)

```
You are deriving consistent option candidates for the next alignment round.

The user's recent answers (in chronological order):
{history.recent_answers[-3:]}

The current target field: {round.target_field}

Generate 1-2 option candidates that would be SEMANTICALLY CONSISTENT with
the user's pattern so far. Do NOT introduce new directions; only extend
the existing trajectory.

If no consistent candidate exists (e.g. the prior answers don't constrain
the current field), return an empty array.

Respond in JSON:
[
  {"label": "<option label>", "consistency_link": "<which prior answer it extends>"}
]
```

The `consistency_link` is rendered in the option's hover/expand text so the
user understands *why* this option appeared.

### Source 4 — Creative fill trigger (R4-A)

```
if len(candidates) < 3:
  needed = 3 - len(candidates)
  ...
```

The threshold is 3 (not 2) because a 2-option round, while technically valid,
feels narrow. Creative fill targets a healthy 3-option floor before Stage 2-A.7
deduplication.

If creative fill itself returns 0 (the LLM cannot invent valid candidates),
the count proceeds to the Mode B fallback path (R5-A) without retry.

### Mode A → Mode B automatic fallback (R5-A)

When `len(options) < 2` after all sources and ranking:

```
convert_to_mode_b(round, ranked, original_intent) -> ModeBRound:
  best_candidate = ranked[0] if ranked else llm_generate_single_recommendation(round)
  alternatives = ranked[1:3] if len(ranked) > 1 else llm_generate_alternatives(round, best=best_candidate, count=2)

  return ModeBRound(
    recommendation: best_candidate,
    alternatives: alternatives,
    rationale: "Limited project-specific signal for this field; falling back to expert recommendation.",
    user_responses: ["accept", "pick alternative", "free input"],
  )
```

The fallback is announced to the user inline:

```
ⓘ This round is showing fewer options than usual — your project doesn't
  yet have strong signal for {target_field}. Going with my best guess:

  → {best_candidate.label}

  [Enter] accept this  ·  [a] see 2 alternatives  ·  [type] free input
```

Honesty about limited signal is a feature, not a flaw. The user knows when
Agora is high-confidence vs guessing.

### Boundaries

- ❌ Source 1 LLM extraction without `source_passage` verification (no fabrication).
- ❌ Source 4 firing when sources 1-3 already gave 3+ candidates (token waste).
- ❌ Aristotle exemplars added without PR + justification (avoid library bloat).
- ❌ Silent Mode A → Mode B fallback (always announced inline).
- ❌ Options without `source` tag (every option carries provenance for telemetry and inspectability).
- ❌ Dedup that loses provenance — when two sources produce semantically identical options, keep highest-weighted source's provenance.

### Output consumed by

- **Round Structure renderer**: receives `Options.items[]` and renders to
  TUI / JSON / MCP per the round structure SPEC.
- **Telemetry / `agora doctor`**: `source_breakdown` is logged per round
  for analyzing where options come from in real use (informs library
  expansion priorities).
- **Validation gates** (Stage 2-A.7): the `source` tag of the chosen option
  contributes to the maturity calculation (e.g. user picking a PROJECT_SPECIFIC
  option lands at higher maturity faster than picking a CREATIVE one).

### Failure modes specifically guarded

- **F2** (purpose): each option carries `source` provenance, surfacing why
  it appeared.
- **F4** (build on prior): Source 1 and Source 3 both encode this directly.
- **F7** (no single proposal without alts): Mode B fallback always provides
  alternatives, never solo.
- **F8** (free input not as option): free input is the channel, never an
  enumerated item — the action line announces it.

---

## Validation Gates per Claim [SPEC] (Accepted 2026-04-28)

> **Goal**: Decide when a claim (a value assigned to a seed field) is
> "settled enough" to count toward termination. Too loose → immature seed →
> Ralph drift compounds (the 0.9^10 problem). Too strict → loop never
> terminates → user abandons.
>
> **Mental model**: three independent axes; the weakest determines effective
> maturity. A claim cannot bootstrap to Noesis on the strength of one axis.

### Algorithm

```
compute_claim_maturity(field, current_state, history) -> Maturity:
  axis_1 = plato_divided_line_score(field, current_state)
  axis_2 = socratic_survival_score(field, history)
  axis_3 = aristotelian_coverage_score(field, current_state, sibling_fields)

  return min(axis_1, axis_2, axis_3)   # R1-A: chain-of-strength


is_field_settled(field, state, history) -> bool:
  required_floor = REQUIRED_FLOORS[field]
  computed = compute_claim_maturity(field, state, history)
  return computed >= required_floor


REQUIRED_FLOORS = {
  "telos.statement":          NOESIS,
  "telos.served_good":        NOESIS,
  "telos.failure_signal":     DIANOIA,    # R2-A: not Noesis-required
  "form.essential_structure": DIANOIA,
  "form.irreducible_parts":   PISTIS,
  "material.*":               PISTIS,
  "efficient.*":              PISTIS,
  "acceptance_criteria.*":    DIANOIA,
  "ontology.*":               DIANOIA,
}
```

### Axis 1 — Plato Divided Line

```
plato_divided_line_score(field, state) -> Maturity:
  if state.value is empty/null:
    return EIKASIA               # nothing yet

  if state.value exists, no justification:
    return PISTIS                # belief without justification

  if state.justification exists:
    return DIANOIA               # reasoned

  if state.justification AND state.rejected_alternatives (≥1) AND
     each alternative has why_rejected reason:
    return NOESIS                # understood — alternatives examined
```

The Noesis test is operational: *"What alternative did you consider for this
claim, and why did you reject it?"* No alternative articulated → not Noesis.
Period. (Per `docs/philosophy/04-plato-...md`.)

### Axis 2 — Socratic survival

```
socratic_survival_score(field, history) -> Maturity:
  if field NOT in LOAD_BEARING_FIELDS:
    return NOESIS                # axis not applicable; never the bottleneck

  probes = [r for r in history if r.target_field == field and r.was_probe]

  if no probes yet:
    return DIANOIA               # claim exists but unprobed → cannot certify

  if any probe ended in unresolved aporia (user kept original
     with tension_acknowledged):
    return DIANOIA               # R3-A: tension is honest signal, not Noesis

  if probes ≥ 1 AND all resolved (refined or affirmed):
    return NOESIS
```

Round Structure SPEC defined `LOAD_BEARING_FIELDS = telos.*, form.essential_structure, AC.*`.
For non-load-bearing fields (material, efficient), this axis returns NOESIS
(does not constrain). For load-bearing, the axis enforces Socratic discipline.

### Axis 3 — Aristotelian coverage

```
aristotelian_coverage_score(field, state, siblings) -> Maturity:
  required_siblings = SIBLING_REQUIREMENTS.get(field, [])

  if any required sibling is empty:
    return cap_at_DIANOIA        # cannot reach Noesis with incomplete siblings

  return NOESIS


SIBLING_REQUIREMENTS = {
  # R4-A: load-bearing field interdependencies only
  "telos.statement":           ["telos.served_good"],          # mutual
  "telos.served_good":         ["telos.statement"],            # mutual
  "form.essential_structure":  ["telos.statement"],            # form needs telos
  "acceptance_criteria.*":     ["telos.statement", "form.essential_structure"],
  # material.*, efficient.*: no sibling requirements
  # telos.failure_signal:    no sibling requirement (it's nice-to-have)
}
```

The coverage axis encodes ADR-0006's "telos primary" principle structurally:
no claim downstream of telos can reach Noesis until telos is settled.

### Composition rule [R1-A]

```
effective_maturity = min(axis_1, axis_2, axis_3)
```

The weakest axis determines the result. **The strong axes do not compensate
for a weak one.** This is conservative by design — the cost of false-positive
maturity (premature Ralph entry) compounds as 0.9^N. The cost of one extra
round in alignment is one round.

Example: `telos.statement` with
- axis_1 = NOESIS (rejected_alternatives present)
- axis_2 = DIANOIA (probed but kept-with-tension)
- axis_3 = NOESIS (siblings settled)
- effective = DIANOIA → does NOT meet REQUIRED_FLOORS[telos.statement]=NOESIS
- claim is NOT settled; further round needed

### Tension-acknowledged claims [R3-A]

When the user explicitly chooses `[k] keep original with tension_acknowledged`
during aporia handling (Round Structure R5-A):

- Axis 1 (Plato): can still reach NOESIS if rejected_alternatives are
  documented separately (the kept-original claim itself is unchanged)
- Axis 2 (Socratic): caps at DIANOIA (probe ended in unresolved aporia)
- Axis 3 (Aristotelian): unaffected
- Composition: caps at DIANOIA via axis 2

This means **a tension-acknowledged claim cannot reach Noesis**. Honest signal
preserved; user must take action (re-probe, refine, or accept that the field
will remain at DIANOIA — relevant only for fields with a Noesis floor like
`telos.statement`).

### Maturity display to user [R5-A]

Maturity is **not displayed during normal rounds**. Showing it per-round
would gamify the loop — users would optimize for "moving the meter" rather
than for clarity.

Maturity IS displayed in two specific contexts:

1. **`agora status`** — the user explicitly asks for current state. Output
   includes a per-field maturity table:

   ```
   Telos
     statement       NOESIS    ✓ floor met (NOESIS required)
     served_good     NOESIS    ✓ floor met (NOESIS required)
     failure_signal  PISTIS    ✗ below floor (DIANOIA required)
   Form
     essential_structure  DIANOIA  ✓ floor met (DIANOIA required)
     irreducible_parts    PISTIS   ✓ floor met (PISTIS required)
   ...
   ```

2. **Termination preview (Y3)** — when termination becomes possible, the
   pre-lock preview shows the maturity table so the user knows exactly
   what state they're locking in.

Otherwise, maturity is internal to the planner. Users see the *effects*
(round happens / round skipped) not the *measurement*.

### Backtrack interaction [from Round Ordering R5-A]

When a user backtracks via `agora seed --edit <field>`:

- The named field's maturity resets to EIKASIA (its `value` is blanked).
- All fields that name the backtracked field in their `SIBLING_REQUIREMENTS`
  drop to `cap_at_DIANOIA` automatically (axis 3 effect).
- Their other axes are unchanged; the user does not re-probe everything,
  only re-confirms the dependent claims.

The history of the backtracked field's previous state is preserved in
`.agora/history/` for audit. The new state starts fresh.

### Boundaries

- ❌ Composition by max (R1-C rejected): a single strong axis would let
  premature Noesis through.
- ❌ Composition by weighted average (R1-B rejected): adds noise without
  changing the conservative-vs-permissive axis.
- ❌ NOESIS floor on telos.failure_signal (R2-B rejected): predicts user
  cannot make.
- ❌ Tension-acknowledged → NOESIS (R3-C rejected): silently accepting
  unresolved tension is exactly what F-Aquinas-4 (silent overruling) is.
- ❌ Sibling requirements for material/efficient (R4-B rejected): would
  block valid solo-project shapes where these are loosely defined.
- ❌ Per-round maturity display (R5-B rejected): gamification risk.

### Output consumed by

- **Round Ordering planner**: calls `is_field_settled()` to decide which
  field is the next round's contributor target. The first field whose
  REQUIRED_FLOOR is not met becomes the next round's focus.
- **Termination Gate (Y2)** (Stage 2-A.8 next): aggregates `is_field_settled()`
  across all required fields. All required fields settled → Y2 condition met.
- **`agora status`** and **Termination preview Y3**: display the per-field
  maturity table.
- **Ralph Gate 5 (Alignment Check)**: load-bearing field maturities are part
  of the seed's "trust signal" carried into Ralph. Tension-acknowledged
  claims trigger stricter Gate 5 monitoring during Ralph iterations.

### Failure modes specifically guarded

- **F2** (purpose visible): when `is_field_settled()` returns false during
  planning, the next round's `purpose_label` includes which axis caused
  the gating ("axis 2: needs Socratic probe").
- **F-Aquinas-4** (silent overruling): tension-acknowledged claims explicitly
  cap maturity rather than silently inheriting the original Noesis assessment.

---

## Termination Gate (Y2 + Y3) [SPEC] (Accepted 2026-04-28)

> **Goal**: Decide when the Alignment Loop is allowed to end, and how the
> termination moment is presented to the user. Y2 = structural readiness
> (composition of `is_field_settled()` results across all required fields).
> Y3 = optional preview generation when quality threshold met.
>
> **Critical UX rule** (Sang's Stage-1 input, non-negotiable): termination
> is **never silent**. Even when Y2 is satisfied and Y3 preview quality is
> high, the system always asks *"anything else to refine?"* and waits for
> explicit user assent.

### Algorithm

```
check_termination(seed_state, history, phase_0_result) -> TerminationDecision:

  # ─── Y2 — Structural readiness (R1-A: 3 conditions, all required) ───
  all_required_settled = all(
    is_field_settled(field, seed_state, history)
    for field in REQUIRED_FLOORS.keys()
  )

  no_unresolved_divergences = all(
    d.resolved for d in phase_0_result.divergences
  )

  no_pending_backtracks = not history.has_pending_backtrack

  y2_satisfied = all_required_settled \
                 AND no_unresolved_divergences \
                 AND no_pending_backtracks

  if not y2_satisfied:
    return CONTINUE_LOOP   # round-planner picks next round to address gap

  # ─── Y3 — Preview generation (R2-A: quality-gated) ───
  preview = generate_preview(seed_state, history)
  preview_quality = score_preview_quality(preview, seed_state)

  show_preview = preview_quality >= PREVIEW_QUALITY_THRESHOLD  # default 0.75

  # ─── Termination dialog (NEVER silent — Sang's non-negotiable) ───
  return TERMINATION_DIALOG(
    show_preview: show_preview,
    preview: preview if show_preview else None,
    seed_summary: render_seed_summary(seed_state),
    maturity_table: render_maturity_table(seed_state),
    aporia_summary: render_aporia_summary(history),
  )


PREVIEW_QUALITY_THRESHOLD = 0.75   # configurable via .agora/config.toml later
```

### Preview generation

```
generate_preview(seed_state, history) -> Preview:
  # 4-8 line natural-language summary of what implementation will look like.
  # NOT a feature list. NOT a technical spec.
  # First-person sentence-style description.

  return llm_render_preview(
    inputs: seed_state,
    style: "first-person summary, 4-8 lines, no jargon",
    forbidden: [
      "bullet lists",                    # we have the maturity table for that
      "technical details beyond material",  # this is intent preview, not impl
      "promises about timeline",         # never
      "promises about completeness",     # never
    ],
    must_reference: [
      "telos.statement",                 # the why must appear
      "telos.served_good",               # the good must appear
      "form.essential_structure",        # the shape must appear
    ],
  )
```

Example preview:

```
You're building a personal note-taking tool that captures what you read with
enough context for future-self to reconnect with the ideas. The shape is a
local-first CLI with a small set of commands; structure favors retrievability
over presentation. Material cause is settled (Node + SQLite). The first
Ralph iterations will scaffold the capture command and the link primitives;
audience-relationship features (the small-circle aspect) are deferred to
later iterations and tagged as such in the AC tree.
```

### Preview quality scoring

```
score_preview_quality(preview, seed_state) -> float [0.0, 1.0]:
  signals = {
    coherence:           llm_judge(preview, "is this internally coherent?"),
    seed_alignment:      llm_judge(preview, seed_state, "matches seed?"),
    specificity:         ratio(specific_terms, total_words),  # > 0.15 = specific
    length_appropriate:  4 <= line_count <= 8,                # boolean → 1.0/0.0
    no_forbidden_patterns:  no bullet lists, no jargon, no timelines,
  }

  weights = {
    coherence: 0.30,
    seed_alignment: 0.30,
    specificity: 0.20,
    length_appropriate: 0.10,
    no_forbidden_patterns: 0.10,
  }

  return weighted_avg(signals, weights)
```

### Termination dialog UX

```
─────────────────────────────────────────────────────────────────
  ✅ Alignment ready
─────────────────────────────────────────────────────────────────

  All load-bearing claims are settled to the required maturity.
  No unresolved divergences. No pending backtracks.

  📊 Maturity summary:                     (R5-A: always in dialog)
     telos.statement       NOESIS    (3 alts examined)
     telos.served_good     NOESIS    (1 probe, refined once)
     telos.failure_signal  DIANOIA   (above floor)
     form.essential_*      DIANOIA   (1 probe, affirmed)
     form.irreducible_parts PISTIS   (above floor)
     material.*            PISTIS    (4 markers, all confirmed)
     efficient.*           PISTIS    (solo project, 1-line)
     acceptance_criteria   DIANOIA   (4 ACs probed)

  🎯 Aporia history: 2  (telos.statement: 1, form: 1) — both refined
  📎 Tension-acknowledged: 0

  📄 Preview — what Ralph will likely build:    (Y3, only if quality ≥ 0.75)
     You're building a personal note-taking tool that captures what
     you read with enough context for future-self to reconnect with
     the ideas. The shape is a local-first CLI with a small set of
     commands; structure favors retrievability over presentation.
     The first Ralph iterations will scaffold the capture command
     and the link primitives.

  ── Anything else you want to refine before we lock the seed? ──

     ◯  Yes — let me address something
     ◯  No — lock it and proceed to Ralph
     ◯  Show me the full seed (read-only) before deciding

     [Enter a number] · [Ctrl+C pause]

  > _
─────────────────────────────────────────────────────────────────
```

When preview quality < threshold, the `📄 Preview` section is **omitted entirely** (not shown at low quality — bad preview is worse than no preview). The dialog still proceeds; the user is not told *why* preview was suppressed (avoids cognitive load), only the maturity table and aporia summary inform their decision.

### "Yes — refine something" handling [R4-A]

```
on_user_chooses_yes() -> RefinementFlow:
  prompt: "What would you like to refine?"
  user_input: free text

  parsed_target = llm_parse_refinement_intent(
    input: user_input,
    seed_state: seed_state,
    options: [field_path for field_path in seed_state],
  )

  if parsed_target.confidence >= 0.8:
    # Direct backtrack into named field via Round Ordering R5-A mechanism
    return Backtrack(target_field: parsed_target.field)

  if parsed_target.confidence < 0.8:
    # Disambiguate
    follow_up = "I'm not sure which field you mean. Did you mean:"
    show: top 3 candidates with quotes from user_input
    return user_picks_one_or_clarifies()

  # After backtrack completes, check_termination() runs again from the top
```

The natural-language refinement entry path mirrors Round Ordering R5-A
("actually let me change..." prefix). Two paths to backtrack: `agora seed --edit`
explicitly, OR through the termination dialog's "Yes" branch.

### "Show me the full seed" handling

```
on_user_chooses_show_seed() -> ReadOnlyView:
  rendered_seed = render_full_seed_markdown(seed_state, history)
  open_in_pager(rendered_seed)   # less / more / pager-of-choice
  # On pager exit, return to termination dialog (re-render with same data)
```

The full-seed view is the locked-in artifact preview, with maturity per
field, all rejected_alternatives, all probe records, all aporia events.
This is the "are you sure?" moment.

### Termination acceptance — what happens

```
on_user_chooses_no_lock_it() -> SeedLocked:
  # 1. Final write of seed.md and seed.json
  # 2. seed.metadata.locked_at = now()
  # 3. seed.metadata.alignment_session_id = current_session
  # 4. seed.metadata.alignment_round_count = len(history.rounds)
  # 5. seed.metadata.aporia_count = total
  # 6. seed.metadata.tension_acknowledged_fields = list

  # 7. Plato Dihairesis runs (handoff — Stage 2-C)
  ac_tree = plato_dihairesis_decompose(seed.acceptance_criteria)
  write(".agora/ac_tree.json", ac_tree)

  # 8. State transition
  state.phase = "ready_for_ralph"

  # 9. User-facing confirmation
  display:
    """
    ✅ Seed locked.

    Next: `agora ralph` to begin implementation.
    Or: `agora seed --edit <field>` to re-open alignment.
    """
```

### Boundaries

- ❌ Silent termination (Sang's non-negotiable). Always shows dialog.
- ❌ Dialog with 2 options (R3-B rejected). 3 is the sweet spot.
- ❌ Dialog with 4+ options (R3-C rejected). Edit-specific-field belongs to
  `agora seed --edit`, not dialog.
- ❌ Always-show preview regardless of quality (R2-B rejected). Bad preview
  damages trust more than its absence.
- ❌ Preview always suppressed (R2-C rejected). When quality is high, preview
  is the most useful trust-building artifact in the loop.
- ❌ Forced field-selector for "Yes refine" (R4-B rejected). Free input + LLM
  parsing is lighter on the user.
- ❌ Maturity summary in `agora status` only (R5-C rejected). The termination
  moment needs full information at hand.

### Output consumed by

- **CONTINUE_LOOP** result: handed back to Round Ordering planner for next
  round selection.
- **TERMINATION_DIALOG** "No, lock it": triggers seed.metadata write,
  Plato Dihairesis decomposition (Stage 2-C handoff), state transition to
  `ready_for_ralph`.
- **TERMINATION_DIALOG** "Yes, refine": triggers backtrack into the
  parsed field via R5-A mechanism, then re-runs check_termination.
- **TERMINATION_DIALOG** "Show full seed": pager view, then re-renders dialog.
- **Ralph Loop entry**: reads `seed.metadata.locked_at` to know the seed is
  ready; reads `seed.metadata.tension_acknowledged_fields` to flag fields
  needing stricter Gate 5 monitoring.

### Failure modes specifically guarded

- **F2** (purpose visible): the dialog announces what each option does
  ("lock it and proceed to Ralph" — explicit consequence).
- **F4** (build on prior): maturity summary, aporia summary, and preview
  all explicitly reference the alignment session's history.
- **F7** (no single proposal without alts): three explicit options always.
- **F8** (free input not as option): "Yes refine" path uses free input
  *after* the user chooses that option, not as an enumerated dialog item.
- Sang's non-negotiable: silent termination is structurally impossible —
  Y2 satisfaction *only* unblocks the dialog, never bypasses it.

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

3. ~~**Phase 2 round structure** (Stage 2-A.4)~~ ✅ Resolved 2026-04-28. See "Phase 2 — Round Structure [SPEC]" above.

4. ~~**Round ordering** (Stage 2-A.5)~~ ✅ Resolved 2026-04-27. See "Phase 2 — Round Ordering [SPEC]" above.

5. ~~**Recommended-options generation** (Stage 2-A.6)~~ ✅ Resolved 2026-04-28. See "Phase 2 — Recommended-options Generation [SPEC]" above.

6. ~~**Validation gates per claim** (Stage 2-A.7)~~ ✅ Resolved 2026-04-28. See "Validation Gates per Claim [SPEC]" above.

7. ~~**Termination Gate Y2 + Y3** (Stage 2-A.8)~~ ✅ Resolved 2026-04-28. See "Termination Gate (Y2 + Y3) [SPEC]" above.

8. **Brownfield vs greenfield branching** (Stage 2-A.9) — partially resolved
   - Phase 0 classification rule is now SPEC (R1-A)
   - Remaining: how Phase −1 and Phase 2 differ between the two

9. **Mini-alignment re-entry from Ralph (Z2)** (Stage 2-A.10) — open
   - Shorter form of alignment loop for re-entry mid-Ralph
   - How much context to re-confirm vs trust-from-prior-seed

---

*This document is being incrementally promoted from placeholder to formal spec
across Stage 2-A rounds. See `docs/stage-2/NOTES.md` for the running plan.*
