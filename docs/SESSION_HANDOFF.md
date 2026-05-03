# Session Handoff Protocol

> **Read this file FIRST at session start.** It is a curated index, not a
> comprehensive document. Following this protocol keeps style/quality
> consistent across sessions despite vast docs (~13,000 lines across
> 30+ files).

---

## 1. Context loading at session start (~30-40 min, deliberate)

> **Sang's explicit feedback**: "13,000줄 SPEC을 다 상세하게 읽어야
> 제대로된 맥락을 가져오게 되는거 아니야? 항상 보면 맥락을 다 로드
> 안해서 정신 못차릴 떄가 많던데."
>
> Under-contextualization is the dominant failure mode for new sessions.
> The fix is NOT "read less" — it's "read efficiently using Explore agent
> for the big SPECs so the main session keeps focus."

### Phase A — Read directly in main session (~15 min)

1. **`docs/SESSION_HANDOFF.md`** (this file) — start here, end of story
2. **`CLAUDE.md`** — project overview, layer rules, tech stack, ADR index, 작업 원칙
3. **All `docs/stage-{1,2,3,4,5}/CLOSED.md`** — these are DENSE summaries of every closed stage's decisions + rationale. Mandatory full read; ~120-275 lines each (~700 lines total). Far smaller than the SPECs themselves but captures every load-bearing decision.
4. **`docs/MANIFESTO.md`** + **`docs/north-star.md`** — Stage 1 thesis + 3-horizon direction (~300 lines combined). The "why" behind every later decision.
5. **`docs/stage-6/NOTES.md`** in full — current open stage; lessons + Outstanding sections per slice are critical for not repeating mistakes
6. **`git log --oneline -20`** — last 20 commits show momentum + slice cadence

That's ~1,500 lines of curated reading — fits comfortably in main context AND captures the project's load-bearing decisions.

### Phase B — Delegate big SPECs to Explore agent (per relevant area, ~15 min each)

The big SPECs are too large for main context BUT too important to skip.
**Use the Explore agent** (or general-purpose) to read them and return
focused briefs. Do this BEFORE starting any slice work in the relevant area.

For **alignment loop work** (Husserl/Socrates/Aristotle/Plato/Aquinas/
Phase 0-2/Y2 termination):
```
Spawn Explore agent with prompt:
  "Read docs/loops/alignment-loop.md (2,389 lines) and produce a
   structured brief covering: (1) phase ordering + termination gate;
   (2) every R-decision number → answer summary; (3) data shapes
   (DefendedFrame, FourCauses, ElenchedClaim, AC tree); (4) F1-F8
   forbidden patterns verbatim; (5) the 'observed Ouroboros failure
   modes' section. Aim for ~600 words. Cite section anchors so I can
   re-read targeted bits."
```

For **Ralph loop work** (gates 0-5, critics, Z1/Z2):
```
Spawn Explore agent with prompt:
  "Read docs/loops/ralph-loop.md (1,765 lines) and produce a structured
   brief covering: (1) Gate 0-5 contracts; (2) the 19-probe registry +
   tier model; (3) Aquinas Disputatio per-objection ruling format
   (Stage 2-B.3); (4) drift_score Stage 2-B.4 formula; (5) Z1/Z2
   escalation; (6) iteration cap + parallel architecture per ADR-0008.
   Cite section anchors. ~700 words."
```

For **CLI work** (any new command, flag, output format):
```
Spawn Explore agent with prompt:
  "Read docs/cli/spec.md (3,383 lines) and produce a structured brief
   covering: (1) Stage 3-A output framework + universal envelope shape;
   (2) Stage 3-A.3 global flags + precedence + forbidden combinations;
   (3) Stage 3-B per-command sections — for command <name> give me the
   full sub-section. Cite section anchors. ~700 words plus the relevant
   3-B sub-section verbatim."
```

For **philosopher work**:
```
Spawn Explore agent with prompt:
  "Read docs/philosophers/runbooks/<name>.md AND docs/philosophy/0X-<name>-...md
   end-to-end and produce: (1) the 12-section runbook contract verbatim
   for input/output/quality bar/forbidden/test contract; (2) the concept
   doc's failure modes (F-<name>-N) verbatim; (3) the canonical prompt
   text from runbook §4 verbatim. ~800 words. I'll be implementing this
   philosopher in TypeScript."
```

### Why this works

- Main session keeps a clean ~30k-token context window for actual work
- Big SPECs ARE absorbed in full — just by Explore agent's separate context
- Briefs come back ~600-800 words, fit easily in main context
- Section anchors let main session re-fetch specific snippets when needed
- Pattern matches what Sang did mid-Stage-5-A.3 review (worked perfectly)

### What's already INCLUDED in Phase A (don't delegate these)

- All ADRs (~700 lines total) — small enough to read directly when cited
- All philosopher runbooks individually (~365-547 lines each) — read when
  implementing that philosopher
- Infra SPECs individually (install/config/probes/llm-integration/errors-and-telemetry,
  ~340-770 lines each) — read the relevant one fully when working there
- Architecture SPECs (module-graph/runbook-template/prompt-library/locale-catalog/result-type,
  ~470-750 lines each) — read the relevant one fully

### Anti-patterns

- ❌ Read only NOTES.md and skip CLOSED.md → miss the cross-cutting decisions
- ❌ Read only the section relevant to current slice → miss the F-rules
  that constrain ALL slices
- ❌ Read big SPECs in main session → blow context before any work
- ❌ Skip Explore-agent brief and "wing it" → repeat Stage 5-A.3 type drift

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

- **Korean primary** for chat; **English** for code comments / commit
  messages / SPEC documents (Sang reads both fluently — Korean conveys
  warmth + speed for ack turns; English locks technical precision in
  the artifact)
- **Terse, direct** — no marketing language, no "I'll now..." narration,
  no over-explanation. Sang prefers 1-2 sentences over a paragraph.
- **Acknowledge briefly, then act**: "좋아." / "확인." / "맞는 지적." +
  one-line summary of what's about to happen.
- **End-of-turn = call to action OR brief result + next question**.
  No trailing summaries that just restate the diff.

### Sang's response shorthands

| Sang says | Means |
|-----------|-------|
| "좋아. 추천 방향으로 진행" / "추천 방향으로 모두 진행" | Accept ALL R1-R5 as recommended |
| "R3는 B로 가자" / "R5는 C로 가면 좋겠어" | Deviate that one R; accept others as recommended |
| "ok" / "ok continue" / "다음" / "진행" | Continue with whatever was just proposed |
| "맞는 지적" / "정확함" | The pushback is valid; course-correct accordingly |
| "그래서 [...]" | Asking for clarification or summary; explain concisely |
| "전혀 맥락을 못짚고 있는거같아" | Stop. Read the actual history. Re-ground. |
| "수고했어" | Slice/round done. Wait for next instruction. |

Always exact-match for these — they have specific meanings that took the
prior session real iteration to learn.

### Mode B Q template — copy-paste this exactly

When proposing a sub-question for Mode B (technical decisions Sang
delegates), use this LITERAL template:

```markdown
## Q<N> (Stage X-A.N) — <topic in Korean>

**왜 이 질문?**
<2-4 sentences in Korean: why now, what's at stake, what's left undecided>

**Inherited inputs** (이번 round가 reopen 못 하는 것들):
- <bullet>: <source SPEC + R-rule citation>
- <bullet>: <...>
- ADR-XXXX / Stage X-A.N R-Z citations explicit

대부분 기술 결정 → Mode B.

---

**추천 spec — <one-line summary in Korean>**

<TypeScript interface OR pseudocode OR file-tree sketch>

<2-3 paragraphs in Korean explaining: how it works, what it unblocks,
what it doesn't do (defer)>

---

## 5개 결정 — R1~R5

**R1 — <decision name in Korean>**

| 옵션 | 동작 |
|------|------|
| **R1-A (제 추천)** | **<recommendation>**. <2-3 line rationale in Korean> |
| R1-B | <alternative>. <why rejected — 1-2 lines> |
| R1-C | <alternative>. <why rejected — 1-2 lines> |

**R2 — <decision name>**

(same table format)

... (R3, R4, R5)

---

각 답해주세요. R1~R5.
```

**Conventions inside Mode B template**:
- Always **5 decisions** (R1-R5) — fewer feels under-thought; more is
  cognitive overload. If 5 doesn't fit, split into two slices.
- **Each R** has 3-4 options labeled `R1-A` / `R1-B` / `R1-C` / `R1-D`
- **Recommended option always FIRST + bolded**: `**R1-A (제 추천)**`
  + bolded recommendation text inside the cell
- **Why rejected** — 1-2 sentence rationale per non-recommended option
  in the right column
- "Mode B" = technical decisions Sang delegates. "Mode A" = decisions
  needing Sang's domain expertise (philosophical content, taste calls).
  Mode A uses recommended options + free input invited; Mode B uses
  single recommendation + alternatives.

### Mode A Q template — for philosophical / taste content

Use when Sang has the domain expertise (e.g. philosopher runbook content,
manifesto wording, philosophical method choices):

```markdown
## Q<N> (Stage X-A.N) — <topic>

**왜 이 질문?** <why ask Sang specifically>

**내가 본 옵션들** (각 trade-off):
A. <option> — <consequence>
B. <option> — <consequence>
C. <option> — <consequence>

자유 입력도 환영. 지금 이 결정의 핵심은 [...] 인 것 같음.
```

### Forbidden patterns in Q presentation (F-rules from Stage 1)

When asking Sang anything, NEVER:
- F1: Output non-English without locale verification (한글 깨짐)
- F2: Ask without "**왜 이 질문?**" purpose label
- F3: Abstract questions about abstract concepts (always concrete examples)
- F4: Ignore prior context (must build on what Sang already said)
- F5: Force ranking on compound input ("rank these 3 needs")
- F6: Drill into single-attribute when multi-dim is possible
- F7: Single proposal without comparison alternatives ("is X good?")
- F8: Free input as a labeled option ("R_free: 자유" — confusing)

These came from Stage 1 live interview. Verify your Q against this list
before sending.

### Per-slice protocol

1. **At slice start**: Mode B Q with template above (unless Sang explicitly
   said "skip the question, just do X")
2. **Sang accepts** with shorthand → start implementing immediately
3. **During implementation**:
   - Every src/ file gets `// SPEC: docs/<area>/<file>.md` header
   - Pause to update messages/{en,ko}.json when adding any user-facing
     string (don't defer locale)
   - Run `pnpm typecheck` mid-implementation if doing big refactor
4. **After implementation**:
   - Run `pnpm verify` (typecheck + lint + lint:locale + test + build)
   - If lint:fix changes formatting, re-read changed files (system
     reminder will note this)
   - Manual verify TUI + JSON + ko outputs (capture for commit message)
5. **Commit** with template (see §10 below)
6. **Push immediately** — never accumulate uncommitted slices
7. **End-of-slice chat summary** with template (see §10)
8. **Update Stage NOTES Progress Log entry** before committing — this
   is the artifact next session reads

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
5. Update §8 Stage 6 snapshot (current commands, slice count)

---

## 10. Concrete templates (copy-paste these exactly)

### 10.1 End-of-slice chat summary (after commit + push)

```markdown
Commit `<hash>` 푸시됨. **Stage 6-A.<N> 완료**.

| 카테고리 | 결과 |
|---------|------|
| 신규/수정 파일 | <count>개 (<short list>) |
| 코드 라인 | ~<count> 신규 |
| Tests | **<pass>/<total>** (<file count> 파일; <delta from prior>) |
| Verify | typecheck ✓ / lint ✓ / lint:locale ✓ / test ✓ / build ✓ |

**진짜 동작 확인** (<context — TUI, JSON, ko>):
\```
$ <command>
<actual output captured>
\```

**Surprises** (NOTES.md에 기록):
1. <surprise + 1-line resolution>
2. <surprise + 1-line resolution>

**Stage 6 status: <slice count> slices done.** 동작하는 명령:
`agora --version` / `doctor` / `ping` / `status` / `new` / `bracket` / <new>.

다음 slice 후보 (continuation):
- (a) <option> — <leverage rationale>
- (b) <option>
- (c) <option>

자동 진행할까 (continue)?
```

### 10.2 Slice commit message template

```
<type>(stage-6-a.<N>): <topic> — <one-line summary>

<paragraph: what this slice ships + auto-selected rationale + bridges>

<Decision summary if Mode B was used:>
Five decisions accepted (R1-R5 recommended):
  R1-A: <decision>
  R2-A: <decision>
  ...

Files shipped:
  src/<area>/<file>.ts (LAYER N — <role>):
    <2-3 line description of what it does>
  src/<area>/<file>.ts:
    <description>
  ...

  src/cli/index.ts:
    <description of dispatch additions>

  messages/en.json + ko.json:
    +<N> keys × 2 locales = <2N> strings:
      <namespace>.<key>
      ...

Tests (<N> new files; total <X> files / <Y> tests, was <pX>/<pY>):
  tests/unit/<area>/<file>.test.ts (<N> tests):
    - <test description>
    - <test description>
  tests/integration/<file>.test.ts (<N> tests):
    - <test description>

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (<warnings if any>)
  pnpm test     ✓ <X> files, <Y> tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ <command>
    <captured output>
    ...

Surprises encountered (full detail in Stage 6 NOTES Progress Log):

1. <surprise title>:
   <2-3 sentences: what happened + how resolved>

2. <surprise title>:
   <description>

Lessons / observations:
- <lesson 1>
- <lesson 2>

Outstanding (intentional defer):
  - <item>: <when it'll be addressed>
  - <item>: <when it'll be addressed>

Stage 6 status: <count> slices done. <one-line milestone>.

Verification:
  pnpm verify ✓
```

### 10.3 Stage NOTES.md Progress Log entry template

```markdown
### Stage 6-A.<N> — DONE (yyyy-mm-dd)

**<one-line topic + slice character>** Auto-selected per Sang's "<continue
phrase>". Bridges <prior slice> → <next slice direction>.

<Optional: simplification vs SPEC paragraph if any deviation>

<Optional: SPEC drift note if inline patterns awaiting refactor>

Five decisions accepted (R1-R5 recommended):
- R1-A: <decision summary in Korean>
- R2-A: <decision summary>
- R3-A: <decision summary>
- R4-A: <decision summary>
- R5-A: <decision summary>

Files shipped:

src/<area>/<file>.ts (LAYER N):
  <Detailed description of types, functions, key constants. ~5-10 lines.
   Include relevant SPEC R-rule citations.>

src/<area>/<file>.ts:
  <Detailed description.>

src/cli/index.ts:
  <Dispatch additions.>

messages/en.json + ko.json:
  +<N> keys × 2 locales = <2N> strings:
    <namespace>.<key1>
    <namespace>.<key2>
    ...

Tests (<N> new files; total <X> files / <Y> tests, was <pX>/<pY>):

tests/unit/<area>/<file>.test.ts (<N> tests):
  - <test description>
  - <test description>
  ...

tests/integration/<file>.test.ts (<N> tests):
  - <test description>
  ...

DoD verification:
  pnpm typecheck ✓
  pnpm lint     ✓ (<warnings if any>)
  pnpm test     ✓ <X> files, <Y> tests
  pnpm lint:locale ✓
  pnpm build    ✓
  Manual:
    $ <command + actual output>
    ...

  <Manual verification deferred to ... if interactive>

Surprises encountered + decisions made:

1. **<surprise title>**:
   <Multi-sentence detail. What happened, why it surprised, how resolved,
    what defer/Rev needed.>

2. **<surprise title>**:
   <Detail.>

Lessons / observations:
- <lesson with rationale>
- <lesson with rationale>

Outstanding (intentional defer):
  - <item>: <when/why it'll be addressed>
  - <item>: <when/why it'll be addressed>
  - <item>: <when/why it'll be addressed>

Stage 6 status: <count> slices done. <Working commands list updated.>

Next task: Stage 6-A.<N+1> — likely candidates:
  (a) <option> — <leverage rationale>
  (b) <option>
  (c) <option>
```

### 10.4 Mode B Q presentation in chat — see §4 above

The literal template lives in §4. Don't deviate from it without reason —
the structure (왜 이 질문 → Inherited → 추천 spec → R1-R5 → 답해주세요)
is what Sang's eye is trained to scan.

---

*Maintained as conventions evolve. When this file disagrees with the code,
the code wins — and this file should be updated to match.*
