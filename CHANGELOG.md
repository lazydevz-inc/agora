# Changelog

All notable changes to Agora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/) once it leaves alpha.

## [Unreleased]

## [0.0.1-alpha.2] — 2026-06-10

Host-relay UX release. Dogfooding the published plugin showed the host
session converting Agora's open examination questions (Socratic probes,
Plato Noesis tests) into "(Recommended)" multiple choice with fully
pre-authored answers — then grading its own assembly, so the maturity
reloop could structurally never fire. Drafted answer options are
deliberately kept (they are good UX); the framing is now contractual.

### Added
- `StepQuestion.open_question` relay flag, set on all 16 open examination
  questions (telos / form / material / efficient / Socratic elenchus /
  Plato maturity / acceptance criteria). Closed decisions (handoff
  confirm, Ralph Z2 confirm) intentionally stay unflagged.
- `agora_align_step` description now carries the relay contract for
  flagged questions: present drafted options as suggestions, state that
  the question is open, invite the user's own thoughts beyond the
  options, and submit only what the user actually selected or wrote.

### Fixed
- Stale "Slice A/D scope" notes in both stepped-tool descriptions
  replaced with their actual coverage (full alignment loop; Gates 1–5
  plus Z1/Z2 escalation).

## [0.0.1-alpha.1] — 2026-06-10

Hardening release from three full self-QA dogfood passes — the MCP
host-reasoning loop driven end-to-end on real projects (greenfield CLI,
brownfield re-run, and a web app that exercised the first live Playwright
Gate 2 run). 518 tests, was 473.

### Fixed
- **Z2 re-alignment deadlock**: accepting Z2 invalidates the maturity tags +
  seed lock (Ralph resumes the same leaf after re-confirm); the alignment
  loop reconciles `in_alignment` → `ready_for_ralph` when every artifact
  already exists instead of replying "done" forever.
- **Gate 5 diff integrity**: `.agora/**` and lockfiles excluded from the
  judged diff, untracked files included, single-root-commit fallback via
  `git show`, "not a repo" classified as `no_git` — previously the gate
  could end up judging Agora's own audit-log churn.
- **Session detection**: a session is `.agora/state.json`, not the bare
  `.agora/` directory — `agora doctor` before `agora new` no longer refuses
  with "existing session detected".
- **Disputatio**: objection ids namespaced per critic (closes an
  F-Aquinas-4 hole where one ruling satisfied several colliding ids);
  zero-objection rounds skip the vacuous Sed contra.
- Socrates aporia markers broadened (en+ko) so refinements like "Good
  catch — I hadn't pinned this down" stop being classified "confirmed"
  (which silently dropped the refinement).
- Declined handoff retries reuse the preserved `ac_tree.json` (straight to
  confirm) instead of re-running the whole Dihairesis.
- Gate failure envelopes carry `failed_detail` (exit codes + output tails);
  gate events record `from_cache` / `skipped` / `detected_config` /
  durations; `ralph.initialized` warns when no git repo is present.
- `resume` at `ralph_complete` (JSON/MCP) points at the real
  non-interactive flags instead of a TTY dead end; material round no longer
  asks to "accept" an empty detected stack; unified CLI exit codes on the
  error catalog; unknown commands error instead of printing the version.

### Added
- **Gate-1 tree-fingerprint cache**: deterministic gate results memoized
  per working-tree fingerprint (pass-only, 10-min TTL) — a multi-leaf Ralph
  session runs typecheck/lint/test/build once per tree state, not once per
  leaf.
- Critic selection receives real signals (changed files from the Gate-5
  diff + the seed's tech stack), activating `file_pattern` / `tech_stack`
  triggers.
- MCP envelopes decorate `next[]` with `mcp_tool` hints; `agora_intake` MCP
  tool so the host-reasoning loop bootstraps without the interactive CLI;
  doctor accepts `include_disabled` / `refresh` over MCP.

### Carried over (first npm release to include the items below)

### Added
- Claude Code **plugin distribution**: `.claude-plugin/plugin.json` +
  `marketplace.json` so the tools install via
  `/plugin marketplace add lazydevz-inc/agora` → `/plugin install agora`.
- `agora_new` **MCP tool** — start a session from inside Claude Code; the plugin
  no longer needs the `agora` CLI for setup (the whole flow is now in-session).
- Project-scoped `.mcp.json` for contributors dogfooding Agora on Agora.
- Open-source meta: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue/PR templates, and a CI workflow gating every PR on `pnpm verify`.
- [ADR-0011](docs/architecture/decisions/0011-public-release-and-license-confirmation.md):
  public-release decision + MIT license confirmation + audit gate.

## [0.0.1-alpha.0] — Stage 6 (implementation in progress)

First runnable alpha. The two-loop architecture works end-to-end through both
the CLI and the in-Claude-Code MCP plugin.

### Added
- **Alignment Loop**: Husserl (`bracket`) → Aristotle four causes
  (`telos`/`form`/`material`/`efficient`) → Socrates (`socrates`, Elenchus) →
  Plato (`maturity` Divided Line + Dihairesis) → acceptance-criteria capture
  (`ac`) → Seed lock (`handoff` → `.agora/seed.json`).
- **Ralph Loop**: leaf selection + Gate 1 (deterministic: typecheck/lint/test/
  build) + Gate 2 (functional QA via your project's Playwright) + Gate 3/4
  (Aquinas Disputatio, per-objection ruling) + Gate 5 (alignment drift score)
  with Z1/Z2 escalation.
- **MCP plugin mode** (primary, ADR-0009/0010): 7 tools — `agora_status`,
  `agora_doctor`, `agora_resume`, `agora_new`, `agora_trace`, and the stepped
  `agora_align_step` / `agora_ralph_step` that drive the whole flow with the host
  Claude Code session supplying all reasoning (Agora makes zero LLM calls).
- Audit log + `agora trace` viewer (`--follow` tail mode), status dashboard with
  drift trend + sparkline, non-interactive/agent-driven JSON mode, en/ko locales.
- Gate 0 pre-flight infrastructure probes (`agora doctor`).

### Notes
- This is **alpha**. Some philosopher/gate prompts are still inline pending the
  prompt-library refactor. Not yet published to npm.

[Unreleased]: https://github.com/lazydevz-inc/agora/compare/v0.5.0-stage-5...HEAD
[0.0.1-alpha.0]: https://github.com/lazydevz-inc/agora/releases/tag/v0.5.0-stage-5
