# ADR-0006 — Pre-Ralph Infrastructure Gate (Gate 0)

> **Status**: Accepted
> **Date**: 2026-04-27
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

Ralph is the implementation loop. It assumes the environment can actually do what the seed describes. In practice, modern projects depend on a constellation of CLIs and credentials:

- `gh` (GitHub) for PR creation, issue lookup
- `supabase` for database operations and migration
- `vercel` for deployment and env vars
- `stripe` for payments
- `clerk` (or similar) for auth
- `gcloud` / `aws` for cloud resources
- Various API keys (Anthropic, OpenAI, etc.)

Ralph cannot meaningfully iterate if any of these are unauthenticated, missing, or pointing at the wrong project. Discovering this at iteration N+5 means N+5 iterations of wasted work and corrupted state.

The user (Sang) explicitly raised this concern:

> *"ralph loop execution 하기 전에 인프라 관련 cli들이나 기타 사용하는 것들 중 계정 연동 확인같은거 필요한것들 있으면 미리 체크를 해주는게 필요할텐데, 그런 부분들도 신경 써줘."*

Without this gate, Ralph's promise of "verified output" is hollow — the verification itself can fail because the *environment* failed, not the code.

## Decision

**Add Gate 0 to the Ralph Loop: a pre-flight infrastructure check that runs once at Ralph start, and may re-run on demand if infra changes mid-session.**

Gate 0 fails-closed: Ralph does not begin any implementation iteration until Gate 0 passes (or is explicitly bypassed by the user with full visibility into what they're skipping).

### What Gate 0 checks

Gate 0's checklist is **dynamically constructed from the seed's `material_cause` field** (Aristotle's material cause). It is not a hardcoded list. The principle: *check what this project actually depends on, nothing more, nothing less.*

For each item in `material_cause.tech_stack` and `material_cause.infrastructure`:
- Look up the corresponding **probe** in Agora's infra-probe registry
- Run the probe with a short timeout (default 5s per probe)
- Record `pass`, `fail`, or `skip` (probe doesn't exist for this dep)

### Probe registry (initial set, expandable per-project)

| Dependency | Probe command | Pass criterion |
|------------|---------------|------------------|
| GitHub (gh) | `gh auth status` | exit 0 + token has required scopes |
| Vercel | `vercel whoami` | exit 0 + linked project (`.vercel/project.json` exists) |
| Supabase | `supabase status` (or `supabase projects list` if no link) | exit 0 |
| Stripe | `stripe config --list` | exit 0 + `test_mode_api_key` set |
| gcloud | `gcloud auth list --format=json` | exit 0 + active account |
| AWS | `aws sts get-caller-identity` | exit 0 |
| Claude Code | `claude --print "ping" --output-format json` | exit 0 (already used by ADR-0005) |
| Node deps | check `node_modules` freshness vs `package.json` | mtime check |
| .env keys | verify required keys present (from `material_cause.env_vars`) | each key set |

The registry is extended by the community over time. Adding a probe requires (a) a deterministic check, (b) a clear pass criterion, (c) an actionable fix instruction shown on failure.

### Failure UX

When Gate 0 fails, the output is **not** "Ralph cannot start." It is a structured remediation list:

```
✗ Gate 0: Pre-flight Infrastructure Check — 2 of 7 probes failed

  ✓ claude         authenticated (Max plan)
  ✓ node           v22.10.1 (>= 22 OK)
  ✓ git            clean working tree
  ✗ gh             not authenticated
                   Fix: run `gh auth login`
  ✗ supabase       linked to wrong project
                   Current: project_xyz
                   Expected (from seed): project_abc
                   Fix: run `supabase link --project-ref project_abc`
  ✓ vercel         authenticated and linked
  ✓ stripe         test mode keys present

Resolve the failures above, then run `agora ralph` again to retry Gate 0.
Or run `agora ralph --skip-gate-0=gh,supabase` to proceed without these
(WARNING: any iteration touching these dependencies will fail Gate 1+).
```

The user can:
1. Fix the issues and rerun
2. Explicitly bypass with `--skip-gate-0=<list>` (recorded in seed metadata as a trust warning)
3. Edit `material_cause` to remove the dependency if it was misspecified

### When Gate 0 runs

- **Always** at Ralph start (before iteration 1 of any session)
- **Conditionally** between iterations if a probe-relevant change occurred (new env var added, project re-linked, etc.)
- **On demand** via `agora doctor` (which is essentially Gate 0 executed independently)

### Relationship to `agora doctor`

`agora doctor` is the standalone version of Gate 0 plus a few generic checks (Node version, disk space, write permissions on `.agora/`).

```
agora doctor                  → runs ALL probes (generic + project-specific)
                                independent of any Ralph session
agora ralph (Gate 0 inside)   → runs project-specific probes only
                                from the active seed's material_cause
```

Both share the same probe registry — fix once, both benefit.

### Material cause auto-population

To make Gate 0 useful from day one, Agora's auto-scan (Phase 0 of Alignment Loop) **detects infrastructure markers** in the project and pre-populates `material_cause`:

| Marker | Inferred dependency |
|--------|---------------------|
| `.vercel/project.json` | Vercel |
| `supabase/config.toml` | Supabase |
| `.github/workflows/*.yml` | GitHub Actions |
| `Dockerfile` | Docker |
| `package.json` deps include `stripe` | Stripe |
| `package.json` deps include `@clerk/*` | Clerk |
| ... | ... |

The auto-detected list is presented to the user during alignment for confirmation/correction (Mode A interview pattern: recommended options + free input). Nothing about infra is accepted silently.

## Consequences

### Positive

- **Ralph cannot waste iterations on unreachable infrastructure.** Failing fast.
- **The user gets actionable fix instructions**, not opaque "command not found" errors mid-iteration.
- **The seed's material_cause becomes operationally meaningful** — it drives Gate 0, not just documentation.
- **`agora doctor` becomes useful for non-Ralph contexts** (e.g., onboarding to an existing Agora-managed project).
- **The probe registry is a community-extensible asset** — every probe added makes Agora more reliable for that ecosystem.

### Negative / Trade-offs

- **Gate 0 adds 2–10 seconds at Ralph start** (depending on probe count).
- **Probe registry is a maintenance burden** — each probe needs a maintainer when CLIs change their auth flow.
- **`--skip-gate-0` is a foot-gun.** Documented and recorded, but escapeable. Mitigation: warning shown loudly, recorded in seed metadata, displayed at every subsequent Ralph start.
- **Auto-population of material_cause may be wrong.** Mitigation: always confirmed during alignment, never silent.

### Neutral

- This is a pattern borrowed from `vercel`, `supabase`, and `stripe` CLIs themselves — they each have their own "doctor"-equivalent. Agora's contribution is **integrating across them with a single pre-flight gate**.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Lazy checking (probe only when Ralph hits the dependency) | Wastes iterations; corrupts intermediate state |
| Hardcoded probe list (no per-project tailoring) | Either too narrow (misses real deps) or too broad (annoying false positives) |
| Skip the gate; trust user to manage env | Violates Agora's biased-product principle (we should handle this for the user) |
| Defer to Stage 4 (no Gate 0 for now) | Sang explicitly raised this; getting it captured now prevents Gate 0 being bolted on later |

## Implementation Notes (for Stage 2-B / Stage 4)

When implementing in Stage 2-B (Ralph Loop spec) and Stage 4 (Infra layer):

1. **Probe interface**:
   ```typescript
   interface Probe {
     name: string;
     description: string;
     detect: () => Promise<boolean>;  // is this dep relevant for current project?
     check: () => Promise<ProbeResult>;
     fixInstruction: (result: ProbeResult) => string;
   }
   ```

2. **Probe registry** lives in `src/agora/infra/probes/` with one file per probe.

3. **Auto-population logic** lives in `src/agora/alignment/auto-scan.ts`.

4. **`agora doctor`** is implemented before Gate 0 because it's standalone-useful and exercises the same probe registry.

5. **Gate 0 results** are persisted to `.agora/state.json` so subsequent Ralph runs can show "infra was OK at last check (timestamp)" — saving probe time when nothing changed.

## References

- ADR-0003 (Meta Dogfooding) — every gate should be its own decision
- ADR-0005 (Claude Integration via Subprocess) — `claude --print` is itself one of the probes Gate 0 runs
- `docs/loops/ralph-loop.md` — Ralph Loop spec where Gate 0 is the first gate
- `docs/philosophy/03-aristotle-four-causes.md` — material cause is what Gate 0 reads from
