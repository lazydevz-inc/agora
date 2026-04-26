# ADR-0005 — Claude Integration via `claude --print` Subprocess (Not Agent SDK)

> **Status**: Accepted (supersedes the T2 recommendation in `docs/stage-1/notes.md`)
> **Date**: 2026-04-27
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

In our Stage-1 alignment interview we initially recommended the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) as Agora's primary path for invoking Claude (T2 in the Q5 interview round).

A claude-code-guide consultation surfaced a hard constraint we missed: the Claude Agent SDK **cannot** use Claude Max subscription auth. It requires `ANTHROPIC_API_KEY` and bills per call.

> *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."*
> — Claude Agent SDK official docs

For Sang specifically — and for the broader audience of senior developers already paying for Claude Max — using the SDK means **paying twice** (Max plus API). That violates Agora's augmentation thesis (we should compound with the user's existing AI investment, not duplicate it).

The Claude Code CLI itself **does** use Max subscription auth, and exposes a non-interactive programmatic mode:

```bash
claude --print --output-format json "prompt"
```

This is the official, structured, supported way to invoke Claude programmatically while reusing the user's existing Max session.

## Decision

**Agora invokes Claude via `claude --print --output-format json` subprocess as the primary path.** The Claude Agent SDK is the secondary fallback, used only when the user has no Claude Code CLI installed.

### Three I/O Modes for Agora

The subprocess decision drives a three-mode architecture, because Agora is invoked from three contexts that have different stdin/stdout semantics:

| Mode | Trigger | I/O | LLM access |
|------|---------|-----|------------|
| **1. Interactive TUI** | Human user runs `agora` in terminal | `@clack/prompts` for input, rich output | `claude --print` subprocess (Max) |
| **2. JSON / Scripted** | Bash from Claude Code, CI, other agents call `agora --json` subcommands | stdin/stdout JSON; non-interactive | `claude --print` subprocess (Max) — only when LLM judgment required; structural ops are deterministic |
| **3. MCP Server** | Claude Code calls Agora as an MCP tool | MCP protocol | **None** — host session (Claude Code) is already an LLM context. Agora returns structured data; host renders & responds. |

### Auto-detection logic on startup

```
On agora start:
  1. Check if `claude` CLI exists on PATH
  2. Check if `claude --print "ping"` succeeds (auth valid)
  3. If yes → primary path (subprocess, Max plan)
  4. If no but ANTHROPIC_API_KEY env var set → fallback (SDK, billed)
       → display warning: "Using API billing (no Claude Code installed)"
  5. If neither → error with install instructions
```

## Consequences

### Positive

- **Sang (and any Max user) pays once.** Agora compounds with the existing subscription, fully consistent with the augmentation thesis.
- **No fragile parsing.** `claude --print --output-format json` returns documented structured output.
- **Three-mode separation prevents nested LLM waste.** Mode 3 (MCP) reuses the host's LLM session entirely.
- **No vendor lock to API billing.** Even non-Max users can run if they have an API key.
- **Recursion-safe.** Agora calls Claude → Claude does *not* re-invoke Agora unless explicitly instructed.

### Negative / Trade-offs

- **Subprocess has latency.** ~200-500ms overhead per call vs. SDK's direct API. Acceptable for alignment-loop turn rate (human-in-the-loop, not throughput-critical).
- **Conversation state is per-call.** `claude --print` does not maintain session state. Agora must reconstruct full context each call OR use Claude Code's `--continue` / `--resume` flags. (Stage 4 detail.)
- **Three I/O modes = three test surfaces.** More to maintain than a single SDK path. But each mode is simple individually.

### Neutral

- Both subprocess and SDK paths are first-party Anthropic interfaces. No third-party shim.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Claude Agent SDK as primary (original Q5 recommendation) | Forces API billing; fails augmentation thesis for Max users |
| Subprocess only, no SDK fallback | Excludes users who only have API key (e.g., enterprise without Claude Code) |
| MCP server only | Only works inside Claude Code; useless for standalone TUI users |
| Bedrock / Vertex routing | Adds cloud-vendor dependency; user data leaves machine in some setups |
| Build a custom proxy that intercepts Max auth | Anthropic terms prohibit it (cited in docs) |

## Implementation Notes (for Stage 4)

When implementing in Stage 4:

1. Wrap `claude --print` calls in a `ClaudeRunner` interface with two implementations: `ClaudeCliRunner` and `ClaudeSdkRunner`.
2. The selection happens once at startup; the rest of the codebase uses `ClaudeRunner` polymorphically.
3. JSON-output parsing must validate against documented schema; missing keys = retry, not crash.
4. Implement Mode 3 (MCP server) only after Modes 1 and 2 are stable.

## References

- ADR-0001 (Language and Runtime) — TS/Node decision
- ADR-0002 (Project Location) — npm package scope
- claude-code-guide consultation (2026-04-27) — primary source of the SDK auth finding
- `docs/stage-1/notes.md` — Stage 1 interview synthesis (T section to be updated)
- Official Claude Agent SDK docs: https://code.claude.com/docs/en/agent-sdk/overview
- Claude Code CLI `--print` mode docs (Anthropic)
