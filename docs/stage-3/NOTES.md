# Stage 3 — CLI Surface Detail

> **Status**: Active (opened 2026-05-03 after Stage 2 close)
> **Goal**: Define the complete CLI surface for Agora — every command, every
> flag, every screen mockup, every output format. Detailed enough that
> Stage 6+ implementation can ship the CLI without re-arguing UX.
> **Done when**: `docs/cli/spec.md` is marked Accepted. All open questions
> below resolved or explicitly deferred.

---

## What Stage 3 settles vs defers

**Settled in Stage 3**:
- Per-command flags, screens, and behavior
- Output format conventions (TUI / JSON / MCP)
- Auto-suggest "Next:" pattern (already in design principles)
- Global flags + their precedence
- Non-interactive mode rules
- Exit codes
- Tab-completion shape
- Help system shape

**Deferred to Stage 4 / 5 / 6**:
- Install mechanics (Stage 4)
- Implementation file organization (Stage 5)
- Actual CLI library bindings (Stage 6)

---

## Entry plan — sub-stages

Stage 3 splits into two sub-stages. They are mostly sequential because
cross-cutting framework (3-A) sets the contract that per-command specs (3-B) follow.

### Stage 3-A — Cross-cutting framework

3 foundational decisions that affect every command:

```
3-A.1  Output format framework         ← TUI default, --json mode, color rules, exit codes
3-A.2  Auto-suggest "Next:" pattern    ← every command output ends with next-step block
3-A.3  Global flags + precedence       ← --help, --json, --version, --parallel, --skip-gate-N, etc.
```

### Stage 3-B — Per-command specs

7 commands (per ADR-0001 + Stage 1 hard cap):

```
3-B.1  agora doctor       ← simplest, standalone — good first command to spec
3-B.2  agora status       ← read-only inspection
3-B.3  agora seed         ← view + edit operations
3-B.4  agora new [name]   ← fresh project entry
3-B.5  agora resume       ← continue paused work (depends on state.phase enum)
3-B.6  agora ralph        ← implementation loop driver
3-B.7  agora              ← context-aware default (depends on all others — natural last)
```

### Estimated rounds

- 3-A: 1-2 rounds each = 3-6 rounds
- 3-B: 1 round each (specs are mechanical given the framework) = 7 rounds
- Total: ~10-13 focused rounds

Some commands may bundle into a single round if they share patterns (e.g.
`status` and `doctor` are both read-only inspectors).

---

## Working principle for Stage 3

Stage 3 is **mockup-heavy**. Each per-command spec should include:
- Full CLI signature (flags, args, defaults)
- Happy-path TUI mockup
- Error/edge-case mockups (1-2)
- JSON output shape (--json mode)
- Auto-suggest "Next:" examples
- Exit code semantics

Mode B (single recommendation + alternatives) for technical decisions;
Mode A (recommended options + free input) for UX taste decisions.

---

## What this stage is NOT

- Not implementation. No code changes beyond placeholder CLI extensions.
- Not "what library to use" (that's Stage 4 / Stage 6 — commander vs citty
  was already decided in ADR-0001).
- Not config file design beyond what's already specified in Stage 2.

---

## Progress Log

### Stage 3-A.1 — DONE (2026-05-03)

Output Format Framework specified. Five decisions accepted:

- **R1-A**: 6-color palette (cyan/dim/red/green/yellow + bold) + 11-icon set (◯◉✓✗⚠ⓘ📎🔍📊📄🔄). No other colors or emoji permitted.
- **R2-A**: Universal JSON schema across all commands — command/version/timestamp/session_id/result.ok/result.data/next[]/warnings[]/errors[]. Per-command specs only define data payload shape.
- **R3-A**: 7-tier exit codes (0/1/2/3/4/10/20 + 64+ reserved). Priority rule: env > config > gate > user > general > success.
- **R4-A**: Auto-detect TTY + `AGORA_NON_INTERACTIVE=1` env override. JSON fallback for pipes/CI/non-TTY.
- **R5-A**: v1 ships `en` + `ko` locales. F1 (locale correctness) enforced at build-time (catalogs) + run-time (LLM output validation).

TUI rendering contract:
- Divider/header/main/optional/Next-block/divider 6-section template
- Header: left-aligned command + right-aligned bracketed context
- @clack/prompts as primitive layer

JSON output contract:
- Single schema across commands
- result.ok = exit code source of truth
- next[] = auto-suggest in JSON form (Stage 3-A.2 will define)
- warnings[] / errors[] always arrays

Per-mode behavior table covering TUI / JSON / MCP differences.

Locale resolution order: --locale flag > AGORA_LOCALE env > LANG/LC_ALL > en default.
Korean validation includes specific check for "뭔는지" class of LLM typos.

Boundaries enforced (rejections by name):
  - Custom colors/emoji (R1-B/C rejected)
  - Per-command JSON schema (R2-B rejected — consistency is value)
  - OpenAPI strict definition (R2-C rejected — over-engineering)
  - Single 0/1 exit code (R3-B rejected — loses signal)
  - Per-gate exit codes (R3-C rejected — too granular)
  - Always-explicit interactive flag (R4-B rejected — friction)
  - TTY-only without env override (R4-C rejected — edge cases need escape)
  - English-only at v1 (R5-B rejected — F1 must be exercised)
  - Korean-only at v1 (R5-C rejected — English baseline for future contributors)
  - ANSI codes leaking to JSON (stripped)
  - Mid-command streaming in non-interactive (batched)

Failure modes guarded: F1 (locale), F2 (purpose visible via next[]), color/emoji bloat, JSON schema drift, exit code ambiguity.

Full SPEC committed to `docs/cli/spec.md` under "Output Format Framework [SPEC]".

### Stage 3-A.2 — DONE (2026-05-03)

Auto-suggest "Next:" pattern specified. Four decisions accepted:

- **R1-A**: 3-source weighted ranking (phase-progression 0.6, failure-correction 0.3, inspection 0.1). Dedup by (command, args), keep highest-weighted source's description.
- **R2-A**: MAX_NEXT_COUNT = 3. Mirrors Stage 2 dialog patterns + low cognitive load.
- **R3-A**: Failure also shows Next (with fix-path suggestions). Users need fix-path most when failed.
- **R4-A**: Empty next[] → TUI block omitted entirely; JSON keeps empty array.

Show/hide decision:
- Informational output (--help, --version) → no Next
- User-aborted (exit code 3) → no Next (don't push after stop)
- result.ok = true → show
- result.ok = false → show (fix-path mode)

Phase → next-action lookup table specified for all 8 state.phase values from Stage 2-C.3 enum.

Failure → fix-path lookup for known error codes (gate_0_failed_*, gate_2_test_failure, gate_5_drift_hard_fail, env_claude_not_authenticated, config_invalid_state_json). Unknown errors fall through to Source 3.

TUI rendering:
- `▸` bullet marker (typographic, distinct from semantic icon set)
- Command line bold cyan, description dim grey indent 6
- Empty line between candidates

JSON rendering reuses 3-A.1 schema: command (bare) + args (argv-ready) + description (locale-aware).

Boundaries enforced (rejections by name):
- Show on --help/--version (informational)
- Show after abort (rude)
- Hide on failure (R3-B rejected)
- COUNT > 3 (R2-B rejected) or = 1 (R2-C rejected)
- Phase-only (R1-B rejected)
- TUI empty placeholder (R4-B rejected)
- Description-less commands (mandatory per F2)
- Locale-unvalidated descriptions (must pass F1)

Failure modes guarded: F2 (purpose visible via description), push fatigue (max 3 + omit on abort/info), stale suggestions (computed per-call), locale leakage (i18n through catalog), Source 2 dead-end (Source 3 fallback).

Full SPEC committed to `docs/cli/spec.md` under "Auto-suggest 'Next:' Pattern [SPEC]".

### Stage 3-A.3 — DONE (2026-05-03)

Global Flags + Precedence specified. Four decisions accepted:

- **R1-A**: 8 universal flags (--help, --version, --json, --locale, --quiet, --verbose, --no-color, --config). Lean set; per-command flags are right home for narrow features.
- **R2-A**: Standard precedence — CLI > env > project config > global config > default. Matches vercel/supabase/gh/stripe convention.
- **R3-A**: Parse-time fail-fast validation of forbidden combinations. User sees error before any I/O / LLM call / state change.
- **R4-A**: Power-user flags (currently just --config) visible in command --help under "Power user options" section — distinct from universal flags but not hidden.

Per-command flag inventory documented (preview; Stage 3-B will confirm/refine):
  agora new, agora resume — no flags planned
  agora seed — --edit, --override-gate5, --regen-tests
  agora ralph — --parallel*, --skip-gate-*, --reset-*
  agora status — --leaf, --history
  agora doctor — --refresh, --include-disabled

Forbidden combinations table (11 rules) with exact error messages:
  --json + --verbose / --json + --no-color
  --quiet + --verbose
  --skip-gate-1, --skip-gate-5 (any value)
  --parallel=0/negative
  --parallel > 5 without --parallel-force
  --skip-gate-{2,3,4} without --reason
  --locale outside en/ko

Help system shape:
  agora --help → top-level commands + universal flags
  agora <cmd> --help → command spec + universal summary + power-user section + examples
  Power-user flags visible but visually distinct (separate heading)

Top-level help template specified verbatim.

--config=<path> semantics:
  Replaces project-level config slot in precedence
  Absolute or relative path (relative resolved from cwd)
  Missing path → exit code 20 (config error per 3-A.1)

Boundaries enforced (rejections by name):
  - Flags > 8 universal (R1-C): cognitive overhead
  - Remove --config (R1-B): legitimate power use
  - Env-over-CLI (R2-B): CLI must win as most explicit signal
  - Config-over-everything (R2-C): blocks ad-hoc overrides
  - Lazy validation (R3-B): mid-execution discovery worse UX
  - Warning-only invalidity (R3-C): errors aren't warnings
  - Hidden --config (R4-B): hidden-knowledge culture
  - Power-user inline mixing (R4-C): overwhelms new users

Failure modes guarded:
  - Silent flag conflict ignore → parse-time validation
  - Multiple-source confusion → standard precedence table
  - Unsupported locale → explicit error + v1 list
  - Power flag discoverability → separate section

Full SPEC committed to `docs/cli/spec.md` under "Global Flags + Precedence [SPEC]".

---

## Stage 3-A — ALL SUB-QUESTIONS RESOLVED (2026-05-03)

  3-A.1  Output Format Framework
  3-A.2  Auto-suggest "Next:" Pattern
  3-A.3  Global Flags + Precedence

Cross-cutting framework now established. Stage 3-B (per-command specs) entering.

Each Stage 3-B sub-question is mostly mechanical given the framework — define
the command's specific flags (most already inventoried in 3-A.3), happy-path
TUI mockup, error mockup(s), JSON data payload shape, command-specific Next
candidates.

Next task: Stage 3-B.1 — `agora doctor` (simplest standalone, good first per-command spec).
