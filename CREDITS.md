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
Agora was partly inspired by [Ouroboros](https://github.com/Q00/ouroboros) by Q00,
especially the intuition that an AI coding workflow should refine intent before
implementation begins.

Agora is not a fork or port. It is an independent TypeScript implementation with
its own architecture, philosopher modules, Claude Code MCP mode, and verification
gates. No Ouroboros source code is included.

## Libraries

Production dependencies are intentionally minimal. Listed here are the runtime dependencies and their roles. See `package.json` for the full list and versions.

| Package | Role |
|---------|------|
| `@clack/prompts` | Modern, beautiful interactive prompts |
| `@modelcontextprotocol/sdk` | MCP server so Agora runs as a plugin inside Claude Code (ADR-0009 / ADR-0010, the primary mode) |
| `picocolors` | Tiny terminal color library |
| `zod` | Runtime schema validation (state, seed, config, events) |

Development tools (TypeScript, vitest, biome, tsx) are listed in `devDependencies`.
