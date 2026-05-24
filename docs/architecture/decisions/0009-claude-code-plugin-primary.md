# ADR-0009 — Claude Code Plugin (MCP) as the Primary Mode

> **Status**: Accepted (supersedes the primary/fallback *ordering* of ADR-0005; the 3-mode architecture itself stands)
> **Date**: 2026-05-24
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

ADR-0005 chose `claude --print --output-format json` subprocess as Agora's **primary** path (Mode 1/2), with the Claude Agent SDK as fallback and an in-Claude-Code **MCP server (Mode 3)** as a third, LLM-free mode. At the time, the subprocess path reused the user's Claude Max subscription at no extra cost — the whole point of ADR-0005.

That economic assumption no longer holds. Anthropic announced a billing change (web-verified 2026-05-24):

- **2026-04-04**: Pro/Max OAuth tokens blocked from third-party agentic tools and the Agent SDK; API-key auth required (later partially reinstated, "with a catch").
- **2026-06-15**: Agent SDK **and `claude -p` (= `claude --print`)** usage on subscription plans moves into a **separate metered credit pool — $20–$200/mo depending on plan, billed at API rates, non-rollover.** The general interactive subscription pool is reserved for *interactive* use of Claude Code, Claude Cowork, and Claude.ai.

**Implication for Agora:** the subprocess path ADR-0005 made primary is exactly the path being moved to the capped metered pool. The Ralph loop issues ~7 LLM calls per iteration; a real session would exhaust a $200/mo pool quickly. As of mid-June 2026, "subprocess primary" is a cost bomb and contradicts ADR-0005's own augmentation thesis ("pay once").

There is already an escape hatch in our own design: **Mode 3 (MCP server inside Claude Code) makes zero LLM calls** — the host Claude Code session, running in the user's *interactive* pool, does all reasoning. It was specified in ADR-0005 but ranked last.

## Decision

**Agora's primary mode becomes the in-Claude-Code plugin (Mode 3, MCP).** Agora itself makes **zero LLM calls**; the host Claude Code session performs all reasoning. Agora contributes structure (the philosophers' method), lifecycle orchestration (alignment → locked Seed → Ralph), and verification gates.

### Positioning: Agora is the Spring of Claude Code

```
Java / JVM   — the runtime that executes code        ≈  Claude Code (writes & runs code)
Spring       — framework: structure, lifecycle, DI    ≈  Agora (method + gates + loop orchestration)
```

Spring does not write your business logic; it wires, sequences, and governs the code *you* write. Likewise, **Claude Code writes the code; Agora directs the flow and scores it through gates.** This also resolves the prior "framing gap" — Agora is not the coder, it is the framework around the coder.

### Mode priority (revised from ADR-0005)

| Priority | Mode | LLM access | Billing |
|----------|------|------------|---------|
| **1 (primary)** | **MCP plugin inside Claude Code** | Host session reasons; Agora calls nothing | Interactive subscription pool (no extra charge) |
| 2 (legacy / standalone) | `claude --print` subprocess (Mode 1/2) | Agora shells out to `claude -p` | **Metered Agent-SDK credit pool** ($20–$200/mo from 2026-06-15) — surface a cost warning |
| 3 (deprecated) | Agent SDK + `ANTHROPIC_API_KEY` | Direct API | API billing |

Standalone CLI use (Mode 1/2) remains supported for users outside Claude Code, but is no longer the default and must warn that it draws the metered pool.

## Consequences

### Positive

- **No extra billing for the primary path.** Reasoning runs in the user's interactive Claude Code session — the augmentation thesis of ADR-0005 is preserved by *moving* where the LLM call happens, not by the (now-metered) subprocess.
- **Framing gap resolved in architecture, not just wording.** "Agora directs implementation; Claude Code implements" is literally true under the plugin model.
- **Cleaner mental model.** "Agora = the framework you run inside Claude Code" (Spring) is more legible than "a CLI that shells out to `claude`."
- **Anti-fragile.** As Claude Code gains tools/models, the plugin inherits them for free.

### Negative / Trade-offs

- **The MCP layer is not built yet** (`src/mcp/` does not exist). This ADR commits us to building it; until then, Agora runs in the now-disfavored subprocess mode.
- **Standalone (no Claude Code) users lose the no-billing guarantee** after 2026-06-15. Acceptable: the target audience runs inside Claude Code.
- **Two reasoning paths to reconcile.** The existing `ClaudeRunner` subprocess code (Stage 4-A.2) stays for Mode 2 but is demoted; gate/orchestration logic must work whether reasoning is in-host (Mode 3) or shelled-out (Mode 2).

### Neutral

- ADR-0005's three-mode *architecture* is unchanged and vindicated — only the *priority ordering* flips. The auto-detection logic inverts: prefer in-Claude-Code context when present.

## What this supersedes

- ADR-0005 "**Decision**" clause ("subprocess as the primary path … SDK is the secondary fallback") — re-ranked as above.
- ADR-0005 startup auto-detection order — now: if running as an MCP tool inside Claude Code → Mode 3; else Mode 2 (with cost warning); else Mode 3-SDK.
- The Agent-SDK fallback in ADR-0005 is effectively retired for cost reasons (kept only as a last resort, not advertised).

ADR-0005 is **not** marked Superseded wholesale — its 3-mode model and `ClaudeRunner` interface remain load-bearing. This ADR amends the priority and rationale.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep subprocess primary, eat the metered pool | $200/mo cap vs ~7 calls/Ralph-iteration = exhausted fast; breaks augmentation thesis |
| Move to API billing as primary | Double-pay for Max users; the exact thing ADR-0005 rejected |
| Drop standalone CLI entirely, MCP-only | Excludes non-Claude-Code users; keep Mode 2 as a warned fallback |
| Wait and see if Anthropic reverses | Billing change is dated (2026-06-15); cannot bet the architecture on a reversal |

## Implementation notes

1. Build `src/mcp/` — an MCP server exposing Agora's alignment + Ralph orchestration as tools. The host session supplies reasoning; tools return structured data + gate verdicts.
2. The reasoning boundary: where Mode 2 calls `ClaudeRunner.call()`, Mode 3 instead returns a structured "the host should reason about X and call back with the result" contract. Factor the philosopher/gate logic so the reasoning step is injectable.
3. Auto-detect MCP context (running as a tool) → select Mode 3; otherwise Mode 2 with a one-line cost warning referencing this ADR.
4. Update README + CLAUDE.md to lead with the plugin/Spring framing (done for README 2026-05-24).

## References

- ADR-0005 (Claude Integration via Subprocess) — the decision this re-ranks
- ADR-0003 (Meta Dogfooding), ADR-0008 (Ralph architecture)
- Web sources (2026-05-24): Anthropic Agent-SDK dual-bucket billing (June 15 2026) — VentureBeat, Tygart Media, Claude Help Center, The Register
- `MEMORY/project_claude_code_plugin_pivot.md` — session context behind this decision
