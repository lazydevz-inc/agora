<!-- Thanks for contributing to Agora. Keep PRs to one vertical slice where possible. -->

## What & why

<!-- One short paragraph: what this changes and the intent behind it. -->

## Linked SPEC / ADR

<!-- Cite the SPEC doc this implements (e.g. docs/loops/ralph-loop.md §Gate 3)
     and any ADR. Architectural changes REQUIRE an ADR — see CONTRIBUTING.md. -->

- SPEC:
- ADR:

## Definition of Done

- [ ] `pnpm verify` passes (lint · typecheck · lint:locale · lint:prompts · test · build)
- [ ] New module exports return `Result<T, E>`; user-facing errors go through `buildAgoraError` (no raw `throw new Error`)
- [ ] New user-facing strings added to **both** `messages/en.json` and `messages/ko.json`
- [ ] New `src/*.ts` files carry a `// SPEC: docs/<path>.md` header
- [ ] Tests added/updated (`tests/` mirrors `src/`); no regression in existing tests
- [ ] No new runtime dependency without prior agreement (Agora is dependency-minimal)
- [ ] Architectural change? An ADR is included under `docs/architecture/decisions/`

## Manual verification

<!-- Paste real output where it helps (TUI + `--json` + `AGORA_LOCALE=ko`). -->

```
$ 
```
