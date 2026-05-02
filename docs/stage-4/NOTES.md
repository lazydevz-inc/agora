# Stage 4 — Infra + LLM Integration + Install

> **Status**: Active (opened 2026-05-03 after Stage 3 close)
> **Goal**: Specify the infrastructure layer — install mechanics, Claude
> integration runtime, MCP server design, probe registry implementation,
> config loading, error handling. Bridges from Stage 2/3 specifications
> down to Stage 6 implementation patterns.
> **Done when**: `docs/infra/install.md`, `docs/infra/llm-integration.md`,
> and `docs/infra/mcp-server.md` are marked Accepted. Probe registry +
> config loading patterns are specified.

---

## Stage 4 sub-questions (estimated 6)

```
4-A.1  Install mechanics                ← curl|bash, npx, pnpm dlx, npm install -g
4-A.2  Claude integration runtime       ← subprocess wrapper, retry, error handling
4-A.3  Config loading                   ← per-project + global per ADR-0002
4-A.4  Probe registry implementation    ← Stage 2-B.1's 19 v1 probes pattern
4-A.5  MCP server design                ← when running inside Claude Code
4-A.6  Error handling + telemetry       ← cross-cutting per 3-A.1 exit codes
```

Order rationale:
- 4-A.1 is the first user touchpoint (install)
- 4-A.2 is the engine for everything Agora does
- 4-A.3 is shared infra used by all (config affects every command)
- 4-A.4 makes Stage 2-B.1's abstract probe interface concrete
- 4-A.5 is parallel feature (separate I/O mode per ADR-0005)
- 4-A.6 is cross-cutting; resolves once others are specified

---

## What this stage settles vs defers

**Settled in Stage 4**:
- Install distribution channels and detection logic
- Claude subprocess wrapper API + retry/timeout policy
- MCP server registration + tool schema
- Probe interface concrete shape + 19 v1 probe stubs
- Config file loading order + merge rules
- Error normalization and telemetry data points

**Deferred to Stage 5 / 6**:
- Module-level file organization (Stage 5)
- Per-philosopher prompt library (Stage 5)
- Actual library bindings (Stage 6: e.g. which subprocess library, which TOML parser)
- Locale catalog content (Stage 6)
- Test suite architecture (Stage 6)

---

## Working principle for Stage 4

Stage 4 is **less algorithmic, more infrastructure**. SPECs here lean toward
"what's the contract, what's the file, what's the dependency" rather than
"what's the user-facing UX." Mostly Mode B (single recommendation + 1-2
alternatives) for technical decisions Sang has delegated.

Some decisions will involve ADR-grade structural choices (e.g. install via
`@lazydevz/agora` npm package vs single-binary distribution). Those will
spawn ADRs as needed (likely 1-2 new ones in Stage 4).

---

## Stage 4 will produce

- `docs/infra/install.md` — Install mechanics SPEC
- `docs/infra/llm-integration.md` — Claude runtime SPEC + MCP server design
- `docs/infra/probes.md` — Probe registry implementation patterns
- `docs/infra/config.md` — Config loading SPEC
- Possibly 1-3 new ADRs

Stage 4 close requires same gate as prior stages: deliverables Accepted, Sang explicit approval, no Proposed ADRs.

---

## Stage 4-A.1 — first task

The first task is **install mechanics** because it's the user's first
touchpoint with Agora. Until install is decided, all other infra decisions
operate in a vacuum (e.g. probe paths assume a known package layout that
install determines).

After 4-A.1: 4-A.2 (Claude runtime) → 4-A.3 (config) → 4-A.4 (probes) →
4-A.5 (MCP) → 4-A.6 (error/telemetry) → Stage 4 close.
