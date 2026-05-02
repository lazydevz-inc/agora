# Stage 3 — CLOSED

> **Status**: Closed
> **Closed on**: 2026-05-03
> **Closed by**: Sang Rhee (explicit approval)
> **Tagged as**: `v0.3.0-stage-3`

---

## What Stage 3 was

Per ADR-0004, Stage 3 was the **CLI Surface Detail** stage. Its goal:
define the complete CLI specification — every command, every flag, every
screen mockup, every output format — detailed enough that Stage 6+
implementation can ship the CLI without re-arguing UX.

Stage 3 split into two sub-stages:
- **Stage 3-A** (cross-cutting framework, 3 sub-questions): output format,
  auto-suggest pattern, global flags + precedence
- **Stage 3-B** (per-command specs, 7 sub-questions): one for each of the
  ≤7 subcommand cap from ADR-0001 + Stage 1

---

## Deliverables (all accepted)

### Stage 3-A — Cross-cutting framework (3 sub-questions, 2026-05-03)

| # | Sub-question | Result |
|---|--------------|--------|
| 3-A.1 | Output Format Framework | 6-color palette + 11-icon set, universal JSON schema, 7-tier exit codes, TTY auto-detect with env override, en+ko locales with F1 enforcement |
| 3-A.2 | Auto-suggest "Next:" Pattern | 3-source weighted ranking (phase 0.6 / failure 0.3 / inspection 0.1), MAX_NEXT_COUNT=3, show on failure too, empty handling |
| 3-A.3 | Global Flags + Precedence | 8 universal flags, CLI > env > project config > global config > default, parse-time fail-fast forbidden combinations, power-user options visible-but-distinct |

Path: `docs/cli/spec.md` sections "Output Format Framework", "Auto-suggest Next: Pattern", "Global Flags + Precedence"

### Stage 3-B — Per-command specs (7 sub-questions, 2026-05-03)

| # | Sub-question | Result |
|---|--------------|--------|
| 3-B.1 | `agora doctor` | Full health view by default, exit 1 on probe-fail or stale-bypass≥3, --include-disabled doesn't affect exit, tree section conditional on phase |
| 3-B.2 | `agora status` | Phase-aware default + --leaf drill-down + --history (5 default), leaf-list status markers, ASCII numeric sparkline, exit 0 always (informational) |
| 3-B.3 | `agora seed` | View default + 3 mutually-exclusive modes (--edit / --override-gate5 / --regen-tests), automatic cascade-reset on edit, mandatory reason for override, manual-edit dialog on regen |
| 3-B.4 | `agora new` | 4-case state branching (per Stage 2-A.9) + Case E for in_handoff, name optional (default cwd folder), --workspace-root for monorepo, archive-then-delete on discard |
| 3-B.5 | `agora resume` | Phase dispatch table (8 phases), confirmation prompt for actionable phases, ralph_complete persistent dialog, exit 20 on corrupt state |
| 3-B.6 | `agora ralph` | Per-gate line + marker layout, Ctrl+C graceful pause (exit 4), reset flags applied first, shell-native background (& or nohup), NDJSON streaming in non-interactive |
| 3-B.7 | `agora` (default) | State-aware dispatch with snapshot + auto-executable next action, single-keypress UX, JSON mode snapshot-only (no auto-execute), 3-option first-time dialog |

Path: `docs/cli/spec.md` sections per command

---

## What was decided in Stage 3

Beyond what's in the SPEC document, several cross-cutting positions consolidated:

1. **CLI is biased and minimal**: 7-command cap (ADR-0001) confirmed in operation; no command-creep during Stage 3.

2. **Universal output contract**: every command shares the same JSON envelope, color palette, icon set, exit code semantics. Per-command differences live in `data` payload only.

3. **JSON mode is first-class**: every command has a complete JSON output; auto-detected on non-TTY; AI agents are first-class citizens of the CLI consumer audience.

4. **Per-command flags consolidate prior SPECs**: every flag from Stage 2-A/B/C is reachable through the right command. No new flags added beyond what prior SPECs demanded.

5. **State.phase is the dispatch key**: `agora` (default), `agora resume`, `agora new` Case detection, `agora status` default rendering — all branch on the same 8-value phase enum.

6. **Failure modes from prior stages are guarded at CLI level**: F1 (locale), F2 (purpose visible), F-Aquinas-4 (silent overruling) explicitly enforced in each command spec.

7. **Mockups are implementation contracts**: every TUI mockup is the literal target output. Stage 6 implementation must match.

8. **Non-interactive equivalents for every dialog**: per-case flags (e.g. `--case-b-action=resume`, `--auto-progress=yes`, `--ralph-complete-action=re_align`) provide non-TTY paths.

9. **Sang's daily use covered**: `agora<Enter>` is the canonical sequence (Stage 3-B.7).

10. **No global state-mutating actions silently default**: every potentially-destructive action (discard, override, bypass, skip) requires explicit user input or flag.

---

## Deliberately deferred

These items Stage 3 chose **not** to settle. Routed to Stage 4 / 5 / 6.

| Item | Stage |
|------|-------|
| CLI library binding (commander vs citty vs custom) | Stage 6 |
| Help text generator implementation | Stage 6 |
| Locale catalog content (actual messages in en/ko) | Stage 6 |
| Tab completion shell scripts (bash/zsh/fish) | Stage 6 |
| Install / distribution mechanics | Stage 4 |
| MCP server design | Stage 4 |
| Module / file-tree implementation organization | Stage 5 |
| Per-philosopher prompt library | Stage 5 |

---

## Verification of close

Per ADR-0004 stage-gate criteria:
1. All named deliverables exist and committed ✅
2. Sang has read and approved them ✅ (explicit approvals throughout 3-A and 3-B rounds)
3. No ADR is left in Proposed state from this stage ✅ (no new ADRs in Stage 3)

All three conditions met.

---

## Next stage

**Stage 4 — Infra + LLM Integration + Install** opens here.

Per Stage 1 / ADR-0004 plan:
- Install mechanics (curl|bash, npm/pnpm/bunx, --version detection)
- LLM integration (claude --print subprocess primary, SDK fallback per ADR-0005)
- MCP server design (when running inside Claude Code)
- Probe registry implementation (Stage 2-B.1's 19 v1 probes)
- Initial config loading (per-project + global per ADR-0002)

Estimated 4-6 sub-questions.

---

*This document is immutable. Stage 3 is over.*
