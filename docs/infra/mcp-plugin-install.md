# Install agora as a Claude Code MCP plugin

> Audience: end users who want to run agora **inside** Claude Code so all
> reasoning happens in the host session (no metered Agent-SDK pool draw).
> This is the primary mode per ADR-0009 / ADR-0010.

## Prerequisites

- Node 22+ (`engines.node`)
- agora cloned + built locally:
  ```bash
  git clone https://github.com/lazydevz-inc/agora.git
  cd agora && pnpm install && pnpm build
  ```
- Claude Code authenticated with a Claude subscription
- A project folder where you want to run agora (any TypeScript / Python /
  whatever — agora is language-agnostic on the host's side)

## Step 1 — register the MCP server

Add the following to your Claude Code MCP config. The file location
depends on your Claude Code build; common paths:

- `~/.config/claude-code/mcp.json`
- `~/Library/Application Support/Claude Code/mcp.json` (macOS)
- inside the IDE's MCP settings panel if you're using the VS Code /
  JetBrains integration

```json
{
  "mcpServers": {
    "agora": {
      "command": "node",
      "args": ["/absolute/path/to/agora/dist/cli/index.js", "mcp"]
    }
  }
}
```

Replace `/absolute/path/to/agora/` with your clone location. The `mcp`
subcommand starts agora as a stdio MCP server (does not return; Claude
Code manages the lifecycle).

## Step 2 — restart Claude Code

The next time Claude Code launches, six tools should be visible:

| Tool | Kind | Purpose |
|------|------|---------|
| `agora_status` | read-only | session phase + drift trend |
| `agora_doctor` | read-only | Gate 0 pre-flight probes (CLI auth, deps reachable) |
| `agora_resume` | read-only | next concrete step given current state |
| `agora_trace` | read-only | query `.agora/events.jsonl` audit log |
| `agora_align_step` | stepped | drive the Alignment Loop one step at a time |
| `agora_ralph_step` | stepped | drive the Ralph Loop one step at a time |

The four read-only tools and the two stepped tools all share a single
contract: agora makes zero LLM calls. The stepped tools return a
StepEnvelope (`done` / `advanced` / `needs_user_input` /
`needs_reasoning` / `error`); your Claude Code session reads it, decides
what to ask the user or reason about, and calls the tool again with
the result.

## Step 3 — start a session

```bash
# In any project folder, ONCE:
cd ~/projects/my-app
node /absolute/path/to/agora/dist/cli/index.js new my-feature
```

That creates `.agora/` with the initial scan + state. Then in Claude
Code (in the same project folder):

> "Run `agora_align_step` to start the alignment loop."

Claude Code calls the tool; it returns either:
- `needs_user_input` — Claude asks you the listed questions; you reply;
  Claude calls the tool again with `user_answers`
- `needs_reasoning` — Claude reasons about the prompt(s); calls the tool
  again with `llm_responses`
- `advanced` — deterministic step ran; Claude calls the tool again
- `done` — loop complete

Repeat through telos → form → material → efficient → socrates →
maturity → ac → handoff. When handoff completes, `seed.json` is locked
and `state.current_phase` advances to `ready_for_ralph`. Then move to
`agora_ralph_step` to enter the Ralph loop.

## Troubleshooting

**Tools don't appear in Claude Code**
- Check the `command` path: `node /absolute/path/.../dist/cli/index.js mcp`
  should start cleanly (hangs on stdio waiting for MCP messages).
- Make sure you ran `pnpm build` — the path points at `dist/`, not
  `src/`. The build is checked in to neither the repo nor npm yet.

**`No Agora session in this directory`**
- `cd` into the project folder + run `agora new <name>` from a regular
  terminal first; `.agora/` must exist before any step tool runs.

**Stuck on a step / want to abort**
- `cat .agora/mcp_pending.json` to see what step is in flight.
- `rm .agora/mcp_pending.json` to abort — the next tool call will
  reconsider from on-disk state.

**Wrong owner error (`mcp_pending belongs to "ralph", not align`)**
- A Ralph iteration is in flight. Either finish it via `agora_ralph_step`
  or delete `mcp_pending.json` to drop the in-flight step.

**Cost warning still showing**
- That warning fires from Mode 2 (standalone CLI). Inside the plugin
  (Mode 3) it never appears. If you also use standalone CLI and want to
  silence it there, `export AGORA_NO_COST_WARNING=1`.

## Why this path

ADR-0009 explains the billing arithmetic: from 2026-06-15 Anthropic
charges the metered Agent-SDK pool for `claude --print` / Agent-SDK
usage on Pro/Max subscriptions ($20–$200/mo, API rates). Running agora
inside Claude Code (Mode 3) routes every LLM call through your
interactive subscription — no extra billing.

ADR-0010 specifies the stepped-tool contract that makes Mode 3
load-bearing. Slices A-E shipped both stepped tools end-to-end.
