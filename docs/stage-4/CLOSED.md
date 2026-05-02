# Stage 4 — CLOSED

> **Status**: Closed
> **Closed on**: 2026-05-03
> **Closed by**: Sang Rhee (explicit approval)
> **Tagged as**: `v0.4.0-stage-4`

---

## What Stage 4 was

Per ADR-0004, Stage 4 was the **Infrastructure + LLM Integration + Install**
stage. Its goal: bridge the Stage 2 / Stage 3 specifications (loops, CLI,
gates) down to concrete infrastructure contracts that Stage 6+ can implement
without re-arguing design.

Stage 4 ran as six focused interview rounds (4-A.1 through 4-A.6), each
producing a SPEC section committed individually for traceability. All six
were Mode B (single confident recommendation + alternatives), all six were
accepted with the recommended option.

---

## Deliverables (all accepted)

| # | Sub-question | Result | Path |
|---|--------------|--------|------|
| 4-A.1 | Install mechanics | 3 v1 distribution channels (npx / pnpm dlx / npm install -g), `npx -y` documented for AI agents, first-run banner via `~/.agora/.first_run` marker, `agora --version` single-line + JSON env context | `docs/infra/install.md` |
| 4-A.2 | Claude integration runtime | Single `ClaudeRunner.call(opts)` interface with composition (CachedRunner wraps ClaudeCliRunner / ClaudeSdkRunner), 3 attempts exponential backoff, 60s default timeout SIGTERM/SIGKILL, per-project cache, SDK fallback warning once per session | `docs/infra/llm-integration.md` |
| 4-A.3 | Config loading | TOML + Zod single source of truth, deep merge per section, `~/.agora/config.toml` global (no XDG), direct `$EDITOR` + `agora doctor --explain-config`, `version=1` field with manual migration | `docs/infra/config.md` |
| 4-A.4 | Probe registry implementation | `Probe` interface with discriminated `detect_shape`, one file per probe under `src/probes/definitions/`, bounded parallel concurrency=5 + 5s timeout, shared `markers.ts` memoized helpers, deterministic-only caching (no timeout/exception cache) | `docs/infra/probes.md` |
| 4-A.5 | MCP server design | `agora --mcp-server` global flag, all 7 commands → 7 tools 1:1 with `agora_<command>` prefix, stateless per-call with mandatory `cwd` arg, `CallToolResult` with text + `structuredContent`, 2-step `host_action_required` protocol for LLM-needing ops | `docs/infra/llm-integration.md` (appended) |
| 4-A.6 | Error handling + telemetry | `AgoraError` + central `ERROR_CATALOG` (per-error exit code in catalog), local-only crash reports with secret redaction, **no telemetry at v1** (MANIFESTO P6), locale-aware messages via en/ko catalog with F1 enforcement | `docs/infra/errors-and-telemetry.md` |

No new ADRs in Stage 4 (all decisions inherited from ADR-0001/0002/0005/0006/0007 + Stage 2/3 SPECs).

---

## What was decided in Stage 4

Beyond what's in the SPEC documents, several cross-cutting positions
consolidated:

1. **5 docs/infra files form the implementation contract**: every
   subsystem Stage 6 will build has a SPEC file with TypeScript
   interfaces, algorithms, and boundaries. No major surprises remain.

2. **Zod adoption brought forward from Stage 5 to Stage 4-A.3**: config
   is the first place needing runtime-validated external input; using a
   different lib here than Stage 5+ domain models would create dual-stack
   overhead. Stage 5 inherits this choice.

3. **MCP server is part of LLM integration story, not a separate file**:
   Mode 3 (per ADR-0005) is structurally about *not* nesting LLM calls,
   so it lives in `llm-integration.md` next to the runner it short-circuits.

4. **Telemetry permanently forbidden at v1**: explicit forbid list of
   SDKs (PostHog, Sentry, Mixpanel, Amplitude, Datadog) at runtime
   import. Re-evaluation requires ADR-0007 public-release trigger fire
   AND a metric question local data can't answer.

5. **Crash reports are local-only artifacts**: `~/.agora/crashes/<ts>.json`
   with auto-redaction of secret env vars (exact list + pattern). User
   can attach manually to bug reports. No phone-home.

6. **Per-folder isolation enforced at every boundary**: MCP tools require
   mandatory `cwd` arg; config loader scoped to `cwd/.agora/`; probes
   read only `cwd` files; crash reports live in `~/.agora/crashes/`
   (global, but artifacts only).

7. **7-cmd cap survived all 6 sub-questions**: no new subcommand was
   added. `--mcp-server` is a flag, `--explain-config` and `--explain-crash`
   are subflags on existing `agora doctor`. ADR-0001 cap intact.

8. **Dependency minimalism honored**: zero new runtime deps added at
   SPEC level. `createLimit` (probe runner) inline ~30 LOC instead of
   p-limit. MCP SDK + Zod are the only new dep candidates for Stage 6
   (justified individually).

9. **Cross-probe coupling avoided**: `anthropic_api_key`'s Stage 2-B.1
   detect spec coupled it to `claude` probe outcome; Stage 4-A.4 resolved
   via cheap proxy (package.json deps) at definition time, no
   runner-internal state coupling.

10. **Single source of truth for errors**: `ERROR_CATALOG` is the only
    place exit codes, message keys, and fix keys live. Stage 6 cannot
    introduce a new error code without adding a catalog entry (TS literal
    type forces it).

---

## Deliberately deferred

These items Stage 4 chose **not** to settle. Routed to Stage 5 / 6.

| Item | Stage |
|------|-------|
| Module / file-tree organization (where everything actually lives) | Stage 5 |
| Per-philosopher runbooks (when called, what prompt, what output) | Stage 5 |
| Prompt library structure + storage | Stage 5 |
| Locale catalog content (en.json / ko.json populated with all keys) | Stage 5 / 6 |
| `Result<T, E>` adoption (CLAUDE.md L327 carried over) | Stage 5 |
| Library bindings (commander vs citty, MCP SDK choice, TOML parser) | Stage 6 |
| Probe registry expansion (Tier 3 community probes per PR) | Per-PR after v1 |
| Schema migration v1 → v2 implementation (`agora doctor` migration diff) | Whenever v2 ships |
| Test suite architecture (vitest patterns, fixture conventions) | Stage 6 |
| Tab completion shell scripts | Stage 6 |
| Public release / commercial form | Per ADR-0007 trigger |

---

## Verification of close

A stage closes only when (per ADR-0004):

1. All named deliverables exist and are committed ✅
2. Sang has read and approved them ✅ (explicit approval per round throughout 4-A.1 through 4-A.6)
3. No ADR is left in `Proposed` state from this stage ✅ (no new ADRs in Stage 4)

All three conditions met.

---

## Next stage

**Stage 5 — Internal Architecture + Philosopher Runbooks + Prompts** opens
here. See `docs/stage-5/NOTES.md` for the entry plan.

Per ADR-0004 / Stage 1 plan:
- Module dependency graph (where everything lives, what depends on what)
- Per-philosopher runbooks (Husserl / Socrates / Aristotle / Plato / Aquinas)
- Prompt library structure + storage
- Locale catalog content rules (CI parity enforcement)
- `Result<T, E>` adoption decision (carried over from CLAUDE.md L327)

Estimated 6 sub-questions.

---

*This document is immutable. Stage 4 is over.*
