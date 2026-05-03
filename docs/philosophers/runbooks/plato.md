# Plato — Runbook

> **Module**: `src/philosophers/plato.ts`
> **Phase**: TWO distinct operations — **Divided Line** (Alignment Phase 2 + Y2 termination gate) + **Dihairesis** (Alignment → Ralph handoff)
> **Method (one line)**: Divided Line (knowledge maturity tagging) + Dihairesis (cut at natural joints)
> **Inherited from**: `docs/philosophy/04-plato-divided-line-and-dihairesis.md`
> **Status**: [SPEC] (Accepted 2026-05-03, Stage 5-A.3)
> **Revision**: 2

---

## Plato is the only philosopher with two operations

Concept doc (`docs/philosophy/04-plato-divided-line-and-dihairesis.md`)
explicitly notes Plato bridges both loops. The Divided Line operates
inside Alignment; Dihairesis operates at the boundary between Alignment
and Ralph. Sections 1-12 below cover BOTH operations; subsections labeled
`(DL)` apply to Divided Line, `(DH)` apply to Dihairesis. When unlabeled,
the section applies to both.

---

## 1. When this is called

### 1.1 Divided Line (DL)

**Trigger A — per-claim maturity tagging**: After Socrates returns an `ElenchedClaim` for any cause-statement or AC. Plato tags maturity (eikasia / pistis / dianoia / noesis) and decides whether to re-loop the claim.

**Trigger B — Y2 termination gate**: At end of Phase 2, before the Alignment Loop closes. Plato checks every required field meets its maturity floor per Stage 2-A.8 R3 `REQUIRED_FLOORS` (alignment-loop.md L1202-1212):

```
telos.statement:           NOESIS
telos.served_good:         NOESIS
telos.failure_signal:      DIANOIA   (NOT Noesis-required per R2-A)
form.essential_structure:  DIANOIA
form.irreducible_parts:    PISTIS
material.*:                PISTIS
efficient.*:               PISTIS
acceptance_criteria.*:     DIANOIA
ontology.*:                DIANOIA
```

If any field is below its floor, Y2 fails and Phase 2 re-iterates (or user invokes explicit `--accept-low-telos-maturity` override per Stage 2-A.8 R3).

### 1.2 Dihairesis (DH)

**Trigger**: At Alignment → Ralph handoff (Stage 2-C.1). Operates ONCE per locked seed. Decomposes the locked AC list into a binary tree where each cut is defended as natural (most fundamental binary at each level).

**Pre-conditions in `.agora/`**:
- `seed.json` locked (Plato Y2 already passed for the locked seed)
- `ac_tree.json` does not yet exist (or `--regen-ac-tree` flag set)

**Skip conditions**:
- (DL) None — Divided Line is mandatory on every load-bearing claim
- (DH) User invokes a Stage 2-B.7 bypass on Dihairesis (rare; recorded in seed metadata; Ralph sees flat AC list with warning). Concrete CLI surface for per-phase opt-out is TBD; Stage 2-B.7 currently only specifies gate-level bypass.

**Cross-references**: Stage 2-A.8 R3 (`REQUIRED_FLOORS`); Stage 2-C.1 R1-A (3-AND atomicity); Stage 2-C.1 R3-A (`DEFENSE_THRESHOLD = 0.6`); Stage 2-B.4 R1-A (drift_score uses noesis-tagged claims as anchors).

## 2. Input contract

```typescript
// Divided Line input
export interface PlatoDLInput {
  claim: ElenchedClaim;          // from Socrates
  field_path: string;            // e.g. "four_causes.telos", "ac.001"
  required_floor: MaturityLevel; // per field map (Stage 2-A.8 R3)
  rejected_alternatives_required: boolean; // true ONLY for noesis floor (telos)
  locale: "en" | "ko";
}

// Dihairesis input
export interface PlatoDHInput {
  locked_seed: Seed;             // includes four_causes + ac list
  max_depth: number;             // 5 per concept doc (default)
  locale: "en" | "ko";
}

export type MaturityLevel = "eikasia" | "pistis" | "dianoia" | "noesis";

export interface ACNode {
  id: string;
  parent: string | null;
  content: string;
  // Flat decomposition fields per Stage 2-C.1 (handoff.md L92-108).
  // Present only on non-leaf nodes.
  split_principle?: string;       // why this cut at this level (dihairesis justification)
  split_defense?: string;         // why MORE fundamental than alternatives
  alternatives_considered?: string[]; // 2-3 alternative binaries that were considered
  arity?: 2 | 3;                  // 2 default; 3 only with explicit defense (F-Plato-DH-1)
  children?: ACNode[];            // length === arity when present
}
```

## 3. Method

### 3.1 Concept

Plato contributes two methods (`docs/philosophy/04-plato-divided-line-and-dihairesis.md`):

**Divided Line** distinguishes 4 ascending levels of knowledge:
- *Eikasia* (imagination/shadows) — "Something kinda like a blog"
- *Pistis* (belief without justification) — "I think this is what we need"
- *Dianoia* (reasoning from premises) — "I can justify this design with logic"
- *Noesis* (direct understanding) — "I know *why* this is right and why alternatives are not"

The Noesis test: **"What alternative did you consider for this claim, and why did you reject it?"** A user at Noesis answers in two sentences. A user at Dianoia struggles. A user at Pistis says "I just thought it was the right way."

**Dihairesis** is systematic division at natural joints. At each step: find the SINGLE most fundamental binary distinction; defend it as more fundamental than alternative binaries; cut there; recurse until atomic. The justification (`split_principle` + `split_defense`) is the work product. *Better an undivided AC than a badly divided one.*

### 3.2 Operationalization

#### Divided Line

```
1. Receive PlatoDLInput
2. Run the Noesis test on claim.refined_content (or original if outcome=confirmed):
   Construct prompt: "What alternative did you consider for this claim,
   and why did you reject it?"
3. Receive user response. Categorize:
   - Strong response (alternative + why-rejected, ≥ 2 sentences total) → Noesis
   - Reasoning-from-premises but no rejected alternative → Dianoia
   - Just-believe-it response → Pistis
   - Vague-association response → Eikasia
4. Compare tagged maturity vs required_floor:
   - tagged >= required_floor → record + return Pass
   - tagged < required_floor → return Fail with re-loop directive
5. If required_floor == Noesis and Noesis achieved:
   capture rejected_alternatives in claim metadata
   (used by Aquinas Sed contra at Ralph Gate 4)
6. Return PlatoDLOutput
```

#### Dihairesis

```
1. Receive PlatoDHInput (locked seed)
2. For each top-level AC in seed.acceptance_criteria:
   a. LLM proposes ONE binary distinction that divides this AC
   b. LLM lists 2-3 alternative binaries that were considered
   c. LLM defends chosen binary as more fundamental than alternatives
   d. If defense_score (LLM self-rated) < 0.6 → AC stays undivided (concept doc:
      "Better an undivided AC than a badly divided one.")
   e. Else → decompose into the two halves (rarely 3 with explicit defense per F-Plato-DH-1)
3. Recurse on each half:
   a. Atomicity check per Stage 2-C.1 R1-A `is_atomic()` (handoff.md L118-131):
      `llm_session_judgment AND estimated_file_touches ≤ 3 AND conjunction_count ≤ 1`
   b. If atomic OR depth == max_depth → leaf; stop recursing
   c. Else → repeat from step 2 on this child
4. Build ac_tree.json
5. Return PlatoDHOutput
```

### 3.3 Failure mode it specifically addresses

**(DL) Optimistic maturity**: Without rigorous tagging, AI conversations declare claims "settled" when they're actually Pistis. Pistis-level claims drift catastrophically across Ralph iterations because the user themselves doesn't have the conviction to correct course. Plato prevents this by demanding rejected-alternatives articulation for any Noesis claim and refusing to lock seed when floors aren't met.

**(DH) Convenient cuts vs natural cuts**: LLM-default decomposition uses MECE-style cuts that produce *plausible* trees but not *natural* trees. Plausible cuts mean every refactor later requires touching the trunk. Natural cuts mean leaves can be swapped without disturbing the structure. Dihairesis enforces "find the binary first, defend it as natural, then cut."

## 4. Prompt

### 4.1 plato:y2-noesis-test (DL)

```text
## System prompt

You are administering Plato's Noesis test on a single claim. Maturity
tagging is the gate that prevents Pistis-level claims from being declared
"settled" and entering Ralph (where they would drift catastrophically per
the 0.9^10 math).

Hard rules:
1. The Noesis test is ONE question:
   "What alternative did you consider for this claim, and why did you
    reject it?"
2. Wait for response. Categorize per the maturity criteria:
   - Noesis: alternative named + why-rejected explained (≥ 2 sentences,
     specific reasoning)
   - Dianoia: reasoning from premises but no specific rejected alternative
   - Pistis: just-believe ("I think it's right", "feels obvious")
   - Eikasia: vague association ("kinda like X", "something about Y")
3. NEVER lead the user. Forbidden: "Did you consider option X?" — that
   plants the alternative.
4. NEVER coach the user toward Noesis. The whole point is rigorous
   measurement. If the user is at Pistis, mark Pistis.
5. When tagged maturity < required_floor, return re-loop directive WITHOUT
   suggesting what to do — the orchestrator decides whether to re-iterate
   Phase 2 or surface override flag.

## User prompt template

Claim being measured:
- field_path: {field_path}
- content: {claim.refined_content or claim.original_content}
- required_floor: {required_floor}

Ask the Noesis test. Categorize the response. Return PlatoDLOutput.

If tagged == "noesis" and required_floor == "noesis", also capture the
named alternative + why-rejected as rejected_alternatives[] for downstream
use (Aquinas Sed contra in Ralph Gate 4).
```

### 4.2 plato:dihairesis-decompose (DH)

```text
## System prompt

You are decomposing an acceptance criterion into a tree of children using
Dihairesis (natural-joint division). The justification is the work product.

Hard rules:
1. Propose ONE binary distinction at this level. Not "split into 2-5
   children" — find THE binary that divides this AC most fundamentally.
2. List 2-3 ALTERNATIVE binaries you considered.
3. Defend your chosen binary as more fundamental than the alternatives.
   Self-rate defense_score 0.0-1.0.
4. If defense_score < 0.6, return "no defensible binary; AC stays undivided."
   This is a valid output. Better undivided than badly divided.
5. The chosen binary should be one the user could grok. Forbidden: jargon
   binaries that obscure rather than reveal.
6. After cutting, run atomicity check on each child:
   - Single file change-shape?
   - Single concern?
   - Executable in one Claude session?
   If all three AND → atomic leaf. If any fails → child needs further decomposition.
7. Max depth: 5. Beyond that, prefer larger atomic leaves over deeper trees.

## User prompt template

Acceptance criterion to decompose:
- id: {ac.id}
- content: {ac.content}
- parent_principle (if applicable): {ac.parent.split_principle}
- depth: {current_depth} of max {max_depth}

Settled telos (for context, do not re-decompose into telos-aligned subnodes
unless they are natural cuts):
{four_causes.telos.statement}

Propose the binary. Defend it. If defense_score >= 0.6, decompose into
two children (or three with explicit defense per F-Plato-DH-1). If < 0.6,
return undivided.

For each resulting child, run atomicity check and return either atomic
leaf or recursion request.
```

## 5. Output contract

```typescript
export interface PlatoDLOutput {
  field_path: string;
  tagged_maturity: MaturityLevel;
  required_floor: MaturityLevel;
  passed: boolean;
  rejected_alternatives?: { alternative: string; why_rejected: string }[]; // when tagged=noesis
  reloop_directive?: {           // when failed
    field_to_reloop: string;
    suggested_next_round: number;
  };
}

export interface PlatoDHOutput {
  ac_tree: ACNode[];             // root nodes; children inlined per ACNode shape
  undivided_acs: string[];       // AC IDs where no defensible binary was found
  max_depth_reached: number;
  total_atomic_leaves: number;
}
```

### Worked example (DL — telos at Noesis)

Input:
```
claim: { refined_content: "Help me make connections across reading I'd otherwise lose." }
field_path: "four_causes.telos"
required_floor: "noesis"
rejected_alternatives_required: true
```

Noesis test trace:
```
Q: "What alternative did you consider for this telos, and why did you reject it?"
A: "I considered 'build for sharing with others' — like a public newsletter
    that forces me to articulate clearly. Rejected because public audience
    pressures me to self-edit away the half-formed thoughts that are most
    valuable for connection-making. Also considered 'use Notion or Obsidian'
    — rejected because friction in capture step kills the habit; I want
    a custom shape that fits my reading flow."
```

Output:
```yaml
field_path: "four_causes.telos"
tagged_maturity: noesis
required_floor: noesis
passed: true
rejected_alternatives:
  - alternative: "build for sharing with others (public newsletter)"
    why_rejected: "Public audience pressures self-editing away half-formed
                   thoughts that are most valuable."
  - alternative: "use existing tools (Notion, Obsidian)"
    why_rejected: "Friction in capture step kills the habit; want custom
                   shape fitting my reading flow."
```

The 2 alternatives + specific reasons → Noesis. Required_floor met. Captured for Aquinas Sed contra later.

### Worked example (DH — auth AC decomposition)

Input:
```
ac: { id: "ac_001", content: "Users can authenticate with the system" }
depth: 0, max_depth: 5
```

Dihairesis trace:
```
1. Propose binary: "identity verification vs session management"
2. Alternative binaries considered:
   a. "login form vs registration form" — REJECTED: feature-aligned,
      not natural; both are sub-types of identity verification
   b. "user-facing vs admin-facing" — REJECTED: orthogonal axis, not
      a fundamental cut for THIS AC
3. Defense: identity verification (proving you are X) and session
   management (maintaining you-are-X across requests) are genuinely
   different concerns with different failure modes (auth bypass vs
   session hijack). defense_score: 0.85.
4. Decompose:
   ac_002: "Identity verification works"
   ac_003: "Session management works"
5. Recurse on ac_002:
   Binary: "first-time identity claim vs returning identity claim"
   defense_score: 0.78
   → ac_004 (registration), ac_005 (login)
6. Atomicity check on ac_004 (registration) per is_atomic():
   llm_session_judgment? yes (one focused session)
   estimated_file_touches ≤ 3? yes (form + handler + DB row = 3)
   conjunction_count ≤ 1? yes ("first-time identity claim" — no AND)
   → atomic leaf at depth 2
```

Output (partial — flat ACNode shape per Stage 2-C.1):
```yaml
ac_tree:
  - id: ac_001
    parent: null
    content: "Users can authenticate with the system"
    split_principle: "identity verification vs session management"
    split_defense: "Identity verification (proving you are X) and session
                    management (maintaining you-are-X across requests) have
                    radically different failure modes (auth bypass vs session
                    hijack)."
    alternatives_considered:
      - "login form vs registration form"
      - "user-facing vs admin-facing"
    arity: 2
    children:
      - id: ac_002
        parent: ac_001
        content: "Identity verification works"
        split_principle: "first-time identity claim vs returning identity claim"
        split_defense: "Different attack surfaces; different UX trust journeys."
        alternatives_considered: ["form layout vs API layout"]
        arity: 2
        children:
          - id: ac_004
            parent: ac_002
            content: "First-time identity claim (registration)"
            # atomic leaf — no split_principle / split_defense / arity / children
          - id: ac_005
            parent: ac_002
            content: "Returning identity claim (login)"
            # atomic leaf
      - id: ac_003
        parent: ac_001
        content: "Session management works"
        # ... continues
total_atomic_leaves: 5
max_depth_reached: 2
undivided_acs: []
```

The MECE-LLM default would have produced [login_form, registration_form, password_reset] — three leaves at depth 1, no trunk. Refactoring to add OAuth would touch all three. The Dihairesis tree allows OAuth to be added under ac_002 (identity verification) without touching the session management subtree.

## 6. Quality bar

### Divided Line

**Quantitative**:
- All `four_causes.*` fields tagged at maturity ≥ floor before seed locks
- All `acceptance_criteria` tagged Dianoia ≥ before seed locks
- `rejected_alternatives` populated for every Noesis-tagged claim (telos always)

**Qualitative tells**:
- ≥ 30% of telos rounds reach Noesis on first Noesis test (else Phase 2 re-iterates — that's OK, but high re-iteration rate signals weak Phase 2 quality)
- `rejected_alternatives` reasons are SPECIFIC (≥ 30 chars, mention concrete consequence) — not "didn't feel right"

### Dihairesis

**Quantitative**:
- Each `split_principle` is a defensible binary (defense_score ≥ DEFENSE_THRESHOLD = 0.6)
- `alternatives_considered` has ≥ 2 entries per cut
- Tree depth ≤ 5 (MAX_DEPTH contract)
- ≥ 80% of leaves pass `is_atomic()` (`llm_session_judgment AND estimated_file_touches ≤ 3 AND conjunction_count ≤ 1`)

**Qualitative tells**:
- Refactoring an unrelated leaf does NOT require touching siblings or trunk
- Each cut "feels obvious in retrospect" (the natural-joint test — concept doc)
- `undivided_acs` is non-empty when the input AC genuinely doesn't decompose (not always zero)

## 7. Forbidden in this runbook

### Divided Line forbidden

- ❌ **F-Plato-DL-1**: Optimistic tagging — runner uses explicit Noesis test, never auto-promotes Dianoia → Noesis
- ❌ **F-Plato-DL-2**: Override flag becomes habit — every override recorded in seed metadata, surfaced as "trust warning" at Ralph start; after 3 overrides on a project, suggest Phase −1 re-bracket
- ❌ Leading questions during Noesis test ("Did you consider X?") — plants alternatives
- ❌ Coaching toward Noesis — the test is rigorous measurement, not pedagogy

### Dihairesis forbidden

- ❌ **F-Plato-DH-1**: Forced binary where ternary is natural — runner allows 2-3-way splits with explicit defense; 4+ defaults to "re-binarize"
- ❌ **F-Plato-DH-2**: Decomposition stops too early — `is_atomic()` 3-AND check enforced (llm_session_judgment AND estimated_file_touches ≤ 3 AND conjunction_count ≤ 1)
- ❌ **F-Plato-DH-3**: Decomposition goes too deep — max_depth 5 hard cap
- ❌ Cuts that "feel like features" (login_form / registration_form / reset) — runner detects feature-aligned cuts and re-prompts for natural binary
- ❌ Jargon binaries that obscure (e.g. "covariance vs contravariance" for a CRUD app) — runner re-prompts for user-grokkable binary

### Both

- ❌ Calling `llm/*` directly — orchestrator routing (Stage 5-A.1)
- ❌ Mutating `seed.json` outside the locked-seed-write path (Stage 2-C.3)

## 8. Test contract

### Unit tests (`tests/unit/philosophers/plato.test.ts`)

**Divided Line tests**:

1. **Schema conformance**:
   - `PlatoDLOutput.tagged_maturity` is one of 4 union literals
   - `rejected_alternatives` undefined when tagged != "noesis"
   - `reloop_directive` undefined when passed === true

2. **Quality-bar threshold**:
   - Fixture: telos round with strong rejected-alternative response → tagged "noesis" + rejected_alternatives populated
   - Fixture: weak just-believe response → tagged "pistis", passed: false (when floor=noesis)
   - Fixture: maturity-floor compliance check across all required fields → all pass before lock

3. **Negative tests**:
   - Mock LLM Noesis test contains "Did you consider X?" → runner detects leading pattern, regenerates
   - Override flag fires → metadata recorded; Ralph start displays "trust warning"
   - Coach attempt ("you're almost at Noesis, try saying...") → runner re-prompts to remove coaching

4. **Locale parity**:
   - en + ko fixtures produce equivalent maturity tags on parallel claims
   - Korean rejected-alternative reasons (≥ 30 Hangul chars equivalent specificity)

**Dihairesis tests**:

1. **Schema conformance**:
   - `PlatoDHOutput.ac_tree` recursive ACNode structure (Zod validates)
   - `children.length === arity` when present; `arity ∈ {2, 3}` (3 only with explicit defense)
   - `max_depth_reached` <= input.max_depth

2. **Quality-bar threshold**:
   - Auth AC fixture → tree matches concept doc example (identity verification vs session management at depth 1)
   - Refactor test: removing one leaf does NOT modify sibling or parent (`split_principle` unchanged)
   - ≥ 80% of leaves pass `is_atomic()` 3-AND check (per Stage 2-C.1 R1-A)

3. **Negative tests**:
   - Mock LLM proposes feature-aligned cut (login_form / registration_form / reset) → runner detects, re-prompts for natural binary
   - Mock LLM defense_score < 0.6 → AC stays in `undivided_acs[]`
   - Mock LLM proposes 4+ way split → runner refuses, requires re-binarize
   - Depth > 5 → recursion stops; remaining leaf added to `undivided_acs`

4. **Locale parity**:
   - en + ko fixtures produce equivalent tree structure on same input AC
   - `split_principle` translated semantically equivalent

### Integration tests participated in

- `tests/integration/alignment-loop.test.ts` — Y2 termination gate fires when maturity floors met; re-loops when not
- `tests/integration/handoff.test.ts` — Dihairesis runs ONCE on locked seed; ac_tree.json written; Ralph reads it
- `tests/integration/ralph-loop.test.ts` — `rejected_alternatives` from telos used by Aquinas Gate 4 Sed contra

## 9. File map

| Path | Purpose |
|------|---------|
| `src/philosophers/plato.ts` | Implementation (both DL + DH operations) |
| `docs/philosophy/04-plato-divided-line-and-dihairesis.md` | Concept doc (Stage 1) |
| `docs/philosophers/runbooks/plato.md` | This runbook |
| `tests/unit/philosophers/plato.test.ts` | Unit tests (both ops) |
| `src/handoff/dihairesis.ts` | Orchestration glue at Alignment → Ralph boundary (calls plato.ts DH operation) |
| `src/handoff/ac-tree.ts` | ac_tree.json read/write (consumes PlatoDHOutput) |
| `messages/{en,ko}.json` keys | `philosophers.plato.*` namespace (with `dl.*` and `dh.*` sub-namespaces) |

## 10. Boundaries (Plato-specific rejections)

- ❌ **Separate runbooks for Divided Line and Dihairesis**: rejected. Concept doc explicitly notes "Plato is the only philosopher who plays two distinct roles" — splitting them obscures that he is ONE philosopher with two methods at different points. Single runbook with `(DL)` / `(DH)` labels is the canonical form.
- ❌ **Promoting Divided Line beyond claims to also tag *projects***: maturity tagging is a per-claim operation. Tagging entire projects' "Noesis-ness" would be ceremonial.
- ❌ **Ternary as default, binary as fallback**: binary IS the natural cut by Platonic argument. Ternary requires explicit defense (F-Plato-DH-1).
- ❌ **MECE checklist as decomposition method**: rejected per concept doc. MECE-by-LLM produces convenient, not natural, cuts.
- ❌ **Auto-decomposition after seed lock without explicit user invocation**: Dihairesis runs once; re-running requires `--regen-ac-tree` flag.
- ❌ **Plato operating in Ralph**: only Aquinas operates in Ralph. Plato exits at handoff. Ralph's drift_score uses Plato's maturity tags as static input, not interactive.

## 11. Examples / Anti-examples

### Good example (DH — natural cut)

Input AC: "Users can pay for the product."

Method trace:
```
Binary proposed: "trust establishment vs charge execution"
Alternatives considered:
  - "credit card vs bank transfer vs PayPal" (REJECTED: payment-method-aligned,
     not natural — all are sub-types of charge execution)
  - "one-time vs subscription" (REJECTED: orthogonal billing-model axis,
     can be added later under either branch)
Defense: trust establishment (does payment fail-soft when card is invalid?
  does the user understand they're being charged?) and charge execution
  (does money actually move?) have radically different failure modes
  (UX failure vs financial failure). defense_score: 0.82
→ Decompose into ac_002 (trust establishment) + ac_003 (charge execution)
```

Why right: the cut survives adding new payment methods later (PayPal goes under charge execution; trust UX is unchanged). Refactor-resilient.

### Anti-example (F-Plato-DH-1 — feature-aligned cut)

Input AC: "Users can pay for the product."

Anti-trace:
```
Binary proposed: "credit card flow vs subscription flow"
Defense: "those are the two main payment types" (defense_score: 0.4)
→ Decomposed into ac_002 (credit card) + ac_003 (subscription)
```

Why wrong: feature-aligned cut. Adding PayPal later requires either creating ac_004 (PayPal flow — breaks binary) or shoving PayPal under ac_002 (incoherent). The cut isn't a natural joint; it's a snapshot of current product offerings.

Detection: section 8 unit test #3 (negative) — runner detects feature-aligned cut by checking against AC content for product-feature nouns ("flow", "form", payment-method names) and re-prompts for natural binary.

### Good example (DL — Noesis on form)

Claim: `four_causes.form.essential_structure: "Single-page CRUD with offline-first sync"`

Noesis test:
```
Q: "What alternative did you consider for this form, and why did you reject it?"
A: "Considered server-rendered with optimistic UI — rejected because the
    target user works in 30-min sessions on mobile in transit, where network
    flakiness makes server-rendered too brittle. Also considered native app —
    rejected because I don't want to maintain two codebases for a personal
    tool."
```

Output: tagged Noesis. rejected_alternatives populated.

Why right: 2 alternatives, each with concrete consequence (network flakiness, two-codebase maintenance). Survives Aquinas Sed contra later.

## 12. Revision history

| Rev | Date       | Change                                                                                                   | By         |
|-----|------------|----------------------------------------------------------------------------------------------------------|------------|
| 1   | 2026-05-03 | Initial Stage 5-A.3 SPEC                                                                                 | Sang Rhee  |
| 2   | 2026-05-03 | Post-review fixes: corrected REQUIRED_FLOORS to verbatim Stage 2-A.8 R3 dict (failure_signal=DIANOIA, ontology not evaluation_principles); replaced 3-AND atomicity wording with verbatim Stage 2-C.1 R1-A `is_atomic()` (llm_session_judgment AND ≤3 file touches AND conjunction_count ≤ 1); flattened ACNode shape to match handoff.md L92-108 (split_principle/split_defense/arity/children, no nested binary_split); split atomicity vs defense_threshold cross-refs (R1-A vs R3-A); replaced --skip-dihairesis flag mention with Stage 2-B.7 bypass language. | Sang Rhee  |
