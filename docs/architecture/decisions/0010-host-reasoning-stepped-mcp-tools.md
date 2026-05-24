# ADR-0010 — Host-Reasoning Stepped MCP Tools (Align + Ralph)

> **Status**: Accepted
> **Date**: 2026-05-24
> **Decided by**: Sang Rhee
> **Discussed with**: Claude
> **Schema discipline**: strict (zod-validated `user_answers` / `llm_responses` at the tool boundary).

## Context

ADR-0009 made the in-Claude-Code MCP plugin Agora's primary mode (Mode 3,
zero LLM calls from Agora — the host session reasons). The plugin
foundation shipped (`src/mcp/server.ts` + `src/mcp/tools.ts`) but exposes
only **four read-only tools** (`agora_status`, `agora_doctor`,
`agora_resume`, `agora_trace`). The LLM-bearing loops — Alignment Phase 2
and Ralph — are still CLI-only and route through the standalone
`ClaudeRunner` (Mode 2 subprocess), which after 2026-06-15 enters
Anthropic's metered Agent-SDK credit pool.

To make Mode 3 actually viable, the alignment loop and Ralph loop must be
reachable from the host Claude Code session via MCP — and the host must
supply reasoning, not Agora.

### What the current LLM call sites look like

Eleven LLM call sites today, all routed through `runner.call(opts)`:

| Loop | Module | Calls / round | Pattern |
|------|--------|---------------|---------|
| Align | `philosophers/husserl.ts` (bracket) | 1 | 1 LLM call |
| Align | `philosophers/aristotle.ts` (telos / form / material / efficient) | 4 × (1-2 calls) | local Qs → extract → opt re-extract |
| Align | `philosophers/socrates.ts` (elenchus) | 1-N | case-probe |
| Align | `philosophers/plato.ts` (maturity, dihairesis) | 1-3 | maturity tag + DH tree |
| Align | `alignment/acceptance-criteria.ts` | 1 | AC extraction |
| Align | `handoff/dihairesis.ts` | 1-3 | DH chain |
| Ralph | `ralph/gate-5.ts` | 1 | drift_score |
| Ralph | `ralph/disputatio.ts` | 3 + N critics | **parallel** Videtur + 3 serial stages |

Common shape: each round is `local interaction → LLM extract → maybe
follow-up local → maybe LLM re-extract → persist`. Multi-call rounds
(Disputatio, DH) chain several LLM calls with intermediate state.

### Why a callback-style ClaudeRunner doesn't work as-is

An obvious-looking design — a `HostCallbackRunner implements ClaudeRunner`
whose `.call()` suspends until the host hands back an answer — fails
inside an MCP tool boundary. A tool handler is a single request/response;
it cannot yield mid-call to ask the client for help and resume. (MCP's
`createMessage` / sampling capability could in principle support this,
but Claude Code's support is not something we want to depend on for the
primary mode.)

ADR-0009 §Implementation notes 2 already anticipated this: *"Factor the
philosopher/gate logic so the reasoning step is injectable."* This ADR
turns that one line into a concrete contract.

## Decision

Expose alignment and Ralph as **two stepped MCP tools** —
`agora_align_step` and `agora_ralph_step` — that follow a **stateless
tool, stateful disk** contract:

- Each call inspects on-disk state (`.agora/state.json`, `four_causes.json`,
  `ralph_state.json`, plus a new `.agora/mcp_pending.json`).
- The tool decides what comes next and returns **one** of:
  - `{ kind: "done" }` — loop complete, nothing to do.
  - `{ kind: "advanced", … }` — purely deterministic step applied; call
    the tool again for the next step.
  - `{ kind: "needs_user_input", questions: [...] }` — host should ask
    the user, then call the tool again with `user_answers`.
  - `{ kind: "needs_reasoning", prompts: [{ id, system, user, expect }] }` —
    host should reason about each prompt and call the tool again with
    `llm_responses: [{ id, content }]`. **`prompts` is an array** so
    parallel patterns (Disputatio Videtur, N critics) collapse into one
    step.
- When the tool needs work, it also writes `.agora/mcp_pending.json` — a
  small record of *which step* the responses will apply to, plus enough
  scratch context to assemble the next LLM prompt (e.g. raw answers to the
  3 telos questions). The next call merges `user_answers` /
  `llm_responses` with the pending record, applies, advances, decides
  again.

The two existing CLI orchestrators (`runRoundCommand`, `runRalphCommand`)
stay as the Mode 2 path. The stepped MCP path uses the **same underlying
philosopher / gate functions** but reaches them through a new
**prepare / apply split** rather than the existing `runner.call`-driven
end-to-end function. The split is layered as:

```
src/philosophers/<phil>.ts
  ├── existing: run<X>Round(input, runner, ui) — Mode 2
  └── new:      prepare<X>Step(input, pending)  → step envelope
                 apply<X>Result(pending, responses) → next pending | final claim
```

For most philosophers this is a thin refactor: the existing function is
*already* "local Qs → call runner → maybe loop → return". The MCP path
threads through the same prompt-building helpers; only the runner
invocation is replaced by "return the prompt, expect a response next
call."

`ClaudeRunner` itself is untouched. It remains the abstraction for
Mode 2 (subprocess) and any future SDK runner. The MCP path simply
**does not use it** — there is no `ClaudeRunner` implementation that
makes sense inside a single MCP tool handler, by design.

### Tool surface (slices A-E)

```
agora_align_step (
  user_answers?:  Record<string, string>,
  llm_responses?: { id: string, content: string | object }[]
) → StepEnvelope

agora_ralph_step (
  user_answers?:  Record<string, string>,
  llm_responses?: { id: string, content: string | object }[]
) → StepEnvelope

type StepEnvelope =
  | { kind: "done", summary: string }
  | { kind: "advanced", step: string, message: string,
      state_after: { phase, round, ... } }
  | { kind: "needs_user_input", step: string,
      questions: { id: string, prompt: string, hint?: string }[] }
  | { kind: "needs_reasoning", step: string,
      prompts: { id: string, system: string, user: string,
                 expect: "json" | "text", schema_hint?: string }[] }
  | { kind: "error", code: string, message: string }
```

The four existing read-only tools stay; this ADR only adds two new tools.

### Pending-state shape

```
.agora/mcp_pending.json
{
  "version": 1,
  "owner": "align" | "ralph",
  "step": "telos.extract" | "telos.refine" | "disputatio.videtur" | …,
  "expects": "user_answers" | "llm_responses",
  "issued_prompts": [{ id, system, user, expect }]?,  // for needs_reasoning
  "issued_questions": [{ id, prompt }]?,              // for needs_user_input
  "scratch": { … step-specific intermediate state … },
  "issued_at": "2026-05-24T…Z"
}
```

The orchestrator refuses if `user_answers` / `llm_responses` arrive
without a matching pending record, or if `expects` doesn't match.

### Why this shape

1. **One tool per loop, not one per cause.** The host conversation
   already reads as "step → reason → step → reason"; mirroring that in a
   single tool keeps the tool catalog small and lets the orchestration
   logic stay co-located with `pickNextRound` / Ralph leaf-selection.
2. **Stateless tool + stateful disk = MCP-restart-safe.** stdio drops
   don't lose progress.
3. **`prompts` array handles parallelism without a second tool.** The
   N-critic Videtur fan-out becomes "one step, N prompts, host responds
   with N answers." Host (Claude Code) is good at parallel reasoning in
   one turn.
4. **Existing CLI path is unchanged.** Mode 2 keeps working; this is
   pure addition.
5. **ClaudeRunner stays clean.** No callback indirection, no fake-async
   runner — the two reasoning paths are explicitly different and
   honestly named.

## Consequences

### Positive

- Mode 3 becomes useful: alignment + Ralph drivable from inside Claude
  Code with zero metered-pool billing.
- Each philosopher gets a clean **prepare / apply** seam — useful well
  beyond MCP (testability, future "agent-driven" CLI mode that prebuilds
  responses).
- The "host reasons" boundary becomes a *type* (the step envelope),
  not a convention.

### Negative / Trade-offs

- Modest refactor across `philosophers/*` and `ralph/*` to extract
  prepare/apply seams. Most files keep ~80% of their code.
- One small new state file (`mcp_pending.json`) joins the `.agora/`
  zoo. Documented in CLAUDE.md, tracked by git like the other files.
- Two distinct reasoning paths to keep aligned (Mode 2 runner-driven,
  Mode 3 stepped). Mitigated by sharing prompt-builder helpers + a
  prepare/apply test matrix.

### Neutral

- The 4 existing read-only MCP tools are untouched.
- ADR-0009 stands; this ADR is the "Implementation notes #2" promised
  there, written down.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| One MCP tool per cause (`agora_align_telos`, `agora_align_form`, …) | 10+ MCP tools; duplicates `pickNextRound`; host has to know the phase model |
| `HostCallbackRunner` that suspends inside the tool until the host returns | A single MCP tool handler can't yield mid-call without `createMessage` capability we don't want to depend on |
| Lean on MCP sampling (`server → createMessage → client`) | Capability support is uncertain in Claude Code; even if available, the stepped contract is easier to debug and audit (every prompt + every answer ends up on disk) |
| In-memory pending state on the server | Lost on stdio drop / Claude Code restart mid-round; on-disk is trivial and survives crashes |
| Stream prompts via MCP `notifications/progress` | Progress is one-way; we need the host's *response* back, which fits tool args naturally |

## Implementation notes

1. New module `src/mcp/pending.ts` — reader/writer + zod schema for the
   pending record + an "expects matches" guard.
2. New module `src/mcp/step.ts` — `StepEnvelope` types + envelope
   builders.
3. New module `src/mcp/align-step.ts` — the orchestrator. Reads state,
   reads pending, dispatches to per-cause `prepare` / `apply` functions,
   writes pending, returns envelope.
4. Per-philosopher prepare/apply pair, added next to the existing
   `run<X>Round` function (no removal). Slice A starts with Aristotle
   telos; subsequent slices extend the same pattern.
5. `src/mcp/server.ts` registers the two new tools with `inputSchema =
   { user_answers: z.record(z.string()).optional(),
     llm_responses: z.array(...).optional() }`.
6. Same shape repeated for Ralph (slices D-E) — `src/mcp/ralph-step.ts`
   reuses the envelope + pending machinery.
7. **Slicing:** each slice (A → F) ends with `pnpm typecheck` + lint +
   test green, an end-to-end manual exercise of the new step, a commit,
   and a push.

## References

- ADR-0009 (Claude Code Plugin / MCP as Primary Mode) — implements its
  §Implementation notes #2.
- ADR-0005 (Claude Integration via Subprocess) — Mode 2 path that this
  ADR explicitly leaves intact.
- `src/cli/commands/round.ts`, `src/cli/commands/ralph.ts` — the
  Mode 2 orchestrators whose logic the stepped tools mirror.
- `MEMORY/project_claude_code_plugin_pivot.md` — billing pivot driving
  the plugin emphasis.
