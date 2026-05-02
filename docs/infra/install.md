# Install Mechanics — Specification (Stage 4)

> **Status**: Stage 4-A in progress (opened 2026-05-03 after Stage 3 close).
> Sections marked **[SPEC]** are formally accepted Stage 4 outputs.
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 4
> closes its gate.

---

## Section Index

| Section | Status |
|---------|--------|
| **Distribution Channels** (4-A.1) | **[SPEC]** Accepted 2026-05-03 |
| **First-Run UX** (4-A.1) | **[SPEC]** Accepted 2026-05-03 |
| **Update + Uninstall** (4-A.1) | **[SPEC]** Accepted 2026-05-03 |
| **Version Output** (4-A.1) | **[SPEC]** Accepted 2026-05-03 |

---

## Distribution Channels [SPEC] (Accepted 2026-05-03, Stage 4-A.1 R1-A)

> **Goal**: Define how users obtain Agora. v1 ships via npm (3 channels).
> No `curl|bash` script at v1 (private repo per ADR-0002+0007).

### v1 channels

```
1. npx (one-shot, no install)
   $ npx @lazydevz/agora <subcommand>            # always pulls latest from npm
   $ npx @lazydevz/agora@0.3.0-stage-3 <cmd>     # version-pinned

2. pnpm dlx (alternative)
   $ pnpm dlx @lazydevz/agora <subcommand>       # equivalent to npx, pnpm-native
   $ pnpm dlx @lazydevz/agora@0.3.0-stage-3 <cmd>

3. Global install
   $ npm install -g @lazydevz/agora
   $ pnpm add -g @lazydevz/agora
   → `agora` available on PATH
```

**Why three channels**:
- `npx` is the most common first-touch ("just try it once") — works without persistent install
- `pnpm dlx` matches Agora's own dev tooling (ADR-0001) and Sang's preferences
- Global install is the canonical "I use this daily" path — `agora<Enter>` (Stage 3-B.7)

### Channels NOT in v1

| Channel | Why deferred |
|---------|--------------|
| `curl \| bash` install script | Repo private (ADR-0002+0007); no public domain to host script. Reconsider after Stage 5 public-release decision. |
| Homebrew formula | Single-platform; npm covers macOS + Linux + Windows uniformly |
| Docker image | Useful but separate concern (running Agora in container ≠ packaging Agora); revisit if user demand surfaces |
| Single-binary (pkg / sea) | Node ≥ 22 satisfies most use; binary distribution adds release complexity for marginal benefit at v1 |
| GitHub release tarball | npm IS the canonical release channel for Node packages |

R1-B (npm install -g only) rejected: too restrictive; `npx` is the modern try-before-install pattern.
R1-C (Homebrew + Docker added) rejected: maintenance burden without clear v1 demand.

### npm package shape

```
@lazydevz/agora
├── package.json
│   ├── "bin": { "agora": "./dist/cli/index.js" }
│   ├── "files": ["dist", "messages", "probes", "README.md", "LICENSE", "CREDITS.md"]
│   └── "engines": { "node": ">=22" }
├── dist/                  ← compiled JS + .d.ts
├── messages/              ← i18n catalog (en.json, ko.json)
├── probes/                ← v1 probe definitions (or compiled in dist/)
├── README.md
├── LICENSE
└── CREDITS.md
```

The `bin.agora` field makes `agora` a callable command after `npm install -g`
or via `npx`.

### `npx` confirm-prompt handling [R2-A]

`npx` shows an interactive confirm prompt on first download
("Need to install the following packages: @lazydevz/agora — Ok to proceed? (y)").

This blocks AI agents and CI environments. Solution: documented `-y` flag:

```
$ npx -y @lazydevz/agora <subcommand>     # auto-yes, AI-agent-safe
```

We **document** this in:
- README quickstart section
- `agora --help` install hint
- AI-agent integration guide (Stage 5)

We can NOT enforce `-y` from inside the package; npm/npx behavior is
controlled by the invoking shell.

R2-B (separate install script) rejected: defeats `npx` simplicity; users
would have to run our script first.
R2-C (don't recommend npx) rejected: npx is the genuine try-before-install path.

### CLI invocation paths summary

| Invocation | When | Auto-yes for AI? |
|------------|------|-------------------|
| `npx @lazydevz/agora <cmd>` | First try, occasional use | Add `-y` for AI |
| `npx -y @lazydevz/agora <cmd>` | AI agents, CI | Yes (no prompt) |
| `pnpm dlx @lazydevz/agora <cmd>` | pnpm users | Yes (no prompt) |
| `agora <cmd>` (after `-g` install) | Daily use | Yes (no prompt) |

---

## First-Run UX [SPEC] (Accepted 2026-05-03, Stage 4-A.1 R3-A)

> **Goal**: Surface environment status on first invocation, then stay quiet.

### First-run detection

```
~/.agora/.first_run          ← marker file
                                Existence: first-run banner already shown
                                Absence:   show banner this invocation
```

Note: `~/.agora/` is the **global** Agora home (per ADR-0002 config locations).
This is distinct from `.agora/` in a project folder.

### First-run banner

Displayed once, then never again (unless `~/.agora/.first_run` is deleted):

```
─────────────────────────────────────────────────────────────────
  Welcome to Agora!
─────────────────────────────────────────────────────────────────

  Checking environment:
    ✓ Node v22.10.1 (≥ 22 OK)
    ✓ pnpm 10.22.0 (recommended package manager detected)
    ⓘ claude CLI not found
       Install Claude Code: https://claude.com/claude-code
       OR set ANTHROPIC_API_KEY for SDK fallback

  Continuing with limited functionality. Run `agora doctor` after fixing.

─────────────────────────────────────────────────────────────────
```

If all universal probes pass (per Stage 2-B.1):

```
─────────────────────────────────────────────────────────────────
  Welcome to Agora!
─────────────────────────────────────────────────────────────────

  Environment ready:
    ✓ Node v22.10.1
    ✓ pnpm 10.22.0
    ✓ claude CLI authenticated (Max plan)

─────────────────────────────────────────────────────────────────
```

After this banner, the requested subcommand executes normally.

### Subsequent runs

`~/.agora/.first_run` exists → banner suppressed. Normal command output only.

`agora doctor` always re-runs the universal probe check explicitly (regardless
of first-run state).

### Reset path

User can force the first-run banner to re-appear:

```
$ rm ~/.agora/.first_run
$ agora <any subcommand>
```

This is documented in `agora doctor --help` but not pushed; rare use case.

R3-B (every invocation re-checks) rejected: friction; defeats biased-product principle.
R3-C (no first-run check) rejected: user doesn't know if their environment is ready.

---

## Update + Uninstall [SPEC] (Accepted 2026-05-03)

> **Goal**: Standard npm-ecosystem patterns. No custom Agora command for either.

### Update

Standard npm/pnpm patterns:

```
npm update -g @lazydevz/agora
pnpm update -g @lazydevz/agora

# Or via npx (always pulls latest)
npx @lazydevz/agora@latest <subcommand>
```

**No `agora update` command**. Reasons:
- 7-command cap (Stage 1) is hard
- npm/pnpm already provide the canonical update mechanism
- An `agora update` would just shell out to npm — needless wrapper

`agora doctor` may surface "version stale" warning when network is
available and the installed version is N+ behind the latest npm release.
This is informational only.

### Uninstall

Standard npm/pnpm patterns:

```
npm uninstall -g @lazydevz/agora
pnpm remove -g @lazydevz/agora
```

What happens:
- `agora` command removed from PATH
- npm package files removed from global install location
- **`~/.agora/` is NOT deleted** (user data — config, history, cache)
- **per-project `.agora/`** in project folders is NOT touched (user data)

Manual cleanup if user wants full removal:

```
rm -rf ~/.agora                    # global Agora data
# Per-project: user manually deletes .agora/ in each folder
```

This separation respects user data ownership — uninstall removes the tool,
not the data.

---

## Version Output [SPEC] (Accepted 2026-05-03, Stage 4-A.1 R4-A)

> **Goal**: `agora --version` returns single-line version. JSON mode adds
> environment context for diagnostic.

### TUI output

```
$ agora --version
agora 0.3.0-stage-3
```

Single line, simple format: `agora <semver>`.

The version is read from the npm package's `version` field at build time.
For Stage tags (e.g. `0.3.0-stage-3`), the suffix conveys the stage closure
(useful during pre-1.0 development).

### JSON output

```
$ agora --version --json
```

```json
{
  "command": "agora",
  "version": "0.3.0-stage-3",
  "timestamp": "2026-05-03T07:40:00Z",
  "result": {
    "ok": true,
    "data": {
      "agora_version": "0.3.0-stage-3",
      "agora_install_path": "/usr/local/lib/node_modules/@lazydevz/agora",
      "node_version": "v22.10.1",
      "pnpm_version": "10.22.0",
      "platform": "darwin",
      "arch": "arm64",
      "claude_cli_present": true,
      "claude_cli_version": "1.0.x",
      "anthropic_api_key_present": false
    }
  },
  "next": [],
  "warnings": [],
  "errors": []
}
```

The JSON form is useful for:
- AI agents detecting capability ("does this Agora support feature X?")
- `agora doctor` diagnostic gathering
- Bug reports (one command captures the full env)

R4-B (always-verbose) rejected: too much output for the common case
(`agora --version` is read mostly by humans wanting a quick check).
R4-C (no `agora` prefix) rejected: ambiguous in shared output (e.g. CI logs).

### `--version` exit code

Always `0` (informational; not a health check).

---

## Boundaries

- ❌ `curl \| bash` script at v1 (private repo blocks public hosting; reconsider post-Stage-5).
- ❌ Homebrew / Docker / single-binary (R1-C rejected): npm covers v1 needs.
- ❌ Custom `agora update` command: npm/pnpm own this; 7-cmd cap respected.
- ❌ Auto-deletion of `~/.agora/` on uninstall: user data is sacred.
- ❌ Per-invocation env check (R3-B rejected): friction.
- ❌ Force users to enable `npx -y` automatically (impossible from inside package).
- ❌ Non-prefixed version output (R4-C rejected): ambiguous in logs.

## Failure modes specifically guarded

- **First-time bewilderment**: banner explains environment state.
- **AI-agent install loop**: `npx -y` documented as the safe pattern.
- **User data loss on uninstall**: `~/.agora/` and per-project `.agora/` preserved.
- **Stale version blindness**: `agora doctor` surfaces (Stage 2-B.1 + Stage 3-B.1) version-staleness warning.
- **Banner fatigue**: shown once via `~/.agora/.first_run` marker.

## Output consumed by

- **README quickstart**: cites all three install paths + `npx -y` for AI agents.
- **AI-agent integration guide** (Stage 5): includes `npx -y @lazydevz/agora` examples.
- **`agora doctor`**: cross-references first-run banner for "are you newly installed?"
- **`agora --version`**: reads npm package version field.
- **Bug reports**: `agora --version --json` is the canonical capture command.

---

## Next sections (still OPEN in this document)

This document covers Stage 4-A.1 (Install Mechanics). Other Stage 4 sub-questions
will land in other infra docs:

- `docs/infra/llm-integration.md` — Stage 4-A.2 (Claude runtime) + Stage 4-A.5 (MCP server)
- `docs/infra/config.md` — Stage 4-A.3 (config loading)
- `docs/infra/probes.md` — Stage 4-A.4 (probe registry implementation)
- (Cross-cutting) — Stage 4-A.6 (error handling + telemetry) — likely woven into the above
