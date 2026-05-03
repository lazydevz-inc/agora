# Socrates — Runbook

> **Module**: `src/philosophers/socrates.ts`
> **Phase**: Alignment Loop, **Phase 2 conductor** — active in every round
> **Method (one line)**: Elenchus — case-probe load-bearing claims toward aporia
> **Inherited from**: `docs/philosophy/02-socrates-elenchus.md`
> **Status**: [SPEC] (Accepted 2026-05-03, Stage 5-A.3)
> **Revision**: 1

---

## 1. When this is called

**Trigger**: Once per claim during Phase 2 of Alignment Loop.

A "claim" is one of:
- Aristotle's telos statement (most load-bearing — always probed)
- Aristotle's form / material / efficient cause statement (probed if load-bearing per maturity floor)
- An acceptance criterion (AC) the user proposed
- Any explicit user assertion the orchestrator tagged `load_bearing: true`

**Pre-conditions in `.agora/`**:
- Phase 0 auto-scan complete (codebase markers needed for case construction)
- Aristotle has produced at least one cause-statement to probe

**Skip conditions**:
- Claim tagged `load_bearing: false` (decorative claims pass without probe — F-Socrates-2 mitigation)
- Claim already has `elenchus.aporia_count >= 1` from earlier round AND no contradicting input since
- User passed `--skip-elenchus` for this specific claim (rare; recorded in seed metadata)

Socrates is the **conductor**, not a phase. Aristotle picks *what* to probe; Socrates probes; Plato measures the result's maturity. The three operate in lockstep per Phase 2 round.

**Cross-references**: Stage 2-A (alignment-loop.md) Phase 2 round structure; Stage 2-B.4 (`drift_score` LLM call shares the case-construction approach); Stage 4-A.4 (`probes/markers.ts` provides codebase signals for case construction).

## 2. Input contract

```typescript
export interface SocratesInput {
  claim: {
    id: string;                  // e.g. "telos_001", "form_002", "ac_005"
    content: string;             // verbatim user statement
    cause: "telos" | "form" | "material" | "efficient" | "ac" | "other";
    load_bearing: boolean;       // true → probe; false → skip
    prior_aporia_count: number;  // 0 on first probe
  };
  cwd_signal: {
    is_brownfield: boolean;
    detected_files?: string[];   // up to 20 most-relevant from auto-scan
    detected_patterns?: string[]; // e.g. ["uses_jwt_auth", "has_test_suite"]
  };
  prior_round_history: PriorClaim[]; // for quoted-prior continuity (F2 prevention)
  locale: "en" | "ko";
}

export interface PriorClaim {
  id: string;
  content: string;
  outcome: "confirmed" | "refined" | "aporia_then_refined";
}
```

`prior_round_history`: every prior probed claim in this Alignment Loop session. Used to construct cases that quote prior answers, preventing the "questions float context-free" failure (Stage 1 F4 forbidden pattern).

`cwd_signal.detected_files` and `detected_patterns`: from `probes/markers.ts` (Stage 4-A.4 R4-A). Brownfield case construction prefers cases drawn from real files (F-Socrates-3 mitigation).

## 3. Method

### 3.1 Concept

Socrates noticed (`docs/philosophy/02-socrates-elenchus.md`) that people hold beliefs with confidence exceeding their evidence — because they have never tested the belief against its own implications. Elenchus is the four-step technique that closes this gap: solicit definition → construct concrete case the belief implies → probe → reach **aporia** (productive confusion). The goal is NOT to teach. The goal is to bring the user to the point of saying *"I do not know what I thought I knew"* — at which point they re-articulate sharper.

The signature of good elenchus: the user thinks *"Oh — I hadn't considered that case. Let me say what I meant more carefully."*

### 3.2 Operationalization

```
1. Receive SocratesInput (claim + cwd_signal + prior_round_history + locale)
2. Decide: probe or pass?
   - if claim.load_bearing == false → return ConfirmedClaim(no probe), exit
3. Construct one concrete case the claim implies:
   a. Try cwd-grounded case (brownfield, cite a real file/pattern)
   b. If no fit, construct a similar real-world case (cite domain — e.g.
      "in a typical SaaS dashboard...")
   c. Last resort: explicit construction prefaced with "If we imagine that..."
   d. NEVER: pure invention without grounding (F-Socrates-3 mitigation)
4. Quote at least one prior claim by ID when applicable (F2 prevention).
   "Earlier you said {prior_claim.content}. Given that, if your current claim
    is X, then case Y follows. Is that right?"
5. Send the case-probing question to ClaudeRunner (via orchestrator)
6. Receive user response. Categorize:
   - "yes" → claim strengthened; case becomes scope-defining example
   - "no, that's not what I meant" → APORIA; user re-articulates → repeat from step 3
     with refined claim
   - "yes but with exception X" → claim refined with explicit exception
7. Build ElenchedClaim artifact
8. Track aporia_count for telemetry (concept doc: aporia_count is the
   "claim got worked over hardest" signal)
9. Return SocratesOutput
```

The case is the work product. A claim that has not been case-probed is not a settled claim; it is a hypothesis dressed as a conclusion.

### 3.3 Failure mode it specifically addresses

**Confidence-without-test**: AI conversation defaults to flattering rephrase ("So what you're really saying is..."). The user feels heard, the AI feels useful, no actual testing happens. Result: load-bearing claims enter Ralph as Pistis-level beliefs (Plato Divided Line) — they will drift catastrophically across iterations. Socrates prevents this by forcing every load-bearing claim to survive at least one concrete case-probe before being recorded as settled.

## 4. Prompt

### 4.1 socrates:elenchus-round

```text
## System prompt

You are conducting Socrates's elenchus on a single load-bearing claim.
Your role is to construct ONE concrete case that the claim implies, present
it to the user, and observe whether the user's response confirms, refines,
or reaches aporia.

Hard rules:
1. The case MUST be concrete — name a specific scenario, not "consider edge
   cases." The user must be able to picture it.
2. The case MUST be grounded:
   - Brownfield: cite a real file or pattern from cwd_signal.detected_files
     or detected_patterns. Example format: "In src/orders/router.ts, you
     handle X this way. If your current claim is Y, would you handle Z
     the same way?"
   - Greenfield: cite a similar real-world case. Format: "In a typical
     [domain], people who claim X typically end up doing Y when Z. Does
     your claim survive that?"
   - Last resort: explicit hypothetical, prefaced with "If we imagine that..."
3. NEVER paraphrase the user's claim back as if it were profound (F-Socrates-1).
   Forbidden phrases: "So what you're really saying is", "If I understand
   correctly", "It sounds like you mean".
4. Quote at least ONE prior_round_history claim by content when relevant.
   Format: "Earlier you said {prior_claim.content}. Given that..."
5. NEVER strawman. The case should be a FAIR implication of the claim, not
   a caricature designed to make the user wrong (F-Socrates-3).
6. ASK ONE QUESTION. Multiple questions in one turn defeat the elenchus
   rhythm.

## User prompt template

Claim being probed (id: {claim.id}, cause: {claim.cause}):
"{claim.content}"

Project context:
- Brownfield: {is_brownfield}
- Detected files (if brownfield): {detected_files_top_5}
- Detected patterns: {detected_patterns}

Prior round history (most recent 3, for quoted-prior continuity):
{prior_round_history_top_3}

Round goal:
- If the user has not yet been case-probed on this claim
  (claim.prior_aporia_count == 0), construct ONE concrete case and ask.
- If the user already reached aporia and re-articulated this claim
  (claim.prior_aporia_count >= 1), construct ONE NEW case that tests
  the refined version. Do NOT re-ask the original case.

Construct the case per the rules above. Ask exactly one question. Wait
for user response. Then categorize the response and return ElenchedClaim
per the output contract.

If after the response the user's wording shows aporia signals
("oh — I hadn't thought of that", "let me say it more carefully", "wait,
that's not quite what I meant"), set outcome: aporia_then_refined and
capture the refined_content verbatim.
```

## 5. Output contract

```typescript
export interface ElenchedClaim {
  claim_id: string;
  original_content: string;        // verbatim from input
  case_probed: {
    case: string;                  // the case Socrates constructed
    grounding: "cwd_file" | "cwd_pattern" | "real_world" | "hypothetical";
    grounding_ref?: string;        // file path or domain when grounded
    quoted_prior_id?: string;      // when prior claim was cited
  };
  user_response: string;           // verbatim user reply
  outcome:
    | "confirmed"                  // user agreed; case becomes scope example
    | "refined_with_addition"      // user added a condition / exception
    | "aporia_then_refined";       // user reached aporia, re-articulated
  refined_content?: string;        // present iff outcome != "confirmed"
  aporia_count: number;            // 0 if confirmed, +1 if aporia
  unsurfaced_objections: string[]; // cases probed where user didn't commit either way
  load_bearing_pass: boolean;      // false ONLY if claim.load_bearing was false (skipped)
}

export interface SocratesOutput {
  elenched_claim: ElenchedClaim;
  ready_for_plato_maturity_check: boolean; // true when ready for Divided Line tagging
}
```

### Worked example

Input:
```
claim: {
  id: "telos_001",
  content: "I want notes to be searchable",
  cause: "telos",
  load_bearing: true,
  prior_aporia_count: 0
}
cwd_signal: { is_brownfield: false }
prior_round_history: [
  { id: "exp_001", content: "Half-formed thoughts about books evaporate",
    outcome: "confirmed" }
]
```

Output:
```yaml
elenched_claim:
  claim_id: telos_001
  original_content: "I want notes to be searchable"
  case_probed:
    case: |
      "Earlier you said half-formed thoughts evaporate. If 'searchable' is
      the telos, picture this: 6 months from now you remember a vague
      thought about 'attention as a finite resource' and you search 'attention.'
      Three results come back. None is the half-formed thought you wanted.
      Was the telos satisfied?"
    grounding: real_world
    quoted_prior_id: exp_001
  user_response: |
    "No — actually that's exactly the problem. Searchable isn't enough.
    I need to find half-formed thoughts I can't quite remember the words for.
    The real telos is closer to 'discoverable from adjacent context' than
    'searchable.'"
  outcome: aporia_then_refined
  refined_content: |
    "I want notes to be DISCOVERABLE from adjacent context — not just
    keyword-searchable."
  aporia_count: 1
  unsurfaced_objections: []
  load_bearing_pass: true
ready_for_plato_maturity_check: true
```

The user reached aporia (`oh — searchable isn't enough`), re-articulated, and the telos shifted from "searchable" to "discoverable from adjacent context." The 0.9^10 math benefits enormously: every Phase 2 + Ralph iteration now lands on the right telos.

## 6. Quality bar

**Quantitative**:
- Every load-bearing claim has `case_probed.case` populated (not empty)
- `case_probed.grounding` is `cwd_file` or `cwd_pattern` for brownfield ≥ 60% of the time
- `prior_round_history` quoted in ≥ 50% of probes after the first round
- Aporia rate (across all probed claims in a session) ≥ 1 in 5 — when below, Socrates triggers a deliberately stronger case (F-Socrates-4 mitigation)

**Qualitative tells of "Socrates did its job"**:
- User responses contain re-articulation language ("let me say that more precisely", "actually no, what I meant was") in ≥ 40% of probes
- `refined_content` is sharper (more specific, more constrained) than `original_content` — not just a synonym swap
- `unsurfaced_objections` is empty by end of session (every probed case got user commitment)

When all three qualitative tells fire across a session, Socrates is operating well. When zero fire, Phase 2 is ceremonial.

## 7. Forbidden in this runbook

- ❌ **F-Socrates-1**: User-restate / sycophantic paraphrase ("So what you're really saying is...") — runner pre-checks generated questions for these patterns and regenerates
- ❌ **F-Socrates-2**: Probing decorative claims that aren't load-bearing — `claim.load_bearing` gates the entire flow
- ❌ **F-Socrates-3**: Strawman cases that misrepresent the claim — `case_probed.grounding` must be `cwd_file`/`cwd_pattern`/`real_world`; pure invention forbidden
- ❌ **F-Socrates-4**: Zero aporia after 5+ probes (probing is shallow) — runner generates one stronger case when aporia rate < 1 in 5
- ❌ Multiple questions in one turn — defeats elenchus rhythm
- ❌ Telling the user what their claim "really means" — Socrates ASKS; never tells
- ❌ Re-asking the same case after a confirmed/refined response — each round is a NEW case
- ❌ Probing without quoting at least one prior claim after round 1 — context-free questions violate F4 (Stage 1)
- ❌ Calling `llm/*` directly — philosophers route through orchestrator (Stage 5-A.1 layer rule)

## 8. Test contract

### Unit tests (`tests/unit/philosophers/socrates.test.ts`)

1. **Schema conformance**:
   - `SocratesInput` Zod parse accepts/rejects per declared fields
   - `ElenchedClaim.outcome` is one of the 3 union literals (TS exhaustive)
   - `refined_content` is undefined iff outcome === "confirmed"
   - `aporia_count` is integer ≥ 0

2. **Quality-bar threshold**:
   - Brownfield fixture (`tests/fixtures/projects/brownfield-react-vercel/`) → ≥ 60% of probes use `cwd_file` or `cwd_pattern` grounding
   - Multi-round session fixture → `prior_round_history` quoted in ≥ 50% of round-2+ probes
   - Synthetic "user always agrees" fixture → after 5 probes with zero aporia, runner generates one deliberately stronger case (F-Socrates-4 detection)

3. **Negative tests (forbidden behaviors fire)**:
   - Mock LLM response containing "So what you're really saying is" → runner detects sycophantic pattern, regenerates (F-Socrates-1)
   - Mock LLM response with `case_probed.grounding === "hypothetical"` AND brownfield input with available files → runner re-prompts with file-grounded case requirement
   - Mock LLM response with multiple questions in one turn → runner truncates to first question + warning
   - Skip when `claim.load_bearing === false` — output has `load_bearing_pass: false` and case_probed is null
   - When `claim.prior_aporia_count >= 1`, runner constructs NEW case (not original) — verified by case content diff

4. **Locale parity (en/ko)**:
   - Same fixture in en + ko produces equivalent output structure
   - Aporia detection keywords for ko (e.g. "아 — 그건 생각 못 했네", "다시 말하면") parsed correctly
   - Case construction respects locale conventions (Korean cases cite Korean-context examples in greenfield)

### Integration tests participated in

- `tests/integration/alignment-loop.test.ts` — Phase 2 round full cycle (Aristotle picks → Socrates probes → Plato tags maturity)
- `tests/integration/handoff.test.ts` — claims marked `aporia_then_refined` flow correctly into seed.json with refined content (not original)

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/socrates.ts` | Implementation (this module) |
| `docs/philosophy/02-socrates-elenchus.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/socrates.md` | This runbook |
| `tests/unit/philosophers/socrates.test.ts` | Unit tests |
| `tests/fixtures/projects/brownfield-*/` | Brownfield case-grounding fixtures |
| `messages/{en,ko}.json` keys | `philosophers.socrates.*` namespace |

## 10. Boundaries (Socrates-specific rejections)

- ❌ **Probing every claim regardless of load-bearing**: F-Socrates-2 directly. Decorative claims (e.g. "I prefer dark mode" in a project where theme isn't a telos-bearer) pass without probe.
- ❌ **Multiple cases per probe**: each round constructs ONE case. Multiple cases dilute the user's attention and break the elenchus rhythm.
- ❌ **Confidence scoring on case quality**: Socrates produces an artifact, not a graded one. Plato's Divided Line measures maturity downstream.
- ❌ **Probing in Ralph loop**: Socrates exits at Alignment Loop close. Ralph deviations get logged; they do not re-trigger Socrates (concept doc + Aristotle runbook §"When Aristotle steps back" pattern).
- ❌ **Sharing case construction with Aquinas**: Aquinas constructs *objections*, not *implications*. Different cognitive shape; do not unify the prompt.
- ❌ **Auto-classifying user response sentiment**: aporia detection uses explicit linguistic markers (concept doc keywords), not sentiment analysis. Sentiment is too noisy.

## 11. Examples / Anti-examples

### Good example (real elenchus, brownfield)

Input claim: `"I want the API to be RESTful"` in a project where `src/api/` already mixes REST + GraphQL.

Method trace:
```
1. Brownfield detected. cwd_signal.detected_files includes:
   src/api/router.ts, src/api/graphql.ts
2. Case constructed (cwd_file grounding):
   "Earlier you said 'simple data shapes are the priority.' I see in
   src/api/graphql.ts you have a query that joins 4 tables in one request.
   If your current claim is 'RESTful,' would the equivalent be 4 separate
   GET endpoints + client-side composition?"
3. User: "Hmm. No, that's worse for the mobile client. Maybe I don't
   actually want pure REST. I want REST for simple resources, GraphQL
   for the join-heavy reads."
4. Outcome: aporia_then_refined.
   refined_content: "I want REST for simple resources and GraphQL for
   join-heavy reads — not pure REST."
5. aporia_count: 1
```

Why right: case grounded in real file (`src/api/graphql.ts`), quoted prior claim, surfaced an unconscious assumption ("pure REST"), refined_content is sharper than original.

### Anti-example (F-Socrates-1 fires)

Input claim: `"I want the API to be RESTful"`

Anti-trace:
```
1. Generated question: "So what you're really saying is that you value
   the predictability and discoverability of REST conventions. Is that
   accurate?"
2. User: "Yeah, exactly."
3. Outcome: confirmed.
4. aporia_count: 0
```

Why wrong: sycophantic paraphrase pattern ("So what you're really saying is"), no concrete case, no aporia. The user feels heard but learned nothing about the friction in their existing codebase. F-Socrates-1 forbidden pattern.

Detection: section 8 unit test #3 — runner pre-checks generated questions for the forbidden phrase list and regenerates.

## 12. Revision history

| Rev | Date       | Change                          | By         |
|-----|------------|---------------------------------|------------|
| 1   | 2026-05-03 | Initial Stage 5-A.3 SPEC        | Sang Rhee  |
