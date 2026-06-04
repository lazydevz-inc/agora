# Code-Quality Backlog

> Source: a design-level audit of `src/` (2026-06-02), run during public-release
> prep. The domain core is in good architectural health — clean `ClaudeRunner`
> abstraction (DIP), dependency-injected philosopher UIs, real `probes/` +
> `critics/` registries, and intact layer/peer isolation (one documented
> exception below). What drags it down is a **missing "command/step shell"**: the
> same plumbing concerns are reimplemented by hand across 15–20 files.
>
> These are tracked here rather than fixed inline because each is a multi-file
> refactor that deserves its own reviewed slice (per SESSION_HANDOFF §5: spawn an
> independent review before committing a big refactor). Do the top three **before**
> adding a 6th philosopher or a new gate — otherwise the new code inherits every
> existing copy.

## Done

- ✅ **`shared/version.ts`** — `getAgoraVersion()`/`readPackageVersion()` was
  copy-pasted in 20 files (18 commands + `render.ts` + `mcp/server.ts`). Extracted
  to one memoized `agoraVersion()`; −244 LOC. (`pnpm verify` green, 471 tests.)

## High — do these first (the "command/step shell")

| # | Issue | Evidence | Fix |
|---|-------|----------|-----|
| H1 | **Session preamble hand-rolled in ~15 files** — `findProjectRoot` → `hasAgoraDir` → `user.aborted("No Agora session…")` → `loadState` → corrupt check, repeated identically. | `telos.ts:51`, `form.ts:52`, `maturity.ts:54`, `ac.ts:53`, `handoff.ts:56`, `round.ts:62`, `socrates.ts:63`, `ralph.ts:69`, `mcp/align-step.ts:74`, `mcp/ralph-step.ts` | Add `cli/command-context.ts: requireSession(cwd): Result<{state,cwd}, AgoraError>`. Each command opens `const ctx = await requireSession(cwd); if (!ctx.ok) return ctx;`. Removes the single most-repeated block in the repo. |
| H2 | **LLM-response parse boilerplate ~50×** — the 4-step `!ok → llm.internal-error` / `typeof !== object → llm.invalid-response` / `safeParse` / `issues[0]` wrap. `mcp/steps/*` additionally re-implement `parseLlmExtraction` + `safeJsonParse` 10×. | `aristotle.ts` (8×), `ralph/disputatio.ts` (8×), every philosopher + every `mcp/steps/*` (`llm.invalid-response` = 70 hits / 20 files) | Add `llm/parse-json-response.ts: parseJsonResponse<T>(resp, schema, label)` + `mcp/step-llm.ts: extractLlmJson<T>(args, id, schema)`. Collapses ~600 LOC and locks the 3 LLM error codes to one definition. |
| H3 | **`ralph.ts` god-functions** (944 LOC). `runRalphCommand` + `applyGate5Outcome` do seed-load + state-init + transition + Gate1 + log + Gate2 + Gate5 + Disputatio + envelope. The "stay-on-leaf" persistence block is duplicated 5×. | `ralph.ts:65`, `:448`; dup at `:232/:265/:580/:635/:691` | Extract `persistLeafFailure(...)` for the 5 variants; split into `runGatePipeline()` (returns a gate-outcome ADT) + `persistOutcome()`. |
| H4 | **`mcp/align-step.ts` `beginX`/`applyXOutcome` repeated 8×** + three parallel switches (`pickAlignTarget`, `dispatchPending`, `beginAlignTarget`) that must all be edited to add a step. | `align-step.ts:191/214/123`, step pairs `:234`–`:758` | Define a `StepModule { begin, advance, persist }` interface + `Record<AlignTarget, StepModule>` registry. Adding a 9th step = one table entry. (Mirrors the `probes/`/`critics/` registry pattern already used well elsewhere.) |

## Medium

| # | Issue | Fix |
|---|-------|-----|
| M1 | `cli/index.ts`: 18 near-identical `dispatchX` fns + an inline exit-code map (`cat==="state"?20:…`) repeated 14×; command wiring is a 70-line `if`-ladder. | `const COMMANDS: Record<string,{run, interactive?}>` table + one generic `dispatch()`; single exit-code source (`render.ts:getExitCodeForError`). |
| M2 | Every command re-defines `buildEnvelope` + `askText` by hand (15× / 7×). | `render.ts: okEnvelope(command, data, next)` + `cli/clack-ui.ts: askText()`. |
| M3 | `user.aborted` overloaded across 43 sites; the actionable guidance lives only in an un-localized `detail` string (never reaches the ko catalog). | A few precise codes (`user.prerequisite-missing`, `user.interactive-only`, `user.over-step-guard`) with parameterized, localized message keys. |
| M4 | Per-command flag parsing hand-rolled 3× (`parseAcArgs`, `parseHandoffArgs`, `parseZ2Preselect`). | `cli/flags.ts: parseValueFlag()` / `parseEnumFlag()`. |
| M5 | `maturity.ts applyXMaturity` ×4 and `align-step.ts applyMaturityToCauses` are the same fold written twice (CLI vs MCP divergence risk). | One `applyMaturityTags(causes, perCause)` in `philosophers/plato.ts`, reused by both paths. |

## Low

| # | Issue | Fix |
|---|-------|-----|
| L1 | `as unknown as Record<string,unknown>` 17× (scratch serialize + envelope `data` casts). | Type `McpPending.scratch` as `unknown`; typed `okEnvelope<T>` so the cast lives in one place. |
| L2 | `ProbeContext` throwing-stub leak — `phase-0-scan.ts:131` + `doctor.ts:57` build a fake context whose `shellExec` throws, via `as unknown as`. | Split a narrower `MarkerContext` (no `shellExec`) — ISP; neither call site needs the stub. |
| L3 | Inline philosopher/gate prompts (`*_SYSTEM` constants) still bypass the prompt library. | Already tracked: finish the `renderPrompt(...)` migration (`disputatio.ts` already does it). |

## Documented exception (not a bug — record it)

- **`mcp/` (LAYER 2) imports read-only command runners + render/flags types from
  `cli/` (LAYER 3)** — `mcp/tools.ts:15` (`runDoctorCommand`/`runResumeCommand`/
  `runStatusCommand`/`runTraceCommand`, `GlobalFlags`, `CommandEnvelope`),
  `mcp/align-step.ts:19` (`ElenchusFile` type). The stated rule is "nothing imports
  `cli/`." This is **intentional** — the read-only MCP tools wrap LLM-free CLI
  commands (`tools.ts` says so) — but it's currently undocumented, so it reads as a
  silent layer breach. **Action:** either (a) move the shared *types*
  (`GlobalFlags`, `CommandEnvelope`, `ElenchusFile`) down to a LAYER-0/1 module and
  relocate the command cores, or (b) sanction the seam explicitly in
  `docs/architecture/module-graph.md` (preferred, low-risk): "`mcp/` may import
  read-only, LLM-free command runners + shared CLI render/flags types — the one
  allowed inward edge to `cli/`."
