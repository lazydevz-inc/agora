# 05 — Aquinas's Disputatio

> *"It is necessary to consider not only what each saith,
> but to whom and on what occasion he saith it."*
> — Thomas Aquinas, *Summa Theologiae*

## What Aquinas perfected

The medieval **disputatio** is the most refined deliberation technique humanity has developed. It outperforms simple voting and even modern adversarial debate. It has four parts:

1. **Videtur quod...** — *"It seems that..."*
   N independent objections to a proposition. Each presented at full strength.

2. **Sed contra...** — *"But on the contrary..."*
   One authoritative counter-position, citing the strongest case for the proposition.

3. **Respondeo dicendum...** — *"I respond..."*
   The master's *own* analysis. Not a synthesis of the above. An independent position.

4. **Ad primum, ad secundum...** — *"To the first, to the second..."*
   A *separate* response to *each* original objection from step 1.

The structure forces three things:
- **Objections must be presented at full strength** (steel-manned, never strawmanned)
- **The master cannot just pick a side** — they must articulate their own position
- **Every objection gets answered individually** — no glossing over inconvenient ones

## Why vote-based consensus fails

Most consensus mechanisms (including Ouroboros's Stage 3) poll N models and take the majority. This is **unsophisticated** in three specific ways:

1. **Objections are not equivalent.** A serious objection and a trivial one count the same vote.
2. **A 2–1 majority gives no information about *why* the minority dissented.**
3. **The dissenter's argument is silenced** rather than addressed.

Even Ouroboros's "deliberative mode" (Advocate / Devil's Advocate / Judge) collapses N objections into one Devil's Advocate position. The richness of "we have five concerns, and they are different" is lost.

## What Agora extracts

A **gate-evaluation framework** for Ralph that runs disputatio on each iteration's output, specifically at Gates 3 (UI/UX) and 4 (Technical Quality).

```
For each Ralph iteration's output, at gates 3 and 4:

  Stage A — Videtur (Generate N objections, parallel)
    Multiple critic personas independently identify one strong objection each.
    Objections are de-duplicated by semantic clustering, not text matching.

  Stage B — Sed Contra (One authoritative case for)
    A single high-tier model articulates the strongest argument FOR the
    output, citing concrete evidence (test results, AC compliance, prior
    decisions, telos alignment).

  Stage C — Respondeo (Master analysis)
    A judge model produces its OWN analysis. Not a vote. Not a summary.
    Takes a position on the output's merit, explains its reasoning
    independently of the objections, cites evidence.

  Stage D — Ad Singula (Per-objection response)
    For each objection from Stage A, the judge produces one of:
      Concedo    — "I concede this objection. Implementation must change."
      Distinguo  — "I distinguish: this is true in case X but not case Y."
      Nego       — "I deny this objection because [reason]."
```

## Where in the loop

```
Alignment Loop:
  (Husserl, Socrates, Aristotle, Plato operate here)

Ralph Loop iteration:
  1. Implement (using Claude Code subprocess or Agent SDK)
  2. Gate 1: Deterministic (lint/typecheck/build/test)        [pass/fail]
  3. Gate 2: Functional QA (Playwright CLI tests)             [pass/fail]
  4. Gate 3: UI/UX expert  ◀── Aquinas Disputatio operates here
  5. Gate 4: Technical Quality  ◀── Aquinas Disputatio operates here
  6. Gate 5: Alignment Check (output vs seed telos)           [pass/fail/escalate]
```

Aquinas operates only in Ralph, only at Gates 3 and 4. These are the gates where *judgment* (not pass/fail mechanical checks) is required. The other gates do not need disputatio — they need binary verdicts.

## What output it produces

A `Verdict` artifact per iteration per gate:

```yaml
verdict:
  iteration_id: ralph_005
  gate: technical_quality
  proposition: "This iteration's code changes meet the project's technical quality bar."
  videtur:
    - objection_id: obj_1
      raised_by: critic_persona_solid
      severity: critical
      claim: "The new module violates SRP — it handles HTTP routing AND data validation AND business logic."
      grounds: "Inspection of src/handlers/user.ts shows three distinct concerns interleaved in one file."
    - objection_id: obj_2
      raised_by: critic_persona_test
      severity: material
      claim: "Test coverage of the new module is 64% — below the project floor of 80%."
      grounds: "Coverage report shows error-path branches uncovered."
    - objection_id: obj_3
      raised_by: critic_persona_naming
      severity: minor
      claim: "Function `processUser` is too generic; name does not communicate intent."
      grounds: "The function specifically validates and persists; `validateAndPersistUser` would be clearer."
  sed_contra:
    case_for: |
      "The implementation directly satisfies all 5 acceptance criteria for this
      iteration. The deterministic gates passed. The structural pattern matches
      precedent in src/handlers/order.ts (a previously-accepted module)."
  respondeo:
    verdict: conditional
    reasoning: |
      "The work serves the AC and the telos. Objection 1 is the load-bearing
      concern: SRP violations compound and we have a project value of SOLID
      compliance. The pattern match to order.ts is itself evidence that the
      precedent module also has this issue and should be refactored separately.
      Objection 2 is a hard policy violation. Objection 3 is improvement,
      not blocker."
  ad_singula:
    obj_1: 
      ruling: concedo
      action: "Refactor user.ts to extract validation and business logic
              into separate modules before merge."
    obj_2:
      ruling: concedo
      action: "Add tests for uncovered error paths to reach 80% before merge."
    obj_3:
      ruling: distinguo
      action: |
        "Renaming improves clarity but does not block this iteration.
        Capture as a follow-up issue."
  overall_outcome: revise_and_continue
```

The verdict is **not** "approved/rejected." It is a **per-objection ruling map** with overall outcome derived from the rulings. The user (or downstream automation) sees exactly which objections were dismissed and why. **No silent overruling.**

## How it integrates with the others

- **Aristotle's telos** is the criterion for *Sed contra* — the strongest case for the implementation must include "and it serves the telos."
- **Plato's Dihairesis** structured the AC tree; Aquinas judges whether the iteration's output satisfies the relevant nodes of that tree.
- **Socrates and Husserl do not appear in Ralph.** Their work was upstream. By the time Ralph runs, the alignment is settled and the question is verification, not exploration.

## How it can fail

**F-Aquinas-1 — Objections clustered into oblivion.**
Multiple critics raise overlapping objections; semantic clustering merges them into one. The richness of "three perspectives raised similar concerns" is lost.
*Mitigation*: clustering preserves the count and identities. The merged objection notes "raised by 3 critics independently" — increasing its severity.

**F-Aquinas-2 — Sed contra rationalizes.**
The "case for" model knows the implementation is bad but constructs a plausible-sounding case anyway.
*Mitigation*: Sed contra must cite *concrete evidence* (test results, AC IDs, prior precedents), not abstract reasoning. Citations are validated.

**F-Aquinas-3 — Respondeo just summarizes.**
The judge model paraphrases the objections and the case-for, then averages them. This is exactly the failure mode disputatio was invented to prevent.
*Mitigation*: Respondeo prompt explicitly forbids referencing the prior steps in its first paragraph. The judge must articulate an independent position before being allowed to acknowledge the objections.

**F-Aquinas-4 — Ad singula skipped for low-severity objections.**
"Minor objection 7 was not addressed because it was minor." This is the silent-overruling failure.
*Mitigation*: every objection gets a ruling. Minor objections often get *Distinguo* (acknowledge + defer) — but they get a ruling.

**F-Aquinas-5 — Disputatio overhead exceeds the change being judged.**
A typo fix triggers a 5-objection disputatio.
*Mitigation*: gate severity scaling. Trivial changes (sub-10-line diffs, no new modules) skip Aquinas and use a one-pass critic. Aquinas activates above a complexity threshold.

## When Aquinas overstepss

Aquinas has the strongest *aesthetic appeal* of the five — the structure looks impressive, the verdict reads like a court ruling. This makes him easy to over-apply.

Aquinas should NOT be used for:
- Alignment Loop disputes (that is Socrates's territory)
- Maturity judgments (that is Plato's Divided Line)
- Decomposition disputes (that is Plato's Dihairesis)
- Frame disputes (that is Husserl's Epoché)

Disputatio is for **adversarial verification of an output against a settled standard**. It is not a general-purpose deliberation tool inside Agora. The boundary matters.

---

*Aquinas's contribution to Agora is the discipline of answering every objection separately, on its own merits, with explicit ruling. The cost is verbosity. The value is that no concern is silently overruled — which is the failure mode that destroys long Ralph loops.*
