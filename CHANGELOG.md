# Changelog

All notable changes to Agora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/) once it leaves alpha.

## [Unreleased]

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
