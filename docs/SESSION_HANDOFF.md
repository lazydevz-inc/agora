# Session Handoff Protocol

> **Read this file FIRST at session start.** It is a curated index, not a
> comprehensive document. Following this protocol keeps style/quality
> consistent across sessions despite vast docs (~13,000 lines across
> 30+ files).

---

## 1. Read in this exact order at session start (~10-15 min)

1. **`CLAUDE.md`** — project overview, layer rules, tech stack, ADR index (~5 min)
2. **`docs/stage-6/NOTES.md`** — **start at the bottom**: read the most recent `### Stage 6-A.N — DONE` entry + the "Next task:" line at the very end (~5 min)
3. **`git log --oneline -15`** — last 15 commits show momentum + slice cadence
4. **The SPEC for the next slice only** (not all SPECs) — see §6 below for which doc per task type

**DO NOT** read in full at session start:
- `docs/loops/alignment-loop.md` (2,389 lines) — only the section for the current phase
- `docs/loops/ralph-loop.md` (1,765 lines) — only when implementing Ralph
- `docs/cli/spec.md` (3,383 lines) — only the Stage 3-B section for the current command
- All 5 philosophy concept docs — only the one for the philosopher you're implementing
- Stage 1-5 closed NOTES — only when researching "why was this decided?"

---

## 2. Live coding conventions (non-negotiable)

These are conventions **extracted from actual shipped code**, not just SPECs.
Violating them re-introduces bugs we already paid to find.

### TypeScript

- **Every `src/*.ts` file starts with `// SPEC: docs/<path>.md` header comment**
  pointing to the SPEC document it implements
- **`.js` extensions on relative imports** (NodeNext requires this)
  ```typescript
  import { foo } from "../config/loader.js";  // ✅
  import { foo } from "../config/loader";     // ❌ tsc errors
  ```
- **Source files use relative imports**, **test files use `@/*` alias**
  - tsc emits no path-alias rewrite; Node ESM resolver fails on `@/foo`
  - vitest config has `resolve.alias` so tests use `@/*`
- **`exactOptionalPropertyTypes` requires conditional spread** for optional fields:
  ```typescript
  // ❌ Type error: undefined not assignable
  return { foo: opts.bar ? "x" : undefined };
  // ✅ Conditional spread
  return { ...(opts.bar ? { foo: "x" } : {}) };
  ```
- **`as const satisfies Record<...>`** preserves narrow types — accessing
  optional fields requires cast widening:
  ```typescript
  const entry = ERROR_CATALOG[code] as ErrorCatalogEntry; // widen for .fix_key
  ```

### Architecture (Stage 5-A.6 R3-A)

- **Module exports return `Result<T, E>`** — internal helpers may throw
- **External library calls (Zod parse, child_process)** throw natively;
  caller wraps with `tryFrom()` at module boundary
- **CLI top-level uses `unwrap()`** for final emit
- **Errors:** all via `buildAgoraError(code, opts)` from ERROR_CATALOG —
  never `throw new Error("...")` for user-facing errors
- **User-facing strings:** all via `localized(key, ctx)` from i18n catalog —
  never inline strings at render sites
- **LLM calls:** all via `selectRuntime(cwd).runner.call(opts)` —
  never spawn `claude` directly
- **State persistence:** `loadState`/`saveState` from `src/state/` —
  atomic write, Zod validate

### Layer rules (Stage 5-A.1)

```
LAYER 0 (no inward src/ dep): shared/ result/ errors/{types,codes} i18n/ prompts/
LAYER 1 (depends on 0): config/ state/ llm/ probes/ critics/ philosophers/
LAYER 2 (depends on 0+1): alignment/ ralph/ handoff/ mcp/
LAYER 3 (top sink): cli/
```

Forbidden: `philosophers/*` → `llm/*` direct (orchestrators do that),
peer features (alignment/ ↔ ralph/), cli/ imported by anything.

---

## 3. DoD per slice (always run before commit)

```bash
pnpm typecheck    # ← must pass clean
pnpm lint         # ← warnings OK (cognitive complexity), errors not
pnpm test         # ← all tests pass
pnpm lint:locale  # ← en/ko keyset parity + ERROR_CATALOG xref + placeholder consistency
pnpm build        # ← dist/cli/index.js gets chmod +x
```

`pnpm verify` runs all 5 in order.

Manual verify per slice (capture output for commit message):
- TUI mode: `node dist/cli/index.js <command>`
- JSON mode: `node dist/cli/index.js <command> --json | jq`
- ko locale: `AGORA_LOCALE=ko node dist/cli/index.js <command>`

Interactive commands (use `@clack/prompts`) cannot be exercised via execSync;
note in commit "manual verification deferred to TTY run."

---

## 4. Conversational style with Sang

- **Korean primary** (Sang speaks Korean; technical terms in English when
  natural)
- **Terse, direct** — no marketing language, no "I'll now..." narration,
  no over-explanation
- **Mode B Q&A** for decision rounds:
  ```
  ## Q<N> (Stage X-A.N) — <topic>

  **왜 이 질문?** <2-3 sentences why this matters now>

  **Inherited inputs**: <bulleted prior decisions that constrain this>

  **추천 spec**: <code/algorithm sketch>

  ## 5개 결정 — R1~R5
  R1 — <topic>: A (제 추천) / B / C with rationale per option
  ...
  각 답해주세요. R1~R5.
  ```
- **Sang's "좋아 추천 방향으로 진행"** = accept all R1-R5 as recommended
- **Sang's deviation pattern**: "R3는 B로 가자" — deviate one rule, accept rest
- **Always commit after green verify; push immediately**
- **Update Stage NOTES Progress Log per slice** — surprises + lessons in detail
- **End-of-slice summary in chat**: brief table (files/tests/verify) + working
  commands status + 1-line "next?" question

---

## 5. Pitfalls discovered in past slices (don't repeat)

Surprises that cost real iteration time. Read once, internalize.

### Stage 6-A.3 (ClaudeRunner)
- **`claude --max-tokens` flag does NOT exist.** claude CLI uses `--effort` /
  `--max-budget-usd`. ClaudeCallOptions.max_tokens is informational only.
- **`claude --output-format json` emits a JSON ARRAY of streaming events**,
  not a single envelope. Parser must walk events backwards, find terminal
  `type: "result"` event, extract `.result` string.

### Stage 6-A.1 (foundations)
- **NodeNext + path alias `@/*` does NOT work at runtime** — tsc doesn't
  rewrite. Source files use relative imports with `.js` ext; tests keep
  `@/*` via vitest alias.
- **`exactOptionalPropertyTypes` + class with optional fields** requires
  conditional assignment in constructor:
  ```typescript
  if (fields.fix !== undefined) this.fix = fields.fix;
  ```
- **vitest needs explicit `resolve.alias`** in `vitest.config.ts` for `@/*` —
  tsconfig paths alone don't propagate.

### Stage 6-A.2 (probes)
- **Cached failures persist after fix** — Stage 4-A.4 R5-A caches
  deterministic failures for 5min TTL. After fixing a probe, run
  `agora doctor --refresh` (or `rm -rf .agora/cache`) to bust.
- **`exit 143` from spawn = SIGTERM kill** — interpreted as deterministic
  failure (e.g. "claude CLI not available") and cached. Use cheaper
  subprocess commands (e.g. `claude --version` not `claude --print "ping"`)
  to stay under 5s timeout.

### Stage 6-A.6 (Husserl)
- **Inline prompt** until prompt-library generator (Stage 5-A.4) ships.
  Each new philosopher repeats this pattern. Refactor to
  `renderPrompt("husserl:phase-minus-1-bracket", ctx)` when generator
  lands — one-line per philosopher.
- **HusserlUi injection pattern** allows testing without mocking
  @clack/prompts. Use this pattern for all interactive philosophers.
- **Conditional spread for `exactOptionalPropertyTypes`** — fourth
  occurrence locked in as canonical idiom.

### Stage 5-A.3 (runbook batch)
- **Batch commits without per-runbook review missed 3 critical drift items**
  (Plato's REQUIRED_FLOORS, atomicity criteria, ACNode shape).
  **Lesson**: spawn independent review agent BEFORE commit on philosophical
  content. Verified against authoritative SPECs (cited line numbers).

---

## 6. Which doc per task type

| Task | Primary SPEC | Secondary |
|------|--------------|-----------|
| Add philosopher | `docs/philosophers/runbooks/<name>.md` | `docs/philosophy/0X-<name>-...md` |
| Add probe | `docs/infra/probes.md` | `docs/loops/ralph-loop.md` Gate 0 section |
| Add CLI command | `docs/cli/spec.md` Stage 3-B.N | `docs/architecture/module-graph.md` |
| Add error code | `docs/infra/errors-and-telemetry.md` | `docs/architecture/locale-catalog.md` |
| Add locale string | `docs/architecture/locale-catalog.md` | — |
| Add module | `docs/architecture/module-graph.md` | layer rule + dependency direction |
| LLM call | `docs/infra/llm-integration.md` Stage 4-A.2 | retry policy + cache section |
| State persistence | `docs/loops/handoff.md` Stage 2-C.3 | + state schema |
| Config field | `docs/infra/config.md` | Zod schema first |
| Test convention | `docs/architecture/module-graph.md` R4-A | tests/ tree mirror |
| Why was X decided? | `docs/stage-N/CLOSED.md` for the relevant N | + ADR if architectural |

---

## 7. When in doubt

- **Default to less code, not more** — biased product, ADR-0001 minimalism
- **Default to defer rather than implement-now** — list in slice's
  Outstanding section
- **Ask 1 Mode B question rather than guess** — Sang's "추천 방향으로 진행"
  is fast; guessing is slow when wrong
- **Read the SPEC inline, not from memory** — even prior slices in this
  same session may have evolved the SPEC

---

## 8. Stage 6 specific: where are we right now?

(Update this section per session.)

**Last verified state at this writing**: Stage 6, 6 slices done.

**Working commands**:
```
agora --version  (6-A.1) — foundation, JSON envelope
agora doctor    (6-A.2) — 5 probes + Gate 0 cache
agora ping      (6-A.3) — first LLM call (ClaudeRunner)
agora status    (6-A.4) — state foundation
agora new       (6-A.5) — Phase 0 auto-scan
agora bracket   (6-A.6) — Husserl Phase −1 (first philosopher)
```

**Next slice candidates** (from latest Stage 6 NOTES "Next task"):
- (a) `agora resume` — phase orchestrator (Phase 1 intake / Phase 2 routing)
- (b) Phase 1 open intake
- (c) Aristotle Phase 2 telos round (second philosopher)
- (d) prompt-library generator (refactor inline prompts)
- (e) `src/config/` + TOML+Zod
- (f) Remaining 14 probes

**Strategic priority for daily-use**: alignment loop completion → Ralph loop
foundation. Path: resume → intake → Aristotle → Socrates → Plato → Y2 lock →
Ralph orchestrator + Gate 1 → Gate 2 → Aquinas Gate 3+4 → Gate 5.

Estimated total to v1 daily-use: **15-25 more slices**.

---

## 9. End-of-session protocol

Before stopping a session:

1. Make sure latest slice is committed + pushed (no uncommitted code)
2. Update Stage 6 NOTES.md "Next task:" line at the very end if you've
   thought about what's next
3. If you discovered a new pitfall, add it to §5 here
4. If you established a new convention (recurring pattern), add it to §2 here

---

*Maintained as conventions evolve. When this file disagrees with the code,
the code wins — and this file should be updated to match.*
