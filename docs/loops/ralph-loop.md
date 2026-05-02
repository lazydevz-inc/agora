# Ralph Loop — Specification (Stage 2)

> **Status**: Stage 2-B in progress (opened 2026-04-28, after Stage 2-A close).
> Sections marked **[SPEC]** are formally accepted Stage 2-B outputs.
> Sections marked **[INHERITED]** are foundational decisions captured in Stage 1
> or earlier (5+1 gate structure, Z1/Z2 escalation).
>
> Per ADR-0004, this document is not "Accepted" (full file) until Stage 2-B
> closes its gate.

---

## What Ralph Is

Ralph is the **implementation loop**. It takes a locked alignment seed (the output of the Alignment Loop) and drives implementation iterations against it until **every gate passes** AND **the user confirms satisfaction**.

Ralph is **not** "AI generates code and we hope." It is "AI generates code, six gates verify it, the gate that fails determines what happens next."

Ralph's name is borrowed from the "ralph loop" pattern in AI agent discourse — the discipline of running self-referential implementation loops until verification passes. We adopt the term and harden it with explicit gates.

---

## The Six Gates

Every Ralph iteration's output must pass all six gates. The gates are ordered by **cost and dependency** — cheap deterministic checks first, expensive judgment-based checks later.

### Gate 0 — Pre-flight Infrastructure Check

**When**: Once per Ralph session (at start), and conditionally between iterations if probe-relevant changes occur.
**Owner**: Agora's infra probe registry (per ADR-0006)
**Criterion**: All probes derived from `seed.material_cause` pass, OR the user has explicitly bypassed with `--skip-gate-0=<list>` (recorded as trust warning).
**Output**: Pass / Fail with structured remediation list per failure.

This gate exists because every other gate's result is meaningless if the environment can't actually do what the seed describes. See [ADR-0006](../architecture/decisions/0006-pre-ralph-infrastructure-gate.md).

**Probe registry, caching, and disable mechanism**: see "Gate 0 — Probe Registry [SPEC]" below (Stage 2-B.1, accepted 2026-04-28).

### Gate 1 — Deterministic

**When**: Every iteration.
**Owner**: External tooling (lint, typecheck, build, test runners)
**Criterion**: All of the following pass:
- Linter (project-detected: biome, eslint, ruff, etc.)
- Type checker (tsc, mypy, etc.)
- Build (project-detected build command)
- Test suite (vitest, pytest, etc.)
- Coverage threshold (default 70%, project-overridable)

**Output**: Pass / Fail. On fail, the iteration is marked "broken" and the next iteration must address the failures.

This is the cheapest gate ($0 cost, no LLM calls). All Ralph iterations must clear it.

### Gate 2 — Functional QA (Playwright CLI)

**When**: Every iteration where UI / web behavior changed.
**Owner**: Playwright CLI (test files generated once by LLM from the seed's acceptance criteria, then run deterministically)
**Criterion**: Generated tests pass.

**Why Playwright CLI, not MCP**: deterministic, fast, version-controlled, zero token cost per run. See `docs/loops/alignment-loop.md` for the rationale (originally captured during the Stage 1 interview).

The LLM generates the Playwright test files **once** during Alignment-Ralph handoff, based on the seed's AC. Subsequent Ralph iterations run them via `npx playwright test`. New AC may trigger new test generation.

### Gate 3 — UI/UX Quality (Aquinas Disputatio)

**When**: Every iteration that touches user-facing surfaces.
**Owner**: Aquinas Disputatio applied with UI/UX critic personas.
**Criterion**: Disputatio verdict is `approved` or `conditional_approved`. `rejected` blocks the iteration.

This is a judgment gate. Critics raise objections about visual hierarchy, interaction clarity, accessibility, taste consistency with the project's design tokens. Each objection gets a per-objection ruling (Concedo / Distinguo / Nego). See [05-aquinas-disputatio.md](../philosophy/05-aquinas-disputatio.md).

### Gate 4 — Technical Quality (Aquinas Disputatio)

**When**: Every iteration that adds or modifies non-trivial code.
**Owner**: Aquinas Disputatio applied with code-quality critic personas (SOLID, naming, test coverage, performance).
**Criterion**: Same as Gate 3 — Disputatio verdict.

This gate is where the *senior-developer-vs-non-developer* distinction is enforced (per Stage 1 telos: SOLID-level structural quality is non-negotiable).

### Gate 5 — Alignment Check (the inviolable gate)

**When**: Every iteration. **Always.**
**Owner**: Alignment-check engine (uses seed.telos, seed.acceptance_criteria, seed.evaluation_principles).
**Criterion**: The implementation's behavior aligns with the seed's telos AND meets the relevant AC. Drift score below threshold.

**This is the gate that prevents 0.9^10 compounding.** If alignment drifts, every subsequent gate's success becomes meaningless.

---

## Failure Escalation (Gate 5 specifically)

When Gate 5 fails, the response is **not** "stop and ask user." It is a graduated escalation:

### Z1 — Self-correction (default)

The iteration's diff is compared to the seed. The misalignment is summarized as a delta (which AC drifted, by how much, in which direction). The next iteration is launched with the delta as additional context: *"Last iteration drifted from telos in direction X. This iteration must correct toward Y."*

Z1 does not modify the seed. The seed remains the truth.

### Z2 — Mini Alignment Loop re-entry

If Z1 fails to close the gap after **N consecutive iterations** (default N=3, project-overridable), Ralph **pauses** and re-enters a mini Alignment Loop. The user is told:

```
⚠ Gate 5 (Alignment Check) failed 3 iterations in a row.
  The implementation appears to have drifted from the seed's telos in a way
  Ralph cannot self-correct.

  Specific drift: [summary]

  Next step: a mini-alignment session (5–10 questions) to either:
  (a) update the seed to reflect a refined understanding, or
  (b) clarify which alignment claim was always going to be unrealistic.

  Run `agora resume` to start the mini-alignment session.
```

The mini-alignment is shorter than a full alignment (uses the existing seed as ground, asks only about the drift). On completion, Ralph resumes from where it paused.

### Z3 — Forbidden

There is no "ignore Gate 5 and push forward." This was explicitly rejected during Stage 1 interview. Ralph definitionally includes alignment verification.

---

## What Triggers Re-running Gates

| Change | Gate 0 | Gate 1 | Gate 2 | Gate 3 | Gate 4 | Gate 5 |
|--------|--------|--------|--------|--------|--------|--------|
| New env var added | ✓ | — | — | — | — | — |
| Code change | — | ✓ | conditional | conditional | ✓ | ✓ |
| New AC added | ✓ if infra-relevant | — | regen tests | — | — | ✓ |
| Telos refined (mini-alignment) | — | — | — | — | — | ✓ (recompute) |
| Material cause expanded | ✓ | — | — | — | — | — |

`conditional` = runs only if the change touched the gate's domain (UI changes → Gate 2 + 3; backend changes → only Gate 4).

---

## Gate 0 — Probe Registry [SPEC] (Accepted 2026-04-28, Stage 2-B.1)

> **Goal**: Define which probes ship in v1, how the active set is computed
> per project, how results are cached, and how false detections are handled.

### Two-axis model

Each probe has two independent properties:

| Axis | Values | Determines |
|------|--------|------------|
| **`detect()` shape** | always-true OR marker-based | When the probe is activated for the current project |
| **Tier** | 1, 2, or 3 | When the probe code ships in the Agora package |

These axes are **orthogonal** — a probe can be (always-true, Tier 1), (marker-based, Tier 1), (always-true, Tier 3), etc.

The colloquial term *"universal probes"* refers to `detect() = always-true` probes — Agora's own infrastructure dependencies that are always relevant. The term is descriptive, not a separate category.

### Active probe set computation

```
On `agora ralph` start (or `agora doctor`):

  bundled = [p for p in registry if p.tier <= installed_agora_version]
            # Tier 1 probes ship in v1, Tier 2 in v1.1, etc.

  active  = [p for p in bundled
             if p.detect_always
                OR p.id in seed.material.tech_stack
                OR p.detect_marker(cwd) is true]

  enabled = [p for p in active
             if p.id not in user_disabled_list]
            # user_disabled_list from .agora/config.toml [probes].disabled

  for p in enabled:
    result = p.check_with_cache(ttl=300_seconds)   # R3-A: 5-min TTL
    record(result)

  return Gate0Result(passed=all(r.ok), failures=[r for r in results if not r.ok])
```

### v1 probe registry (19 probes)

```yaml
# ─── Tier 1 (always shipped from v1.0) ───

# detect_always = true (universal)
- id: claude
  detect: always
  check: claude --print --output-format json "ping"
  pass_criterion: exit 0 + JSON parse
  fix: "Install Claude Code (https://claude.com/claude-code) OR set ANTHROPIC_API_KEY"

- id: node
  detect: always
  check: node --version
  pass_criterion: version >= 22
  fix: "Install Node 22+: nvm install 22 / volta install node@22"

- id: pnpm
  detect: always   # NOTE: pnpm is Agora's own package manager (per ADR-0001)
  check: pnpm --version
  pass_criterion: exit 0 + version >= 10
  fix: "npm install -g pnpm"

# detect_marker = true (project-specific)
- id: git
  detect_marker: .git/ exists
  check: git status --porcelain
  pass_criterion: exit 0
  fix: "git init OR resolve git error"

- id: gh
  detect_marker: .github/ exists OR git remote contains "github.com"
  check: gh auth status
  pass_criterion: exit 0 + token present
  fix: "gh auth login"

- id: vercel
  detect_marker: .vercel/project.json OR vercel.json exists
  check: vercel whoami
  pass_criterion: exit 0 + linked project (.vercel/project.json present)
  fix: "vercel login && vercel link"

- id: supabase
  detect_marker: supabase/config.toml exists
  check: supabase status (if linked) OR supabase projects list
  pass_criterion: exit 0
  fix: "supabase login && supabase link --project-ref <ref>"

- id: anthropic_api_key
  detect_marker: claude probe failed AND ANTHROPIC SDK in package.json
  check: process.env.ANTHROPIC_API_KEY present + matches /^sk-ant-/
  pass_criterion: env var present + format valid
  fix: "export ANTHROPIC_API_KEY=sk-ant-..."

# ─── Tier 1+2 (shipped from v1.0 — promoted from Tier 2) ───

- id: stripe
  detect_marker: package.json deps include "stripe" OR stripe/ config dir
  check: stripe config --list
  pass_criterion: exit 0 + test_mode key present
  fix: "stripe login OR set STRIPE_SECRET_KEY"

- id: clerk
  detect_marker: package.json deps include "@clerk/*"
  check: process.env.CLERK_SECRET_KEY present
  pass_criterion: env var present
  fix: "Set CLERK_SECRET_KEY in .env (https://dashboard.clerk.com)"

- id: openai_api_key
  detect_marker: package.json deps include "openai" OR project source mentions OpenAI
  check: process.env.OPENAI_API_KEY present + matches /^sk-/
  pass_criterion: env var present + format valid
  fix: "export OPENAI_API_KEY=sk-..."

- id: docker
  detect_marker: Dockerfile OR docker-compose.yml OR compose.yaml exists
  check: docker --version (daemon running optional, version is enough)
  pass_criterion: exit 0
  fix: "Install Docker Desktop or docker engine"

- id: railway
  detect_marker: railway.json OR railway/ dir OR ~/.railway/ dir
  check: railway whoami
  pass_criterion: exit 0
  fix: "railway login"

- id: posthog_key
  detect_marker: package.json deps include "posthog-*" or "@posthog/*"
  check: process.env.POSTHOG_PROJECT_KEY OR POSTHOG_API_KEY present
  pass_criterion: env var present
  fix: "Set POSTHOG_PROJECT_KEY in .env"

# ─── Tier 1+2+3-partial (promoted from Tier 3 by Sang's Stage 2-B.1 decision) ───

- id: gcloud
  detect_marker: gcloud config dir exists OR cloudbuild.yaml exists
                 OR app.yaml OR project source includes "@google-cloud/*"
  check: gcloud auth list --format=json
  pass_criterion: exit 0 + active account present
  fix: "gcloud auth login && gcloud config set project <id>"

- id: aws
  detect_marker: .aws/ dir OR package.json deps include "aws-sdk" or "@aws-sdk/*"
                 OR amplify.yml OR samconfig.toml
  check: aws sts get-caller-identity
  pass_criterion: exit 0 + identity returned
  fix: "aws configure OR set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"

- id: bun
  detect_marker: bun.lockb OR bun.lock exists
  check: bun --version
  pass_criterion: exit 0 + version present
  fix: "Install Bun: curl -fsSL https://bun.sh/install | bash"

- id: upstash
  detect_marker: package.json deps include "@upstash/*"
  check: env var present for the relevant Upstash service:
         UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
         OR QSTASH_TOKEN OR similar by detected pkg
  pass_criterion: at least one matching pair present
  fix: "Set Upstash credentials (https://console.upstash.com)"

- id: cloudflare
  detect_marker: wrangler.toml OR package.json deps include "@cloudflare/*" or "wrangler"
  check: wrangler whoami
  pass_criterion: exit 0 + email returned
  fix: "wrangler login"
```

**Total: 19 probes ship in v1.0.**

### Tier 3 deferred (community PR or v1.x patches)

Probes intentionally **not** in v1, awaiting concrete need:

```
sentry, sendon, rocketapi, kakao_oauth,
go_toolchain, rust_toolchain, python_toolchain,
mongodb, redis_cloud, fly_io, render_com,
discord_webhook, slack_webhook, ...
```

These appear in `agora doctor` as `⚠ {dep} probe not yet bundled — manual verify`
when their detect markers are found, but they do NOT block Gate 0.

### Caching [R3-A]

```
.agora/cache/gate0_results.json
{
  "version": 1,
  "cached_at": "2026-05-03T13:31:00Z",
  "ttl_seconds": 300,
  "results": [
    {"probe_id": "claude", "ok": true, "detail": "Max plan"},
    {"probe_id": "vercel", "ok": false, "detail": "Not authenticated", "fix": "vercel login"},
    ...
  ]
}
```

Cache hit logic:

```
on gate_0_run(probes):
  cache = load(.agora/cache/gate0_results.json)
  results = []
  for p in probes:
    if cache.has(p.id) AND cache.age(p.id) < 300_seconds:
      results.append(cache.get(p.id))   # use cached
    else:
      r = p.check()
      cache.set(p.id, r)
      results.append(r)
  save(cache)
  return results
```

**5-minute TTL rationale**:
- Most Ralph sessions are bursts of activity — running `agora ralph` 3-4 times in a few minutes (debug iterations, etc.). Cache catches these.
- Auth tokens that expire mid-session typically expire on much longer cycles (hours, days).
- Edge case: user runs `gh auth login` 30 seconds after a failed Gate 0. They'll wait up to 5 minutes for cache to expire OR run `agora doctor --refresh` to bust cache immediately.
- 5 minutes is balance: long enough to skip in burst sessions, short enough to catch most legitimate auth changes.

`agora doctor --refresh` (manual cache bust) is documented as the explicit override.

### User disable [R5-A]

`.agora/config.toml` schema for probe overrides:

```toml
[probes]
# Disable false-positive probes (e.g. dep detected but project doesn't actually use)
disabled = ["stripe"]

# Force-enable probes that detect missed (rare; usually material round catches)
forced = []
```

When a probe is in `disabled`:
- Skipped in Gate 0 results
- Shown in `agora doctor` output as `~ stripe (disabled in config)` — italic/dim style
- `agora doctor --include-disabled` runs them anyway, treats as warning rather than fail

When a probe is in `forced`:
- Runs even if `detect()` returns false
- Useful for tools the user knows they'll need but auto-detection missed

### `agora doctor` standalone usage

`agora doctor` reuses Gate 0's probe execution, but:
- Always runs against current `bundled ∩ active` set (no skip)
- Prints rich, multi-section output
- Does not write Gate 0 cache (separate concern)
- Supports flags: `--refresh` (bust cache), `--include-disabled`, `--json`

Example output:

```
$ agora doctor

Universal probes
  ✓ claude         Max plan, 240ms latency
  ✓ node           v22.10.1 (≥ 22 OK)
  ✓ pnpm           10.22.0

Project-specific probes (active)
  ✓ git            clean working tree
  ✓ gh             authenticated as srhee91
  ✓ vercel         linked to lazydevz-inc/screenflow
  ✓ supabase       linked to project_xyz
  ~ stripe         disabled in config (false-positive — see .agora/config.toml)
  ✗ posthog_key    POSTHOG_PROJECT_KEY missing
                   Fix: Set POSTHOG_PROJECT_KEY in .env

Probes detected but not bundled (community PR welcome)
  ⚠ sentry         (detect marker found: package.json deps include "@sentry/*")

19/20 probes available · 1 failure · 1 disabled
```

### Boundaries

- ❌ Auto-running probes that user disabled (R5-A enforces explicit opt-in via flag).
- ❌ Silently using cache > 5 minutes old (TTL enforced).
- ❌ Probes above current bundled tier (would need Agora upgrade first).
- ❌ Mutating user environment (probes are read-only).
- ❌ Running probes in parallel without timeout (each probe has 5-second hard timeout per ADR-0006).
- ❌ Bundling probes for niche services without concrete demand (Tier 3 community-driven path).

### Output consumed by

- **Ralph Loop start sequence**: blocks Ralph start when Gate 0 fails (unless `--skip-gate-0=<list>`).
- **`agora doctor`**: same probe execution, different output formatting + flags.
- **`.agora/cache/gate0_results.json`**: persists across `agora ralph` invocations.
- **Phase 0 auto-scan (Alignment Loop)**: marker detection logic shared with `detect_marker()` of probes — single source of truth for "this dep is in this project."

### Failure modes specifically guarded

- **Stale cache** (R3-A): 5-min TTL bounds the staleness window.
- **False-positive probe** (R5-A): user-disable mechanism preserves recoverability.
- **Niche service uncovered** (Tier 3 deferred): warning rather than block — `agora doctor` shows `⚠ probe not yet bundled` without breaking flow.
- **Probe code bug**: per-probe 5-second timeout (ADR-0006) caps damage from a hung probe.

---

## Open Questions for Stage 2-B

These resolve in Stage 2-B (full Ralph spec):

1. **Probe registry initial coverage** — which CLIs/tools ship with v1? Likely: gh, vercel, supabase, stripe, claude, node, git. Others added per demand.
2. **Drift score threshold** — what numeric value triggers Z1 vs Z2? (Currently: Z1 every fail, Z2 after 3 consecutive Z1 fails.)
3. **Critic persona selection** — which UI/UX and code-quality personas run for Gate 3 and 4? Project-overridable?
4. **Test regeneration trigger** — when do Playwright tests get regenerated vs. updated incrementally?
5. **Iteration cap** — should Ralph have a hard cap on iterations per session? (Default 10? 20? Or unlimited with token budget instead?)
6. **Parallel iterations** — can Ralph run multiple iteration paths in parallel and pick the best (Disputatio between paths)? Or strictly sequential?
7. **Bypass UX** — `--skip-gate-0=<list>` is documented; what about other gates? (Lean toward: only Gate 0 is bypassable; others have lower-cost equivalents but no full bypass.)

---

## Pre-Stage-2 Inputs from Sang (captured during interview)

### Input 1 — Quality is non-negotiable; velocity is a side-effect of AI capability (2026-04-27)

> *"내가 봤을 때 ai의 성능이 좋아지면 quality와 velocity 양쪽 다 자동으로 올라가. 그래서 우리는 quality에 베팅하면 됨. velocity는 따라온다."*

Operational rule: gate strictness defaults are **strict**. There is no option to "loosen gates for faster iteration." If gates are wrong, fix the gates; don't loosen them.

### Input 2 — SOLID-level technical quality is the senior-vs-non-senior differentiator (2026-04-27)

Gate 4's critic personas must include SOLID-discipline checks. This is what distinguishes Agora's output from a generic AI code generator's. A non-developer using AI can ship MVP; only a senior-quality system ships maintainable production code.

### Input 3 — UI/UX quality is taste-area, sync with user (2026-04-27)

Gate 3's checks must respect the project's design tokens (if defined) and remain minimal otherwise. Critics do not impose taste; they verify consistency with the project's stated taste.

### Input 4 — Pre-Ralph infra check is required (2026-04-27)

> *"ralph loop execution 하기 전에 인프라 관련 cli들이나 기타 사용하는 것들 중 계정 연동 확인같은거 필요한것들 있으면 미리 체크를 해주는게 필요할텐데"*

Gate 0 is the answer. ADR-0006 captures the full design.

---

*This document will be expanded during Stage 2-B with the resolved spec. The 5+1 gate structure and Z1/Z2 escalation are committed and unlikely to change. Probe registry, persona selection, and threshold tuning are the remaining open work.*
