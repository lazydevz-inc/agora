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

Next task: Stage 3-A.2 — Auto-suggest "Next:" Pattern (when it appears, how candidates ranked, max count, JSON↔TUI contract).
