# Aquinas — Runbook

> **Module**: `src/philosophers/aquinas.ts`
> **Phase**: Ralph Loop, **Gates 3 (UI/UX) and 4 (Technical Quality)** — once per iteration per gate
> **Method (one line)**: Disputatio — Videtur / Sed contra / Respondeo / Ad singula (per-objection ruling, never vote)
> **Inherited from**: `docs/philosophy/05-aquinas-disputatio.md`
> **Status**: [SPEC] (Accepted 2026-05-03, Stage 5-A.3)
> **Revision**: 1

---

## 1. When this is called

**Trigger**: At Ralph Loop **Gate 3 (UI/UX Quality)** and **Gate 4 (Technical Quality)** of every iteration that exceeds the complexity threshold.

**Pre-conditions in `.agora/`**:
- `seed.json` locked (telos available for Sed contra criterion)
- `ac_tree.json` exists (relevant AC nodes for this iteration's scope)
- Gates 1 (deterministic) and 2 (functional QA) already passed for this iteration
- This iteration's diff exists in `iterations/{id}/`

**Skip conditions** (F-Aquinas-5 mitigation — gate severity scaling):
- Trivial change: sub-10-line diff AND no new modules → skip Aquinas, use one-pass critic instead
- Iteration is `--skip-gate-{3,4}` per Stage 2-B.7 (with mandatory `--reason` recorded in state.json metadata)

**Cross-references**: Stage 2-B.3 (10 critic personas selected by trigger); Stage 2-B.4 (Gate 5 alignment check is downstream — Aquinas runs at 3+4, not 5); Stage 4-A.3 `[gates.3.critics]` / `[gates.4.critics]` config knobs; ADR-0008 (parallel Ralph Architecture — Aquinas Disputatio is the dominant per-iteration LLM cost).

## 2. Input contract

```typescript
export interface AquinasInput {
  iteration_id: string;
  gate: "uiux" | "technical_quality";        // Gate 3 or Gate 4
  proposition: string;                        // claim being adjudicated
                                              // (e.g. "This iteration's code changes
                                              //  meet the project's technical quality bar.")
  iteration_context: {
    diff: string;                             // unified diff of changes
    affected_files: string[];
    relevant_ac_node_ids: string[];           // from ac_tree.json
    telos: string;                            // from four_causes.telos.statement
    served_good: string;                      // from four_causes.telos.served_good
    failure_signal: string;                   // from four_causes.telos.failure_signal
    rejected_alternatives: { alternative: string; why_rejected: string }[]; // from Plato
    prior_precedents: PrecedentRef[];         // similar-shape modules previously accepted
  };
  selected_critics: CriticPersona[];          // from critics/selection.ts trigger-based selection
  complexity_score: number;                   // 0..1; below threshold → skip Aquinas
  locale: "en" | "ko";
}

export interface CriticPersona {
  id: string;                                 // e.g. "tech-solid", "ui-typography"
  description: string;
  prompt_key: string;                         // points into prompt-library
}

export interface PrecedentRef {
  file_path: string;                          // e.g. "src/handlers/order.ts"
  iteration_id: string;
  acceptance_summary: string;
}
```

## 3. Method

### 3.1 Concept

Aquinas perfected (`docs/philosophy/05-aquinas-disputatio.md`) the medieval *disputatio* — the most refined deliberation technique humanity has developed. It outperforms voting and even modern adversarial debate. Four parts:

1. **Videtur quod...** — *"It seems that..."* — N independent objections at full strength
2. **Sed contra...** — *"But on the contrary..."* — one authoritative case FOR the proposition with concrete evidence
3. **Respondeo dicendum...** — *"I respond..."* — the master's OWN analysis (not synthesis, not vote — independent position)
4. **Ad primum, ad secundum...** — *"To the first, to the second..."* — separate response to each original objection

Why vote-based consensus fails: objections aren't equivalent (serious vs trivial count the same), majority gives no info on dissent reasoning, dissenter's argument is silenced rather than addressed. Disputatio forces objections to be steel-manned, master to take own position, every objection answered individually.

### 3.2 Operationalization

```
1. Receive AquinasInput
2. Check skip condition: if complexity_score < threshold OR diff < 10 lines:
   → return one-pass critic verdict (no full disputatio)
3. Stage A — Videtur (parallel):
   a. For each critic in selected_critics, fire critic-specific prompt
      (prompts owned by critics/, not Aquinas — Aquinas orchestrates)
   b. Each critic returns ONE strong objection (severity + claim + grounds)
   c. De-duplicate by semantic clustering (NOT text matching)
   d. Merged objection notes raised_by: [critic_ids] — increases severity
      when multiple raised independently (F-Aquinas-1 mitigation)
4. Stage B — Sed contra:
   a. Single high-tier prompt for case-FOR-the-proposition
   b. MUST cite concrete evidence (test results, AC IDs, prior_precedents)
   c. Citations validated against iteration_context.relevant_ac_node_ids
      and prior_precedents (F-Aquinas-2 mitigation)
5. Stage C — Respondeo:
   a. Judge model produces own analysis
   b. First paragraph FORBIDDEN from referencing Stage A or B (F-Aquinas-3
      mitigation) — judge must articulate independent position before
      acknowledging objections
   c. Verdict: approved / conditional / rejected
6. Stage D — Ad singula:
   a. For EACH objection from Stage A, produce ruling:
      - Concedo  — "I concede this objection. Implementation must change."
      - Distinguo — "I distinguish: true in case X but not case Y."
      - Nego     — "I deny this objection because [reason]."
   b. Every objection gets a ruling — including minor ones (F-Aquinas-4)
   c. Each ruling includes action when concedo (what to change)
7. Derive overall_outcome from rulings:
   - any concedo on critical-severity → revise_and_continue
   - all distinguo or nego → approved
   - majority concedo → reject_and_re-iterate (rare)
8. Build Verdict artifact
9. Return AquinasOutput
```

### 3.3 Failure mode it specifically addresses

**Vote-driven consensus**: Most multi-model evaluation collapses N model opinions into a majority vote. The minority's argument disappears, the majority's reasoning is invisible, severity differences are flattened. Long Ralph loops fail this way: minor objections quietly accumulate uncorrected because each one was outvoted; eventually the implementation drifts past the telos. Aquinas prevents this by **answering every objection separately on its own merits with explicit ruling**. No silent overruling. The cost is verbosity. The value is preventing the failure mode that destroys long Ralph loops.

## 4. Prompt

Aquinas has 4 prompts. Stage A (videtur) prompts live in `critics/` (each critic persona owns its own prompt — see `docs/philosophers/runbooks/_template.md` is for philosophers, not critics; critic prompts are in `critics/definitions/` per Stage 5-A.1 module layout). Aquinas owns Stages B, C, D.

### 4.1 aquinas:videtur (orchestration only — actual prompts in critics/)

```text
## System prompt (orchestration)

You are orchestrating Stage A (Videtur) of Aquinas's disputatio. You do
NOT generate objections — that's the critics' job. You orchestrate critic
firing and de-duplication.

For each critic in selected_critics:
  - Fire the critic's prompt with iteration_context
  - Collect their single strongest objection
  - Capture (raised_by, severity, claim, grounds)

After all critics return:
  - Cluster objections by semantic similarity (NOT text matching)
  - Merge clusters; preserve raised_by[] list per merged objection
  - Increase severity of multi-critic-raised objections

Hard rules:
1. NEVER critique the critic's objection — that's Sed contra / Respondeo's job.
2. NEVER drop an objection because it seems "minor" — minor objections
   matter (F-Aquinas-4).
3. De-duplication preserves the COUNT and IDENTITIES (raised_by[3 critics]).
   Never reduce a 3-raised objection to a 1-raised one silently.

## User prompt template

Iteration context:
- gate: {gate}
- diff: {diff_summary}  (full diff embedded as attachment)
- affected_files: {affected_files}
- telos: {telos}
- relevant_ac_node_ids: {relevant_ac_node_ids}
- prior_precedents: {prior_precedents}

Critics to fire (in parallel): {selected_critics_with_prompt_keys}

After all critics return, cluster + merge + return objections list.
```

### 4.2 aquinas:sed-contra

```text
## System prompt

You are constructing Sed contra — the single strongest case FOR the
proposition. You are NOT a vote — you are a high-tier articulation of
"why this is right despite the objections."

Hard rules:
1. MUST cite concrete evidence:
   - Specific AC IDs (from relevant_ac_node_ids) the iteration satisfies
   - Specific test results (from Gate 1/2 outputs)
   - Specific prior_precedents (cite file_path + iteration_id) where
     similar shapes were previously accepted
   - Specific telos alignment (cite served_good and failure_signal)
2. Citations are VALIDATED downstream — fabricated citations cause
   sed_contra to be rejected and regenerated.
3. NEVER use abstract reasoning ("it seems sound", "the design is elegant")
   without backing citation.
4. The case must be FAIR — do not strawman the objections to make the
   case easier (F-Aquinas-2 mitigation).

## User prompt template

Proposition: {proposition}

Iteration context:
- gate: {gate}
- relevant_ac_node_ids: {relevant_ac_node_ids}
- telos: {telos} / served_good: {served_good} / failure_signal: {failure_signal}
- prior_precedents: {prior_precedents}
- gate_1_results: {gate_1_results}
- gate_2_results: {gate_2_results}

Objections from Videtur (for context only; do not refute here, that's
Respondeo's job):
{objections_summary}

Construct the strongest case FOR the proposition. Cite concrete evidence
per the rules. Return SedContra artifact (case_for + citations[]).
```

### 4.3 aquinas:respondeo

```text
## System prompt

You are the master conducting Respondeo. You produce YOUR OWN analysis —
not a synthesis of Videtur, not a summary of Sed contra. Your independent
position on the proposition.

Hard rules:
1. FIRST PARAGRAPH FORBIDDEN from referencing prior steps. You must
   articulate your own position before acknowledging the objections or
   the case-for. (F-Aquinas-3 mitigation)
2. After your independent position, you MAY then engage with objections
   and case-for — but only to explain how your position relates, not to
   defer to either.
3. Verdict options: approved / conditional / rejected
   - approved: telos served, AC met, no critical objections
   - conditional: telos served, AC met, but specific objections require
     before-merge action (most common)
   - rejected: telos NOT served OR critical objections compound
4. Reasoning must be CONCRETE — cite specific files, specific objections,
   specific telos elements.

## User prompt template

Proposition: {proposition}

Iteration context: {full context}

Videtur (objections) from Stage A: {objections}
Sed contra from Stage B: {sed_contra}

Now produce Respondeo:
1. First paragraph: your independent position (NO references to Videtur
   or Sed contra)
2. Subsequent paragraphs: how your position relates to the objections and
   case-for
3. Verdict: approved / conditional / rejected
4. Reasoning paragraph

Return Respondeo artifact.
```

### 4.4 aquinas:ad-singula

```text
## System prompt

You are producing Ad singula — a SEPARATE ruling for EACH objection from
Videtur. No silent skipping, no summary rulings.

Hard rules:
1. EVERY objection from Videtur gets exactly ONE ruling. No exceptions
   for "minor" or "addressed by another ruling" (F-Aquinas-4).
2. Ruling options:
   - Concedo:    "I concede this objection. {action} must happen before merge."
   - Distinguo:  "I distinguish: this is true in {case_X} but not {case_Y}.
                  {action_or_no_action}."
   - Nego:       "I deny this objection because {specific_reason}."
3. Concedo MUST include a concrete action (file path + change shape).
4. Distinguo MUST identify both cases (where true, where not true).
5. Nego MUST include specific reason — never just "I disagree."

## User prompt template

Objections from Videtur: {objections_with_ids}

Respondeo (your overall verdict + reasoning): {respondeo}

For EACH objection (obj_1, obj_2, ..., obj_N), produce one ruling per the
rules. Return AdSingula artifact (rulings: { obj_id: { ruling, action_or_reason } }).
```

## 5. Output contract

```typescript
export interface Verdict {
  iteration_id: string;
  gate: "uiux" | "technical_quality";
  proposition: string;
  videtur: Objection[];
  sed_contra: {
    case_for: string;
    citations: Citation[];
  };
  respondeo: {
    verdict: "approved" | "conditional" | "rejected";
    reasoning: string;
    independent_first_paragraph: string;
  };
  ad_singula: {
    [objection_id: string]: {
      ruling: "concedo" | "distinguo" | "nego";
      action?: string;             // present iff concedo or distinguo with action
      reason?: string;             // present iff nego or distinguo
    };
  };
  overall_outcome: "approved" | "revise_and_continue" | "reject_and_re-iterate";
  skipped_full_disputatio: boolean; // true when complexity_score below threshold
}

export interface Objection {
  objection_id: string;
  raised_by: string[];             // critic_ids; multi-entry = independent multi-raise
  severity: "critical" | "material" | "minor";
  claim: string;
  grounds: string;
}

export interface Citation {
  type: "ac_id" | "test_result" | "precedent" | "telos_element";
  reference: string;               // AC id, test name, file_path, served_good, etc.
  validated: boolean;              // CI step verifies citation exists
}

export interface AquinasOutput {
  verdict: Verdict;
  ready_for_next_gate: boolean;    // false when revise_and_continue or reject
}
```

### Worked example

(Concept doc has a complete worked example at lines 86-136 — reproduced briefly here.)

Input: iteration_005, gate: technical_quality, diff modifies `src/handlers/user.ts`.

Output (abbreviated):
```yaml
verdict:
  iteration_id: ralph_005
  gate: technical_quality
  proposition: "This iteration's code changes meet the project's technical quality bar."
  videtur:
    - objection_id: obj_1
      raised_by: [critic_persona_solid]
      severity: critical
      claim: "user.ts violates SRP — handles routing AND validation AND business logic."
      grounds: "Inspection of src/handlers/user.ts shows three concerns interleaved."
    - objection_id: obj_2
      raised_by: [critic_persona_test_coverage]
      severity: material
      claim: "Test coverage is 64% — below project floor of 80%."
      grounds: "Coverage report shows error-path branches uncovered."
    - objection_id: obj_3
      raised_by: [critic_persona_naming]
      severity: minor
      claim: "Function processUser is too generic; intent unclear."
      grounds: "Function specifically validates and persists; validateAndPersistUser would be clearer."
  sed_contra:
    case_for: "Implementation directly satisfies all 5 acceptance criteria. Deterministic gates passed. Structural pattern matches precedent in src/handlers/order.ts (previously-accepted module)."
    citations:
      - { type: ac_id, reference: ac_005_001, validated: true }
      - { type: ac_id, reference: ac_005_002, validated: true }
      - { type: precedent, reference: src/handlers/order.ts (iteration_002), validated: true }
      - { type: telos_element, reference: served_good="...", validated: true }
  respondeo:
    verdict: conditional
    independent_first_paragraph: "The work serves the AC and the telos. The implementation is functionally correct. However, structural compromises (SRP violation, test gaps) are not the kind that can be deferred without affecting maintainability of the changed module."
    reasoning: "obj_1 is the load-bearing concern — SRP violations compound and we have a project value of SOLID compliance. The pattern match to order.ts is itself evidence that order.ts also has this issue and should be refactored separately. obj_2 is a hard policy violation. obj_3 is improvement, not blocker."
  ad_singula:
    obj_1:
      ruling: concedo
      action: "Refactor user.ts: extract validation into src/handlers/user-validation.ts and business logic into src/services/user-service.ts before merge."
    obj_2:
      ruling: concedo
      action: "Add tests for uncovered error paths to reach 80% before merge."
    obj_3:
      ruling: distinguo
      action: "Rename improves clarity but does not block this iteration. Capture as follow-up issue."
  overall_outcome: revise_and_continue
  skipped_full_disputatio: false
ready_for_next_gate: false  # iteration must revise before progressing
```

The verdict is **not** "approved/rejected." It is a **per-objection ruling map** with overall outcome derived. User sees exactly which objections were dismissed and why. **No silent overruling.**

## 6. Quality bar

**Quantitative**:
- Every objection from Videtur has exactly one ruling in Ad singula (no missing entries)
- All Sed contra `citations[].validated == true` (CI-validated)
- Respondeo `independent_first_paragraph` contains zero references to Videtur or Sed contra (lint check)
- All `concedo` rulings include `action` field with concrete file + change shape

**Qualitative tells of "Aquinas did its job"**:
- Verdict's `reasoning` paragraph engages with at least 2 specific objection IDs (not abstract)
- ≥ 1 minor objection gets explicit ruling (Concedo with deferral, Distinguo, or Nego with reason) per iteration on average — proves no silent dropping
- When multiple critics raise the same objection (`raised_by.length > 1`), severity is escalated automatically

## 7. Forbidden in this runbook

- ❌ **F-Aquinas-1**: Objections clustered into oblivion — clustering preserves count + identities, multi-raised get severity boost
- ❌ **F-Aquinas-2**: Sed contra rationalizes without evidence — citations MUST be concrete + validated
- ❌ **F-Aquinas-3**: Respondeo summarizes instead of independent position — first paragraph forbidden from referencing prior stages
- ❌ **F-Aquinas-4**: Ad singula skipped for low-severity — every objection gets a ruling
- ❌ **F-Aquinas-5**: Disputatio overhead exceeds change — gate severity scaling skips Aquinas for trivial changes
- ❌ Voting/majority logic anywhere in the flow — Disputatio is per-objection ruling, never vote
- ❌ Aquinas operating in Alignment Loop — that's Socrates's territory (concept doc explicit boundary)
- ❌ Aquinas operating at Gate 5 (alignment) — Gate 5 is drift_score, not disputatio
- ❌ Sed contra strawmanning objections — case-for must be fair to the proposition, not designed to make objections look weak
- ❌ Calling `llm/*` directly — orchestrator routing (Stage 5-A.1)

## 8. Test contract

### Unit tests (`tests/unit/philosophers/aquinas.test.ts`)

1. **Schema conformance**:
   - `Verdict` Zod parse accepts/rejects per declared fields
   - `ad_singula` keys are the exact set of objection_ids from videtur (TS exhaustive check via property iteration)
   - `respondeo.verdict` is one of 3 union literals
   - `Citation.validated` is boolean post-validation step

2. **Quality-bar threshold**:
   - Fixture: 5-critic disputatio → all 5 objections present + de-duplicated correctly
   - Fixture: trivial diff (sub-10-line) → `skipped_full_disputatio: true`
   - Fixture: same-objection-from-3-critics → severity escalated; raised_by[3 entries]
   - Citation fixtures: all `citations[].reference` exist in `relevant_ac_node_ids` or `prior_precedents`

3. **Negative tests (forbidden behaviors fire)**:
   - Mock Sed contra without citations → runner rejects, regenerates with concrete-evidence demand
   - Mock Respondeo first paragraph contains "as the objections noted" → runner detects, regenerates
   - Mock Ad singula missing ruling for obj_3 → runner rejects, demands all-objection coverage
   - Mock Sed contra fabricated citation (ac_id not in relevant_ac_node_ids) → CI validation fails, regenerate

4. **Locale parity (en/ko)**:
   - en + ko fixtures produce equivalent verdict structure on parallel iterations
   - Korean ruling labels (e.g. "인정 (concedo)", "구별 (distinguo)", "부인 (nego)") map correctly
   - Citations preserved verbatim (file paths + AC IDs do not translate)

### Integration tests participated in

- `tests/integration/ralph-loop.test.ts` — Gate 3 + Gate 4 disputatio per iteration; revise_and_continue triggers next iteration
- `tests/integration/critics-orchestration.test.ts` — Aquinas's Videtur stage correctly orchestrates `critics/selection.ts` output

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/aquinas.ts` | Implementation (4-stage disputatio orchestrator) |
| `src/critics/selection.ts` | Trigger-based critic selection (Stage 2-B.3) |
| `src/critics/definitions/*.ts` | 10 critic personas (Aquinas fires their prompts in Videtur) |
| `src/ralph/disputatio.ts` | Shared Disputatio engine (per-iteration glue) |
| `src/ralph/gate-3-uiux.ts` | Gate 3 entry calling Aquinas |
| `src/ralph/gate-4-tech.ts` | Gate 4 entry calling Aquinas |
| `docs/philosophy/05-aquinas-disputatio.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/aquinas.md` | This runbook |
| `tests/unit/philosophers/aquinas.test.ts` | Unit tests (4-stage flow + clustering) |
| `messages/{en,ko}.json` keys | `philosophers.aquinas.*` namespace |

## 10. Boundaries (Aquinas-specific rejections)

- ❌ **Disputatio in Alignment Loop**: Socrates's territory. Aquinas operating upstream defeats the boundary.
- ❌ **Disputatio at Gate 5 (alignment)**: Gate 5 is drift_score (Stage 2-B.4 R1-A LLM judgment), not disputatio. Mixing them confuses verdict semantics.
- ❌ **Voting/majority anywhere**: Disputatio is per-objection ruling. Even a "vote among critics" feature would defeat the entire method.
- ❌ **Skipping ad_singula entries for "minor" objections**: F-Aquinas-4 directly. Minor gets Distinguo or Nego, not silent skip.
- ❌ **Generating critic prompts inside aquinas.ts**: critic prompts live in `critics/definitions/`. Aquinas orchestrates; critics speak.
- ❌ **Auto-tuning complexity threshold based on iteration history**: threshold is config (Stage 4-A.3 `[ralph]`). Auto-tuning hides decision; explicit config knob preserves transparency.
- ❌ **Reusing Verdict across iterations**: each iteration gets a fresh disputatio. Caching verdicts would cement past judgments against present diffs.

## 11. Examples / Anti-examples

### Good example (correct disputatio flow)

See worked example in section 5 above — abbreviated from concept doc lines 86-136.

Key right-features:
- 3 objections of distinct severity (critical / material / minor)
- Sed contra cites 4 concrete evidence items (3 ACs + 1 precedent + 1 telos element)
- Respondeo first paragraph is independent (no "as obj_1 noted" pattern)
- Ad singula has 3 rulings — one per objection — including the minor one (Distinguo with deferred action)
- overall_outcome: revise_and_continue (because 2 concedos, 1 critical)

### Anti-example (F-Aquinas-3 fires)

Same input as good example.

Anti Respondeo:
```
"Looking at the objections raised in Videtur, particularly obj_1's SRP
concern and obj_2's coverage gap, alongside Sed contra's case for the
implementation matching prior precedent, my verdict is conditional. The
objections are valid but the precedent argument carries weight..."
```

Why wrong: First paragraph references "the objections raised in Videtur" and "Sed contra's case" — exactly the failure F-Aquinas-3 was created to prevent. The judge is summarizing, not taking an independent position. The disputatio collapses back into vote-by-other-name.

Detection: section 8 unit test #3 — runner pre-checks Respondeo first paragraph for forbidden phrase patterns ("as obj_X noted", "Sed contra argues", "the objections in Videtur") and regenerates with explicit "independent position first" instruction.

### Anti-example (F-Aquinas-4 fires)

Same input as good example.

Anti Ad singula:
```yaml
ad_singula:
  obj_1: { ruling: concedo, action: "..." }
  obj_2: { ruling: concedo, action: "..." }
  # obj_3 silently dropped because it's minor
```

Why wrong: obj_3 has no ruling. Concept doc: "Minor objection 7 was not addressed because it was minor. This is the silent-overruling failure."

Detection: section 8 unit test #3 — runner verifies `Object.keys(ad_singula) === objection_ids`. Mismatch → regenerate.

## 12. Revision history

| Rev | Date       | Change                          | By         |
|-----|------------|---------------------------------|------------|
| 1   | 2026-05-03 | Initial Stage 5-A.3 SPEC        | Sang Rhee  |
