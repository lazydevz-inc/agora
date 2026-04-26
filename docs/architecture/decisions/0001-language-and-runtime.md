# ADR-0001 — Language and Runtime: TypeScript on Node 22+ LTS

> **Status**: Accepted
> **Date**: 2026-04-26
> **Decided by**: Sang Rhee (delegated language choice to Claude)
> **Discussed with**: Claude

## Context

Agora's primary interface is a CLI. The same codebase should later power a desktop GUI (Tauri or similar) and a web dashboard (Next.js).

Sang has no language preference but specified the requirements:

1. Best-in-class CLI ergonomics for AI agents (the Stripe / Supabase / Vercel pattern)
2. Path to GUI later without rewriting core logic
3. Stable AI model integration (LLM SDK quality matters)
4. Easy installation for both AI agents and humans

Sang's existing projects are mostly TypeScript (Next.js, NestJS, Electron). Node 22 LTS, pnpm 10, and gh CLI are already on his machine. Bun is not installed.

## Decision

**TypeScript ≥ 5.9, runtime Node ≥ 22 LTS, package manager pnpm 10.**

Specific stack:

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript 5.9, strict mode | Type safety matches Sang's preference; prevents whole classes of bugs |
| Runtime | Node ≥ 22 LTS | Already installed; broad compatibility; LTS until 2027-04 |
| Package manager | pnpm 10 | Already installed; faster than npm; deterministic |
| CLI framework | commander 14 | Battle-tested, used by every major CLI; no surprises |
| Interactive UI | @clack/prompts | Modern, beautiful, minimal output |
| Colors | picocolors | 14× smaller than chalk, identical API |
| Dev runtime | tsx | Instant TypeScript without build step |
| Build | tsc → dist/ | Standard, zero magic, ships .d.ts |
| Test | vitest | Fast, modern, native ESM, watch mode |
| Lint + Format | biome | Single tool, faster than ESLint+Prettier |

### Why not Bun

- Not installed on Sang's machine; forcing install is a user-hostile decision for a tool that is supposed to be friction-free
- Node 22+ has rapidly closed the cold-start gap
- Library compatibility is still occasionally rough on Bun
- Can re-evaluate when Bun reaches 2.0 with proven Windows support

### Why not Go

- AI SDK quality (anthropic, openai) is markedly better in TypeScript and Python
- Future GUI requires rewrite (Wails ≠ React)
- Sang's existing stack is TypeScript

### Why not Python

- GUI path is poor (Streamlit and PyQt are not what Sang ships)
- AI agents call Python CLIs via `pipx` or `uv tool` — adoption friction higher than `npx`
- Distribution to non-Python users requires PyInstaller hacks

### Why not Rust

- Anthropic SDK is community-maintained, less mature
- Slower iteration during Phase 1–5 (code-heavy stages)

## Consequences

### Positive

- Future GUI shares 100% of core logic (Tauri or Next.js dashboard)
- AI agents install with `npx @lazydevz/agora` — zero ceremony
- Sang's existing TypeScript fluency reduces context-switch cost
- npm registry is the universal AI-CLI distribution channel

### Negative / Trade-offs

- Cold start is ~80–150 ms vs Bun's ~30 ms (acceptable for CLI tool, sub-second always)
- Single-binary distribution requires `pkg`/`@yao-pkg/pkg` if we ever want it (deferred)
- Node version skew across user machines is a real support cost

### Neutral

- Documentation conventions (TSDoc, README badges) follow npm ecosystem norms

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Bun + TypeScript | Not installed on Sang's machine; forcing install violates friction-free principle |
| Go + cobra | Future GUI requires rewrite; AI SDK quality lower |
| Python + typer | GUI path is poor; install friction higher than npm |
| Rust + clap | LLM SDK maturity gap; slower iteration |

## References

- Stripe CLI (Go): https://github.com/stripe/stripe-cli — single binary, but rewriting GUI is painful
- Vercel CLI (Node + commander): the model we follow
- @clack/prompts: https://github.com/natemoo-re/clack
- picocolors: https://github.com/alexeyraspopov/picocolors
- biome: https://biomejs.dev
