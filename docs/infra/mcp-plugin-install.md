# Install Agora as a Claude Code MCP plugin

> Audience: users who want to run Agora **inside** Claude Code so the host
> session supplies reasoning and Agora makes zero LLM calls. This is the primary
> mode per ADR-0009 / ADR-0010.

The [shared agent guide](../agent-guide.md) defines task execution and the relay
contract for Codex, Claude Code and other coding agents. The installation and
end-to-end walkthrough here cover the shipped Claude Code path. Agora's stdio
transport does not by itself establish verified support for another host, and
Agora has no OpenAI API runner.

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

The stepped tools return a JSON-encoded `StepEnvelope` in MCP `content[].text`:

- `advanced` — read the message and perform any requested leaf implementation before calling again
- `needs_user_input` — show the listed questions with their `philosopher` and `purpose_label` when present, then call again with the user's actual `user_answers`
- `needs_reasoning` — reason in the host session, respect each prompt's `expect` and `schema_hint`, then call again with `llm_responses`
- `done` — the loop is complete for the current phase
- `error` — recoverable state/input error; correct and retry

Keep question IDs and prompt IDs exactly as returned; they can change between
steps. For `open_question: true`, explicitly invite the user's own answer and
present any candidate answers as suggestions. Never replace the user's answer
with host reasoning or manufacture confirmation. A `done` envelope completes
that loop's current phase; use its result and the next-step guidance to continue.

An envelope with `kind: "error"` can arrive without MCP `isError: true`, so inspect
the decoded envelope as well as transport-level errors.

## Project and state ownership

Start the MCP server in the target project directory. The current tools use the
server's working directory and accept no `cwd` argument; one server should serve
one project. `.mcp.json` and `.claude-plugin/` contain Claude-specific integration
settings, not portable configuration for every host.

Serialize calls that update a session. Alignment and Ralph share
`.agora/mcp_pending.json`, so parallel writers can interfere with one another.
Delegate independent inspection or analysis, collect its results, and have one
host submit the next state transition. Model names, effort and verbosity belong
to host configuration; they are not Agora tool arguments.

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
- Inspect `agora_status`, `agora_resume`, `agora_trace` and
  `.agora/mcp_pending.json` in the server's project directory.
- Resume the pending owner with the exact issued IDs and expected response shape.
  Do not run alignment and Ralph mutations concurrently.
- Preserve the pending record and session before an intentional abort/reset.
  Deleting pending state loses in-flight work and is not the default recovery.

**Cost warning still appears**
- That warning is from standalone subprocess mode. Inside the MCP plugin path it
  should not appear. If you also use standalone CLI mode and want to silence it,
  set `AGORA_NO_COST_WARNING=1`.

## Why this path

ADR-0009 explains the billing pivot: subprocess / Agent-SDK style calls can draw
from a separate billing path. Those dated billing assumptions are historical;
current charges depend on the host/runtime and account terms. In MCP mode,
Agora provides structure and gates while the host session supplies reasoning,
so there is no extra Agora-side LLM call. Host usage limits still apply.
