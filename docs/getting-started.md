# Getting started with Agora

This guide takes you from zero to a first aligned-and-built feature, driving
Agora from inside Claude Code. It assumes you have
[Claude Code](https://claude.com/claude-code) authenticated with a Claude
subscription and Node 22+.

---

## 1. What you're installing

Agora is two cooperating pieces:

| Piece | What it is | You use it to… |
|-------|------------|----------------|
| **MCP server** (`agora mcp`) | Seven `agora_*` tools your Claude Code session calls | run the whole flow *inside* Claude Code — your subscription does the thinking, Agora makes **zero** LLM calls |
| **`agora` CLI** | A normal terminal command | drive the same flow from the terminal instead, if you prefer |

Everything — starting a session included (`agora_new`) — runs through the tools,
so you can stay inside Claude Code. The `agora` CLI is there if you'd rather work
from the terminal. One install gives you both.

---

## 2. Install

### Recommended (once published to npm)

```bash
npm install -g @lazydevz/agora
claude mcp add --scope user agora -- agora mcp
```

`--scope user` registers the tools for **every** project, written to
`~/.claude.json`. No restart needed for the next session.

### From source (works today, before the npm release)

```bash
git clone https://github.com/lazydevz-inc/agora.git
cd agora && pnpm install && pnpm build && npm link
claude mcp add --scope user agora -- agora mcp
```

`npm link` puts the `agora` binary (from `dist/`) on your PATH so `agora mcp` and
`agora new` resolve.

### As a Claude Code plugin (tools only)

```text
/plugin marketplace add lazydevz-inc/agora
/plugin install agora
```

The plugin registers all seven tools (no global `agora` binary needed) — you can
start a session right inside Claude Code by asking it to call `agora_new`.

---

## 3. Confirm it works

In the terminal:

```bash
agora --version
agora doctor      # Gate 0 pre-flight: is `claude` reachable, are deps installed?
```

In Claude Code, open a project and ask:

> *"Call agora_status."*

If it answers "No active Agora session," you're wired up correctly — that's the
expected answer before you start one. (You'll see seven `agora_*` tools
available: `status` / `doctor` / `resume` / `new` / `trace` / `align_step` /
`ralph_step`.)

---

## 4. The mental model (60 seconds)

Agora runs **two loops**, with a locked **Seed** between them:

1. **Alignment Loop** — five philosophers interrogate your intent until the gap
   between *what you meant* and *what's written down* is ~0%. It refuses to
   finish until intent is settled, then splits the goal into atomic, verifiable
   pieces and locks them into `.agora/seed.json`.
2. **Ralph Loop** — builds the Seed, and at **every** iteration runs gates
   (deterministic checks → functional QA → Aquinas quality rulings → an
   **alignment drift check** that can never be waived). It refuses to ship until
   every gate passes.

You don't call the tools by hand. You talk to Claude Code in plain language;
Claude Code drives `agora_align_step` / `agora_ralph_step`, asks you the
philosophers' questions, and reports gate results.

---

## 5. Walkthrough — align, seed, build

### Step 1 — start a session

In your project, ask Claude Code:

> *"Call agora_new with name settings-page."*

(or, from the terminal: `agora new settings-page`). This creates `.agora/`
— session state plus a Phase 0 scan of your stack — auto-detecting brownfield vs
greenfield. Run it once per project.

### Step 2 — align

In Claude Code, in that same project:

> *"Use agora to align on a per-user settings page."*

Claude Code now steps through `agora_align_step`. Expect it to:

- **(Husserl, optional)** bracket your hidden assumptions — *"a settings* page*,
  or do you actually need settings to* persist *per user?"*
- **(Aristotle, four causes)** pin down **why** (telos), **what** (form), **with
  what** (material — stack/data), **by whom/when** (efficient).
- **(Socrates)** probe your answers with concrete cases to expose gaps.
- **(Plato)** check each answer is *mature* enough, looping back if it's shallow,
  then split the goal into atomic acceptance criteria (`ac_001`, `ac_002`, …).

Answer in chat. When intent is settled, Claude Code locks the Seed. Verify:

> *"Call agora_status."* → shows the phase advancing to `ready_for_ralph`.

`.agora/seed.json` now exists — that's the contract for the build.

### Step 3 — build

> *"Now build the Seed with agora."*

Claude Code drives `agora_ralph_step`, one acceptance criterion at a time. Each
iteration runs the gates:

- **Gate 1** deterministic — your `lint` / `typecheck` / `test` / `build`
- **Gate 2** functional — your project's Playwright tests, if detected
- **Gate 3+4** quality — Aquinas Disputatio (per-objection rulings)
- **Gate 5** alignment — a drift score of the output against the Seed's telos;
  a high drift sends it back to fix-and-retry

### Step 4 — watch

> *"Call agora_status"* — phase, current leaf, drift trend + sparkline.
> *"Call agora_trace with limit 20"* — the local audit log of what happened.

---

## 6. When something gets stuck

| Symptom | Fix |
|---------|-----|
| A step won't advance / "pending owner" error | Delete `.agora/mcp_pending.json` to abort the in-flight step, then ask again. |
| Gate 0 / `agora doctor` fails | Authenticate the CLI it names (`claude`, `gh`, etc.). Re-run `agora doctor --refresh` to bust the 5-minute probe cache. |
| A probe keeps showing a stale failure | `rm -rf .agora/cache` (or `agora doctor --refresh`). |
| Want to start over | Remove `.agora/` and run `agora new` again. |

Everything Agora writes lives under `.agora/` in your project. `.agora/cache/`
and `.agora/logs/` are gitignored; the Seed and state are safe to commit and
share with your team.

---

## 7. Prefer the terminal? Standalone CLI

You can drive the whole flow without Claude Code:

```bash
agora new my-feature
agora resume      # Agora always tells you the next step
agora status
```

> ⚠️ In standalone mode Agora calls `claude` itself. From 2026-06-15 that draws
> Anthropic's metered Agent-SDK credit pool ($20–$200/mo), separate from your
> interactive subscription. The in-Claude-Code install (§2) avoids this entirely.
> Suppress the per-run reminder with `AGORA_NO_COST_WARNING=1`.

---

## 8. Uninstall

```bash
claude mcp remove --scope user agora     # or: /plugin uninstall agora
npm uninstall -g @lazydevz/agora         # if installed globally
```

Remove `.agora/` from any project to drop its session.

---

*Hit a rough edge? Agora is alpha — please
[open an issue](https://github.com/lazydevz-inc/agora/issues). If behavior
diverges from this guide, that's a bug.*
