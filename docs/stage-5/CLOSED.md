# Stage 5 — CLOSED

> **Status**: Closed
> **Closed on**: 2026-05-04
> **Closed by**: Sang Rhee (explicit approval)
> **Tagged as**: `v0.5.0-stage-5`

---

## What Stage 5 was

Per ADR-0004, Stage 5 was **Internal Architecture + Philosopher Runbooks
+ Prompts**. Its goal: pin the file-tree + dependency rules, the
canonical runbook structure for the 5 philosophers, the prompt library
mechanics, the locale catalog conventions, and the `Result<T, E>`
adoption decision — so Stage 6 implementation has a 1:1 mapping from
SPEC to file.

Stage 5 ran as six focused sub-questions (5-A.1 through 5-A.6). All six
were Mode B (single confident recommendation + alternatives), all six
were accepted with the recommended option. One mid-stage review session
(post-Stage-5-A.3 batch) caught real drift in the Plato runbook before
it propagated to 5-A.4.

---

## Deliverables (all accepted)

| # | Sub-question | Result | Path |
|---|--------------|--------|------|
| 5-A.1 | Module / file-tree organization | Direct `src/<feature>/` (no `src/agora/*`); feature-folder + 4-layer dependency rule; Biome `useImportRestrictions` enforcement; separate `tests/` tree; single `@/*` alias | `docs/architecture/module-graph.md` |
| 5-A.2 | Per-philosopher runbook template | 12-section DTD; runbook-canonical prompt with library-indexed mirror; 4-category test contract; optional examples; integer revision + changelog | `docs/architecture/runbook-template.md` + `docs/philosophers/runbooks/_template.md` |
| 5-A.3 | 5 philosopher runbooks (Rev 2 after review) | All 5 (Husserl/Socrates/Aristotle/Plato/Aquinas) instantiate the 12-section DTD; 12 prompt IDs declared; cross-philosopher integration verified; Plato Rev 2 fixed 3 critical SPEC drift items | `docs/philosophers/runbooks/{husserl,socrates,aristotle,plato,aquinas}.md` |
| 5-A.4 | Prompt library structure | Auto-generated TS module (`src/prompts/_generated.ts`); LAYER 0 placement; hybrid 22-entry library (12 philosopher + 10 critic); manual `pnpm gen:prompts` + CI `pnpm lint:prompts`; `getPrompt`/`renderPrompt` API | `docs/architecture/prompt-library.md` |
| 5-A.5 | Locale catalog content rules | JSON at repo root (`messages/{en,ko}.json`); dot-namespaced snake_case keys (7 reserved namespaces); hybrid nested + flat-leaf-with-dots structure; `pnpm lint:locale` runs 3 checks (parity / ERROR_CATALOG cross-ref / placeholder consistency); catalog vs prompt-library boundary explicit | `docs/architecture/locale-catalog.md` |
| 5-A.6 | `Result<T, E>` adoption | YES adoption; custom inline ~50 LOC (no library); module boundary returns Result, internal helpers may throw; Stage 6 first-commit Result-first; 6 documented throw exceptions; reconciliation with Stage 5-A.4 (`renderPrompt` becomes Result) and Stage 5-A.5 (`localized()` STAYS throw — reverses 5-A.5 closing note) | `docs/architecture/result-type.md` |

No new ADRs in Stage 5 (all decisions inherited from ADR-0001/0002/0004/0005/0006/0007/0008 + Stage 1-4 SPECs).

---

## What was decided in Stage 5

Beyond the SPEC documents, several cross-cutting positions consolidated:

1. **`src/<feature>/` is the canonical layout** — `src/agora/*` namespace
   from CLAUDE.md L256-274 + ADR-0006 examples is now historical.
   CLAUDE.md updated; ADRs preserved as immutable record.

2. **15 top-level feature folders + LAYER 0/1/2/3 dependency rule**:
   LAYER 0 (no inward `src/<feature>/` dep): `shared/`, `result/`,
   `errors/{types,codes}.ts`, `i18n/`, `prompts/`.
   LAYER 1: `config/`, `state/`, `llm/`, `probes/`, `critics/`, `philosophers/`.
   LAYER 2: `alignment/`, `ralph/`, `handoff/`, `mcp/`.
   LAYER 3: `cli/` (top sink).
   Same-layer cross-feature import allowed only at orchestrator file.

3. **One philosopher = one file = one runbook** in the canonical layout.
   `src/philosophers/` (5 modules) is distinct from `src/critics/`
   (10 personas). Aquinas orchestrates critics; critics aren't sub-types
   of Aquinas-the-philosopher.

4. **12 philosopher prompts + 10 critic prompts = 22-entry hybrid library**
   in single `src/prompts/_generated.ts` file. Philosopher prompts canonical
   in runbooks; critic prompts canonical in `src/critics/definitions/<id>.ts`
   exported `prompt` const.

5. **Manual generator + CI in-sync verification** is the consistent
   pattern (`pnpm gen:prompts` / `pnpm lint:prompts`; `pnpm lint:locale`).
   No forced pre-commit hooks at v1 — minimalism.

6. **Locale and prompts are separate concerns**. Catalog = user-facing
   strings (en + ko). Prompts = LLM-facing strings (English-only at v1).
   Small overlap when prompt placeholders carry catalog-resolved values
   (Korean alternatives embedded in English templates).

7. **Result<T, E> adopted, throw kept where ergonomic**. Module exports
   return Result; internal helpers throw freely. `localized()` and
   `interpolate()` and `buildAgoraError()` deliberately stay throw
   (with documented rationale per case). `renderPrompt` converts to
   Result-returning at module boundary.

8. **F1 enforcement is mechanical** at multiple checkpoints:
   - `pnpm lint:locale` Check 1 catches en/ko keyset divergence
   - `i18n/index.ts` self-throws on missing key (no silent en fallback)
   - The single documented English-fallback exception is i18n's own
     `makeMissingKeyError` (developer-facing, never user-visible)

9. **Runbook revision tracking** is integer + changelog table, with
   bump conditions pinned (prompt text / output contract / quality bar /
   forbidden list / when-called trigger). Stage 6 implementation files
   carry `// runbook: <name>@N` comment; CI lint warns on revision drift.

10. **One mid-stage review prevented downstream propagation**: 5-A.3
    batch had 3 critical drift items in Plato (REQUIRED_FLOORS dict,
    `is_atomic()` criteria, ACNode shape) caught before 5-A.4 indexed
    them. Lesson formalized for future batches: spawn review agent
    before commit, not after.

---

## Deliberately deferred

These items Stage 5 chose **not** to settle. Routed to Stage 6+ or
beyond.

| Item | Stage |
|------|-------|
| Actual locale catalog content (en/ko strings populated per scaffold) | Stage 6 |
| Actual prompt content fingerprints (drafts in runbook §4; Stage 6 generates) | Stage 6 |
| `scripts/gen-prompts.ts` implementation (markdown parser choice, etc.) | Stage 6 |
| Pre-commit hook for prompts/locale regen (deferred per R4-A in both 5-A.4 and 5-A.5) | Stage 6 (only if workflow surfaces need) |
| Library bindings: commander vs citty, MCP SDK choice, TOML parser, markdown parser | Stage 6 |
| Test fixture conventions (synthetic projects, canonical seeds, llm-responses fixtures) | Stage 6 |
| First vertical slice + which subcommand it implements | Stage 6 (first sub-question) |
| Tab completion shell scripts | Stage 6 |
| `match` / `Result.all()` / pipeable Result combinators (add only on concrete need) | Stage 6+ |
| `validation.*` ERROR_CATALOG family (surfaced as gap during Husserl runbook Rev 2) | Stage 6 (next ERROR_CATALOG evolution) |
| Per-phase bypass flags (`--skip-bracket`, `--skip-elenchus`, `--skip-dihairesis`) | Whenever real CLI use case surfaces |
| Husserl domain-specific brackets beyond Software/Form/Audience | Whenever non-software use case surfaces |
| Runbook examples for Aristotle (omitted per R4-A; add in Rev 2 if calibration needed) | Stage 6+ |
| `Result.all()` / `Result.collect()` / `match` combinators | Stage 6+ on concrete need |
| 6th philosopher candidacy | Stage 7+ on concrete justification (MANIFESTO V) |

---

## Verification of close

A stage closes only when (per ADR-0004):

1. All named deliverables exist and are committed ✅
2. Sang has read and approved them ✅ (explicit approval per round
   throughout 5-A.1 through 5-A.6, including Rev 2 fix approval after
   the post-batch review session)
3. No ADR is left in `Proposed` state from this stage ✅ (no new ADRs in
   Stage 5)

All three conditions met.

---

## Next stage

**Stage 6 — Implementation (vertical slices)** opens here. See
`docs/stage-6/NOTES.md` for the entry plan.

This is the **first stage where actual TypeScript code beyond placeholder
is written**. Stage 0-5 produced 5,300+ lines of SPEC across 17 doc
files. Stage 6 turns those into runnable code, one vertical slice at a
time. The first sub-question is which slice to start with.

Per Stage 1 / ADR-0004 plan:
- First vertical slice (smallest end-to-end path that exercises multiple layers)
- Subsequent slices accumulate, each adding capability
- Real `agora` commands come online incrementally
- Definition-of-done (DoD) per slice: passes typecheck/lint/test
  + manually verified in TUI + JSON modes + (where applicable) MCP mode

Estimated open-ended sub-questions (no fixed count). Stage 6 closes
when v1 is feature-complete per north-star.md 3-month horizon — likely
20-50 sub-questions over weeks of focused work.

---

*This document is immutable. Stage 5 is over.*
