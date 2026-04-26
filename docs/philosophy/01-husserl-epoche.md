# 01 — Husserl's Epoché

> *"Back to the things themselves."*
> — Edmund Husserl, *Logical Investigations* (1900)

## What Husserl noticed

When you describe an experience, you do not describe the experience. You describe **the experience plus every interpretive frame you have ever absorbed about that kind of experience.** The frames are invisible because they feel like part of the experience.

A user who says *"I want to build a blog"* has already smuggled in:
- The assumption that the answer is software
- The assumption that the form is post + comments
- The assumption that the audience is "readers"
- The assumption that the output is HTML

The frames were so habitual the user did not notice them entering.

Husserl's response: **epoché** (ἐποχή, *suspension*). Before describing an experience, *bracket* — temporarily set aside — every interpretive frame, and return to the experience itself.

Note carefully: epoché does not deny the frames. It does not claim the user is wrong. It **suspends** the frames so the underlying phenomenon can be re-examined. After bracketing, the user may re-adopt the same frame — but now consciously.

## What Agora extracts

A phase that runs **before any other interview question** — Phase −1 of the Alignment Loop.

The phase asks the user to articulate the *experience* that prompted them to reach for a tool, **before** asking what they want to build. Then it presents three brackets:

1. **The Software Bracket** — *"Is the answer to this experience necessarily software? What if it were a habit, a meeting, a conversation?"*
2. **The Form Bracket** — *"If software, what shape have you assumed it must take? What other shapes could carry the same experience?"*
3. **The Audience Bracket** — *"Who is this for? Have you assumed your past self, your future self, others? Are they the same?"*

The user does not have to abandon their original framing. They have to **defend it** against bracketing. The defense becomes part of the artifact.

## Where in the loop

```
Alignment Loop:
  Phase −1  ◀── Husserl Epoché operates here
  Phase 0   (auto-scan)
  Phase 1   (open intake)
  Phase 2   (iterative rounds)
  Termination
```

Phase −1 is **optional by default** for brownfield projects (an existing codebase already commits to a frame, and bracketing it is usually overkill). For greenfield projects it is **default-on** but skippable.

Sang can also invoke it explicitly mid-project (`agora bracket`) when stuck — sometimes the right move is not the next iteration but a re-bracketing of what was assumed three weeks ago.

## What output it produces

A `DefendedFrame` artifact stored in the seed:

```yaml
defended_frame:
  raw_experience: |
    I want to remember what I read so I can connect ideas later when
    I'm working on something and a half-forgotten passage might apply.
  chosen_form: "personal note-taking software with backlinking"
  brackets_considered:
    software_bracket:
      considered_alternative: "physical notebook + index cards"
      defense: "Search and backlinking are the core requirements;
                physical media defeats the purpose."
    form_bracket:
      considered_alternative: "private Discord with a reading-notes channel"
      defense: "Conversation is not the goal; durability and structure are."
    audience_bracket:
      primary_audience: "future-self at 6+ months out"
      considered_alternative: "small public audience for accountability"
      defense: "Public audience changes what I write — I would self-edit
                away the half-formed thoughts that are most valuable."
  surprising_findings:
    - "I had not realized I was assuming software until you asked. The
       Discord option felt initially absurd then revealing — I rejected
       it but for a clearer reason than 'software is obvious.'"
```

Notice what `surprising_findings` captures: **the moments where the user noticed an assumption they did not know they had**. This is the actual work product of Phase −1. Even if the user re-commits to their original frame, having articulated *why* shifts every subsequent decision.

## How it integrates with Aristotle

Phase −1 (Husserl) hands off to Phase 1 (open intake) and then Phase 2 (Aristotle's four causes). Aristotle's first question — *what is the telos?* — lands on a frame that has been examined, not assumed. This makes Aristotle's questioning *deeper from the first round*.

If we skipped Husserl, Aristotle's *telos* question would still get an answer. But the answer would be defending an unbracketed frame — a frame the user accepted by inertia. The telos extracted under those conditions is shallower than the telos extracted from a defended frame.

## How it can fail

**F-Husserl-1 — Bracketing performed without genuine consideration.**
The user goes through the brackets ritually, picks "stay with my frame" without engaging. Symptom: `defended_frame.brackets_considered.*.defense` reads as one-line dismissal.
*Mitigation*: when defense is shorter than 50 characters, Agora asks one follow-up: *"That was quick — what made the alternative obviously wrong?"*

**F-Husserl-2 — Over-bracketing.**
Every question turns into a bracket. The user feels interrogated, not freed.
*Mitigation*: epoché is a single phase, not a stance. After Phase −1 closes, no more bracketing unless the user explicitly invokes `agora bracket` mid-project.

**F-Husserl-3 — Brackets are too generic.**
The three brackets (Software / Form / Audience) cover most cases but not all. A user building a hardware product, a research artifact, or an institutional change has different relevant brackets.
*Mitigation*: detect domain from auto-scan in Phase 0 — when the project is non-software-shaped, generate domain-appropriate brackets.

## When to skip Husserl

Skip Phase −1 when:
- **Brownfield with a clear scope addition.** *"Add a settings page to dexter-player"* does not benefit from frame-bracketing. The frame was set when the project began.
- **The user has explicitly invoked Husserl recently** (last 24 hours, on the same scope). The frame was just bracketed; doing it again is ceremony.
- **The project has a `defended_frame` already and the new request is consistent with it.** Re-bracket only on inconsistency.

In all skip cases, Agora prints a one-liner: *"Skipping Phase −1 because [reason]. Run `agora bracket` to invoke it explicitly."* Visibility prevents silent skipping from becoming default behavior.

---

*Husserl's contribution to Agora is the discipline of asking what was smuggled in before asking anything else. Every other philosopher operates on the frame Husserl bracketed.*
