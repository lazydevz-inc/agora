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

### Stage 3-B.1 — DONE (2026-05-03)

`agora doctor` SPEC accepted. Four decisions:

- **R1-A**: Default scope = full health view (Universal + Project + Unbundled + Tree quality + Bypasses + Stale). Single command, complete diagnostic.
- **R2-A**: Exit code 1 when probes_failed ≥ 1 OR stale_bypasses ≥ 3; otherwise 0. Doctor judges "environment ready or not."
- **R3-A**: --include-disabled runs disabled probes + displays results, but failures don't affect exit code (user explicitly opted out of caring).
- **R4-A**: Tree quality section omitted entirely when no .agora/ac_tree.json exists; JSON sets data.tree_quality = null (schema stable).

Specified:
- CLI signature with universal + 2 command-specific flags (--refresh, --include-disabled)
- Three TUI mockups: happy path with concerns, healthy state (compact), empty state (no project)
- Full JSON data payload schema with summary/universal_probes/project_probes/unbundled_detected/tree_quality/bypasses
- Exit code logic
- --include-disabled annotation rule ("(included via --include-disabled)")
- Tree-quality conditional rule (state.phase ≥ ready_for_ralph)
- Cache sharing with Gate 0 + --refresh busts both
- Auto-suggest Next: candidates from Sources 1/2/3 + command-specific (stale bypass reset commands)

Healthy-state mockup compact-formats project probes on one line ("✓ git, gh, vercel, ... (all OK)") — saves vertical space when no concerns.

External Next: candidates use literal string "(external)" as command field with description carrying instruction (e.g. "Set POSTHOG_PROJECT_KEY in .env").

Boundaries enforced (rejections by name):
- Probes-only output (R1-B): defeats full health view value
- Verbose-gated tree (R1-C/R4-C): tree quality is core
- Always-zero exit (R2-B): defeats scripting
- Per-failure exit codes (R2-C): too granular
- Disabled probe failure counted (R3-B): violates opt-out
- --include-disabled as list-only (R3-C): defeats diagnostic
- Tree "(no tree)" placeholder (R4-B): noise

Failure modes guarded:
- Silent probe state → every result surfaces
- Forgotten bypasses → dedicated stale section
- Tree decay → snapshot + --refresh
- CI false-pass → exit 1 on any probe fail
- F2 → recommendation + fix fields per concern

Full SPEC committed to `docs/cli/spec.md` under "`agora doctor` [SPEC]".

### Stage 3-B.2 — DONE (2026-05-03)

`agora status` SPEC accepted. Four decisions:

- **R1-A**: Default = full info on one screen (project + session + maturity + ralph progress + recent gates + aporia + bypasses).
- **R2-A**: Ralph progress as leaf-list with status markers (✓ ◐ ○ ✗). DFS pre-order from Stage 2-C.2.
- **R3-A**: Recent gate signals = ASCII numeric drift_score row + per-gate marker rows. Block chars / pure numbers rejected.
- **R4-A**: --history default 5 sessions. --count=N override.

Phase-aware default output table covering all 8 state.phase values.
Mockups for in_ralph (canonical), --leaf drill-down, --history, in_alignment phase, ralph_complete phase.

Truncation rules: leaves > 10 collapse to first 10 + "(N more)" hint; --verbose shows all.
--quiet reduces to project name + phase + Ralph progress only.

Exit code: 0 always (informational); 1 only on corrupt state. Health judgment is doctor's job, not status'.

JSON shape with default / --leaf / --history schemas specified.

Boundaries (rejections by name):
- Compact default (R1-B): hides too much
- Verbose default (R1-C): overwhelms
- Progress bar (R2-B): granularity lost
- Tree visualization (R2-C): noisy at > 5 leaves
- Block-char sparkline (R3-B): font dependent
- Numbers only (R3-C): loses gate semantics
- History > 5 default (R4-B): scroll burden
- History < 5 default (R4-C): too short for trend
- Status as health gate (doctor's role)
- Status running probes (doctor only)

Failure modes guarded:
- Confusion with doctor → clear scope separation (doctor=env, status=workflow)
- Stale data → fresh read every call
- Missing tree → phase-appropriate sections only
- Truncation surprise → explicit "(N more)" hint

Full SPEC committed to `docs/cli/spec.md` under "`agora status` [SPEC]".

### Stage 3-B.3 — DONE (2026-05-03)

`agora seed` SPEC accepted. Four decisions:

- **R1-A**: Full seed view by default (Telos/Form/Material/Efficient/AC/Maturity/Genesis/Overrides). Section headers always present (empty if no content).
- **R2-A**: Automatic cascade-reset on --edit, following SIBLING_REQUIREMENTS from Stage 2-A.7. One Plato Divided Line level drop. User informed via cascade preview before confirm.
- **R3-A**: --override-gate5 reason mandatory + recorded in seed.metadata.gate5_overrides[] + surfaced as trust warning in agora doctor for 7 days.
- **R4-A**: --regen-tests defaults to changed-AC only; --all forces full regen. Manual-edit dialog (Stage 2-B.2 R4-A) always applies.

CLI signature:
  agora seed                              # view (default)
  agora seed --edit <field>               # edit + cascade
  agora seed --override-gate5 <iter> <score>  # manual drift override
  agora seed --regen-tests [--all]        # test regeneration

Mode flags mutually exclusive (parse-time error on combos).

Mockups for view (full), --edit (cascade preview), --override-gate5 (reason capture), --regen-tests (manual-edit dialog).

JSON shapes: view mode (seed structure with maturity + overrides), action modes (operation confirmation with cascade list).

Non-interactive --edit requires --value="..." flag (no editor in non-TTY).

Exit codes: 0 success, 1 parse/exclusion/no-seed, 4 paused-state-after-edit.

Cascade rule explicit:
  NOESIS → DIANOIA, DIANOIA → PISTIS, PISTIS → EIKASIA, EIKASIA → EIKASIA
  Cascaded fields keep value but lose maturity certification
  Mini-alignment loop re-confirms naturally via Round Ordering planner

Boundaries (rejections by name):
  - Compact view (R1-B/C): seed is ground truth artifact
  - No-cascade edit (R2-B): leaves validation inconsistent
  - Per-cascade prompts (R2-C): tedium for common case
  - Optional override reason (R3-B): silent F-Aquinas-4
  - No override at all (R3-C): edge cases lost
  - Always-all regen (R4-B): token waste + manual-edit destruction
  - No --all option (R4-C): clean-slate sometimes correct
  - Mode flag combos (mutual exclusivity)
  - Non-TTY edit without --value
  - Showing seed before alignment_complete

Failure modes guarded:
  - Silent stale-validation edit → cascade-reset
  - Silent gate5 override → reason+record+doctor
  - Manual test edit loss → mandatory dialog
  - Mode confusion → exclusivity
  - F-Aquinas-4 → all potentially-silent actions announced + recorded

Full SPEC committed to `docs/cli/spec.md` under "`agora seed` [SPEC]".

### Stage 3-B.4 — DONE (2026-05-03)

`agora new` SPEC accepted. Three decisions:

- **R1-A**: `name` optional, defaults to cwd folder name. Stored in seed.metadata.project_name. Does NOT create folder or change cwd.
- **R2-A**: `--workspace-root=<path>` per Stage 2-A.2 R3-A. Expands Phase 0 scan to monorepo root. Default strict cwd-only.
- **R3-A**: Case D "Pause Ralph + new alignment" preserves ralph_state checkpoint. User can resume Ralph later or discard via subsequent action.

CLI signature:
  agora new [name] [--workspace-root=<path>] + universal flags

5 case mockups specified (per Stage 2-A.9 4-case + Case E for in_handoff):
  Case A — no .agora/ → fresh start (greenfield + brownfield variants)
  Case B — in_alignment unfinished → 3-option dialog (Resume/Discard/Cancel)
  Case C — locked seed → 3-option intent dialog (Add/Refine/Different)
  Case D — in_ralph → 3-option dialog (Pause+new/Continue/Cancel)
  Case E — in_handoff → 3-option dialog (Resume/Discard/Cancel) — added for completeness

Discard semantics specified:
  - Archive full state to history first (audit preservation)
  - Delete state.json, seed.md, seed.json, ac_tree.json, ralph_state.json, tests/
  - .agora/history/ NEVER deleted
  - .agora/cache/, .agora/logs/ untouched
  - Then run Case A flow

Non-interactive behavior:
  - Every dialog has equivalent --case-{X}-action=<choice> flag
  - Without flag in non-TTY → errors with interactive_required code

JSON shapes for Case A (proceed) and Cases B/C/D/E (dialog required) specified.

Exit codes:
  0 = dispatched and proceeded
  1 = parse error
  3 = user Cancel
  4 = pause-with-transition (Case D pause-and-new)

State transitions:
  Case D Pause+new: in_ralph → in_ralph_paused → in_alignment
  Case C Different + confirm: alignment_complete → null → fresh Case A
  Case B Discard: in_alignment → null → fresh Case A

Boundaries (rejections by name):
  - Required name (R1-B): cwd default is sensible
  - Auto-create folder (R1-C): violates user-folder-control
  - Auto-detect monorepo (R2-B): rejected at Stage 2-A.2
  - Remove --workspace-root (R2-C): legitimate edge case
  - Auto-discard ralph_state in Case D (R3-B): silent loss
  - Extra confirm before pause (R3-C): 3-option already gives choice
  - Silent discard (always confirmed)
  - Deleting .agora/history/ (audit absolute)

Failure modes guarded:
  - Silent overwrite of in-progress work → mandatory dialogs
  - Forgotten Ralph progress → Case D defaults to pause
  - Lost audit trail → discard archives full state first
  - Non-interactive ambiguity → explicit per-case flags required

Full SPEC committed to `docs/cli/spec.md` under "`agora new` [SPEC]".

### Stage 3-B.5 — DONE (2026-05-03)

`agora resume` SPEC accepted. Three decisions:

- **R1-A**: "Actionable" phases (alignment_complete, in_handoff, ready_for_ralph) prompt before transition. Resume = "continue from pause", not "auto-progress to next phase."
- **R2-A**: `ralph_complete` re-shows the same session-end dialog persistently. User must explicitly choose [r] re-align / [a] accept-as-deferred / [v] view-log.
- **R3-A**: Corrupt state.json → exit 20 + agora doctor recommendation. Single SoT means no disambiguation; corruption needs fixing.

CLI signature: agora resume + universal flags only (no command-specific).

Phase dispatch table for all 8 state.phase values per Stage 2-C.3 algorithm.

Mockups:
  - in_alignment resume (most common — header + normal loop UI)
  - no .agora/ (info + Next: agora new)
  - ralph_complete (full session-end dialog re-rendered)
  - corrupt state (error with detail + agora doctor hint)

State transition map: per-phase resume effect on state.phase enumerated.

Non-interactive mode flags for prompts:
  --auto-progress=yes/no for actionable phases
  --ralph-complete-action=re_align/accept_deferred/view_log for ralph_complete

JSON output:
  Default: previous_phase, new_phase, session_id, resumed_at_field
  Corrupt state: errors[] with field + got + expected_one_of + fix

Exit codes:
  0 = resumed successfully
  1 = no .agora/ OR non-interactive without choice flag
  3 = user abort/cancel
  20 = corrupt state.json

Boundaries (rejections by name):
  - Auto-progress through actionable (R1-B): violates resume semantic
  - Always-confirm including in-progress (R1-C): unambiguous intent
  - Bare "already complete" (R2-B): silently abandons skipped leaves
  - Auto-accept-as-deferred (R2-C): silent F-Aquinas-4
  - Multi-session selector (R3-B): single SoT
  - Auto-pick most-recent (R3-C): silent guess on corruption

Failure modes guarded:
  - Silent phase-jumping → R1-A confirmation prompts
  - Skipped leaves abandoned → R2-A persistent dialog
  - Acting on corrupt state → R3-A errors out
  - Lost user input → reads last_answered_field
  - F-Aquinas-4 → every state-mutating action requires user input

Full SPEC committed to `docs/cli/spec.md` under "`agora resume` [SPEC]".

### Stage 3-B.6 — DONE (2026-05-03)

`agora ralph` SPEC accepted. Four decisions:

- **R1-A**: Per-gate line + marker + brief detail. Compact (R1-B) loses diagnostic value; multi-paragraph (R1-C) floods screen.
- **R2-A**: Ctrl+C → graceful pause (finish in-flight LLM call, atomic checkpoint, exit 4). Double Ctrl+C within 2s → hard abort. Immediate abort (R2-B) silent loss; confirm dialog (R2-C) signals shouldn't prompt.
- **R3-A**: Reset flags applied first, then stale bypass dialog SUPPRESSED for this session. Ignore-reset (R3-B) and announce-then-still-prompt (R3-C) both redundant/confusing.
- **R4-A**: Shell-native background (& or nohup). Non-TTY auto-detects to JSON. Pending dialogs stored in state.json + exit 4. Daemon flag (R4-B) duplicates shell; foreground-only (R4-C) loses legitimate use case.

CLI signature consolidated:
  agora ralph [parallel + skip-gate-* + reset-* flags from prior SPECs] + universal

Pre-flight + iteration loop algorithm specified.

Per-iteration TUI display layout:
  [Iteration N — leaf_id (label)]
  Working... (Ns)
  [Gate N: name]   marker   brief detail
                                ↳ sub-detail (indented arrow)
  ✓ Iteration N complete OR Z1/Z2 escalation triggered

Mockups:
  - Ralph start + first iteration (happy path)
  - Z2 escalation (3 consecutive Gate 5 fails) per Stage 2-A.10
  - Session-end (all completed, no skipped)

Background execution:
  - agora ralph & → backgrounded by shell
  - Non-TTY auto-detects JSON mode (3-A.1 R4-A)
  - NDJSON stream output (one line per gate event)
  - Pending dialogs serialize to state.json
  - User resumes via agora ralph or agora resume

NDJSON streaming format for non-interactive mode specified.

Cache interaction: shared with agora doctor; --refresh only on doctor (separation of concerns).

Exit codes:
  0 = session completed
  1 = parse error / phase precondition
  2 = Gate 0 failed at start
  3 = user hard-abort (double Ctrl+C)
  4 = graceful pause (single Ctrl+C; pending dialog in non-interactive)

Boundaries (rejections by name):
  - Compact / multi-paragraph display
  - Immediate abort / confirm dialog on Ctrl+C
  - Stale dialog after reset (redundant)
  - --daemon flag (shell platform)
  - Foreground-only (kills "while I sleep" use case)
  - Implicit Gate 0 skip
  - Resuming from corrupt state
  - Bypassing Gate 1 / Gate 5 (parse-time forbidden)

Failure modes guarded:
  - Silent gate skip → parse-time + reason requirement
  - Lost progress on Ctrl+C → graceful pause + atomic checkpoint
  - Stale bypass surprise → session-start dialog
  - Background dialog deadlock → pending_dialog in state.json
  - Streaming buffering → NDJSON line-flushed
  - F-Aquinas-4 → every bypass/override/reset announced + recorded

Full SPEC committed to `docs/cli/spec.md` under "`agora ralph` [SPEC]".

Next task: Stage 3-B.7 — `agora` (default, context-aware) — LAST per-command spec.
After 3-B.7, Stage 3 closes.
