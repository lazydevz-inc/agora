# CLI Specification (Stage 3)

> **Status**: Stage 3-A in progress (opened 2026-05-03 after Stage 2 close).
> Sections marked **[SPEC]** are formally accepted Stage 3 outputs.
> Sections marked **[OPEN]** are not yet specified.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 3
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Output Format Framework** (3-A.1) | **[SPEC]** Accepted 2026-05-03 |
| **Auto-suggest "Next:" Pattern** (3-A.2) | **[SPEC]** Accepted 2026-05-03 |
| **Global Flags + Precedence** (3-A.3) | **[SPEC]** Accepted 2026-05-03 |
| **`agora doctor`** (3-B.1) | **[SPEC]** Accepted 2026-05-03 |
| **`agora status`** (3-B.2) | **[SPEC]** Accepted 2026-05-03 |
| **`agora seed`** (3-B.3) | **[SPEC]** Accepted 2026-05-03 |
| **`agora new`** (3-B.4) | **[SPEC]** Accepted 2026-05-03 |
| `agora resume` (3-B.5) | [OPEN] |
| `agora ralph` (3-B.6) | [OPEN] |
| `agora` (default) (3-B.7) | [OPEN] |

---

## Output Format Framework [SPEC] (Accepted 2026-05-03, Stage 3-A.1)

> **Goal**: Establish the contract every command's output follows. TUI
> rendering, JSON schema, color/icon set, exit codes, non-interactive mode,
> locale handling — all defined here once so every per-command spec inherits.

### Three I/O modes (per ADR-0005, restated)

| Mode | When | Owner | LLM access |
|------|------|-------|------------|
| **TUI** | TTY + interactive | `@clack/prompts` + custom layout per this spec | Subprocess `claude --print` |
| **JSON** | `--json` flag OR pipe / non-TTY | stdout JSON, no chrome | Subprocess `claude --print` (only when needed) |
| **MCP** | invoked as MCP server inside Claude Code | MCP protocol | None (host session is the LLM) |

This SPEC primarily defines the TUI and JSON contracts (modes 1 + 2).
MCP mode reuses the JSON schema as its return payload.

### TUI rendering contract

Every TUI screen follows this structural template:

```
─────────────────────────────────────────────────────────────────
  {Command label}                              [{stage / phase}]
─────────────────────────────────────────────────────────────────

  {Main content area}
    - free-form per command
    - mockups follow `docs/loops/alignment-loop.md` patterns where applicable
    - layout uses @clack/prompts primitives

  {Optional sections}
    - progress indicator
    - status sparkline
    - inline notes / warnings

  ── Next: ─────────────────────────────────────────────────────
    {Auto-suggest block — defined in 3-A.2 SPEC}

─────────────────────────────────────────────────────────────────
```

The `─` divider lines render to terminal width (truncate long, fill short).
Header label format: left-aligned command name, right-aligned bracketed
context (stage/phase/iteration counter — varies by command).

### Color set [R1-A]

| Use | Color | Notes |
|-----|-------|-------|
| Info / heading | cyan | primary brand color |
| Secondary text | dim grey | supporting info |
| Bold emphasis | terminal default + bold | selected option, key terms |
| Errors | red | only for genuine errors |
| Success markers | green | only with `✓` |
| Warnings | yellow | only with `⚠` |

**No other colors permitted.** Specifically forbidden: rainbow, magenta,
multi-color text within one line, color cycling/animation.

The 6-color palette mirrors Sang's design preferences (Vercel/Notion/Google
minimal aesthetic per Stage 1) and stays accessible (works on dark and
light terminal backgrounds).

### Icon set [R1-A]

Sourced from `docs/loops/alignment-loop.md` SPEC for consistency.

```
◯  single-select option (unselected)
◉  selected / multi-select on
✓  passed / success
✗  failed / blocked
⚠  warning
ⓘ  information / "why this question?"
📎  prior-answer quote / reference
🔍  probe / case-test
📊  statistics / data
📄  preview / summary
🔄  retry / aporia / refinement
```

**No other emoji permitted.** Specifically forbidden: party emoji, faces,
animals, celebrations, decoratives. Each icon must do work (mark a
semantically meaningful element).

### JSON output contract [R2-A]

Schema for `--json` mode. Every command produces exactly this shape:

```json
{
  "command": "agora ralph",
  "version": "0.2.0-stage-2",
  "timestamp": "2026-05-03T06:14:00Z",
  "session_id": "session_xyz789",
  "result": {
    "ok": true,
    "data": {
      // command-specific payload
      // shape defined per-command in Stage 3-B specs
    }
  },
  "next": [
    {
      "command": "agora status",
      "args": [],
      "description": "View Ralph progress"
    },
    {
      "command": "agora seed",
      "args": ["--edit", "telos.statement"],
      "description": "Refine telos before continuing"
    }
  ],
  "warnings": [
    {
      "code": "stale_bypass",
      "message": "Probe disabled: stripe (set 4 sessions ago)",
      "recommendation": "Reconfirm via `agora ralph` interactive prompt"
    }
  ],
  "errors": []
}
```

**Universal rules**:
- `result.ok` is the single source of truth for success — exit code derived from this
- `data` shape is command-specific (each Stage 3-B spec defines its schema)
- `next[]` is the JSON form of the auto-suggest block (3-A.2 SPEC will define)
- `warnings[]` and `errors[]` are always arrays (empty if none)
- All timestamps are ISO 8601 UTC
- All identifiers (session_id, leaf_id, etc.) are opaque strings; no leaking internals

**Forbidden in JSON**:
- ANSI color codes (strip all on JSON output)
- @clack/prompts UI elements
- Anything not in the schema

### Exit code semantics [R3-A]

```
 0   success                              (result.ok = true)
 1   general failure                      (invalid argument, parse error)
 2   gate failure                         (Ralph Gate 0–5 fail; Z2 escalation)
 3   user abort                           (Ctrl+C, dialog [a] abort)
 4   paused / resumable                   (Z2 mini-alignment trigger, soft caps)
10   environment error                    (claude CLI not authenticated, node version too old)
20   configuration error                  (.agora/ corrupt, state.json invalid)

64+  reserved for future use
```

Codes 64+ stay reserved (Unix `sysexits.h` reserves 64-78 for special meanings).

When the same execution could fit multiple codes:
- Higher numeric code wins (env > config > gate > user > general > success)
- This mirrors "most fundamental failure first" diagnosis — env errors
  should be visible even if a gate also failed

### Non-interactive mode detection [R4-A]

```
detect_io_mode() -> Mode:
  if env.AGORA_NON_INTERACTIVE in ("1", "true"):
    return JSON

  if --json flag set:
    return JSON

  if stdout is NOT a TTY (pipe, redirect, CI):
    return JSON   # silent fallback to JSON

  if invoked as MCP tool (env.MCP_SERVER_MODE):
    return MCP

  return TUI   # default for human use in terminal
```

In JSON / non-interactive mode:
- All `@clack/prompts` interactive widgets fail with error code 1 if hit
  (commands must accept all answers via flags upfront)
- No spinners, progress bars, or animations in output
- Single batched output at end (stream nothing intermediate)
- `result.warnings[]` carries any "would have shown a dialog" notices

The env var `AGORA_NON_INTERACTIVE=1` is the explicit override for cases
where TTY detection is wrong (e.g. some Docker images report TTY=true
incorrectly).

### Locale (i18n) [R5-A]

v1 ships with **`en` and `ko`** message catalogs.

```
src/agora/i18n/
├── en.json       ← English (default)
├── ko.json       ← Korean (Sang's primary)
└── index.ts      ← lookup helper + locale-correctness check
```

Locale resolution order:
1. `--locale=ko` flag
2. `AGORA_LOCALE=ko` env var
3. `LANG` / `LC_ALL` env var (parse `ko_KR.UTF-8` → `ko`)
4. Default to `en`

**F1 enforcement**: every user-facing string passes a locale-correctness check
before rendering:
- Static template strings: validated at build time (CI checks message catalogs
  for typos, missing keys, encoding artifacts)
- LLM-generated strings: post-generation check (LLM call to validate "is
  this valid {locale}?", retry once if fails, fall back to `en` if persistent)
- Korean strings specifically: extra check for the `뭔는지` / `뭔지` class
  of common LLM typos

This is the F1 forbidden-pattern from Stage 1, codified at the framework level.

### Per-mode behavior table

| Behavior | TUI | JSON | MCP |
|----------|-----|------|-----|
| Color output | yes | NO (stripped) | NO |
| Interactive prompts | yes | error | error (host renders) |
| Spinners / progress | yes | NO | NO |
| `Next:` block | rendered | `next[]` array | `next[]` array |
| Warnings | inline + final summary | `warnings[]` array | `warnings[]` array |
| Errors | red banner + exit | `errors[]` array + exit | `errors[]` array |
| Locale | full | full | full |

### Boundaries

- ❌ Custom emoji or color outside the defined set (R1-B/C alternatives rejected).
- ❌ Per-command JSON schema (R2-B rejected): consistency is the value.
- ❌ OpenAPI / JSON-Schema strict definition (R2-C rejected): over-engineering at v1.
- ❌ Single 0/1 exit code (R3-B rejected): loses diagnostic signal.
- ❌ Per-gate exit codes (R3-C rejected): too granular, maintenance burden.
- ❌ Always-explicit `--interactive` flag (R4-B rejected): forces friction.
- ❌ TTY-only auto-detection without env override (R4-C rejected): edge cases need escape valve.
- ❌ English-only at v1 (R5-B rejected): Sang's primary use is Korean, F1 must be exercised from day one.
- ❌ Korean-only at v1 (R5-C rejected): English baseline keeps Agora friendly to future contributors and validation tools.
- ❌ ANSI codes leaking into JSON output (must strip).
- ❌ Mid-command output in non-interactive mode (must batch).

### Output consumed by

- **Every Stage 3-B command spec**: inherits this contract; per-command spec only defines `data` payload shape and command-specific output sections.
- **Stage 6 implementation**: TUI rendering uses `@clack/prompts` + a thin layout module enforcing the divider/header/Next: structure.
- **AI agents calling Agora CLI**: read JSON output, follow `next[]` to chain commands.
- **CI / automation**: rely on exit codes + JSON output for scripting.

### Failure modes specifically guarded

- **F1 (locale incorrectness)**: build-time + run-time validation; no Korean output without locale check.
- **F2 (purpose visible)**: `next[]` block carries explicit description; never bare commands.
- **Color / emoji bloat**: hard-locked palette and icon set; PRs adding either require justification.
- **JSON schema drift**: every command's schema is documented per-command in 3-B; CI tests assert shape.
- **Exit code ambiguity**: priority rule (env > config > gate > user > general > success) ensures one canonical code.

---

## Auto-suggest "Next:" Pattern [SPEC] (Accepted 2026-05-03, Stage 3-A.2)

> **Goal**: Define when the auto-suggest "Next:" block appears, how candidate
> next-actions are generated and ranked, how many to show, and the
> contract between TUI and JSON rendering.

### When the block appears [R3-A: failure also shows]

```
SHOW_NEXT_DECISION:
  if command output is informational (--help, --version):
    SHOW: false
  elif command was aborted by user (exit code 3):
    SHOW: false           # user explicitly stopped; don't push
  elif result.ok == true:
    SHOW: true            # natural progression
  elif result.ok == false:
    SHOW: true            # fix-path suggestions (R3-A)
```

In TUI: rendered as `── Next: ───` block.
In JSON: `next[]` array always present (empty allowed when SHOW=false).

### Candidate generation — 3 sources [R1-A: weighted ranking]

```
generate_next_candidates(command_result, state) -> [Candidate]:

  candidates = []

  # SOURCE 1 — Phase-based natural progression (weight 0.6)
  # state.phase determines obvious next move
  candidates += derive_from_phase(state.phase)

  # SOURCE 2 — Result-driven correction (weight 0.3)
  # Only fires when result.ok == false
  if not command_result.ok:
    candidates += derive_from_failure(command_result.errors)

  # SOURCE 3 — Inspection / read-only options (weight 0.1)
  # Always available but lowest priority
  candidates += [
    {"command": "agora status", "description": "View current state"},
    {"command": "agora doctor", "description": "Diagnose environment"},
  ]

  # ─── RANK + DEDUP ───
  ranked = score_and_dedup(candidates)
    score = source_weight  # 0.6 / 0.3 / 0.1
    dedup_key = (command, args)  # same command+args = duplicate;
                                   keep highest-weighted source's description

  # ─── COUNT CAP ───
  return ranked[:MAX_NEXT_COUNT]


MAX_NEXT_COUNT = 3   # R2-A
```

### Phase → next-action lookup table

```
state.phase → suggested next actions (Source 1)

"in_alignment":
  → ["agora resume", "Continue alignment session"]

"in_alignment_paused":
  → ["agora resume", "Continue paused alignment session"]

"alignment_complete":
  → ["agora ralph", "Start implementation now that the seed is locked"]
  → ["agora seed --edit telos.statement", "Refine telos before starting Ralph"]

"in_handoff":
  → ["agora resume", "Re-show the AC tree review dialog"]

"ready_for_ralph":
  → ["agora ralph", "Start implementation"]
  → ["agora seed", "View the locked seed before starting"]

"in_ralph":
  → ["agora status", "View current Ralph progress"]

"in_ralph_paused":
  → ["agora resume", "Resume Ralph from checkpoint"]

"ralph_complete":
  → []   # User chose explicit acknowledgment via session-end dialog;
         # block becomes empty, omitted in TUI per R4-A

null (no .agora/):
  → ["agora new", "Start a new project workflow"]
  → ["agora doctor", "Verify environment is ready"]
```

### Failure → fix-path lookup (Source 2)

When `result.errors[]` carries known error codes, map to fix actions:

```
error.code → suggested fix command

"gate_0_failed_<probe_id>":
  → External fix command from probe.fixInstruction()
  → Example: "gh auth login" or "vercel login"
  → Plus ["agora doctor", "Re-run all probes after fixing"]

"gate_2_test_failure":
  → ["agora ralph", "Re-run iteration after reviewing failed tests"]
  → No external fix — Ralph self-corrects via Z1

"gate_5_drift_hard_fail":
  → ["agora resume", "Mini-alignment was triggered; resume to address it"]

"env_claude_not_authenticated":
  → ["claude auth status", "Verify Claude Code authentication"]
  → ["claude login", "Re-authenticate"]

"config_invalid_state_json":
  → ["agora doctor", "Diagnose .agora/ corruption"]
```

Unknown error codes: omit Source 2; Source 3 (inspection) carries the load.

### TUI rendering

```
─────────────────────────────────────────────────────────────────
  ── Next: ────────────────────────────────────────────────────
    ▸ agora ralph
      Start implementation now that the seed is locked

    ▸ agora seed --edit telos.statement
      Refine telos before starting Ralph

    ▸ agora status
      View current state
─────────────────────────────────────────────────────────────────
```

Layout rules:
- `▸` bullet marker (typographic, NOT in semantic icon set — distinct usage)
- Command line: bold + cyan
- Description line: dim grey, indent 6 spaces
- Empty line between candidates (visual breathing room)
- Maximum 3 candidates per Stage 3-A.2 R2-A

### JSON rendering

`next[]` array per the universal schema established in 3-A.1:

```json
"next": [
  {
    "command": "agora ralph",
    "args": [],
    "description": "Start implementation now that the seed is locked"
  },
  {
    "command": "agora seed",
    "args": ["--edit", "telos.statement"],
    "description": "Refine telos before starting Ralph"
  },
  {
    "command": "agora status",
    "args": [],
    "description": "View current state"
  }
]
```

`command` is the bare command (no args). `args[]` is the flag/positional list
ready for `argv` parsing. `description` is the same string shown in TUI.

`description` is locale-aware (resolved per Stage 3-A.1 R5-A locale lookup
before rendering).

### Empty next handling [R4-A]

When `generate_next_candidates()` returns empty (e.g. `ralph_complete` after
session-end ack):

```
TUI:  Block omitted entirely — cleaner visual, no "Next: (none)" noise
JSON: "next": []   — array always present, just empty
```

### Boundaries

- ❌ Show Next: on `--help` or `--version` output (informational, not action-driving).
- ❌ Show Next: after explicit user abort (exit code 3) — pushing after a stop is rude.
- ❌ Hide Next: on failure (R3-B rejected): users need fix-path most when failed.
- ❌ MAX_NEXT_COUNT > 3 (R2-B rejected): cognitive overload at end of every command.
- ❌ MAX_NEXT_COUNT == 1 (R2-C rejected): hides legitimate alternatives.
- ❌ Failure suppresses Source 1 (R1-C rejected): even on failure, the "intended path" candidate is useful.
- ❌ Phase-only (R1-B rejected): inspection options ARE useful when user is stuck.
- ❌ TUI empty-block placeholder (R4-B rejected): "(none)" adds visual noise.
- ❌ Description-less commands (description is mandatory per F2 enforcement).
- ❌ Locale-unvalidated descriptions (must pass F1 check before render).

### Output consumed by

- **Every TUI command output**: appends Next block per the layout rules.
- **Every JSON command output**: includes `next[]` per the schema.
- **AI agents calling Agora CLI**: read `next[]` to chain commands; `description`
  helps the agent's reasoning ("why pick this next").
- **Stage 3-B per-command specs**: each command may add command-specific
  candidates beyond Sources 1-3 (e.g. `agora ralph` after iteration completion
  may suggest specific files to review). Per-command additions append to
  Source 1.

### Failure modes specifically guarded

- **F2 (purpose visible)**: every candidate carries `description` explaining
  *why* this next action makes sense.
- **Push fatigue**: max 3 + omitted on abort + omitted on info-only.
- **Stale suggestions**: candidates are computed per-call (no caching);
  always reflect current state.phase.
- **Locale leakage**: descriptions resolved through i18n catalog before
  render (TUI) or before serialization (JSON).
- **Source 2 dead-end**: failure with no known fix-path falls through to
  Source 3 (inspection options); never empty `next[]` on failure.

---

## Global Flags + Precedence [SPEC] (Accepted 2026-05-03, Stage 3-A.3)

> **Goal**: Consolidate every global flag, environment variable, and config
> source. Define precedence when same setting appears in multiple sources.
> Define forbidden flag combinations and their error messages.

### Universal flags inventory [R1-A]

Available on every command:

| Flag | Short | Description | Sources |
|------|-------|-------------|---------|
| `--help` | `-h` | Show command/subcommand help; exit | CLI only |
| `--version` | `-v` | Show Agora version; exit | CLI only |
| `--json` | — | Force JSON output mode (per 3-A.1) | CLI / `AGORA_JSON=1` |
| `--locale=<code>` | — | Force locale (`ko` or `en`, per 3-A.1 R5-A) | CLI / `AGORA_LOCALE` / `LANG` |
| `--quiet` | `-q` | Suppress warnings; errors only (TUI only) | CLI / `AGORA_QUIET=1` |
| `--verbose` | — | Extra debug output (TUI only) | CLI / `AGORA_VERBOSE=1` |
| `--no-color` | — | Disable ANSI color (CI / piped output) | CLI / `NO_COLOR=1` (standard) |
| `--config=<path>` | — | Override `.agora/config.toml` path | CLI only |

The 8-flag set is intentionally lean. Anything beyond this is a per-command flag.

### Per-command flag inventory (preview — Stage 3-B will detail each)

```
agora new [name]
  no command-specific flags planned (Stage 3-B.4 confirms)

agora resume
  no command-specific flags planned (Stage 3-B.5 confirms)

agora seed
  --edit <field>                      view+edit specific field
  --override-gate5 <iter> <score>     manual drift score override
  --regen-tests [--all]               trigger test regeneration

agora ralph
  --parallel=<N>                      1-5 (ADR-0008)
  --parallel-force=<N>                required for N > 5
  --skip-gate-0=<list>                gh,vercel,supabase,...
  --skip-gate-2 --reason="..."        conditional bypass with rationale
  --skip-gate-3 --reason="..."        same pattern
  --skip-gate-4 --reason="..."        same pattern
  --reset-bypasses                    clear all persistent bypasses
  --reset-bypass=<id>                 clear specific
  --reset-cap                         restore default iteration cap

agora status
  --leaf=<id>                         drill into specific AC node
  --history                           show recent sessions

agora doctor
  --refresh                           bust Gate 0 probe cache
  --include-disabled                  run disabled probes anyway
```

These are placeholders — Stage 3-B per-command SPECs may add/remove individual flags.

### Precedence order [R2-A]

When the same setting appears in multiple sources, the higher-priority source wins:

```
HIGHEST                                                          LOWEST
  ↓                                                                ↓

  CLI flag > env variable > project .agora/config.toml > global ~/.agora/config.toml > hardcoded default
```

This is the standard pattern across `vercel`, `supabase`, `gh`, `stripe`, etc.

Examples:

```
agora ralph --parallel=3
  → 3 (CLI wins, ignores config and env)

env AGORA_PARALLELISM=5
agora ralph
  → 5 (env wins over config and default)

# .agora/config.toml has [ralph].parallelism = 2
# ~/.agora/config.toml has [ralph].parallelism = 4
agora ralph
  → 2 (project config beats global config)

# .agora/config.toml has nothing about parallelism
# ~/.agora/config.toml has [ralph].parallelism = 4
agora ralph
  → 4 (global config beats default)

# nothing anywhere
agora ralph
  → 1 (default per ADR-0008)
```

The rule applies uniformly to every setting that has multiple sources.

### Forbidden flag combinations [R3-A: parse-time fail-fast]

Validated **immediately after argv parse**, before any command logic runs.
Error format: `agora: error: <message>` to stderr, exit code 1.

| Forbidden combination | Error message |
|------------------------|----------------|
| `--json` + `--verbose` | `--verbose has no effect with --json (output is always batched).` |
| `--json` + `--no-color` | `--no-color has no effect with --json (color already absent).` |
| `--quiet` + `--verbose` | `Cannot combine --quiet and --verbose.` |
| `--skip-gate-1` (any value) | `Gate 1 (deterministic) is not bypassable. Use 'agora ralph abort' to end the session.` |
| `--skip-gate-5` (any value) | `Gate 5 (alignment) is not bypassable. Use 'agora ralph abort' to end the session.` |
| `--parallel=0` or `--parallel=-N` | `Parallelism must be >= 1.` |
| `--parallel=N` (N > 5) without `--parallel-force=N` | `Parallelism > 5 requires --parallel-force=N for cost guardrail.` |
| `--skip-gate-2` without `--reason` | `--skip-gate-2 requires --reason='...' (mandatory rationale).` |
| `--skip-gate-3` without `--reason` | (same pattern) |
| `--skip-gate-4` without `--reason` | (same pattern) |
| `--locale=fr` (or any non-`en`/`ko`) | `Locale '<code>' not bundled. v1 supports: en, ko.` |

Validation function structure:

```
on_argv_parsed(parsed):
  for rule in FORBIDDEN_RULES:
    if rule.matches(parsed):
      print_to_stderr(f"agora: error: {rule.message}")
      exit(1)
  return parsed
```

The fail-fast contract: user sees the error before any I/O, before any
LLM call, before any state change. Cheapest correction loop possible.

### `--config=<path>` semantics

Power-user flag. When present:
- Loads `.toml` from given path INSTEAD of `.agora/config.toml`
- Project-level slot in precedence is replaced (global / default still apply)
- Useful for: environment simulation, A/B testing of configs, CI variation

```
agora ralph --config=./config.staging.toml
agora ralph --config=./config.production.toml --parallel-force=8
```

Path resolution:
- Absolute path: used as-is
- Relative path: resolved from `cwd`
- Path doesn't exist: error code 20 (config error per 3-A.1)

### Help system shape [R4-A]

```
agora --help                       → top-level command list + universal flags

agora <command> --help             → command-specific:
                                       Description
                                       Usage line
                                       Command-specific flags
                                       Universal flags (compact summary)
                                       Power-user options (separate section)
                                       Examples (1-3)
                                       Next: hint to related commands
```

Power-user flags (in v1: just `--config=<path>`) appear in `agora <command> --help`
under a `Power user options` heading, separated by an extra blank line.
They're visible (not hidden) but visually distinct.

Top-level `agora --help`:

```
Agora — agent harness where ancient philosophers gather to refine intent into reality.

Usage: agora [command] [options]

Commands:
  agora               (default) status + suggested next action
  agora new [name]    Start a new project workflow
  agora resume        Resume paused work
  agora seed          View / edit the locked seed
  agora ralph         Start / resume implementation
  agora status        View current project state
  agora doctor        Diagnose environment

Universal flags:
  -h, --help          Show this message
  -v, --version       Show Agora version
      --json          JSON output mode
      --locale=<code> ko or en (default: env LANG or en)
  -q, --quiet         Suppress warnings
      --verbose       Extra debug output
      --no-color      Disable ANSI color

Power user options:
      --config=<path> Override .agora/config.toml path

Documentation:
  https://github.com/lazydevz-inc/agora (private during Stage 0-5)

Run 'agora <command> --help' for detailed help on each command.
```

### Boundaries

- ❌ Universal flags exceeding 8 (R1-C rejected): every additional flag becomes
  cognitive overhead; per-command flags are the right home for narrow features.
- ❌ Removing `--config` (R1-B rejected): power-user environment override is
  legitimate; visibility-tier handles the discoverability concern.
- ❌ Env-over-CLI precedence (R2-B rejected): CLI is the most explicit signal
  and must win; env is for ambient defaults.
- ❌ Config-over-everything (R2-C rejected): would make ad-hoc CLI overrides
  impossible.
- ❌ Lazy validation of forbidden combinations (R3-B rejected): user discovers
  the error mid-execution after partial state writes — worse UX.
- ❌ Warning-only on forbidden combinations (R3-C rejected): "errors are not
  warnings" — incorrect invocations should fail, not silently succeed with caveats.
- ❌ Hidden `--config` in help (R4-B rejected): hiding power options breeds
  hidden-knowledge culture; the visibility-tier (separate section) is the
  correct middle ground.
- ❌ Mixing power-user flags inline with universal (R4-C rejected): visual
  separation prevents new users from being overwhelmed.

### Output consumed by

- **Every command**: inherits the universal flag set + the precedence engine.
- **CLI parser** (Stage 6): implements forbidden-combination validation as a
  post-parse pass before dispatching to command handler.
- **Help generator** (Stage 6): renders `--help` per the help-system shape.
- **Stage 3-B per-command specs**: each command's per-command flags are
  appended to the universal set; this SPEC's precedence rules apply uniformly.

### Failure modes specifically guarded

- **Flag conflicts silently ignored**: parse-time validation prevents.
- **Multiple sources confusion**: explicit precedence table + standard pattern
  matches user expectation from other CLIs.
- **Unsupported locale**: explicit error with v1-supported list (no silent
  fallback to `en` when user asked for something unsupported).
- **Power user flag discoverability**: separate section in help (visible but
  distinct) — neither hidden nor noise.

---

## `agora doctor` [SPEC] (Accepted 2026-05-03, Stage 3-B.1)

> **Goal**: Standalone environment + project health diagnostic. Surfaces every
> Stage 2 quality signal (probes, tree quality, bypasses, stale state) in one
> command. Reuses Gate 0 probe execution but never blocks Ralph.

### CLI signature

```
agora doctor [--refresh] [--include-disabled] [--json] [--locale=<code>]
             [-q | --verbose] [--no-color] [--config=<path>]
```

Universal flags inherited from Stage 3-A.3.

Command-specific flags:

| Flag | Effect |
|------|--------|
| `--refresh` | Bust Gate 0 probe cache (per Stage 2-B.1 R3-A); re-run all probes |
| `--include-disabled` | Run disabled probes anyway; results shown but don't affect exit code (per R3-A below) |

### Default scope [R1-A: full health view]

A single invocation produces these sections in order:

```
1. Universal probes              ← always-true detect probes (claude, node, pnpm)
2. Project-specific probes (active)  ← detect-marker matched + in seed.material
3. Probes detected but not bundled   ← markers found, no bundled probe (Tier 3 deferred)
4. Tree quality (current handoff)    ← only if state.phase >= "ready_for_ralph"  (R4-A)
5. Bypass status                     ← active persistent bypasses + accumulation alert
6. Stale bypass reminders            ← persistent bypasses set > 24h ago
7. Final summary line                ← single-line aggregate counts
```

Sections 4 (Tree quality) is **conditionally hidden** when no `.agora/ac_tree.json`
exists. All other sections are always present (may be empty).

### Happy-path TUI mockup

```
─────────────────────────────────────────────────────────────────
  agora doctor                                  [Stage: in_ralph]
─────────────────────────────────────────────────────────────────

  Universal probes
    ✓ claude         Max plan, 240ms latency
    ✓ node           v22.10.1 (≥ 22 OK)
    ✓ pnpm           10.22.0

  Project-specific probes (active)
    ✓ git            clean working tree
    ✓ gh             authenticated as srhee91
    ✓ vercel         linked to lazydevz-inc/screenflow
    ✓ supabase       linked to project_xyz
    ~ stripe         disabled in config (false-positive)
    ✗ posthog_key    POSTHOG_PROJECT_KEY missing
                     ⓘ Fix: Set POSTHOG_PROJECT_KEY in .env

  Probes detected but not bundled (community PR welcome)
    ⚠ sentry         marker found (package.json deps include "@sentry/*")

  Tree quality (current handoff)
    ✓ Tree: 4 leaves, max depth 3, avg defense 0.77
    ✓ Test files: 4 generated, 0 failures
    ✓ User edits during review: 0

  Bypass status
    ⚠ Active persistent bypasses:
        - Probe disabled: stripe (set 4 sessions ago)
        - Iteration cap raised to 40 (set 2 sessions ago)
    ✓ No accumulation alert (last 5 iterations: 0 bypasses)

  Stale bypass reminders
    ⚠ stripe bypass set 4 sessions ago — still relevant?
       Run `agora ralph --reset-bypass=stripe` to clear

  19/20 probes available · 1 failure · 1 disabled · 2 stale bypasses

  ── Next: ────────────────────────────────────────────────────
    ▸ Set POSTHOG_PROJECT_KEY in .env
      Fix the failing probe before next ralph run

    ▸ agora ralph --reset-bypass=stripe
      Clear stale bypass

─────────────────────────────────────────────────────────────────
```

### Healthy-state mockup

When all probes pass, no concerns surface, no stale bypasses:

```
─────────────────────────────────────────────────────────────────
  agora doctor                          [Stage: ready_for_ralph]
─────────────────────────────────────────────────────────────────

  Universal probes
    ✓ claude         Max plan, 230ms latency
    ✓ node           v22.10.1
    ✓ pnpm           10.22.0

  Project-specific probes (active)
    ✓ git, gh, vercel, supabase, anthropic_api_key  (all OK)

  Tree quality (current handoff)
    ✓ Tree: 4 leaves, max depth 3, avg defense 0.81
    ✓ All defense scores >= 0.7
    ✓ No force-leaves at max depth
    ✓ All binary splits (no ternary fallbacks)

  Bypass status
    ✓ No active persistent bypasses
    ✓ No accumulation alert

  All clear. 8 probes pass, 0 issues.

  ── Next: ────────────────────────────────────────────────────
    ▸ agora ralph
      Start implementation

─────────────────────────────────────────────────────────────────
```

When healthy, project-specific probes are listed compactly on one line
(sparing vertical space for cluttered cases).

### Empty-state mockup

`agora doctor` in an empty directory (no `.agora/`):

```
─────────────────────────────────────────────────────────────────
  agora doctor                                       [Stage: —]
─────────────────────────────────────────────────────────────────

  Universal probes
    ✓ claude         Max plan, 230ms latency
    ✓ node           v22.10.1
    ✓ pnpm           10.22.0

  Project-specific probes (active)
    ⓘ No project detected. Run `agora new` to start.

  Bypass status
    ⓘ No project state to evaluate.

  Universal environment ready. Run `agora new` to start a project.

  ── Next: ────────────────────────────────────────────────────
    ▸ agora new [project-name]
      Start a new project workflow

─────────────────────────────────────────────────────────────────
```

Tree quality, bypass-active, and stale-bypass sections are omitted when no
project exists. Universal probes always run (they verify the agora
installation itself).

### JSON output schema

`--json` mode emits the universal envelope (per Stage 3-A.1) with `data` shape:

```json
{
  "command": "agora doctor",
  "version": "0.2.0-stage-2",
  "timestamp": "2026-05-03T06:14:00Z",
  "session_id": null,
  "result": {
    "ok": false,
    "data": {
      "summary": {
        "probes_total": 19,
        "probes_passed": 18,
        "probes_failed": 1,
        "probes_disabled": 1,
        "probes_unbundled_detected": 1,
        "tree_quality_concerns": 0,
        "bypasses_active": 2,
        "stale_bypasses": 2
      },
      "universal_probes": [
        {
          "id": "claude",
          "status": "pass",
          "detail": "Max plan, 240ms latency",
          "fix": null
        },
        ...
      ],
      "project_probes": [
        {
          "id": "vercel",
          "status": "pass",
          "detail": "linked to lazydevz-inc/screenflow",
          "fix": null
        },
        {
          "id": "stripe",
          "status": "disabled",
          "detail": "disabled in config",
          "fix": null
        },
        {
          "id": "posthog_key",
          "status": "fail",
          "detail": "POSTHOG_PROJECT_KEY missing",
          "fix": "Set POSTHOG_PROJECT_KEY in .env"
        }
      ],
      "unbundled_detected": [
        {
          "id": "sentry",
          "marker": "package.json deps include \"@sentry/*\""
        }
      ],
      "tree_quality": {
        "leaves": 4,
        "max_depth": 3,
        "avg_defense_score": 0.77,
        "force_leaves_at_max_depth": 0,
        "test_files_count": 4,
        "test_generation_failures": 0,
        "user_edits_count": 0,
        "concerns": []
      },
      "bypasses": {
        "active_persistent": [
          {
            "type": "probe_disabled",
            "id": "stripe",
            "set_at": "2026-04-29T...",
            "set_via": "config_toml",
            "reason": "monorepo workspace"
          },
          {
            "type": "iteration_cap_raised",
            "value": 40,
            "set_at": "2026-05-01T...",
            "set_via": "interactive_dialog",
            "reason": "complex auth migration"
          }
        ],
        "accumulation_alert": false,
        "stale": [
          {
            "id": "stripe",
            "age_hours": 96,
            "reset_command": "agora ralph --reset-bypass=stripe"
          }
        ]
      }
    }
  },
  "next": [
    {
      "command": "(external)",
      "args": [],
      "description": "Set POSTHOG_PROJECT_KEY in .env"
    },
    {
      "command": "agora ralph",
      "args": ["--reset-bypass=stripe"],
      "description": "Clear stale bypass"
    }
  ],
  "warnings": [
    {
      "code": "stale_bypass",
      "message": "Probe disabled: stripe (set 4 sessions ago)",
      "recommendation": "Run agora ralph --reset-bypass=stripe to clear"
    },
    {
      "code": "unbundled_marker",
      "message": "sentry marker found but probe not bundled",
      "recommendation": "Manual verify or contribute community probe"
    }
  ],
  "errors": [
    {
      "code": "probe_failed",
      "probe_id": "posthog_key",
      "message": "POSTHOG_PROJECT_KEY missing",
      "fix": "Set POSTHOG_PROJECT_KEY in .env"
    }
  ]
}
```

When `command` in `next[]` references an external action (not an Agora subcommand),
the value is the literal string `"(external)"` and `description` carries the
human-readable instruction.

### Exit code [R2-A]

```
exit_code = compute_exit():
  if (probes_failed >= 1) OR (stale_bypasses >= 3):
    return 1
  return 0
```

Exit 1 means **agora doctor judged the environment NOT ready**. The user must
address the failure(s) before reliable Ralph operation.

`--include-disabled` (R3-A) does NOT affect exit code: disabled probe failures
remain advisory; the user opted out of caring about that probe.

Tree-quality concerns and unbundled-detected markers do NOT affect exit code
(informational warnings only).

### `--include-disabled` behavior [R3-A]

```
on --include-disabled:
  - Run disabled probes alongside the active set
  - Display results with `~` marker (same as default disabled display)
  - Output line annotation: "(included via --include-disabled)"
  - Do NOT count disabled probe failures toward exit_code
```

Example with --include-disabled when stripe is disabled but the env doesn't have STRIPE_SECRET_KEY:

```
~ stripe         (included via --include-disabled)
                 STRIPE_SECRET_KEY missing
                 ⓘ Fix: Set STRIPE_SECRET_KEY OR run `agora ralph --reset-bypass=stripe` to re-enable
```

### Tree-quality section conditional [R4-A]

```
show_tree_quality_section():
  if state.phase NOT IN ("ready_for_ralph", "in_ralph", "in_ralph_paused", "ralph_complete"):
    return False  # no tree exists yet
  if not exists(.agora/ac_tree.json):
    return False  # tree was somehow lost
  return True
```

When section is hidden, JSON `data.tree_quality` is `null` (not omitted — keeps schema stable).

### Cache interaction

`agora doctor` shares the Gate 0 probe cache (Stage 2-B.1 R3-A — 5min TTL) by default.
`--refresh` flag busts the cache.

Tree-quality data is read fresh from `.agora/ac_tree.json` (no cache).
Bypass state is read fresh from `seed.metadata.bypasses[]` and ralph_state (no cache).

### Auto-suggest Next: candidates (per-command additions per 3-A.2)

`agora doctor` computes candidates from:

- **Source 2 (failure correction)**: every failed probe → external fix command + agora doctor re-run
- **Source 1 (phase progression)**: respects state.phase from default lookup
- **Source 3 (inspection)**: `agora status` is highly relevant; included when no other Source 1/2 dominates

Plus command-specific additions:
- Each stale bypass → reset command suggestion
- Each unbundled detected → "manual verify or contribute probe" note (NOT in next[]; goes to warnings[])

### Boundaries

- ❌ Probes-only output (R1-B rejected): full health view is the value of
  `agora doctor` over `agora ralph`'s embedded Gate 0.
- ❌ Verbose-gated tree section (R1-C rejected): tree quality is core diagnostic,
  not advanced.
- ❌ Always-zero exit (R2-B rejected): would defeat scripting / CI use.
- ❌ Per-failure exit codes (R2-C rejected): too granular; signals lost when
  multiple categories fail at once.
- ❌ Disabled probe failure counted in exit (R3-B rejected): user explicitly
  opted out; counting violates that intent.
- ❌ --include-disabled as list-only (R3-C rejected): defeats the diagnostic value.
- ❌ Tree section "(no tree)" placeholder (R4-B rejected): adds noise when
  doctor runs in a project without tree (very common during alignment phase).
- ❌ Verbose-gated tree section (R4-C rejected): doctor's job is to surface
  concerns; verbose-gating hides relevant signal.

### Output consumed by

- **AI agents**: parse `--json` output to decide remediation (e.g. "doctor
  reported posthog_key missing → suggest user set the env var").
- **CI / scripts**: rely on exit code 0/1 for health gating ("if doctor fails, fail the pipeline").
- **`agora ralph` Gate 0**: shares probe cache; doctor's `--refresh` invalidates Gate 0's cache too.
- **Ralph stale-bypass reminder dialog**: derives stale-bypass list from the same source that doctor surfaces.

### Failure modes specifically guarded

- **Silent probe state**: every probe result reaches the user (no aggregation
  hides individual failures).
- **Forgotten bypasses**: stale-bypass reminder section dedicated to surfacing
  set-and-forget state.
- **Tree decay over iterations**: tree-quality section shows current snapshot;
  `agora doctor --refresh` re-evaluates on demand.
- **CI false-pass**: exit code 1 on any probe failure ensures CI gates catch
  environment issues before allowing downstream Agora commands.
- **F2 (purpose visible)**: each warning carries a `recommendation` field;
  each error carries a `fix` field.

---

## Open Questions for Stage 3

1. ~~**Output Format Framework**~~ ✅ Resolved 2026-05-03 (Stage 3-A.1).
2. ~~**Auto-suggest "Next:" Pattern**~~ ✅ Resolved 2026-05-03 (Stage 3-A.2).
3. ~~**Global Flags + Precedence**~~ ✅ Resolved 2026-05-03 (Stage 3-A.3).
4. ~~**`agora doctor`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.1).

## `agora status` [SPEC] (Accepted 2026-05-03, Stage 3-B.2)

> **Goal**: Single-command snapshot of project progress. Different from
> `agora doctor` (environment diagnostic) — `status` answers "where am I
> in this project's lifecycle?" Maturity table + Ralph progress + recent
> gate sparkline in one view.

### CLI signature

```
agora status [--leaf=<id>] [--history [--count=N]] [--json] [--locale=...]
             [-q | --verbose] [--no-color] [--config=<path>]
```

Universal flags inherited from Stage 3-A.3.

Command-specific flags:

| Flag | Effect |
|------|--------|
| `--leaf=<id>` | Drill into specific AC leaf (test results, drift history) |
| `--history` | List recent sessions instead of current state |
| `--count=N` | Used with `--history`; defaults to 5 (per R4-A) |

### Phase-aware default output

The default (no flag) output adapts to `state.phase` from `.agora/state.json`:

| state.phase | Default output focus |
|-------------|----------------------|
| `null` (no .agora/) | "No project. Run `agora new` to start." |
| `in_alignment` | Phase 2 round progress, last answered field, ambiguity trend, next contributor |
| `in_alignment_paused` | "Paused at round N. Last answered: <field>." + resume hint |
| `alignment_complete` | "Seed locked. Awaiting handoff." |
| `in_handoff` | Tree review status (decomposition done, awaiting user accept) |
| `ready_for_ralph` | Tree summary + "ready for `agora ralph`" |
| `in_ralph` / `in_ralph_paused` | Maturity + Ralph progress + recent gate sparkline (full mockup below) |
| `ralph_complete` | Final session summary + post-completion next actions |

The `in_ralph` mockup is the most-information-rich case and is shown below
as the canonical example. Other phases use the same layout structure but
hide/replace sections inappropriate to their phase.

### Mockup — in_ralph state [R1-A: full info on one screen]

```
─────────────────────────────────────────────────────────────────
  agora status                              [Stage: in_ralph]
─────────────────────────────────────────────────────────────────

  Project:           screenflow (lazydevz-inc)
  Session:           session_xyz789 (started 2h 14m ago)
  Phase:             in_ralph
  Parallelism:       1 (sequential)

  📊 Maturity (locked seed)
     telos.statement       NOESIS    (3 alts examined)
     telos.served_good     NOESIS
     form.essential_*      DIANOIA
     acceptance_criteria   DIANOIA   (4 ACs)

  📊 Ralph progress (4 leaves)
     ✓ leaf_001  capture_command       (iter 1-3, passed)
     ✓ leaf_002  link_primitives       (iter 4-6, passed)
     ◐ leaf_003  search_durability     (iter 7, in progress)
     ○ leaf_004  cooccurrence_display  (queued)

  📈 Recent gate signals (last 5 iterations)
     drift_score:    0.12  0.18  0.09  0.21  0.14
     Gate 1 (det):   ✓ ✓ ✓ ✓ ✓
     Gate 2 (qa):    ✓ ✓ ✓ ✓ ✓
     Gate 3 (ui):    — — — — —     (no UI changes)
     Gate 4 (tech):  ✓ ✓ ⚠ ✓ ✓     (1 minor objection refined)
     Gate 5 (align): ✓ ✓ ✓ ✓ ✓

  🎯 Aporia delta this session: +1
  📎 Active bypasses: 1 (probe disabled: stripe)

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Continue Ralph iteration

    ▸ agora doctor
      Diagnose environment if Ralph feels stuck

─────────────────────────────────────────────────────────────────
```

### Mockup — `--leaf=<id>` drill-down

```
─────────────────────────────────────────────────────────────────
  agora status --leaf=leaf_003           [Stage: in_ralph]
─────────────────────────────────────────────────────────────────

  Leaf: leaf_003 (search_durability)
  Content: "Search results show co-occurring notes within 100ms"
  Parent: node_root.children[1] (associations)
  Status: in progress (iteration 7)

  📊 Iteration history for this leaf
     iter 7: in progress (started 12m ago)

  📊 Test file
     .agora/tests/leaf_003.spec.ts (4 cases)
     Last run: 3m ago, 2/4 passing

  📈 Drift score history for this leaf
     iter 7 (current): 0.21 (PASS_WITH_WARNING)
     ⓘ Gate 4 raised concern about index re-build cost

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Continue iteration

─────────────────────────────────────────────────────────────────
```

### Mockup — `--history` (R4-A: 5 sessions default)

```
─────────────────────────────────────────────────────────────────
  agora status --history                            [Sessions]
─────────────────────────────────────────────────────────────────

  Recent sessions (last 5):

  session_xyz789  active           started 2h ago
                  in_ralph (4 leaves: 2 done, 1 active, 1 queued)

  session_uvw456  completed        2026-04-29 (4d ago)
                  ralph_complete (12 iterations, 0 skipped)
                  Telos refined once via Z2

  session_rst123  aborted          2026-04-25 (8d ago)
                  in_alignment_paused (5 rounds, user Ctrl+C)

  session_opq890  completed        2026-04-22 (11d ago)
                  ralph_complete (8 iterations, 1 auto-skipped)

  session_lmn567  completed        2026-04-19 (14d ago)
                  ralph_complete (6 iterations, 0 skipped)

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Continue active session

    ▸ agora status
      View current session detail

─────────────────────────────────────────────────────────────────
```

When `--history --count=10` is set, list shows up to 10 sessions.

### Ralph progress display rules [R2-A]

Each leaf rendered as one line with status marker:

| Marker | Meaning |
|--------|---------|
| `✓` | Completed (all gates passed in some iteration) |
| `◐` | In progress (currently iterating) |
| `○` | Queued (not yet started) |
| `✗` | Auto-skipped (after 3 Z2 + 2 user-aborts per Stage 2-C.2) |

Format per line: `{marker} {leaf_id}  {short_label}  ({iteration_range, status})`

Leaves shown in `leaf_order` from ralph_state.json (DFS pre-order per Stage 2-C.2).

For trees with > 20 leaves, default truncates to first 10 + "... (N more)" hint.
`--verbose` shows all.

### Recent gate signals — sparkline [R3-A: ASCII numeric + markers]

```
drift_score:    0.12  0.18  0.09  0.21  0.14
Gate 1 (det):   ✓ ✓ ✓ ✓ ✓
Gate 2 (qa):    ✓ ✓ ✓ ✓ ✓
Gate 3 (ui):    — — — — —     (no UI changes)
Gate 4 (tech):  ✓ ✓ ⚠ ✓ ✓     (1 minor objection refined)
Gate 5 (align): ✓ ✓ ✓ ✓ ✓
```

Rules:
- 5 most-recent iterations across the session (or fewer if session has < 5)
- drift_score: numeric to 2 decimals, space-separated
- Each gate: 5 markers separated by single space
  - `✓` = PASS
  - `⚠` = PASS_WITH_WARNING (drift 0.15-0.30 or Disputatio conditional)
  - `✗` = FAIL
  - `—` = N/A (gate didn't run for that iteration)
- Trailing annotation: short summary if any non-✓ markers ("(1 minor objection refined)")

Block characters (R3-B `▂▃▅▇▆`) and pure numbers (R3-C) rejected: ASCII reads
on every terminal, the marker conveys gate-result semantics that pure numbers lose.

### JSON output schema

```json
{
  "command": "agora status",
  "result": {
    "ok": true,
    "data": {
      "project": {
        "name": "screenflow",
        "owner": "lazydevz-inc",
        "cwd": "/Users/sang/Developer/screenflow"
      },
      "session": {
        "id": "session_xyz789",
        "started_at": "2026-05-03T04:00:00Z",
        "elapsed_minutes": 134,
        "phase": "in_ralph",
        "parallelism": 1
      },
      "maturity": {
        "fields": [
          {"path": "telos.statement", "level": "NOESIS", "alts_examined": 3},
          {"path": "telos.served_good", "level": "NOESIS"},
          {"path": "form.essential_structure", "level": "DIANOIA"},
          {"path": "acceptance_criteria.*", "level": "DIANOIA", "count": 4}
        ]
      },
      "ralph_progress": {
        "total_leaves": 4,
        "leaves": [
          {"id": "leaf_001", "label": "capture_command", "status": "completed",
           "iteration_range": "1-3"},
          {"id": "leaf_002", "label": "link_primitives", "status": "completed",
           "iteration_range": "4-6"},
          {"id": "leaf_003", "label": "search_durability", "status": "in_progress",
           "current_iteration": 7},
          {"id": "leaf_004", "label": "cooccurrence_display", "status": "queued"}
        ]
      },
      "recent_gates": {
        "iterations_window": 5,
        "drift_scores": [0.12, 0.18, 0.09, 0.21, 0.14],
        "gates": {
          "gate_1": ["pass", "pass", "pass", "pass", "pass"],
          "gate_2": ["pass", "pass", "pass", "pass", "pass"],
          "gate_3": ["na", "na", "na", "na", "na"],
          "gate_4": ["pass", "pass", "warn", "pass", "pass"],
          "gate_5": ["pass", "pass", "pass", "pass", "pass"]
        },
        "annotations": [
          {"gate": "gate_4", "iteration_offset": -3, "note": "1 minor objection refined"}
        ]
      },
      "aporia_delta_this_session": 1,
      "active_bypasses_count": 1
    }
  },
  "next": [...],
  "warnings": [],
  "errors": []
}
```

For `--leaf=<id>`, `data` shape is leaf-focused:

```json
{
  "leaf": {
    "id": "leaf_003",
    "label": "search_durability",
    "content": "Search results show co-occurring notes within 100ms",
    "parent_node_id": "node_root.children[1]",
    "parent_label": "associations",
    "status": "in_progress",
    "current_iteration": 7
  },
  "iteration_history": [
    {"iteration": 7, "status": "in_progress", "started_at": "..."}
  ],
  "test_file": {
    "path": ".agora/tests/leaf_003.spec.ts",
    "case_count": 4,
    "last_run_at": "...",
    "last_run_result": "2/4 passing"
  },
  "drift_history": [
    {"iteration": 7, "drift_score": 0.21, "classification": "PASS_WITH_WARNING",
     "concern": "Gate 4 raised concern about index re-build cost"}
  ]
}
```

For `--history`:

```json
{
  "sessions_window": 5,
  "sessions": [
    {
      "id": "session_xyz789",
      "started_at": "...",
      "ended_at": null,
      "phase": "in_ralph",
      "outcome": "active",
      "summary": "in_ralph (4 leaves: 2 done, 1 active, 1 queued)"
    },
    ...
  ]
}
```

### Exit code

- `0`: status read successfully (regardless of project health)
- `1`: cannot read state (corrupt .agora/, missing required file)

`agora status` is informational; project being in a degraded state (failing
gates, etc.) does not produce non-zero exit. That's `agora doctor`'s job.

### `--verbose` mode additions

- Ralph progress: shows ALL leaves (not just first 10)
- Recent gate signals: extends to last 10 iterations (not 5)
- Adds: per-gate avg pass rate over session
- Adds: per-leaf drift_score history (compact)

### `-q / --quiet` mode reductions

- Skips: aporia delta, bypass count, recent gate signals
- Output: project name + phase + Ralph progress only
- Useful for: scripts, status bar integration

### Phase-specific layout variations

For `in_alignment` phase:

```
─────────────────────────────────────────────────────────────────
  agora status                          [Stage: in_alignment]
─────────────────────────────────────────────────────────────────

  Project:    screenflow
  Session:    session_xyz789 (started 12m ago)
  Phase:      in_alignment, round 4 of ~6

  📊 Current ambiguity trend
     Round 1: 0.85 → Round 2: 0.62 → Round 3: 0.41 → Round 4: 0.23

  Last answered: telos.served_good
  Last contributor: Aristotle (Telos)
  Next contributor: Plato (Divided Line — Noesis test)

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Continue alignment

─────────────────────────────────────────────────────────────────
```

For `ralph_complete`:

```
─────────────────────────────────────────────────────────────────
  agora status                        [Stage: ralph_complete]
─────────────────────────────────────────────────────────────────

  Project:           screenflow
  Session:           session_xyz789 (completed 12m ago)
  Phase:             ralph_complete

  📊 Final summary
     Total leaves: 4
     Completed:    4 (100%)
     Auto-skipped: 0
     Iterations:   12 (avg 3 per leaf)
     Aporia events this session: 2 (both refined)

  Session-end dialog awaits acknowledgment.

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Re-show session-end dialog

    ▸ agora new
      Start a new project workflow

─────────────────────────────────────────────────────────────────
```

### Boundaries

- ❌ Single-line / compact-only default (R1-B rejected): hides too much; user
  has to drill repeatedly for normal operations.
- ❌ Verbose-as-default (R1-C rejected): overwhelms; verbose is opt-in.
- ❌ Progress bar visualization (R2-B rejected): per-leaf granularity lost;
  AC tree iteration isn't a smooth percentage.
- ❌ Tree visualization (R2-C rejected): trees with > 5 leaves become noisy;
  list form scales better.
- ❌ Block-character sparklines (R3-B rejected): font rendering inconsistent
  across terminals.
- ❌ Numbers-only without markers (R3-C rejected): loses gate-result semantics
  (PASS vs WARN vs FAIL distinction).
- ❌ History default > 5 (R4-B rejected): scroll burden without proportional
  value; --count=N for those who want more.
- ❌ History default < 5 (R4-C rejected): too short to see meaningful trend.
- ❌ Status reporting unhealthy state via exit code (that's doctor's role,
  not status').
- ❌ Status running probes (only doctor runs probes; status reads cached state).

### Output consumed by

- **AI agents**: parse `--json` output to know "what's currently happening";
  next[] guides their next CLI call.
- **Scripts / status bar**: `--quiet --json` gives minimal phase + progress info.
- **`agora resume`**: shares phase enum with status (status surfaces what
  resume will do).
- **`agora` (default command)**: relies on status's logic for "what's next" suggestions.

### Failure modes specifically guarded

- **Confusion vs doctor**: `agora doctor` = environment health; `agora status`
  = project progress. No overlap (doctor surfaces env issues, status surfaces
  workflow position).
- **Stale data**: status reads from disk on every call (no caching); always
  reflects current `.agora/state.json` and `ralph_state.json`.
- **Missing tree**: phases before `ready_for_ralph` show alignment-flavored
  sections; phases after show Ralph-flavored sections; never both at once.
- **Truncation surprise**: if leaves > 10 are truncated, the "... (N more)"
  hint is explicit, not silent.

---

## Open Questions for Stage 3

1. ~~**Output Format Framework**~~ ✅ Resolved 2026-05-03 (Stage 3-A.1).
2. ~~**Auto-suggest "Next:" Pattern**~~ ✅ Resolved 2026-05-03 (Stage 3-A.2).
3. ~~**Global Flags + Precedence**~~ ✅ Resolved 2026-05-03 (Stage 3-A.3).
4. ~~**`agora doctor`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.1).
5. ~~**`agora status`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.2).

## `agora seed` [SPEC] (Accepted 2026-05-03, Stage 3-B.3)

> **Goal**: View and edit the locked seed. Single command for every direct
> user influence on the seed: viewing the artifact, editing fields (triggers
> mini-alignment per Stage 2-A.5 R5-A), overriding Gate 5 drift scores
> (Stage 2-B.4 manual override), regenerating tests (Stage 2-B.2).

### CLI signature

```
agora seed                                       # view (default)
agora seed --edit <field>                        # edit specific field
agora seed --override-gate5 <iter_id> <score>    # manual drift override
agora seed --regen-tests [--all]                 # trigger test regeneration
```

Mode flags are mutually exclusive: at most one of `--edit / --override-gate5
/ --regen-tests` per invocation. Multiple → error code 1.

Universal flags inherited from Stage 3-A.3.

### Default view scope [R1-A: full seed]

```
─────────────────────────────────────────────────────────────────
  agora seed                              [Stage: in_ralph]
─────────────────────────────────────────────────────────────────

  📄 Locked seed (session_xyz789, locked 2h 14m ago)

  🎯 Telos
     statement:       "Help me capture and connect what I read"
     served_good:     "Reduce cognitive load of remembering ideas"
     failure_signal:  "Notes pile up but never get re-read"

  📐 Form
     essential_structure: "Local-first CLI with capture + link primitives"
     irreducible_parts:   ["capture", "link", "search", "render"]

  🛠 Material
     tech_stack:    [Node.js 22, SQLite, fzf]
     infrastructure: [local filesystem only]

  ⚙ Efficient
     who:  "Sang (solo)"
     when: "Evenings, ~30min sessions"
     how:  "Manual capture from Kindle highlights"

  📋 Acceptance Criteria (4)
     1. Capture command stores timestamp + book/url
     2. Capture command stores user-typed reflection
     3. User adds [[note-id]] syntax in capture body
     4. Search results show co-occurring notes within 100ms

  📊 Maturity
     telos.statement       NOESIS    (3 alts examined)
     telos.served_good     NOESIS
     telos.failure_signal  DIANOIA
     form.essential_*      DIANOIA
     form.irreducible_*    PISTIS
     material.*            PISTIS
     efficient.*           PISTIS
     acceptance_criteria   DIANOIA

  📎 Genesis (original Phase 1 intake)
     "I want a place to remember what I read with a few people occasionally engaging"

  ⚠ Active overrides:
     - threshold: gate_5 fail = 0.50 (default 0.60)
     - cap raised: 40 iterations (default 25)
     - gate_5 manual override on iter_007 (3 days ago)

  ── Next: ────────────────────────────────────────────────────
    ▸ agora seed --edit telos.statement
      Refine telos (triggers mini-alignment Z2 path)

    ▸ agora ralph
      Continue implementation

─────────────────────────────────────────────────────────────────
```

Sections in order: Telos / Form / Material / Efficient / AC / Maturity /
Genesis / Active overrides. Sections may be empty (e.g. no overrides) but
section headers always present (R1-A: full info).

If `state.phase < "alignment_complete"` (no locked seed yet):

```
─────────────────────────────────────────────────────────────────
  agora seed                          [Stage: in_alignment]
─────────────────────────────────────────────────────────────────

  ⓘ No locked seed yet. Currently in alignment loop (round 4 of ~6).

  Use `agora status` for alignment progress detail.
  Use `agora resume` to continue alignment.

─────────────────────────────────────────────────────────────────
```

### `--edit <field>` flow

```
agora seed --edit telos.statement
```

Interactive flow:

```
─────────────────────────────────────────────────────────────────
  agora seed --edit telos.statement      [Stage: in_ralph → editing]
─────────────────────────────────────────────────────────────────

  Current value:
    "Help me capture and connect what I read"

  Current maturity: NOESIS (3 alts examined)

  ⚠ Editing this field will:
    - Reset its maturity to EIKASIA (Plato Divided Line)
    - Cascade-reset dependent fields (form.*, AC.*) one level lower
    - Trigger Plato Dihairesis re-decomposition on accept
    - If Ralph is running, auto-pause it (state.phase → in_ralph_paused)
    - Open mini-alignment loop at this field

  Cascade preview (R2-A: automatic):
    telos.served_good       NOESIS → DIANOIA
    form.essential_structure DIANOIA → PISTIS
    acceptance_criteria.*   DIANOIA → PISTIS

  Continue? [y]es / [N]o
  > _
```

On `y`:
1. Opens `$EDITOR` with current value pre-populated (per Stage 2-A.3 editor escape contract)
2. On editor save with non-empty content:
   - `seed.statement` updated to new value
   - Maturity cascade applied per R2-A
   - State transitions: `in_ralph` → `in_ralph_paused` (if Ralph was running)
   - `state.phase` becomes `in_alignment`
   - Mini-alignment loop opens at the named field
3. On editor save with empty content OR cancel:
   - No changes applied
   - "Edit canceled" message
   - State unchanged

### Cascade-reset rule [R2-A: automatic per SIBLING_REQUIREMENTS]

When a field is edited, dependent fields per Validation Gates SPEC's
SIBLING_REQUIREMENTS (Stage 2-A.7) drop one Plato Divided Line level:

```
NOESIS → DIANOIA
DIANOIA → PISTIS
PISTIS → EIKASIA
EIKASIA → EIKASIA (floor)
```

Example for `--edit telos.statement`:

```
SIBLING_REQUIREMENTS lookup:
  telos.served_good          requires telos.statement       → cascade
  form.essential_structure   requires telos.statement       → cascade
  acceptance_criteria.*      requires form.essential, telos → cascade

Net effect:
  telos.statement      → EIKASIA (full reset; awaiting new value)
  telos.served_good    → DIANOIA (was NOESIS)
  form.essential_*     → PISTIS  (was DIANOIA)
  AC.* (each)          → PISTIS  (was DIANOIA)
```

Cascaded fields keep their existing **value** but lose maturity certification.
Mini-alignment loop will re-confirm (or refresh) each one as needed.

User does NOT manually edit each cascaded field — they're surfaced in the
mini-alignment session naturally per Round Ordering planner (which finds
the first not-settled field and proposes the next round).

R2-B (no cascade) rejected: would leave validation in inconsistent state
(form claiming DIANOIA defense vs telos that no longer holds). R2-C (per-cascade
prompts) rejected: tedium for the common case where automatic is correct.

### `--override-gate5 <iter_id> <score>` flow

```
agora seed --override-gate5 iter_007 0.10
```

Interactive flow:

```
─────────────────────────────────────────────────────────────────
  agora seed --override-gate5            [Manual drift override]
─────────────────────────────────────────────────────────────────

  ⚠ Manual drift_score override
     Iteration:  iter_007
     Original:   0.42 (FAIL → triggered Z1)
     Override:   0.10 (PASS)

  This override:
    - Reverses the Z1 escalation for iter_007
    - Records as trust warning in seed.metadata.gate5_overrides
    - Surfaces in `agora doctor` for 7 days

  Reason for override (required, recorded permanently):
  > _

  [reason captured, then:]

  ✓ Override applied.
    seed.metadata.gate5_overrides += {
      iter: "iter_007",
      original_score: 0.42,
      override_score: 0.10,
      reason: "<your reason>",
      timestamp: "2026-05-03T07:00:00Z"
    }

  Ralph state may now resume.

  ── Next: ────────────────────────────────────────────────────
    ▸ agora resume
      Continue Ralph (override applied)

─────────────────────────────────────────────────────────────────
```

Reason is **required** [R3-A]. Empty reason → command rejected (exit 1):

```
agora: error: --override-gate5 requires reason. Empty reason rejected.
```

Override is recorded:
- In `seed.metadata.gate5_overrides[]` (immutable history)
- Surfaced by `agora doctor` for 7 days as trust warning (then archived in metadata but no longer surfaced unless `--include-disabled`-style flag set)

R3-B (optional reason) rejected: silent override is exactly the F-Aquinas-4
pattern this guards against. R3-C (no override at all) rejected: legitimate
edge cases exist (LLM judgment was clearly wrong + iteration is correct).

### `--regen-tests [--all]` flow [R4-A]

Default (`--regen-tests` without `--all`):

```
agora seed --regen-tests

  📋 Detecting AC changes since last test generation...

  Changed since last gen:
    leaf_003 (AC content edited 5m ago)
    leaf_004 (added 5m ago)

  Unchanged:
    leaf_001, leaf_002 (skipped)

  Manual edit detected in:
    leaf_002 (you edited the test file directly 2h ago)

    Choose:
      ◯ [k] Keep manual edit; skip regen for leaf_002
      ◯ [o] Overwrite (lose manual edit; git diff preserves history)
      ◯ [m] Show 3-way merge: original generated / your manual / new generated

      > _

  [user picks k]

  Regenerating leaf_003... ✓
  Regenerating leaf_004... ✓
  Skipping leaf_002 (manual edit kept) ✓

  ── Next: ────────────────────────────────────────────────────
    ▸ agora ralph
      Run Ralph with regenerated tests

─────────────────────────────────────────────────────────────────
```

`--regen-tests --all` forces regeneration of every test file regardless of
change detection. Manual-edit dialog still applies (R4-A: same as 2-B.2 R4-A
mechanism).

R4-B (always-all) rejected: token waste; loses manual edits without explicit
intent. R4-C (no `--all` option) rejected: legitimate cases where the user
wants clean-slate (e.g. test generation prompt itself was tuned).

### Mode mutual exclusivity

Only ONE of these may be present per invocation:

```
--edit <field>
--override-gate5 <iter> <score>
--regen-tests [--all]
```

Multiple → parse-time error per Stage 3-A.3 R3-A:

```
agora: error: --edit, --override-gate5, --regen-tests are mutually exclusive.
              Choose one operation per invocation.
```

When none of the above flags set, mode = view (default).

### JSON output schema

View mode (`--json`):

```json
{
  "command": "agora seed",
  "result": {
    "ok": true,
    "data": {
      "seed_locked_at": "2026-05-03T04:00:00Z",
      "session_id": "session_xyz789",
      "telos": {
        "statement": "...",
        "served_good": "...",
        "failure_signal": "..."
      },
      "form": {
        "essential_structure": "...",
        "irreducible_parts": ["..."]
      },
      "material": {
        "tech_stack": ["..."],
        "infrastructure": ["..."]
      },
      "efficient": {
        "who": "...",
        "when": "...",
        "how": "..."
      },
      "acceptance_criteria": [
        {"id": "ac_001", "content": "..."},
        ...
      ],
      "maturity": {
        "telos.statement": "NOESIS",
        ...
      },
      "genesis": "<phase 1 intake quote>",
      "active_overrides": [
        {"type": "threshold", "field": "gate_5_fail", "value": 0.50, "default": 0.60},
        {"type": "cap_raised", "value": 40, "default": 25},
        {"type": "gate5_override", "iter": "iter_007", "score": 0.10, "set_at": "..."}
      ]
    }
  },
  "next": [...]
}
```

Edit / Override / Regen modes return action confirmation:

```json
{
  "result": {
    "ok": true,
    "data": {
      "operation": "edit",
      "target_field": "telos.statement",
      "previous_value": "...",
      "new_value": "...",
      "cascade_applied": [
        {"field": "telos.served_good", "old_maturity": "NOESIS", "new_maturity": "DIANOIA"},
        ...
      ],
      "state_transition": "in_ralph → in_ralph_paused → in_alignment"
    }
  }
}
```

In non-interactive mode, `--edit` requires `--value="<new value>"` flag
(or stdin pipe). Without it, errors out (no interactive editor in non-TTY mode).

### Exit code

- `0`: operation succeeded (or view rendered)
- `1`: parse error / mutual-exclusion violation / no locked seed for view
- `4`: edit operation paused state (Ralph auto-paused per --edit semantics)

### Boundaries

- ❌ Compact view (R1-B/C rejected): seed is the ground truth artifact;
  every section is part of "knowing your project."
- ❌ No-cascade edit (R2-B rejected): leaves validation inconsistent.
- ❌ Per-cascade prompting (R2-C rejected): tedium for the common case.
- ❌ Optional reason for gate5 override (R3-B rejected): silent F-Aquinas-4 pattern.
- ❌ No gate5 override at all (R3-C rejected): legitimate edge cases lost.
- ❌ Always-all regeneration (R4-B rejected): token waste + manual-edit destruction.
- ❌ No --all option (R4-C rejected): clean-slate is sometimes correct.
- ❌ Multiple mode flags in one invocation (mutual exclusivity).
- ❌ Editing in non-TTY mode without `--value` (no path for non-interactive editor).
- ❌ Showing seed before alignment_complete (refers user to status / resume).

### Output consumed by

- **AI agents**: read `--json` view to know seed shape; act on `next[]` for
  edits / regen.
- **Mini-alignment loop**: triggered by `--edit`; reads target_field +
  cascade list to bound its scope.
- **Ralph engine**: pauses on `--edit` (state.phase transition); resumes on
  --override-gate5 (overrides take effect immediately).
- **Test generator (Stage 2-B.2)**: invoked by `--regen-tests` with the
  changed-AC list (or all-AC list if --all).
- **`agora doctor`**: surfaces gate5 overrides as trust warnings for 7 days.

### Failure modes specifically guarded

- **Silent edit with stale validation**: cascade-reset enforces consistency;
  user can't edit and pretend dependents are still valid.
- **Silent gate5 override**: reason required + recorded + surfaced in doctor.
- **Manual test edit lost**: regen always shows the manual-edit dialog.
- **Mode confusion**: mutual exclusivity prevents accidental combo.
- **F-Aquinas-4**: every potentially-silent action (override, cascade, regen)
  is announced in TUI and recorded in metadata.

---

## Open Questions for Stage 3

1. ~~**Output Format Framework**~~ ✅ Resolved 2026-05-03 (Stage 3-A.1).
2. ~~**Auto-suggest "Next:" Pattern**~~ ✅ Resolved 2026-05-03 (Stage 3-A.2).
3. ~~**Global Flags + Precedence**~~ ✅ Resolved 2026-05-03 (Stage 3-A.3).
4. ~~**`agora doctor`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.1).
5. ~~**`agora status`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.2).
6. ~~**`agora seed`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.3).

## `agora new` [SPEC] (Accepted 2026-05-03, Stage 3-B.4)

> **Goal**: Project entry point. Triggers Brownfield/Greenfield Branching
> SPEC's 4-case state branching (Stage 2-A.9). Almost no flags of its own;
> the command's complexity lives in correctly dispatching based on
> existing `.agora/` state.

### CLI signature

```
agora new [name] [--workspace-root=<path>]
          [--json] [--locale=<code>] [-q | --verbose] [--no-color] [--config=<path>]
```

| Argument / Flag | Effect |
|------|--------|
| `name` (positional, optional) | Project name suggestion. Default: `cwd` folder name. Stored in `seed.metadata.project_name`. Does NOT create a new folder (R1-A). |
| `--workspace-root=<path>` | Per Stage 2-A.2 R3-A. Expands Phase 0 auto-scan to a monorepo workspace root. Rare; default is strict `cwd`-only. |

### 4-case state branching (per Stage 2-A.9)

```
on_invoke_agora_new(cwd, args):
  state = read_state_json(cwd)

  Case A — no .agora/                              → fresh start
  Case B — in_alignment OR in_alignment_paused     → 3-option warning dialog
  Case C — alignment_complete OR ready_for_ralph
           OR ralph_complete (with seed locked)    → 3-option intent dialog
  Case D — in_ralph OR in_ralph_paused             → 3-option Ralph-pause dialog
  Case E — in_handoff                              → "Resume handoff?" prompt
```

Case E (in_handoff) wasn't enumerated in Stage 2-A.9; it's the same shape
as Case B's "in-progress something" pattern. For consistency:

```
Case E (in_handoff):
  ⚠ Handoff (tree review) is in progress.
  Choose:
    ◯ Resume — re-show the AC tree review dialog
    ◯ Discard — drop tree, return to alignment_complete
    ◯ Cancel
```

### Mockup — Case A (greenfield, fresh start)

```
─────────────────────────────────────────────────────────────────
  agora new "reading-notes-cli"               [Stage: starting]
─────────────────────────────────────────────────────────────────

  [Phase 0: scanning current folder...]
    ✓ Empty directory (greenfield, high confidence)
    ✓ No prior context found
    Scan time: 87ms

  [Phase −1: Husserl Epoché]
    Greenfield default. Three brackets to defend your frame.

    Bracket 1/3 — Software Bracket
      "Is the answer to this experience necessarily software?
       What if it were a habit, a meeting, a conversation?"
    > _

  [...continues through brackets, then Phase 1, then Phase 2...]
```

After bracket completion, Phase 1 open intake begins per Stage 2-A.3 SPEC.
The full alignment loop unfolds inside the same `agora new` invocation.

### Mockup — Case A (brownfield, no prior `.agora/`)

```
─────────────────────────────────────────────────────────────────
  agora new                                   [Stage: starting]
─────────────────────────────────────────────────────────────────

  [Phase 0: scanning current folder...]
    ✓ Detected: brownfield TypeScript project (high confidence)
    ✓ Read: CLAUDE.md (12KB), README.md (4KB)
    ✓ Markers: Vercel, Supabase, GitHub Actions, Stripe
    ✓ Size: medium (~8K LoC)
    Scan time: 1.4s

  [Phase −1 skipped — brownfield default-off; run `agora bracket` to invoke]

  [Phase 1: open intake]
    What would you like to work on?
    ⓘ I've read your CLAUDE.md and README.md (16KB total).
      You don't need to re-explain what the project is — just tell me
      what you want to do here today.

    Press Enter alone to open $EDITOR for longer thoughts.
    > _
```

### Mockup — Case B (in_alignment, unfinished)

```
─────────────────────────────────────────────────────────────────
  agora new                              [Stage: in_alignment]
─────────────────────────────────────────────────────────────────

  ⚠ In-progress alignment session found:
    Started:        2026-04-29 03:14
    Rounds done:    4 / ~6 estimated
    Last answered:  telos.served_good
    Idle since:     5h 23m ago

  Choose:
    ◯ Resume — continue from where you left off (= `agora resume`)
    ◯ Discard — drop and start fresh (history preserved in .agora/history/)
    ◯ Cancel — exit this command

    > _
```

User picks Resume → equivalent to direct `agora resume` invocation.
Discard → state.phase reset to null, .agora/state.json deleted (history preserved), then Case A flow runs.
Cancel → exits with code 3.

### Mockup — Case C (locked seed, second alignment attempt)

```
─────────────────────────────────────────────────────────────────
  agora new                          [Stage: ready_for_ralph]
─────────────────────────────────────────────────────────────────

  ⓘ Last alignment locked: "Help me capture and connect what I read"
    Tree: 4 leaves, max depth 3
    Locked 2 days ago
    Ralph status: not yet started

  What would you like to do today?

    ◯ Add a new feature on top of reading-notes-cli
    ◯ Refine some part of the locked seed
    ◯ Something completely different (treat as new project — discard prior)

    [Enter a number] · [type free description]
    > _
```

User actions:
- "Add a new feature": opens Phase 1 with prior seed as context. Telos and form preserved; AC list extended in alignment loop.
- "Refine some part": triggers `agora seed --edit <field>` flow (user prompted to choose which field).
- "Something completely different": confirms (`Are you sure? This discards the locked seed.`); on yes, prior seed archived to history, Case A flow runs.
- Free text: LLM parses intent, routes to one of the three.

### Mockup — Case D (in_ralph)

```
─────────────────────────────────────────────────────────────────
  agora new                                  [Stage: in_ralph]
─────────────────────────────────────────────────────────────────

  ⚠ Ralph is currently running (iteration 7 of ~10).
     Starting a new alignment will pause Ralph.

  Choose:
    ◯ Pause Ralph + start new alignment (Ralph progress preserved)  ← R3-A default
    ◯ Continue Ralph (= `agora ralph resume`)
    ◯ Cancel

    > _
```

R3-A: choosing "Pause Ralph + start new alignment" preserves `ralph_state.json`
(checkpoint intact). State transitions: `in_ralph` → `in_ralph_paused` → `in_alignment`.
After the new alignment closes, the user can choose `agora ralph resume` to
return to the paused Ralph state, OR continue with the freshly-aligned seed
(which would discard the prior Ralph progress).

R3-B (auto-discard ralph_state) rejected: silent loss of work.
R3-C (extra confirm dialog) rejected: 3-option dialog already gives the user the choice; double-confirming is friction.

### `name` argument behavior [R1-A]

```
agora new                              # name = basename(cwd)
agora new "reading-notes-cli"          # name = "reading-notes-cli"
agora new "Reading Notes CLI"          # name preserved verbatim (whitespace OK)
```

The `name` value is stored in `seed.metadata.project_name` after first
alignment locks. It does NOT:
- Create a new folder
- Change cwd
- Affect `.agora/` location (always relative to cwd)

R1-B (required name) rejected: cwd folder name is sensible default, forcing
specification adds friction.
R1-C (mkdir + cd) rejected: violates user-controls-folder-structure principle;
agora's job is to operate inside the folder it was invoked in.

### `--workspace-root=<path>` semantics [R2-A]

Per Stage 2-A.2 R3-A:

```
agora new --workspace-root=../..
```

When set:
- Phase 0 auto-scan extends visibility to that root (and its sibling packages)
- `seed.metadata.workspace_root` records the path
- `.agora/` still lives in `cwd` (per-folder isolation rule preserved)

When unset (default):
- Phase 0 strict `cwd`-only
- Sibling monorepo packages invisible

R2-B (auto-detect monorepo) was already rejected in Stage 2-A.2.
R2-C (no flag at all) rejected: rare but legitimate use case (e.g. `agora new`
inside a monorepo package wanting to reference shared schemas in `../shared`).

### Discard semantics

When user picks "Discard" in Case B or "Something completely different" in Case C:

```
on_discard():
  # 1. Archive existing state to history
  archive_to_history({
    "type": "discarded_at_agora_new",
    "previous_state": current_state.serialize(),
    "previous_seed": current_seed.serialize() if exists,
    "discarded_at": now(),
    "discarded_via": "agora_new"
  })

  # 2. Clear active state
  delete(.agora/state.json)
  delete(.agora/seed.md, .agora/seed.json) if exists
  delete(.agora/ac_tree.json) if exists
  delete(.agora/ralph_state.json) if exists
  delete(.agora/tests/) if exists

  # 3. .agora/history/ NEVER deleted (audit preservation per Stage 2-C.3)
  # 4. .agora/cache/, .agora/logs/ NOT touched (independent lifecycle)

  # 5. Proceed to Case A flow
  invoke_case_a()
```

Discard is announced explicitly; never silent. The "Are you sure? This
discards the locked seed" confirmation in Case C is mandatory before discard executes.

### JSON output schema

For Case A (initial scan + start alignment):

```json
{
  "command": "agora new",
  "result": {
    "ok": true,
    "data": {
      "case": "A",
      "scan_summary": {
        "classification": "greenfield",
        "confidence": "high",
        "context_docs": [],
        "detected_markers": [],
        "size_signal": "tiny",
        "scan_duration_ms": 87
      },
      "session_id": "session_new_xyz",
      "next_phase": "phase_minus_1"  // or "phase_1" if brownfield
    }
  },
  "next": [
    {"command": "agora resume", "args": [], "description": "Continue alignment loop"}
  ]
}
```

For Cases B/C/D/E (dialog required):

In TTY mode, dialog is rendered.
In `--json` / non-interactive mode, returns:

```json
{
  "result": {
    "ok": false,
    "data": {
      "case": "B",
      "dialog_required": true,
      "options": [
        {"id": "resume", "description": "Continue from where you left off"},
        {"id": "discard", "description": "Drop and start fresh"},
        {"id": "cancel", "description": "Exit this command"}
      ]
    }
  },
  "errors": [
    {
      "code": "interactive_required",
      "message": "Cannot dispatch without user choice in non-interactive mode."
    }
  ]
}
```

Caller in non-interactive mode must specify the choice via flag:
`agora new --case-b-action=resume` (or `discard` / `cancel`). Stage 6
implementation will codify these flag names. The pattern: every interactive
dialog has a non-interactive equivalent flag.

### Exit code

- `0`: command dispatched and proceeded (Case A direct, or Cases B/C/D/E after user choice)
- `1`: parse error
- `3`: user chose Cancel in Cases B/C/D/E
- `4`: command paused (e.g. user picked "Pause Ralph + start new alignment" — alignment will start, but exit signals the state transition)

### Boundaries

- ❌ Required `name` argument (R1-B rejected): cwd default is sensible.
- ❌ Auto-create folder from name (R1-C rejected): violates user-folder-control.
- ❌ Auto-detect monorepo workspace (R2-B rejected at Stage 2-A.2).
- ❌ Remove `--workspace-root` (R2-C rejected): legitimate edge case.
- ❌ Auto-discard ralph_state in Case D (R3-B rejected): silent loss of work.
- ❌ Extra confirm dialog before pause (R3-C rejected): 3-option dialog gives the choice.
- ❌ Silent discard (Case B/C "Discard" must be confirmed for Case C; for Case B, the dialog itself is the explicit choice).
- ❌ Deleting `.agora/history/` on discard (audit preservation absolute).
- ❌ Non-interactive Cases B/C/D/E without choice flag (interactive dialog can't run; error 1).

### Output consumed by

- **Phase 0/1/2 of alignment loop**: receives `case_a` dispatch and starts.
- **`agora resume`**: receives `case_b` "Resume" choice, equivalent dispatch.
- **`agora seed --edit`**: receives `case_c` "Refine" choice, equivalent dispatch.
- **`agora ralph` resume**: receives `case_d` "Continue Ralph" choice.
- **History store**: every discard event recorded with full state snapshot.

### Failure modes specifically guarded

- **Silent overwrite of in-progress work**: Case B forces explicit dialog;
  Case C "Different" requires confirmation before discard.
- **Forgotten Ralph progress**: Case D defaults to PAUSE (preserves checkpoint);
  user must explicitly choose "Continue Ralph" to skip alignment.
- **Lost audit trail**: discard archives full state to history before clearing.
- **Non-interactive ambiguity**: explicit per-case flags required; no silent
  default behavior in JSON / pipe / CI mode.

---

## Open Questions for Stage 3

1. ~~**Output Format Framework**~~ ✅ Resolved 2026-05-03 (Stage 3-A.1).
2. ~~**Auto-suggest "Next:" Pattern**~~ ✅ Resolved 2026-05-03 (Stage 3-A.2).
3. ~~**Global Flags + Precedence**~~ ✅ Resolved 2026-05-03 (Stage 3-A.3).
4. ~~**`agora doctor`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.1).
5. ~~**`agora status`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.2).
6. ~~**`agora seed`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.3).
7. ~~**`agora new`**~~ ✅ Resolved 2026-05-03 (Stage 3-B.4).

8. **Per-command specs (remaining)** (Stage 3-B.5 through 3-B.7) — open
   - In order: resume → ralph → agora
