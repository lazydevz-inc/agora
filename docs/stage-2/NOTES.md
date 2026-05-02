# Stage 2 — Two-Loop Specification

> **Status**: Active (opened 2026-04-27)
> **Goal**: Promote `docs/loops/interview-loop.md` (renamed to `alignment-loop.md`) and `docs/loops/ralph-loop.md` from placeholder to formal spec.
> **Done when**: Both docs are marked `Accepted`. All open questions inherited from Stage 1 are resolved or explicitly deferred to Stage 3+.

---

## Entry plan

Stage 2 splits into three sub-stages. They are sequential because each builds on the previous.

### Stage 2-A — Alignment Loop full spec

Resolve the open questions inherited from Stage 1's interview-loop placeholder:

1. **Rename**: `docs/loops/interview-loop.md` → `docs/loops/alignment-loop.md`. Update all references. (Mechanical, low-risk, do first.)
2. **Phase 0 auto-scan algorithm**: what is scanned, in what order, how is brownfield/greenfield decided, how is the result fed to Phase 1.
3. **Phase 1 open intake design**: what prompt, what format, how long can the input be, how is editor escape handled.
4. **Phase 2 round structure**: how does a single round flow, who picks the philosopher, how is the question constructed, how is the answer routed.
5. **Round ordering**: which philosopher operates when, with what triggers.
6. **Recommended-options generation**: where do the suggested options come from (codebase, Aristotle exemplars, prior answers).
7. **Validation gates per claim**: when is a claim "settled" — maturity floor + Socratic survival + coverage.
8. **Termination gate Y2 + Y3**: precise algorithm for when the loop can ask "anything else?", and when preview generation is offered (quality threshold).
9. **Brownfield vs greenfield branching**: where do the two paths diverge (Phase −1 default-on/off, Phase 0 emphasis, etc.).
10. **Mini-alignment re-entry from Ralph (Z2)**: shorter form of the alignment loop for re-entry mid-Ralph.

### Stage 2-B — Ralph Loop full spec

Resolve the open questions inherited from Stage 1's ralph-loop placeholder:

1. **Probe registry initial coverage**: which CLIs/tools ship with v1.
2. **Drift score numeric threshold**: what triggers Z1 (per-iteration self-correct) vs Z2 (mini-alignment re-entry).
3. **Critic persona selection**: which UI/UX and code-quality personas run Disputatio at Gates 3 and 4.
4. **Test regeneration trigger**: when do Playwright tests get regenerated vs incrementally updated.
5. **Iteration cap**: hard cap or token-budget-based stopping.
6. **Parallel iterations**: should Ralph try multiple iteration paths and Disputatio between them.
7. **Bypass UX**: details of `--skip-gate-0=<list>` and whether other gates have any bypass at all.

### Stage 2-C — Handoff ceremony

The transition from Alignment Loop to Ralph Loop is itself a structural moment:

1. **Locked seed format**: exact YAML schema for the seed (extends `docs/philosophy/03-aristotle-four-causes.md` and `04-plato-divided-line-and-dihairesis.md` artifacts).
2. **Plato Dihairesis decomposition algorithm**: how the seed's acceptance criteria become the AC tree Ralph operates on.
3. **State carry-over**: what context does Ralph receive from Alignment beyond the seed (history, deferred questions, preview-vs-actual log).

---

## Working principle for Stage 2

Stage 2 is the **most algorithmic stage so far**. Stage 1 was philosophy + direction. Stage 2 is "how does this actually work, step by step, deterministically enough for Stage 6 implementation to follow without re-arguing the design."

Stage 2 still uses the Alignment Loop to make decisions (meta-dogfooding per ADR-0003), but each round produces **algorithmic specification**, not philosophical commitment. Less prose, more pseudocode and decision trees.

UX expectation: Mode B (single confident recommendation + alternatives) will dominate Stage 2 because most of these are technical choices Sang has delegated.

---

## Open question priority

Tackle in this order (each unblocks the next):

```
2-A.1  Rename                             ◀── do first (mechanical)
2-A.2  Phase 0 auto-scan algorithm        ◀── unblocks Phase 1
2-A.3  Phase 1 open intake design         ◀── unblocks Phase 2
2-A.5  Round ordering                     ◀── unblocks Phase 2
2-A.4  Phase 2 round structure
2-A.6  Recommended-options generation
2-A.7  Validation gates per claim
2-A.8  Termination Y2 + Y3
2-A.9  Brownfield vs greenfield branching
2-A.10 Mini-alignment re-entry

(Then Stage 2-C handoff, then Stage 2-B Ralph spec)
```

Estimated rounds per sub-question: 1–2. Total Stage 2 work: ~15–20 focused rounds.

---

## Stage 2 will produce

- `docs/loops/alignment-loop.md` — full spec, Status: Accepted
- `docs/loops/ralph-loop.md` — full spec, Status: Accepted
- `docs/loops/handoff.md` — Alignment → Ralph handoff specification (new doc)
- Possibly 1–3 new ADRs for any structural decisions that emerge

Stage 2 close requires the same gate as Stage 1: deliverables exist, Sang explicitly approves, no Proposed ADRs.

---

## Progress Log

### Stage 2-A.1 — DONE (2026-04-27)

Rename `interview-loop.md` → `alignment-loop.md` completed at Stage 2 open. All references updated.

### Stage 2-A.2 — DONE (2026-04-27)

Phase 0 auto-scan algorithm specified. Four key decisions accepted:
- **R1-A**: low-confidence brownfield gets a Phase 1 one-liner confirmation
- **R2-A**: CLAUDE.md > AGENTS.md > README.md priority; semantic divergence surfaces as explicit Phase 2 probe (never silent merge)
- **R3-A**: strict per-folder isolation; never walk above `cwd`; monorepo expansion requires explicit `--workspace-root` flag
- **R4-A**: Phase 0 result always displayed to user immediately before Phase 1 prompt

Full SPEC committed to `docs/loops/alignment-loop.md` under "Phase 0 — Auto-scan [SPEC]" section. Time budget: ≤ 2s. No LLM calls, no write ops, no above-cwd reads.

### Stage 2-A.3 — DONE (2026-04-27)

Phase 1 open intake algorithm specified. Four key decisions accepted:
- **R1-A**: brownfield prompt explicitly references docs already read (CLAUDE.md, README.md) so user spends words on what we don't know
- **R2-A**: greenfield prompt suggests 3 dimensions (what / why / shape) without forcing structure
- **R3-A**: 8 KB soft cap (≈ 1500 words) with gentle notice; 16 KB hard truncate with announcement at echo
- **R4-A**: mechanical echo back ("Captured N words via {method}") — no LLM-generated summary (avoids F4 violation if summary is wrong)

Full SPEC committed to `docs/loops/alignment-loop.md` under "Phase 1 — Open Intake [SPEC]". Editor escape contract specified ($EDITOR with vim/nano/vi fallback, comment-header convention, audit-preserved temp file). Failure modes F2/F3/F8 specifically guarded.

### Stage 2-A.4 — DONE (2026-04-28)

Phase 2 round structure specified. Five key decisions accepted:
- **R1-A**: "Why this question?" purpose label always at top of every round (mandatory, F2 enforcement)
- **R2-A**: "📎 Building on..." continuity block always at top, quoting prior answer or detected fact (mandatory, F4 enforcement)
- **R3-A**: Socratic case-probe only on load-bearing fields (telos, form.essential_structure, AC) — material/efficient confirm-only (avoids F-Socrates-2 over-probing)
- **R4-A**: Round header shows `Round N of ~estimate` (tilde signals not-a-promise); estimate may revise mid-loop with explicit notice
- **R5-A**: Aporia → LLM proposes refined version + user explicitly chooses [Enter accept] / [e edit] / [k keep with tension_acknowledged]; never auto-apply

Round structure spec includes:
- Engine algorithm with three I/O modes (TUI / JSON / MCP) per ADR-0005
- Four exact TUI mockups (Mode A round, Mode B round, Socratic probe, Aporia refinement) — implementation contract
- Layout contract: 12-section round template with mandatory ordering
- LOAD_BEARING_FIELDS enumerated explicitly
- JSON/MCP payload schema for Mode 2/3 facades
- Eight failure modes (F1-F8) all specifically guarded with implementation rules

Full SPEC committed to `docs/loops/alignment-loop.md` under "Phase 2 — Round Structure [SPEC]".

### Stage 2-A.5 — DONE (2026-04-27)

Phase 2 round ordering specified. Five key decisions accepted:
- **R1-A**: Husserl Phase −1 default-on for greenfield, default-off for brownfield (`agora bracket` always available for explicit invocation)
- **R2-A**: Telos-first invariant is a HARD GATE — no other contributor leads a round until telos reaches NOESIS. Override only via `--accept-low-telos-maturity` flag (recorded as permanent trust warning)
- **R3-A**: Phase 0 detected_markers auto-fill material_cause as Mode A recommendations; user confirms/edits but never re-types from scratch
- **R4-A**: AC generation = LLM drafts 3-5 from telos+form, user edits/adds/removes; then each AC enters Socratic case-probing
- **R5-A**: Backtrack via explicit intent only — `agora seed --edit <field>` command OR in-round natural language "actually let me change..." prefix. Downstream dependent fields flagged stale, history preserved.

Established the **Conductor + Contributor model**: Socrates conducts every Phase 2 round (case-probing wrapper); exactly one Contributor leads each round (Aristotle for cause investigation, Plato.divided_line for maturity check, Plato.dihairesis at handoff). Husserl is one-shot pre-Phase-2; Aquinas is not in Alignment Loop at all.

Full SPEC committed to `docs/loops/alignment-loop.md` under "Phase 2 — Round Ordering [SPEC]" with full round-planner algorithm pseudo-code, invocation conditions for Husserl, telos-first enforcement, material auto-fill flow, AC drafting bounds (3-5), backtrack mechanics, and failure modes F2/F4/F5 specifically guarded.

### Stage 2-A.6 — DONE (2026-04-28)

Recommended-options generation algorithm specified. Five key decisions accepted:
- **R1-A**: Source 1 (project-specific) extraction by LLM with strict prompt + verbatim source_passage verification (no fabrication)
- **R2-A**: Source 2 (Aristotle exemplars) lives in `src/agora/philosophers/aristotle/exemplars/{cause}.yaml` — version-controlled, community-extensible via PR with justification
- **R3-A**: Source 3 (prior consistency) — LLM derives 1-2 options from recent N=3 answers; consistency_link rendered for user understanding
- **R4-A**: Source 4 (LLM creative) triggers only `if len(candidates) < 3` — token economy + Source 1-3 priority
- **R5-A**: Automatic Mode A → Mode B fallback when `len(options) < 2` — announced inline ("limited project-specific signal"), honest about confidence level

Source priority ranking with weights:
- Source 1 (project-specific): 0.5  — user's own materials, highest trust
- Source 2 (Aristotle exemplars): 0.2 — curated universal fallback
- Source 3 (prior consistency): 0.2 — F4 reinforcement, coherent seed building
- Source 4 (LLM creative): 0.1 — bridge only when needed

Aristotle exemplars library specified:
- File layout: `exemplars/{telos,form,material,efficient,acceptance_criteria}.yaml`
- Example telos.yaml shape with archetype tags (introspective, relational, instrumental, reputational, utilitarian)
- Starts small (5-8 per field), grows on demand via PR + justification

Failure modes F2/F4/F7/F8 specifically guarded. Provenance preserved on every option (source tag).

Full SPEC committed to `docs/loops/alignment-loop.md` under "Phase 2 — Recommended-options Generation [SPEC]".

### Stage 2-A.7 — DONE (2026-04-28)

Validation gates per claim specified. Five key decisions accepted:
- **R1-A**: composition by `min(3 axes)` — chain-of-strength. Strong axis cannot compensate for weak one. Conservative by design (0.9^10 cost > one extra round)
- **R2-A**: telos.failure_signal floor = DIANOIA (not NOESIS). Honest "I don't know" allowed; Ralph Gate 5 absorbs the slack
- **R3-A**: tension-acknowledged claim caps at DIANOIA (axis 2 enforcement). Honest signal preserved, not silently rounded to NOESIS
- **R4-A**: SIBLING_REQUIREMENTS only for load-bearing field interdependencies (telos↔served_good mutual; form needs telos; AC needs both). Material/efficient have no sibling constraints
- **R5-A**: maturity displayed in `agora status` and Y3 termination preview only — never per-round (avoids gamification)

Three-axis composition model:
- Axis 1: Plato Divided Line (4 levels: EIKASIA→PISTIS→DIANOIA→NOESIS)
- Axis 2: Socratic survival (probe history; load-bearing fields only)
- Axis 3: Aristotelian coverage (sibling requirements; encodes telos-primary)

REQUIRED_FLOORS table specified per field with defensible justifications.
Backtrack interaction specified (axis 3 cascade to dependent claims).
F-Aquinas-4 (silent overruling) specifically guarded.

Full SPEC committed to `docs/loops/alignment-loop.md` under "Validation Gates per Claim [SPEC]".

### Stage 2-A.8 — DONE (2026-04-28)

Termination Gate (Y2 + Y3) algorithm specified. Five key decisions accepted:
- **R1-A**: Y2 = 3 AND-ed conditions (all REQUIRED_FLOORS settled + no unresolved divergences + no pending backtracks)
- **R2-A**: Y3 preview gated by quality ≥ 0.75 — bad preview suppressed entirely (omitted, not announced)
- **R3-A**: 3-option dialog (Yes refine / No lock / Show full seed). 3 is the sweet spot — binary too thin, 4+ overflow
- **R4-A**: "Yes refine" → free input → LLM parses intent to field path → R5-A backtrack. Disambiguation flow if confidence < 0.8
- **R5-A**: Maturity + aporia summary always shown in termination dialog (the most consequential decision moment needs full info)

Critical Sang non-negotiable preserved: **termination is never silent**. Y2 satisfaction only unblocks the dialog, never bypasses it. Every alignment session ends with explicit user assent.

Preview generation specified:
- 4-8 lines, first-person summary, no bullets, no jargon, no timelines
- Must reference telos.statement + telos.served_good + form.essential_structure
- Quality scored on 5 signals (coherence, seed_alignment, specificity, length, no_forbidden_patterns)
- Weighted average; threshold default 0.75

Termination acceptance flow:
- Seed metadata write (locked_at, alignment_session_id, round_count, aporia_count, tension_acknowledged_fields)
- Plato Dihairesis decomposition runs (handoff — Stage 2-C territory)
- State transition to `ready_for_ralph`

Failure modes F2/F4/F7/F8 + Sang's non-negotiable all guarded.

Full SPEC committed to `docs/loops/alignment-loop.md` under "Termination Gate (Y2 + Y3) [SPEC]".

### Stage 2-A.9 — DONE (2026-04-28)

Brownfield/greenfield branching consolidated into a single SPEC table.
Three key decisions made/refined:

- **R1-A**: low-confidence brownfield → user replies "new project" → eager re-routing
  (classification flips to greenfield + Husserl invoked immediately + context_docs/markers cleared + reclassification recorded)
- **R2-B (Sang revision of R2-A)**: greenfield Husserl Phase −1 has NO skip flag.
  Biased-product principle commits to the most valuable single phase. Escape valve =
  rapid affirmation through brackets (≈30s if frame is sturdy). Removing `--no-bracket`
  prevents lazy-skip from defeating the phase that justifies greenfield UX.
- **R3 hybrid (Sang's question expanded into 4 cases)**: existing `.agora/` directory
  on `agora new` is handled by reading `state.json` and branching:
  - **Case A (no prior)**: Fresh start
  - **Case B (in-progress unfinished)**: Warning dialog (Resume / Discard / Cancel)
  - **Case C (locked seed)**: Auto-ingest prior seed as context + Phase 1 variant prompt
    ("Add feature / Refine seed / Something different")
  - **Case D (Ralph in progress)**: Confirmation dialog (Pause + new alignment / Continue Ralph / Cancel)

Per-phase divergence consolidated into a single comparison table covering
Husserl, Phase 0, Phase 1, Phase 2 (Husserl gating, Material round,
Divergence rounds, Options Source 1), Validation gates, Termination dialog,
estimated round count.

`state.json` schema implications captured (phase enum, seed_locked,
alignment_started_at, rounds_completed, etc.) — Stage 2-A.10 and Stage 4
will further constrain.

`agora resume` defined as the natural mate to Case B — either invoked directly
or selected from the Case B warning dialog. Behavior across all state.phase
values enumerated.

Failure modes F2/F5/F-Aquinas-4 + Sang's non-negotiable all guarded.

Full SPEC committed to `docs/loops/alignment-loop.md` under "Brownfield / Greenfield Branching [SPEC]".

Sang's question that drove the refinement:
> "이전 seed가 끝나지 않은 상태로 있는 경우가 어떤경우가 있을까?
>  하다 중간에 멈추고. 다시 들어와서 새로 시작하고싶은 경우가 있을까?
>  그렇다면 C안으로 가야할까?"
This question split R3-A's overly-simple recommendation into the 4-case
hybrid that captures real user states.

### Stage 2-A.10 — DONE (2026-04-28)

Mini-alignment re-entry from Ralph (Z2 escalation) specified.
Five key decisions accepted:

- **R1-A**: Z1 → Z2 escalation threshold = 3 self-correction failures.
  3 is noise/signal threshold; 1-2 may be LLM statistical noise.
- **R2-A**: Z2 entry always pauses Ralph + announces 3-option entry dialog
  ([Enter] proceed / [c] cancel-keep-paused / [a] abort-to-full).
  Silent Z2 forbidden (Sang's non-negotiable extends here).
- **R3-A**: Mini-alignment scope = `affected_fields + axis-3 cascade`.
  Reuses Validation Gates SPEC's `SIBLING_REQUIREMENTS` table for natural expansion.
  Surgical not wholesale; cascade ensures consistency.
- **R4-A**: Mini-alignment SKIPS Phase −1, Phase 0, Phase 1.
  Only Phase 2 round-planner runs, bounded to reset_targets.
  Reasons: codebase context unchanged, intake unchanged, frame already bracketed.
  User who needs more can choose "Abort to full" from mini-termination dialog.
- **R5-A**: Mini-termination dialog = 3 options.
  [Resume Ralph from checkpoint with replay] /
  [Discard last 3 iterations + restart Ralph fresh] /
  [Abort + return to full agora new flow]

Z3 (silent override + push forward) remains structurally forbidden per Sang's
Stage 1 input: every Ralph iteration definitionally includes alignment verification.

After-action handlers specified:
- **Resume**: replay 3 paused iterations against refined seed (automatic gate
  re-run); user sees "↻ Replaying..." then result
- **Discard + restart**: counter reset, ralph fresh from iteration 1
- **Abort to full**: state transitions to `in_alignment`, mini-alignment
  refinements preserved, full Phase 2 re-opens (no Phase -1/0/1 per Case C)

Failure modes F2/F4/F5/F-Aquinas-4 + Sang's non-negotiable all guarded.

Full SPEC committed to `docs/loops/alignment-loop.md` under "Mini-Alignment
Re-entry from Ralph (Z2) [SPEC]".

---

## Stage 2-A — ALL SUB-QUESTIONS RESOLVED (2026-04-28)

All 10 sub-questions (2-A.1 through 2-A.10) are now SPEC-accepted in
`docs/loops/alignment-loop.md`. The document is ready to be marked
**Accepted** as a whole upon Sang's review.

Summary of Stage 2-A SPECs:
- 2-A.1: Rename interview-loop → alignment-loop
- 2-A.2: Phase 0 auto-scan algorithm
- 2-A.3: Phase 1 open intake design
- 2-A.4: Phase 2 round structure (4 mockups)
- 2-A.5: Round ordering (Conductor + Contributor model)
- 2-A.6: Recommended-options generation (4-source ranking)
- 2-A.7: Validation gates per claim (3-axis composition)
- 2-A.8: Termination Gate Y2 + Y3 (preview quality threshold)
- 2-A.9: Brownfield/greenfield branching (per-phase table + 4-case state branching)
- 2-A.10: Mini-alignment re-entry from Ralph (Z2 escalation)

**Stage 2-A — CLOSED on 2026-04-28** (explicit Sang approval).

`docs/loops/alignment-loop.md` Status header updated to:
> **Accepted (Stage 2-A closed 2026-04-28).**

---

## Stage 2-B — Ralph Loop full spec (ENTERING NOW)

7 open questions inherited from `docs/loops/ralph-loop.md`:

1. **Gate 0 — Probe registry initial coverage** (Stage 2-B.1)
   Which CLIs/tools ship probes in v1? Initial set from ADR-0006 needs commitment.

2. **Gate 1-2 — Test regeneration trigger** (Stage 2-B.2)
   When do Playwright CLI tests get regenerated vs incrementally updated?

3. **Gates 3-4 — Critic persona selection** (Stage 2-B.3)
   Which UI/UX and code-quality personas run Aquinas Disputatio?

4. **Gate 5 — Drift score numeric threshold** (Stage 2-B.4)
   What value of "drift score" triggers Z1 fail? (Z1 → Z2 escalation count is 3 from 2-A.10; this is per-iteration threshold.)

5. **Engine — Iteration cap** (Stage 2-B.5)
   Hard cap on iterations per session? Token-budget-based stopping? Both?

6. **Engine — Parallel iterations** (Stage 2-B.6)
   Should Ralph try multiple iteration paths in parallel and Disputatio between?

7. **Cross-cutting — Bypass UX** (Stage 2-B.7)
   Details of `--skip-gate-0=<list>` and which other gates have bypass at all.

### Stage 2-B priority order

Gate-by-gate (Ralph execution order), then engine cross-cutting:

```
2-B.1  Gate 0 probe registry initial coverage    ← unblocks gate execution
2-B.2  Gate 1-2 test regen trigger               ← Gate 2 depends on this
2-B.3  Gates 3-4 critic personas                 ← Aquinas operational detail
2-B.4  Gate 5 drift score threshold              ← Z1 fail criterion
2-B.5  Engine iteration cap                      ← when does Ralph give up entirely
2-B.6  Engine parallelism                        ← architecture choice
2-B.7  Cross-cutting bypass UX                   ← consolidates all gate skip rules
```

Working principle: same as Stage 2-A. Mode B (single recommendation + alternatives) for Sang's non-expert areas; Mode A (recommended options + free input) for product decisions.

Stage 2-B will produce: `docs/loops/ralph-loop.md` promoted from placeholder + 5+1-gate skeleton to full SPEC, plus possible new ADR(s) for any structural decisions.

### Stage 2-B.1 — DONE (2026-04-28)

Gate 0 Probe Registry specified with v1 shipping 19 probes.

Two-axis model formalized (after Sang surfaced the muddled "universal" terminology):
- **`detect()` shape**: always-true OR marker-based — determines when probe is activated for current project
- **Tier**: 1 / 2 / 3 — determines when probe code ships in Agora package
- Axes are independent

Decisions:
- **R1 (3-tier structure)**: Retained — Tier concept still drives future expansion
- **R2 (v1 composition)**: Sang custom — promoted Tier 2 entirely + 5 Tier 3 probes (gcloud, aws, bun, upstash, cloudflare) into v1
- **R3-A (5-min TTL caching)**: `.agora/cache/gate0_results.json` with 300s TTL. `agora doctor --refresh` for manual bust
- **R4-A (PR-based community additions)**: `src/agora/infra/probes/{id}.ts` + registry entry, ADR-0006 interface
- **R5-A (user disable via .agora/config.toml)**: `[probes].disabled = [...]` with `agora doctor --include-disabled` flag

v1 probe set (19):
  Universal (3): claude, node, pnpm
  Tier 1 marker (5): git, gh, vercel, supabase, anthropic_api_key
  Tier 2 promoted (6): stripe, clerk, openai_api_key, docker, railway, posthog_key
  Tier 3 promoted (5): gcloud, aws, bun, upstash, cloudflare

Tier 3 deferred to community: sentry, sendon, rocketapi, kakao_oauth, go/rust/python toolchains, mongodb, redis_cloud, etc.

`agora doctor` standalone command shares probe execution with Gate 0 but:
- Always runs full bundled ∩ active set (no skip)
- Rich multi-section output
- `--refresh`, `--include-disabled`, `--json` flags

Failure modes guarded: stale cache (TTL), false-positive (disable), niche uncovered (warning not block), probe bug (5s per-probe timeout).

Meta-learning: I rushed Q1 by introducing "universal probes" without integrating with tier system. Sang caught it; we re-explained with the 2-axis model. Captures F2/F3 violation by Claude. Future spec presentations should ground the foundation before posing decisions.

Full SPEC committed to `docs/loops/ralph-loop.md` under "Gate 0 — Probe Registry [SPEC]".

Next task: Stage 2-B.2 — Test regeneration trigger (when do Playwright CLI tests get regenerated vs incrementally updated; Gate 2 detail).
