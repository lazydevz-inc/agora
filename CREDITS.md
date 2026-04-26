# Credits

Agora stands on the shoulders of giants — both ancient and modern.

## Ancient Philosophers

The conceptual core of Agora is built on frameworks developed by:

- **Socrates** (470–399 BCE) — Elenchus, the questioning method
- **Plato** (428–348 BCE) — Divided Line (knowledge maturity), Dihairesis (natural division)
- **Aristotle** (384–322 BCE) — Four Causes, Phronesis (practical wisdom)
- **Husserl** (1859–1938) — Epoché (phenomenological reduction)
- **Aquinas** (1225–1274) — Disputatio (structured deliberation)

These are not decorative references. Each maps to a 1급 시민 (first-class) module. The justification for each is captured in `docs/philosophy/`.

## Software Foundations

### Ouroboros
Agora was inspired by and selectively borrows ideas from [Ouroboros](https://github.com/Q00/ouroboros) by Q00.

- **License**: MIT
- **Copyright**: (c) 2025 Q00
- **Borrowed (concepts, not code)**: spec-first interview pattern, event sourcing for execution state, MCP-server-as-harness pattern, the philosophical premise that "AI coding fails at the input, not the output."

Where Agora diverges sharply from Ouroboros:
1. **Single-command CLI UX** instead of ~15 subcommands
2. **Per-project configuration** as the default, with global as fallback
3. **Five focused philosopher modules** instead of 21 generic agents
4. **Telos (final cause)** as the primary axis of evaluation
5. **TypeScript stack** for unified CLI/GUI/dashboard codebase

We thank Q00 for releasing under MIT, which made this exploration possible.

## Libraries

Production dependencies are intentionally minimal. Listed here are the runtime dependencies and their roles. See `package.json` for the full list and versions.

| Package | Role |
|---------|------|
| `commander` | Battle-tested CLI argument parsing |
| `@clack/prompts` | Modern, beautiful interactive prompts |
| `picocolors` | Tiny terminal color library |

Development tools (TypeScript, vitest, biome, tsx) are listed in `devDependencies`.
