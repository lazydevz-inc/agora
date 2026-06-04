# Credits

Agora stands on the shoulders of giants — both ancient and modern.

## Ancient Philosophers

The conceptual core of Agora is built on frameworks developed by:

- **Socrates** (470–399 BCE) — Elenchus, the questioning method
- **Plato** (428–348 BCE) — Divided Line (knowledge maturity), Dihairesis (natural division)
- **Aristotle** (384–322 BCE) — Four Causes (telos primary)
- **Husserl** (1859–1938) — Epoché (phenomenological reduction)
- **Aquinas** (1225–1274) — Disputatio (structured deliberation with per-objection ruling)

These are not decorative references. Each maps to a 1급 시민 (first-class) module that operates at a specific point in Agora's runtime. Each module's exact contribution is documented in `docs/philosophy/`.

## Software Foundations

### Ouroboros
Agora was inspired by and selectively borrows ideas (not code) from [Ouroboros](https://github.com/Q00/ouroboros) by Q00.

- **License**: MIT
- **Copyright**: (c) 2025 Q00
- **Borrowed concepts** (re-expressed in Agora's own architecture):
  - The premise that "AI coding fails at the input, not the output"
  - The pattern of running an interview phase before any implementation
  - The pattern of a Ralph-style loop with verification gates
  - The MCP-server-as-harness pattern (now Agora's primary mode — ADR-0009)

### What Agora does NOT borrow from Ouroboros

To prevent confusion: Agora is a clean reimplementation in TypeScript, not a port. We deliberately did **not** carry over:

- Ouroboros's Python codebase (Agora is TypeScript on Node 22+)
- Ouroboros's 21-agent system (Agora has 5 philosopher modules)
- Ouroboros's 15+ subcommand CLI (Agora is a single guided `agora` flow — you rarely think about subcommands)
- Ouroboros's global-only configuration model (Agora is per-folder primary)
- Ouroboros's vote-based consensus (Agora uses Aquinas Disputatio)
- Ouroboros's Claude Agent SDK integration (Agora runs inside Claude Code so the host session honors the user's subscription with no extra billing — see ADR-0005 + ADR-0009)

### Where Agora diverges sharply from Ouroboros

1. **Single-command CLI UX** instead of ~15 subcommands
2. **Per-project configuration** as the default, with global as fallback
3. **Five focused philosopher modules** instead of 21 generic agents
4. **Telos (final cause)** as the primary axis of evaluation
5. **TypeScript stack** for unified CLI / TUI / future GUI codebase
6. **Runs as a plugin inside Claude Code** (the host session does the reasoning; Agora makes zero LLM calls) so subscription users are not double-billed — see ADR-0009

We thank Q00 for releasing under MIT, which made this exploration possible.

## Libraries

Production dependencies are intentionally minimal. Listed here are the runtime dependencies and their roles. See `package.json` for the full list and versions.

| Package | Role |
|---------|------|
| `@clack/prompts` | Modern, beautiful interactive prompts |
| `@modelcontextprotocol/sdk` | MCP server so Agora runs as a plugin inside Claude Code (ADR-0009 / ADR-0010, the primary mode) |
| `picocolors` | Tiny terminal color library |
| `zod` | Runtime schema validation (state, seed, config, events) |

Development tools (TypeScript, vitest, biome, tsx) are listed in `devDependencies`.
