# Husserl — Runbook

> **Module**: `src/philosophers/husserl.ts`
> **Phase**: Alignment Loop, **Phase −1** (optional, default-on for greenfield)
> **Method (one line)**: Epoché — bracket assumed solution-frames before any other question is asked
> **Inherited from**: `docs/philosophy/01-husserl-epoche.md`
> **Status**: [SPEC] (Accepted 2026-05-03, Stage 5-A.3)
> **Revision**: 1

---

## 1. When this is called

**Trigger**: At the very start of an Alignment Loop, before Phase 0 (auto-scan) consumes its results.

**Pre-conditions in `.agora/`**:
- No `seed.json` exists yet (greenfield first-run) OR
- User explicitly invoked `agora bracket` (re-bracketing mid-project — Stage 1 carve-out)

**Default activation**:
- **Greenfield project** (no `.git`, no codebase signal): Phase −1 default-on
- **Brownfield project**: Phase −1 default-off (existing code already commits a frame)
- Override either way via runtime decision when user types unexpected scope

**Skip conditions**:
- Recent invocation: a `defended_frame` artifact exists in `.agora/seed.json` and was created within last 24 hours on the same scope
- New request is consistent with existing `defended_frame` (no contradiction with chosen_form / audience / brackets_considered)
- User passed `--skip-bracket` flag (Stage 3-B.4 / 3-B.5; recorded in seed metadata as override)

When skipped, Agora prints the one-line surfacing:
```
Skipping Phase −1 because [reason]. Run `agora bracket` to invoke explicitly.
```
(Per concept doc — visibility prevents silent skipping from becoming default.)

**Cross-references**: Stage 2-A (alignment-loop.md) Phase −1 SPEC; Stage 3-B.4 (`agora new --skip-bracket`); Stage 4-A.3 (`[bypass_alerts]` does NOT cover this — Phase −1 skip is per-invocation, not persistent).

## 2. Input contract

```typescript
export interface HusserlInput {
  raw_intent: string;           // user's first-utterance request, verbatim
  cwd_signal: {
    is_greenfield: boolean;     // .git absence + empty project signal
    detected_form?: string;     // brownfield: detected stack hint (from probes/markers.ts)
    detected_audience?: string; // brownfield: hint from README / package.json
  };
  invocation: "auto" | "explicit_bracket"; // explicit when `agora bracket` was used
  prior_frame?: DefendedFrame;  // present when re-bracketing (consistency check input)
  locale: "en" | "ko";          // Stage 3-A.1 R5-A
}
```

`raw_intent` source: Stage 2-A Phase 1 open intake (8KB cap). For greenfield, this is the first user utterance that triggered Agora.

`cwd_signal`: produced by Phase 0 auto-scan if available, but Phase −1 can run BEFORE Phase 0 (concept doc places Husserl strictly before scan). When Phase −1 runs first, `cwd_signal` carries only the cheap signals (`.git` exists?).

## 3. Method

### 3.1 Concept

Husserl observed (`docs/philosophy/01-husserl-epoche.md`) that humans cannot describe an experience without smuggling in **interpretive frames** that feel like part of the experience. A user saying *"I want to build a blog"* has already smuggled the answer is software, the form is post + comments, the audience is "readers." Epoché is the discipline of **bracketing** — temporarily suspending — those frames so the underlying phenomenon can be re-examined. The user does not abandon their frame; they **defend** it. The defense becomes the artifact.

### 3.2 Operationalization

```
1. Receive HusserlInput (raw_intent + cwd_signal + invocation + locale)
2. Articulate the underlying experience:
   a. Re-prompt the user: "Before what to build — describe the EXPERIENCE
      that prompted this. What were you doing/feeling/needing right before
      you reached for a tool?"
   b. Capture as raw_experience (free text, ≤ 500 chars)
3. Present three brackets (in order):
   a. Software Bracket: "Is the answer to this experience necessarily
      software? What if it were a habit, a meeting, a conversation?"
   b. Form Bracket: "If software, what shape have you assumed it must take?
      What other shapes could carry the same experience?"
   c. Audience Bracket: "Who is this for? Past self / future self / others?
      Are they the same?"
4. For each bracket, capture (alternative_considered, defense)
   - If defense < 50 chars: re-ask once with "That was quick — what made
     the alternative obviously wrong?" (F-Husserl-1 mitigation)
5. Detect surprising findings:
   "Was there a moment where you noticed an assumption you didn't know
    you had?" → captured as surprising_findings[]
6. Build DefendedFrame artifact
7. If prior_frame was provided (re-bracketing case):
   compare new defended_frame against prior; flag inconsistencies
8. Return HusserlOutput
```

Husserl never proposes solutions during Phase −1 (section 7 forbidden #1). It only constructs brackets and records defenses.

### 3.3 Failure mode it specifically addresses

**Solution-frame contamination**: AI-coding pipelines optimize what the user said, not what the user meant. When the user said "blog" and meant "personal connection-making across reading," the implementation drifts from the start. The 0.9^10 math compounds especially viciously here — every Phase 2 question lands on an unbracketed frame, sharpening the wrong thing iteratively. Husserl prevents this by making the user articulate (and defend) the frame BEFORE any sharpening begins.

## 4. Prompt

### 4.1 husserl:phase-minus-1-bracket

```text
## System prompt

You are conducting Husserl's Phase −1 Epoché for an Agora alignment loop.
Your role is to bracket the user's solution-frame BEFORE any other interview
question. You are NOT proposing solutions, evaluating ideas, or critiquing
choices. You are ONLY constructing brackets that surface assumptions the
user has smuggled in.

Hard rules:
1. NEVER suggest a solution. Even if the user explicitly asks "what would
   you build?" — defer with: "That's the wrong question for this phase.
   First, the brackets."
2. NEVER affirm or deny the user's chosen frame. Bracketing is neutral —
   the goal is articulation, not judgment.
3. Each bracket presents an ALTERNATIVE the user must defend against. The
   alternative must be CONCRETE (not "consider other options" — name one).
4. When a defense is shorter than 50 characters, ask one follow-up:
   "That was quick — what made the alternative obviously wrong?"
5. After all three brackets, ask: "Was there a moment where you noticed
   an assumption you didn't know you had?" Capture verbatim.

## User prompt template

The user's raw intent: "{raw_intent}"

Project context: {cwd_signal_summary}
Invocation type: {invocation}
{prior_frame_diff_if_present}

Begin Phase −1. Conduct the three brackets in order:
  1. Software Bracket — alternative: {software_alternative_for_this_intent}
  2. Form Bracket    — alternative: {form_alternative_for_this_intent}
  3. Audience Bracket — alternative: {audience_alternative_for_this_intent}

For each bracket:
  - Present the alternative as a one-line question
  - Wait for user response
  - If defense < 50 chars, follow up once
  - Capture (alternative_considered, defense) verbatim

Then ask the surprising-findings question and capture the response verbatim.

Return a structured DefendedFrame per the output contract. Do not propose
what to build — that is Phase 2's job.
```

The `{software_alternative_for_this_intent}` etc. placeholders are filled by Husserl runner: cheap heuristic + LLM-backed if needed. Examples encoded in the markers file (Stage 6 implementation):
- Intent mentions "remember / connect / read" → Software alt: physical notebook + index cards
- Intent mentions "share / publish" → Software alt: existing hosted platform vs custom
- Intent mentions "monitor / track" → Software alt: scheduled review meeting

Default fallback if no heuristic match: ask LLM to generate one concrete alternative (separate cheap call before the main bracketing prompt).

## 5. Output contract

```typescript
export interface DefendedFrame {
  raw_experience: string;       // ≤ 500 chars; the underlying experience
  chosen_form: string;          // user's defended choice (their original frame)
  brackets_considered: {
    software_bracket: BracketDefense;
    form_bracket: BracketDefense;
    audience_bracket: BracketDefense;
  };
  surprising_findings: string[]; // moments where user noticed unconscious assumption
  invocation: "auto" | "explicit_bracket";
  consistency_with_prior?: {     // present only when re-bracketing
    prior_frame_id: string;
    contradictions: string[];    // empty array = consistent
  };
}

export interface BracketDefense {
  considered_alternative: string;
  defense: string;               // user's defense of original choice
  defense_followup_triggered: boolean; // F-Husserl-1 mitigation fired?
}

export interface HusserlOutput {
  defended_frame: DefendedFrame;
  ready_to_proceed: boolean;     // false if user asked to abort/restart
}
```

### Worked example

Input:
```
raw_intent: "I want to build a blog"
cwd_signal: { is_greenfield: true }
invocation: "auto"
locale: "en"
```

Output:
```yaml
defended_frame:
  raw_experience: |
    "I keep having half-finished thoughts about books and articles I read,
    and they evaporate. I want a place to put them so they're available
    later when I'm thinking about something related."
  chosen_form: "personal blog with chronological posts"
  brackets_considered:
    software_bracket:
      considered_alternative: "physical notebook + index cards"
      defense: |
        "I tried that. The retrieval is too slow when I want to find a
        related thought from 6 months ago. Search is the core need."
      defense_followup_triggered: false
    form_bracket:
      considered_alternative: "private Discord with a reading-notes channel"
      defense: |
        "Conversation format pulls me toward chatting, not reflecting.
        Durable structure is the goal, not real-time engagement."
      defense_followup_triggered: false
    audience_bracket:
      considered_alternative: "small public audience for accountability"
      defense: |
        "Public audience would make me self-edit away the half-formed
        thoughts that are actually most valuable for connection-making."
      defense_followup_triggered: false
  surprising_findings:
    - "I had assumed 'blog' meant 'public.' Hadn't realized the audience
       I cared about was my own future self at 6+ months."
  invocation: "auto"
ready_to_proceed: true
```

Note that `chosen_form` evolved from "blog" to "personal blog with chronological posts" during bracketing — the user's frame got *more specific*, not abandoned. That's correct Husserl operation.

## 6. Quality bar

**Quantitative**:
- All 3 brackets present in `brackets_considered` (no skipping)
- Each `defense` ≥ 20 chars (below this, follow-up was triggered AND user re-answered)
- `raw_experience` ≥ 100 chars (forces user to articulate beyond a noun-phrase)

**Qualitative tells of "Husserl did its job"**:
- `surprising_findings` is non-empty in ≥ 70% of greenfield Phase −1 runs
  (per concept doc: "the moments where the user noticed an assumption they
  did not know they had" is the actual work product)
- At least one of the three `BracketDefense.defense` fields is ≥ 100 chars
  (substantive defense, not dismissive)
- `chosen_form` differs (even slightly) from `raw_intent` after bracketing —
  bracketing should sharpen the frame, not preserve it verbatim

When all three qualitative tells fire, Husserl is operating well. When zero
fire, Phase −1 likely became ceremony.

## 7. Forbidden in this runbook

- ❌ **F-Husserl-1**: Performing brackets ritually with one-line dismissive defenses (mitigation: 50-char follow-up rule)
- ❌ **F-Husserl-2**: Over-bracketing — bracketing every Phase 2 question afterward (Husserl is a phase, not a stance — exits cleanly after `ready_to_proceed: true`)
- ❌ **F-Husserl-3**: Generic brackets that don't match domain (mitigation: detect domain from `cwd_signal` for non-software projects; v1 ships software brackets only — non-software detection routes to fallback that asks user to nominate the bracket)
- ❌ Suggesting solutions (system prompt rule #1)
- ❌ Affirming or denying user's chosen frame (system prompt rule #2)
- ❌ Abstract alternatives ("consider other options" — must be concrete)
- ❌ Skipping the surprising-findings question
- ❌ Re-bracketing within same Alignment Loop session (one Phase −1 per session; second invocation requires `agora bracket` explicit user call)
- ❌ Mutating any file outside `.agora/` (read cwd signals only; never write to project root)

## 8. Test contract

### Unit tests (`tests/unit/philosophers/husserl.test.ts`)

1. **Schema conformance**:
   - `HusserlInput` Zod parse accepts all 4 required fields + optional `prior_frame`
   - `HusserlOutput.defended_frame` matches `DefendedFrame` interface
   - `BracketDefense.defense_followup_triggered` is boolean (no string "true")
   - All 3 brackets present in output regardless of input shape

2. **Quality-bar threshold**:
   - Fixture: realistic greenfield intents (`tests/fixtures/intents/greenfield-blog.txt`, `greenfield-tracker.txt`, `greenfield-tool.txt`) → output meets all 3 quantitative thresholds
   - Fixture: brownfield re-bracket → `consistency_with_prior` populated correctly
   - At least 70% of fixtures yield non-empty `surprising_findings` (qualitative tell #1)

3. **Negative tests (forbidden behaviors fire)**:
   - Mock LLM response that proposes a solution → runner detects "solution proposal during Epoché" and re-prompts
   - Mock LLM response with `defense.length < 50` → follow-up question fires; `defense_followup_triggered: true` is set on next response
   - Mock LLM response that affirms user's choice ("good thinking") → runner re-prompts to remove affirmation
   - Input missing `raw_intent` → throws `buildAgoraError("config.invalid-toml" or new "user.aborted" if mid-flow)` — never silently proceeds

4. **Locale parity (en/ko)**:
   - Fixture in `en` and parallel `ko` translation produce equivalent output structure
   - Both locales surface ≥ 1 surprising_finding on the same fixture
   - Defense lengths in both locales meet the 50-char threshold (Korean defense lengths measured in Hangul characters, not bytes)

### Integration tests participated in

- `tests/integration/alignment-loop.test.ts` — Phase −1 entry/exit + handoff to Phase 0
- `tests/integration/cli-new.test.ts` — `agora new` with greenfield triggers Husserl by default
- `tests/integration/cli-bracket.test.ts` — explicit `agora bracket` mid-project triggers Husserl regardless of brownfield default

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/husserl.ts` | Implementation (this module) |
| `docs/philosophy/01-husserl-epoche.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/husserl.md` | This runbook |
| `tests/unit/philosophers/husserl.test.ts` | Unit tests |
| `tests/fixtures/intents/greenfield-*.txt` | Bracketing fixtures |
| `messages/{en,ko}.json` keys | `philosophers.husserl.*` namespace |

## 10. Boundaries (Husserl-specific rejections)

- ❌ **Domain-specific brackets at v1** (e.g. hardware/research/institutional): v1 ships Software/Form/Audience only. Non-software detection routes to user-nominated brackets via fallback prompt. Adding domain catalogs requires concrete demand + ADR.
- ❌ **Brackets as mid-Phase-2 interruption**: Phase −1 is a phase, not a per-question gate. Bracketing during Phase 2 questions defeats Aristotle's structuring rhythm.
- ❌ **Auto-bracketing on every brownfield invocation**: would make Husserl ceremonial. Brownfield default-off respects the existing frame.
- ❌ **Solution suggestion during Phase −1**, even when user explicitly asks: defer to Phase 2. Husserl never crosses this line.
- ❌ **Quantitative scoring of "frame quality"**: bracketing produces a defended artifact, not a scored one. The user's defenses are theirs, not graded.

## 11. Examples / Anti-examples

### Good example (Phase −1 done well)

Input: greenfield project; `raw_intent: "I want to build a personal task tracker"`

Method trace:
```
1. Husserl asks for raw_experience → user articulates "I lose track of
   small commitments to myself, then feel guilty when I remember them."
2. Software Bracket: "Could a daily 10-minute review meeting with yourself
   serve this without software?" → user defends software (mobility,
   capture-anywhere need)
3. Form Bracket: "If software, must it be a list? What about a calendar
   showing past commitments-to-self?" → user pivots: "Actually, calendar
   feels closer to what I want — temporal context matters."
4. Audience Bracket: "Past self vs future self vs accountability partner?"
   → user: "Future self. Hadn't thought of it as audience before."
5. Surprising findings: "I started saying 'task tracker' but realized I
   want a record of past commitments to compare against actual behavior —
   that's not really a tracker."
```

Output: `chosen_form` shifted from "task tracker" to "personal calendar of past commitments-to-self." That's correct Husserl operation — bracketing sharpened the frame.

Why this is right: the brackets produced concrete alternatives, defenses surfaced reasoning the user didn't have when they said "task tracker," and a `surprising_findings` entry captured the unconscious assumption.

### Anti-example (F-Husserl-1 fires)

Input: same as above

Anti-trace:
```
1. Software Bracket: "Could a meeting do this?" → user: "no, software."
2. Form Bracket: "Other shape?" → user: "no, list is fine."
3. Audience Bracket: "Who's it for?" → user: "me."
4. Surprising findings: "no."
```

Why this is wrong:
- All three defenses are < 50 chars → F-Husserl-1 should have fired and asked the follow-up. Runner did NOT fire it.
- Surprising findings empty → quality bar #1 violated; bracketing was ceremonial
- `chosen_form` unchanged from `raw_intent` → frame was not sharpened

Detection: section 8 unit test #3 (negative tests — `defense_followup_triggered` should be true when defense < 50 chars; runner that doesn't fire follow-up fails this test).

## 12. Revision history

| Rev | Date       | Change                          | By         |
|-----|------------|---------------------------------|------------|
| 1   | 2026-05-03 | Initial Stage 5-A.3 SPEC        | Sang Rhee  |
