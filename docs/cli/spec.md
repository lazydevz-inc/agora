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
| Global Flags + Precedence (3-A.3) | [OPEN] |
| `agora doctor` (3-B.1) | [OPEN] |
| `agora status` (3-B.2) | [OPEN] |
| `agora seed` (3-B.3) | [OPEN] |
| `agora new` (3-B.4) | [OPEN] |
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

## Open Questions for Stage 3

1. ~~**Output Format Framework**~~ ✅ Resolved 2026-05-03 (Stage 3-A.1).

2. ~~**Auto-suggest "Next:" Pattern**~~ ✅ Resolved 2026-05-03 (Stage 3-A.2).

3. **Global Flags + Precedence** (Stage 3-A.3) — open
   - Inventory of universal flags (`--help`, `--json`, `--version`, `--locale`, ...)
   - Flag precedence when multiple sources (CLI > env > config > default)
   - Forbidden flag combinations + error messages

4. **Per-command specs** (Stage 3-B.1 through 3-B.7) — open
   - In order: doctor → status → seed → new → resume → ralph → agora
