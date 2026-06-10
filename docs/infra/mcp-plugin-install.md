# Install Agora as a Claude Code MCP plugin

> Audience: users who want to run Agora **inside** Claude Code so the host
> session supplies reasoning and Agora makes zero LLM calls. This is the primary
> mode per ADR-0009 / ADR-0010.

## Prerequisites

- Claude Code authenticated with a Claude subscription
- Node 22+ if installing through npm / `claude mcp add`
- A project folder where you want a project-local `.agora/` session

## Option A — Claude Code plugin

Inside Claude Code:

```text
/plugin marketplace add lazydevz-inc/agora
/plugin install agora
```

The plugin registers Agora's MCP server through `npx -y @lazydevz/agora mcp`, so
you do not need a global `agora` binary for the in-Claude-Code flow.

## Option B — npm global install

```bash
npm install -g @lazydevz/agora
claude mcp add --scope user agora -- agora mcp
```

`--scope user` makes the tools available in every Claude Code project. A global
install also gives you the standalone `agora` CLI.

## Tools exposed

After opening a fresh Claude Code session, these eight tools should be visible:

| Tool | Kind | Purpose |
|------|------|---------|
| `agora_status` | read-only | Session phase, next action, Ralph drift trend |
| `agora_doctor` | read-only | Gate 0 pre-flight probes |
| `agora_resume` | read-only | Next concrete step from current state |
| `agora_trace` | read-only | Query `.agora/events.jsonl` |
| `agora_new` | mutating, LLM-free | Start a project-local Agora session |
| `agora_intake` | mutating, LLM-free | Capture the user's raw intent/context |
| `agora_align_step` | stepped | Drive alignment through Seed lock |
| `agora_ralph_step` | stepped | Drive Ralph Gates 1-5 + Z1/Z2 |

The stepped tools return a `StepEnvelope`:

- `advanced` — deterministic work completed; call the tool again
- `needs_user_input` — ask the user the listed questions, then call again with `user_answers`
- `needs_reasoning` — reason in the host Claude Code session, then call again with `llm_responses`
- `done` — the loop is complete for the current phase
- `error` — recoverable state/input error; correct and retry

## Start a session

In your project, ask Claude Code:

```text
Call agora_new with name settings-page.
Use agora_intake with this intent: I want a per-user settings page...
Use agora_align_step until the Seed is locked.
Then use agora_ralph_step to build it.
```

The same flow is available from the terminal if you installed the CLI:

```bash
agora new settings-page
agora resume
```

## Troubleshooting

**Tools do not appear**
- Restart the Claude Code session after installing the plugin or adding the MCP server.
- For npm installs, confirm `agora --version` works and re-run:
  `claude mcp add --scope user agora -- agora mcp`.

**`No Agora session in this directory`**
- Start one with `agora_new` or `agora new <name>` in the target project folder.

**A step is stuck / wrong owner error**
- Inspect `.agora/mcp_pending.json`.
- Delete `.agora/mcp_pending.json` to abort the in-flight stepped call; the next
  tool call will reconsider from on-disk state.

**Cost warning still appears**
- That warning is from standalone subprocess mode. Inside the MCP plugin path it
  should not appear. If you also use standalone CLI mode and want to silence it,
  set `AGORA_NO_COST_WARNING=1`.

## Why this path

ADR-0009 explains the billing pivot: subprocess / Agent-SDK style calls can draw
from Anthropic's metered credit pool. In MCP mode, Agora provides structure and
gates while Claude Code's host session supplies the reasoning, so there is no
extra Agora-side LLM billing path.
