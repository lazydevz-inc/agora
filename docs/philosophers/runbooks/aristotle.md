# Aristotle — Runbook

> **Module**: `src/philosophers/aristotle.ts`
> **Phase**: Alignment Loop, **Phase 2 structuring** — orders the entire round sequence
> **Method (one line)**: Four Causes — telos primary, then form / material / efficient
> **Inherited from**: `docs/philosophy/03-aristotle-four-causes.md`
> **Status**: [SPEC] (Accepted 2026-05-03, Stage 5-A.3)
> **Revision**: 2

---

## 1. When this is called

**Trigger**: At the start of Phase 2 of Alignment Loop, then on every round transition.

**Pre-conditions in `.agora/`**:
- Phase −1 (Husserl) completed (or skipped per its skip conditions) → `defended_frame` exists
- Phase 0 auto-scan completed → `cwd_signal` available
- Phase 1 open intake completed → `raw_intake` available

**Per-round invocation**: Aristotle decides which cause-slot to investigate next. The order is **fixed and not user-configurable** (concept doc + section 7 forbidden #1):
1. **Telos** first (always — must reach Noesis per Plato Divided Line before others matter)
2. **Form** second (once telos settled)
3. **Material** third (often partially answered by Phase 0 auto-scan)
4. **Efficient** fourth (often delegated to project tooling, not deeply interviewed)

**Interrupt condition**: When telos becomes unstable mid-round (user response on form/material/efficient contradicts telos), Aristotle interrupts and returns to telos. The rest is moot until telos holds.

**Skip conditions**: None for telos. For brownfield projects, `material` may auto-fill from Phase 0 with maturity tagged Pistis (concept doc default — material maturity floor is Pistis); user can leave it as-is or upgrade.

**Cross-references**: Stage 2-A (alignment-loop.md) Phase 2 round structure; Stage 2-B.4 (Gate 5 reads `four_causes.telos.served_good` directly); Stage 2-B.3 (defines a `telos_alignment` critic added to Gate 3 + Gate 4 Videtur — telos serves as the basis for that critic's objections, distinct from how Sed contra cites telos as evidence).

## 2. Input contract

```typescript
export interface AristotleInput {
  defended_frame: DefendedFrame; // from Husserl Phase −1 (Stage 5-A.3 husserl runbook output)
  cwd_signal: {
    is_brownfield: boolean;
    detected_stack?: string[];   // material hints (e.g. ["typescript", "next.js", "supabase"])
    detected_patterns?: string[]; // efficient hints (e.g. ["solo_dev", "pnpm_workspace"])
  };
  raw_intake: string;            // Phase 1 open intake (≤ 8KB)
  prior_causes?: Partial<FourCauses>; // present on subsequent rounds (ongoing build-up)
  current_round: number;         // 0 = first round, increments per round
  locale: "en" | "ko";
}
```

`prior_causes`: as Phase 2 progresses, each cause fills in. Aristotle reads what's been settled to decide what's next AND to detect telos instability (interrupt condition).

## 3. Method

### 3.1 Concept

Aristotle observed (`docs/philosophy/03-aristotle-four-causes.md`) that to understand any thing, you must understand it from four angles — material (what it's made of), formal (its essential structure), efficient (the process that makes it), and final/telos (what it's ultimately for). Modern requirements collapse these into "purpose" and lose the others. Telos is primary: an acorn becomes an oak *because that is what acorns are for*. Without telos, the other three are mere description.

For software: most requirements docs capture form ("build a button that does X"), some capture material ("use React"), few capture efficient ("team of 2 over 4 weeks"), almost none capture telos. The 0.9^10 math compounds especially hard when telos is missing — every iteration drifts in the direction of formal cause and after 10 iterations the result is technically correct but spiritually wrong.

### 3.2 Operationalization

```
1. Receive AristotleInput
2. Determine next cause to investigate:
   if four_causes.telos NOT YET at Noesis (per Plato):
     → next_cause = "telos"
   elif four_causes.form NOT YET at Dianoia:
     → next_cause = "form"
   elif four_causes.material NOT YET at Pistis:
     → next_cause = "material"
   elif four_causes.efficient NOT YET at Pistis:
     → next_cause = "efficient"
   else:
     → all causes meet maturity floors; Phase 2 ready to terminate
3. Detect telos instability:
   if next_cause != "telos" AND user's last response contradicts current
   four_causes.telos statement:
     → INTERRUPT; reset next_cause = "telos"; flag instability
4. Construct cause-specific prompt (telos has 3 sub-prompts; others single)
5. Send to ClaudeRunner via orchestrator
6. Receive user response; categorize:
   - For telos: extract (statement, served_good, success_signal, failure_signal)
   - For form: extract (essential_structure, irreducible_parts)
   - For material: extract (tech_stack, data_shape, infrastructure)
   - For efficient: extract (who, when, how)
7. Hand off to Socrates for case-probing of the new cause-statement
8. After Socrates returns ElenchedClaim, hand off to Plato for maturity tagging
9. Update four_causes with the maturity-tagged result
10. Return AristotleOutput
```

Aristotle does NOT probe its own questions — that's Socrates's job. Aristotle structures *what* gets asked. Socrates structures *how each answer gets tested*. Plato measures the maturity of the result.

### 3.3 Failure mode it specifically addresses

**Telos collapse**: Without explicit four-cause structure, AI conversations gravitate to whatever the user mentioned first — usually material ("I want to build something with WebSockets") or form ("I want a comment system"). The interview anchors there, telos never gets articulated, and Ralph builds something that satisfies the surface request but not the underlying purpose. Aristotle prevents this by **forcing telos first** with non-negotiable order, and by interrupting subsequent rounds when telos shows instability.

## 4. Prompt

Aristotle has **4 distinct prompts**, one per cause. Each is fired by the orchestrator after Aristotle's `next_cause` decision.

### 4.1 aristotle:telos-question

```text
## System prompt

You are extracting the TELOS (final cause / what-it's-ultimately-for) from
the user. Telos is the most load-bearing claim in the entire alignment seed.
Without it, every other cause is mere description.

Hard rules:
1. NEVER accept a noun-phrase that names the artifact as telos.
   Forbidden: "It's a comment system" / "It's a notes app" / "It's an API."
   Always re-ask: "What good does {user's noun} serve?"
   Telos is a verb-phrase about the served good.
2. ASK THREE QUESTIONS in order, capturing each:
   a. "Why does this exist?" → statement
   b. "What good does it serve? (Name the goodness, not the activity.)"
      → served_good
   c. "How will you know if you built the thing but it failed at its purpose?"
      → failure_signal
3. The failure_signal question often surfaces a DIFFERENT telos than what
   the user first stated. When it does, capture both and ask which is real.
4. NEVER lead — open questions only. Forbidden: "Is your telos X?"
5. NEVER skip the failure_signal question. A telos with no failure signal
   is Pistis, not Noesis (per Plato Divided Line).

## User prompt template

The user's defended frame (from Phase −1):
- raw_experience: {defended_frame.raw_experience}
- chosen_form: {defended_frame.chosen_form}

The user's open intake (Phase 1):
{raw_intake}

Round: {current_round}

Ask the THREE telos questions in order. Capture each verbatim. Do not
synthesize them into one combined question.

After all three are answered, return AristotleOutput with the telos
sub-fields populated. Hand off to Socrates for case-probing the telos
statement.
```

### 4.2 aristotle:form-question

```text
## System prompt

You are extracting the FORM (essential structure / what-shape-it-takes) from
the user, AFTER telos is settled (at Noesis per Plato Divided Line).

Hard rules:
1. Form questions reference the settled telos. Format: "Given your telos
   {telos.statement}, what shape carries that telos?"
2. Capture two sub-fields:
   a. essential_structure: high-level shape (e.g. "single-page CRUD app
      with offline-first sync")
   b. irreducible_parts: components without which the telos cannot be served
3. NEVER let the user list features. Form is structure, not feature list.
   When user lists features, ask: "Which of those is essential to the telos,
   and which is decoration?"

## User prompt template

Settled telos:
- statement: {four_causes.telos.statement}
- served_good: {four_causes.telos.served_good}
- failure_signal: {four_causes.telos.failure_signal}

Defended frame:
- chosen_form: {defended_frame.chosen_form}

Ask the form questions. Capture (essential_structure, irreducible_parts).
Hand off to Socrates for case-probing the form statement.
```

### 4.3 aristotle:material-question

```text
## System prompt

You are extracting the MATERIAL cause (what-it's-made-of) from the user.
For brownfield projects, much of this is auto-detected; verify and capture.

Hard rules:
1. When material is offered before telos, REBUT: "Noted. {tech} is a material
   cause. What is the telos that you believe needs {tech}?" Do not capture
   material first.
2. Capture three sub-fields:
   a. tech_stack: language + framework + key libs (≤ 10 entries)
   b. data_shape: shape of the primary data (one paragraph)
   c. infrastructure: where it runs (one paragraph)
3. For brownfield, pre-fill from cwd_signal.detected_stack and ask user
   to confirm/extend. Do not re-interview what's already detected.

## User prompt template

Settled telos: {four_causes.telos.statement}
Settled form: {four_causes.form.essential_structure}

Brownfield detection:
- detected_stack: {cwd_signal.detected_stack}
- detected_patterns: {cwd_signal.detected_patterns}

Ask the material questions, pre-filling from detection. Capture
(tech_stack, data_shape, infrastructure). Hand off to Socrates ONLY if
user added material beyond detection (otherwise material at Pistis is
the floor and we're done).
```

### 4.4 aristotle:efficient-question

```text
## System prompt

You are extracting the EFFICIENT cause (who/when/how-process) from the user.
Even for solo projects, capture this — it informs Ralph's verbosity, gate
strictness, and over-engineering tolerance.

Hard rules:
1. Capture three sub-fields:
   a. who: people involved (e.g. "solo: one dev", "team of 2")
   b. when: timeline + cadence (e.g. "evenings, 30 min sessions")
   c. how: process tools and sequence (e.g. "TDD with vitest, deploy on push")
2. NEVER skip even for solo projects. Solo IS an efficient cause that
   constrains everything downstream.
3. Pre-fill from cwd_signal.detected_patterns when possible.

## User prompt template

Settled telos: {four_causes.telos.statement}
Settled form: {four_causes.form.essential_structure}
Settled material: {four_causes.material.tech_stack}

Detected efficient patterns: {cwd_signal.detected_patterns}

Ask the efficient questions. Capture (who, when, how). Pistis is the
floor — keep it brief; this is the lightest of the four causes.
```

## 5. Output contract

```typescript
export interface FourCauses {
  telos: {
    statement: string;          // verb-phrase about served good (NOT artifact name)
    served_good: string;        // the goodness this serves
    success_signal: string;     // (derived) — how we know it worked
    failure_signal: string;     // how we know it didn't
    maturity: "noesis";         // MUST be noesis to lock seed
    rejected_alternatives?: { alternative: string; why_rejected: string }[]; // populated by Plato
  };
  form: {
    essential_structure: string;
    irreducible_parts: string[];
    maturity: "dianoia" | "noesis";
  };
  material: {
    tech_stack: string[];
    data_shape: string;
    infrastructure: string;
    maturity: "pistis" | "dianoia" | "noesis";
  };
  efficient: {
    who: string;
    when: string;
    how: string;
    maturity: "pistis" | "dianoia" | "noesis";
  };
}

export interface AristotleOutput {
  next_cause: "telos" | "form" | "material" | "efficient" | null; // null when all causes met floor
  updated_causes: Partial<FourCauses>; // only the cause Aristotle just processed
  telos_instability_detected: boolean; // true if interrupt condition fired
  ready_for_termination_check: boolean; // true when all 4 causes meet maturity floors
}
```

### Worked example (telos round)

Input:
```
defended_frame: {
  chosen_form: "personal note-taking software with backlinking",
  raw_experience: "Half-formed thoughts about books evaporate..."
}
raw_intake: "I read 50 books a year and want to capture insights for later"
prior_causes: {} // first round
current_round: 0
```

Telos round trace:
```
1. Q1: "Why does this exist?"
   A1: "So I can find half-formed thoughts later when working on something."
2. Q2: "What good does it serve? Name the goodness, not the activity."
   A2: "Helps me make connections across reading I'd otherwise lose."
3. Q3: "How will you know if you built it but it failed at its purpose?"
   A3: "If after 6 months I'm still searching my memory instead of the
        tool when I think 'I read something about this once.'"
```

Output:
```yaml
next_cause: form  # telos meets Noesis after Plato tags
updated_causes:
  telos:
    statement: "Help me make connections across reading I'd otherwise lose."
    served_good: "Connection-making across time"
    success_signal: "After 6 months, I reach for the tool first when
                     remembering 'I read something about this once.'"
    failure_signal: "After 6 months, I'm still searching my memory instead
                     of the tool."
    maturity: noesis  # Plato will verify
telos_instability_detected: false
ready_for_termination_check: false  # form/material/efficient still pending
```

The user said "blog" → "personal note-taking software with backlinking" → "Help me make connections across reading I'd otherwise lose." Each layer was sharper. That's correct Aristotle operation.

## 6. Quality bar

**Quantitative**:
- Telos round captures all 3 sub-fields (statement / served_good / failure_signal) — no skipping
- `telos.statement` is a verb-phrase, not a noun-phrase (lint check: no leading article + noun like "A blog" / "A tracker")
- `failure_signal` is concrete (≥ 30 chars, mentions a specific observable outcome)
- For brownfield, `material.tech_stack` matches `cwd_signal.detected_stack` ≥ 80% (else user explicitly added/removed)

**Qualitative tells of "Aristotle did its job"**:
- `telos.failure_signal` answer prompted the user to refine `telos.statement` in ≥ 30% of sessions (per concept doc: failure_signal often surfaces a different telos than first stated)
- All 4 causes captured before termination (none at empty/null when `ready_for_termination_check: true`)
- Telos instability interrupt fired ≤ 2 times per session (more than that signals user is genuinely confused, not just refining)

## 7. Forbidden in this runbook

- ❌ **F-Aristotle-1**: Accepting noun-phrase as telos (e.g. "It's a comment system") — runner re-asks until verb-phrase about served good emerges
- ❌ **F-Aristotle-2**: Material cause leading the interview — when material is offered before telos, runner explicitly rebuts
- ❌ **F-Aristotle-3**: Efficient cause skipped for solo projects — Pistis is still required, even one-line
- ❌ **F-Aristotle-4**: Telos at Pistis declared "good enough" — termination gate (Plato Divided Line) refuses to close; user override `--accept-low-telos-maturity` records flag in metadata
- ❌ **User-configurable cause order**: order is fixed (telos → form → material → efficient). Configurability defeats the structure.
- ❌ **Combining telos sub-questions into one prompt**: each of the 3 sub-questions fires separately to allow user reflection between them
- ❌ **Skipping the failure_signal question**: a telos with no failure signal is Pistis, not Noesis
- ❌ **Probing causes ourselves**: probing is Socrates's job. Aristotle structures *what*; Socrates tests *how*.
- ❌ **Re-interviewing material auto-detected from cwd_signal**: respect detection, ask only for confirmation/extension
- ❌ **Calling `llm/*` directly**: layer rule (Stage 5-A.1)

## 8. Test contract

### Unit tests (`tests/unit/philosophers/aristotle.test.ts`)

1. **Schema conformance**:
   - `AristotleInput` Zod parse accepts/rejects per declared fields
   - `next_cause` is one of the 4 union literals or null
   - `FourCauses.telos.maturity` is literal `"noesis"` (Zod refinement)
   - `updated_causes` is a Partial<FourCauses> (TS structural test)

2. **Quality-bar threshold**:
   - Fixture: greenfield with realistic intent → telos round produces verb-phrase statement (regex: not starting with article+noun pattern)
   - Fixture: brownfield with detected_stack → material round pre-fills ≥ 80% of detected entries
   - Multi-round fixture → cause order is exactly telos → form → material → efficient (no reordering)

3. **Negative tests (forbidden behaviors fire)**:
   - Mock LLM returns telos="A note-taking app" → runner detects noun-phrase pattern, re-asks (F-Aristotle-1)
   - Mock user response contains tech first ("I want to use WebSockets") in a telos-round prompt → runner emits rebuttal prompt (F-Aristotle-2)
   - Solo project skip-attempt for efficient → runner refuses, requires at least one-line capture (F-Aristotle-3)
   - User attempts to skip failure_signal sub-question → runner refuses, marks telos maturity Pistis (cannot lock seed without override)
   - Material cause arrives before telos in input → runner re-orders to telos first

4. **Locale parity (en/ko)**:
   - en + ko fixtures produce equivalent four_causes structure
   - Korean noun-phrase detection patterns (e.g. "~앱이에요", "~시스템") trigger F-Aristotle-1 correctly
   - Failure_signal in ko captures equivalent specificity (≥ 30 Hangul chars)

### Integration tests participated in

- `tests/integration/alignment-loop.test.ts` — Phase 2 cause ordering + handoff to Socrates per round
- `tests/integration/handoff.test.ts` — `four_causes.telos` becomes Gate 5 criterion in Ralph
- `tests/integration/cli-default.test.ts` — `agora` (default) shows next_cause from current round

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/aristotle.ts` | Implementation (this module) |
| `docs/philosophy/03-aristotle-four-causes.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/aristotle.md` | This runbook |
| `tests/unit/philosophers/aristotle.test.ts` | Unit tests |
| `messages/{en,ko}.json` keys | `philosophers.aristotle.*` namespace |

## 10. Boundaries (Aristotle-specific rejections)

- ❌ **User-configurable cause order**: defeats structuring rationale. Telos-first is non-negotiable.
- ❌ **Skipping any of the 4 causes** even when it feels trivial: efficient for solo projects still must be captured (one-liner is fine).
- ❌ **Combining causes into single prompt** (e.g. "tell me telos AND form together"): defeats reflection between sub-questions.
- ❌ **Aristotle owning case-probing**: that's Socrates. Boundary is hard. Aristotle structures *what*; Socrates tests *how*.
- ❌ **5th cause** ("aesthetic cause" or similar) — would require ADR superseding the 5-philosopher cap (MANIFESTO V) AND a Stage 1 / Stage 5 reopening, given Aristotle's four-cause framework is the structuring principle of Phase 2.
- ❌ **Skipping telos when brownfield has prior project** — even brownfield needs explicit telos for the new feature/scope; inheriting prior project's telos is Pistis at best.

## 11. Examples / Anti-examples

(Per R4-A guidance: omitted because Four Causes telos extraction reads as
a structured extraction with clear method. The operationalization +
worked example in section 5 + Quality bar + Forbidden rules together
provide sufficient calibration. Add examples in revision 2 if
implementation surfaces calibration ambiguity.)

## 12. Revision history

| Rev | Date       | Change                                                                                                                                       | By         |
|-----|------------|----------------------------------------------------------------------------------------------------------------------------------------------|------------|
| 1   | 2026-05-03 | Initial Stage 5-A.3 SPEC                                                                                                                     | Sang Rhee  |
| 2   | 2026-05-03 | Post-review fixes: removed stale ADR-0006 cite from §10 (ADR-0006 is Gate 0 infrastructure, unrelated to philosopher cap); rephrased §1 Stage 2-B.3 cross-ref (telos_alignment is a Videtur critic, not a Sed-contra criterion). | Sang Rhee  |
