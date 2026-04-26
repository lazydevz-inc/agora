# 02 — Socrates's Elenchus

> *"I know that I know nothing."*
> — Socrates (apocryphal, but apt)

## What Socrates noticed

People hold their beliefs with confidence that exceeds their evidence. The confidence does not come from rigor; it comes from **never having tested the belief against its own implications**.

Socrates's response was a four-step technique called *elenchus* (ἔλεγχος, *examination*):

1. **Solicit a definition.** The other person states what they believe.
2. **Find a case.** Socrates constructs a concrete example the belief implies.
3. **Probe the case.** They examine together: does the implication match the person's other beliefs?
4. **Aporia.** When implication and belief conflict, the person admits *I do not know what I thought I knew*.

The goal is **not** to teach. It is to bring the person to *aporia* — productive confusion — so they recognize their own gap.

This is the same technique that doctors use when diagnosing a confusing symptom: *"You said you sleep eight hours. If I called you at 3 AM next Tuesday, would you be asleep?"* The patient pauses, realizes their actual sleep is different from their reported sleep. Aporia.

## What Agora extracts

The **conductor of the entire Alignment Loop**. Socrates is not a phase; he is the *spirit* of how every claim is tested. Every other philosopher contributes structure; Socrates contributes the testing rhythm.

Agora's interview engine implements the four-step elenchus on every load-bearing claim:

```
For each claim the user makes:
  1. Capture the claim verbatim
  2. Generate one concrete case the claim implies (drawn from the user's
     auto-scanned codebase if brownfield, otherwise constructed)
  3. Present the case back: "If your claim is X, then Y follows. Yes?"
  4. If the user says yes → claim is strengthened with the case as scope
     If the user says no → aporia! Re-articulate the claim sharper
     If the user says yes-but-with-exception → claim is refined with the exception
```

The **case** is the work product. A claim that has not been case-probed is not a settled claim — it is a hypothesis dressed as a conclusion.

## Where in the loop

```
Alignment Loop:
  Phase −1   (Husserl, optional)
  Phase 0    (auto-scan)
  Phase 1    (open intake)
  Phase 2    (iterative rounds)  ◀── Socrates conducts every round here
  Termination
```

Socrates is **active in every Phase 2 round**. Aristotle structures *what* gets asked (telos / form / material / efficient). Socrates structures *how* each answer gets tested before moving on.

A round in Phase 2 is, mechanically:
1. **Aristotle picks the next slot** to investigate (e.g. telos)
2. **Socrates asks the question** in elenchus form (with case-probing built in)
3. **The user answers**
4. **Socrates probes** with one or more implied cases
5. **Plato (Divided Line) tags** the resulting claim's maturity
6. **Repeat or move on**

## What output it produces

For each claim, an `ElenchedClaim` artifact:

```yaml
claim_id: telos_001
content: "I want to remember what I read so I can connect ideas later"
elenchus:
  case_probed:
    case: "If you forgot the physical book entirely but kept your notes,
           and someone asked you about a passage you took notes on, would
           you be satisfied with the answer your notes alone gave?"
    response: "Mostly yes — but I realized the notes need the *context of when
               I was reading it*, not just the passage. The 'when and why I
               was reading' is part of what I want to remember."
    outcome: "refined_with_addition"
  refined_content: |
    "I want to remember what I read AND the context of why I was reading
    it AT THAT TIME, so I can connect ideas later."
  aporia_count: 1   # the user reached aporia once and re-articulated
  unsurfaced_objections: []  # any cases probed where user did not commit
```

The `aporia_count` is interesting telemetry — claims that reached aporia tend to be the *most aligned* ones (the user genuinely re-thought), while claims that survived without aporia may be either deeply settled OR superficially examined. Agora shows aporia count to the user during the termination preview so they see which claims got worked over hardest.

## How it integrates with the others

- **Husserl** brackets the frame; **Socrates tests claims within that frame**. Without Husserl, Socrates may be sharpening claims about an unexamined assumption.
- **Aristotle** structures *which* claim to test next; **Socrates tests it**. Aristotle without Socrates becomes a checklist; Socrates without Aristotle becomes wandering.
- **Plato (Divided Line)** measures the *maturity* of the claim after Socrates has tested it. Together they answer "is this claim ready to ship to Ralph?"
- **Aquinas** operates on Ralph's output, not on alignment claims. Socrates and Aquinas never collide.

## How it can fail

**F-Socrates-1 — Flattering questions.**
The default LLM behavior is to paraphrase the user's words back as if they were profound. *"So what you're really saying is..."* — this is not Socratic, it is sycophantic.
*Mitigation*: every generated question is checked for "user-restate" patterns before being shown. If detected, regenerate with explicit case-probing.

**F-Socrates-2 — Over-probing.**
Every claim gets case-probed. The user feels grilled. The interview becomes interrogation.
*Mitigation*: probe only claims tagged as load-bearing (Aristotle's telos, top-level form, top-level constraints). Decorative claims pass without probe.

**F-Socrates-3 — Cases that strawman.**
The case constructed for probing is a caricature, not a fair implication. The user rejects the case but the claim wasn't tested.
*Mitigation*: cases must be drawn from either (a) the user's existing codebase, (b) a similar real-world case, or (c) explicit construction with the user's input. Never pure invention.

**F-Socrates-4 — No aporia ever reached.**
After 5+ rounds, no claim has been re-articulated. Either the user is uncommonly clear (rare) or the probing is shallow (common).
*Mitigation*: when aporia rate is below 1 in 5 claims, generate one deliberately *strong* case meant to expose any remaining tension. If still no aporia, log a quality concern in the seed metadata.

## What Socrates is NOT

- Not a feature for "clarification questions." Every chatbot does that.
- Not a way to make the user feel smart. Done well, Socrates makes the user feel **productively unsettled**, then **clearer than before**.
- Not a checklist of question types. The technique is generative — every case is constructed for the specific claim being tested.

The signature of good elenchus: the user thinks, *"Oh — I hadn't considered that case. Let me say what I meant more carefully."* Anything else is approximate.

---

*Socrates is the only one of the five who ran a school where no books were written. The method is the curriculum. Agora honors this by making elenchus the engine, not a feature.*
