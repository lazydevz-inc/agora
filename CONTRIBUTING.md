# Contributing to Agora

Thanks for your interest. Agora is **alpha** and **opinionated by design** — it
prefers picking the one best option over exposing many. Before you open a PR,
it helps to know what kind of project this is:

- **Spec-first.** Behavior is defined in `docs/` *before* it's coded. The rule of
  the house is *"이 문서에 없는 것은 구현하지 마세요. 이 문서와 다른 것은 버그입니다"* —
  if it's not in the SPEC, it's not implemented; if it diverges from the SPEC,
  it's a bug.
- **Dependency-minimal.** Adding a runtime dependency is a real decision, not a
  reflex. Don't add one without prior agreement.
- **Architectural changes need an ADR.** Anything structural (a new loop, a new
  gate, a new philosopher, a layering change) is recorded in
  `docs/architecture/decisions/` as an ADR. The five philosophers are a
  deliberately closed set — a sixth requires both a `docs/philosophy/06-*.md`
  and an ADR (see [ADR-0007](docs/architecture/decisions/0007-license-mit-provisional.md)
  and the MANIFESTO).

## Getting set up

```bash
# Node >= 22, pnpm 10 (via corepack)
corepack enable
git clone https://github.com/lazydevz-inc/agora.git
cd agora
pnpm install
pnpm build
```

Run the CLI in dev (no build needed):

```bash
pnpm dev doctor        # any command
pnpm dev --version
```

## Definition of Done

Every change must pass the full gate before it's considered done:

```bash
pnpm verify
# = lint · typecheck · lint:locale · lint:prompts · test · build
```

- `pnpm lint` — Biome (warnings OK, errors not)
- `pnpm typecheck` — `tsc --noEmit`, strict
- `pnpm lint:locale` — en/ko key parity + `ERROR_CATALOG` cross-reference + placeholder consistency
- `pnpm lint:prompts` — generated prompt library is in sync with the runbooks
- `pnpm test` — Vitest (all green)
- `pnpm build` — emits `dist/`

## Code conventions (enforced by review)

These are extracted from shipped code, not aspiration:

- **Imports:** source files use **relative imports with `.js` extensions**
  (NodeNext); test files use the `@/*` alias. Don't use `@/*` in `src/`.
- **Result, not throw, at boundaries:** module exports return `Result<T, E>`
  (`src/result/`). Internal helpers may throw; external library calls (Zod,
  `child_process`) are wrapped at the module boundary. Only the CLI top level
  unwraps.
- **One error catalog:** user-facing errors go through `buildAgoraError(code, …)`
  from `ERROR_CATALOG` — never `throw new Error("…")` for anything a user sees.
- **One string catalog:** user-facing text goes through `localized(key, ctx)`.
  No inline English (or Korean) at render sites. New strings land in **both**
  `messages/en.json` and `messages/ko.json` in the same change.
- **SPEC headers:** every `src/*.ts` starts with `// SPEC: docs/<path>.md`.
- **Layers** (inward dependencies only):
  `shared/ result/ errors/ i18n/ prompts/` → `config/ state/ llm/ probes/ critics/ philosophers/`
  → `alignment/ ralph/ handoff/ mcp/` → `cli/`. Peer features
  (`alignment/ ↔ ralph/`) must not import each other; nothing imports `cli/`.
- **No telemetry. Ever.** No phone-home, no Sentry/PostHog runtime imports. Local
  crash reports only (MANIFESTO P6). This is non-negotiable.

## Working rhythm

Agora is built in **vertical slices** — the smallest end-to-end path that adds
value, with tests and manual verification, not horizontal layers. The deep
conventions (reading order for the SPECs, past pitfalls, commit/PR templates)
live in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — read it before a
substantial change.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `refactor:`…). Keep one slice per PR where you can.

## Reporting bugs / proposing features

Use the issue templates. For security, see [`SECURITY.md`](SECURITY.md). For
open-ended questions, prefer
[Discussions](https://github.com/lazydevz-inc/agora/discussions).

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
