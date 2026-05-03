# <Philosopher Name> — Runbook

> **Module**: `src/philosophers/<name>.ts`
> **Phase**: <when in the two loops this is called>
> **Method (one line)**: <e.g. Husserl: Epoché / Socrates: Elenchus / Aristotle: Four Causes / Plato: Divided Line + Dihairesis / Aquinas: Disputatio>
> **Inherited from**: `docs/philosophy/0X-<name>-<concept>.md` (concept doc, Stage 1)
> **Status**: [SPEC] (Accepted yyyy-mm-dd, Stage 5-A.3)
> **Revision**: 1

> **Note**: This file is the **template**, not a runbook itself. Leading
> underscore in the filename (`_template.md`) signals to readers and
> tooling. Stage 5-A.3 instantiates 5 copies (husserl.md, socrates.md,
> aristotle.md, plato.md, aquinas.md) using this exact structure.
> See `docs/architecture/runbook-template.md` for the SPEC defining the
> 12-section DTD + rules.

---

## 1. When this is called

<Trigger conditions in the two-loop runtime:
- Phase / gate where activated
- Pre-conditions (what state must exist in `.agora/`)
- Skip conditions (when this philosopher is bypassed, if any)

Cross-reference Stage 2 SPEC sections by name + line.>

## 2. Input contract

```typescript
export interface <Name>Input {
  // Concrete fields, not narrative.
  // Each field annotated with the SPEC section that produced it.
  context: { ... };
  prior_round_history?: ...;
  // ...
}
```

## 3. Method

### 3.1 Concept

<One paragraph restating the philosopher's idea in software terms. Cite
`docs/philosophy/0X-<name>-<concept>.md` for the deep treatment.>

### 3.2 Operationalization

<Pseudocode + plain-English steps. NO TypeScript here — Stage 6 owns the
actual code.>

```
1. Receive input <Name>Input
2. Construct prompt(s) per section 4
3. Call ClaudeRunner via orchestrator
   (philosophers/* never call llm/* directly per Stage 5-A.1 layer rule)
4. Validate response shape (Zod schema for <Name>Output)
5. Apply quality-bar checks (section 6)
6. Return <Name>Output
```

### 3.3 Failure mode it specifically addresses

<Which AI-coding pattern fails without this philosopher in the loop, that
this module exists to prevent. Concrete, not abstract.>

## 4. Prompt

### 4.1 <prompt_id>

```text
## System prompt
<the system prompt>

## User prompt template
<template with {placeholders}>
```

<Repeat 4.X for each distinct prompt this philosopher fires.>

## 5. Output contract

```typescript
export interface <Name>Output {
  // Concrete fields the orchestrator uses downstream
}
```

### Worked example

Input:  `{ ... }`
Output: `{ ... }`

## 6. Quality bar

<Quantitative thresholds (cite Stage 2 SPECs where set) + qualitative
tells specific to this philosopher.>

## 7. Forbidden in this runbook

- ❌ <forbidden behavior 1>
- ❌ <forbidden behavior 2>

<Extends global F1-F8 with philosopher-specific F-rules where needed.>

## 8. Test contract

### Unit tests (`tests/unit/philosophers/<name>.test.ts`)

1. **Schema conformance**: <specific assertions>
2. **Quality-bar threshold**: <specific assertions>
3. **Negative (forbidden behaviors)**: <specific assertions>
4. **Locale parity (en/ko)**: <specific assertions>

### Integration tests participated in

- `tests/integration/<phase>.test.ts` — <what's verified>

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/<name>.ts` | Implementation (this module) |
| `docs/philosophy/0X-<name>-<concept>.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/<name>.md` | This runbook |
| `tests/unit/philosophers/<name>.test.ts` | Unit tests |
| `messages/{en,ko}.json` keys | `philosophers.<name>.*` namespace |

## 10. Boundaries (philosopher-specific rejections)

- ❌ <alternative considered and rejected for THIS runbook, with reason>

## 11. Examples / Anti-examples

<Optional. Include when section 7's failure mode is subtle. Format:>

### Good example

Input:        `{ ... }`
Method trace: 1. ... 2. ... 3. ...
Output:       `{ ... }`
Why right:    <one sentence>

### Anti-example

Input:        `{ same as above }`
Output:       `{ wrong shape or content }`
Why wrong:    <which forbidden rule (section 7) it violates>
Detection:    <how the unit test catches it (cross-ref section 8 #3)>

## 12. Revision history

| Rev | Date       | Change                          | By         |
|-----|------------|---------------------------------|------------|
| 1   | yyyy-mm-dd | Initial Stage 5-A.3 SPEC        | Sang Rhee  |
