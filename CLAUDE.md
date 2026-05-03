# Agora — AI Context Document

> 이 문서는 AI(Claude)가 프로젝트를 정확하게 이해하기 위한 Single Source of Truth입니다.
> **이 문서에 없는 것은 구현하지 마세요. 이 문서와 다른 것은 버그입니다.**

---

## 작업 원칙

### 설계 철학

- **Best Practice 우선**: SOLID, DRY, KISS, YAGNI, SoC 원칙을 따르고, 최선의 해결책을 찾는다
- **확장성/유연성 검토**: 현재 요구사항만 해결하되, 향후 확장이 막히지 않는 구조인지 확인한다
- **기존 코드 재사용**: 새로 만들기 전에 프로젝트 내 기존 유틸리티/패턴/컴포넌트를 먼저 탐색한다
- **커뮤니케이션**: 작업 설명 시 항상 **개요(왜, 무엇을)**를 먼저 제시하고, 그 후 **상세 구현 계획**을 전개한다
- **Biased over un-biased**: 유저는 결정을 내리고 싶어하지 않는다. 베스트 옵션을 골라서 제공하라. 내부 코드는 유연하게, 외부 인터페이스는 단호하게

### 절대 규칙

- **추측을 사실처럼 말하지 말 것.** 가설은 반드시 검증 후 결론
- **기존 아키텍처 임의 변경 금지**
- **요청 범위 밖 리팩토링 금지**
- **`.env` 파일 커밋 금지**
- **기존 코드 재사용 우선** — 새로 만들기 전에 프로젝트 내 기존 패턴 먼저 탐색
- **로컬에서 반드시 테스트 후 push** — 빌드 실패 상태로 push 금지
- **새 패키지/의존성 추가 금지** (허락 없이) — Agora는 의존성 미니멀리즘
- **5명의 철학자 외 추가 금지** (허락 없이) — 사고 모듈은 의도적으로 제한된 집합 (ADR-0007 / 향후)
- **ADR 없이 architectural change 금지** — 모든 구조적 결정은 `docs/architecture/decisions/`에 ADR로 기록 (ADR-0003 참조)
- **Stage 게이트 무단 통과 금지** — 다음 Stage 진입은 항상 명시적 승인 필요 (ADR-0004 참조)

### 완료 기준 (DoD)

1. `pnpm typecheck` 에러 없음
2. `pnpm lint` 통과
3. `pnpm test` 모든 테스트 통과
4. `pnpm build` 빌드 성공 (해당되는 경우)
5. CLI에서 실제 명령어가 의도한 대로 동작 (수동 검증)
6. 기존 기능 regression 없음

### 작업 프로세스

#### 1단계: 문제/요청 이해

- 문제 현상 명확히 기술 (에러 메시지, 로그, 재현 조건). 실제 코드 확인.
- 불분명한 부분이 있으면 사용자에게 질문

#### 2단계: 원인 분석 (버그의 경우)

- 가설 수립 → 검증 → 확정. 검증 없이 원인 단정 금지.
- ❌ "이게 원인입니다" → ✅ "가설: ~일 수 있습니다. 검증해보겠습니다."

#### 3단계: 해결책 제시

- 해결 방안 + 영향 범위 분석. 사용자 선택 대기.

#### 4단계: 작업 계획 보고 (코드 작성 전 필수)

```
📋 작업 계획 보고

🔍 문제 상황 — 어떤 상황에서 어떤 증상이 발생하는지
🎯 목표 — 완료 후 기대 상태
🔬 원인 분석 — 검증된 원인 (추측은 "가설"이라고 명시)
📁 변경 예정 파일
| 파일 경로 | 변경 내용 | 비고 |
⚡ Before → After
🔗 관련 ADR — ADR 번호 또는 "해당 없음"

이대로 진행해도 될까요?
```

#### 5단계: 실행

- 승인받은 계획대로 진행. 예상 밖 상황 → 중단 후 보고.

#### 6단계: 검증 → 완료

- DoD 통과 후에만 "완료" 선언. 실패 시 문제 보고.

### 이전 세션 작업 이어받을 때

1. "완료됐다"는 요약을 그대로 믿지 말 것
2. 실제 코드 상태를 직접 확인 후 진행
3. `docs/architecture/decisions/`의 ADR 목록을 먼저 훑어 현재 합의 상태 파악
4. `docs/stage-1/notes.md`로 Stage 1에서 확정된 핵심 합의 빠르게 파악

---

## 프로젝트 개요

**Agora = 고대 철학자들이 모이는 광장. AI 코딩 에이전트의 alignment harness.**

> - License: MIT (provisional, ADR-0007 — Q00의 Ouroboros 저작권 보존, CREDITS.md 참조)
> - Status: **Stage 6 (Implementation — vertical slices) — 진행 중**
> - Stage 1 closed: 2026-04-27 (`docs/stage-1/CLOSED.md`, tag `v0.1.0-stage-1`)
> - Stage 2 closed: 2026-05-03 (`docs/stage-2/CLOSED.md`, tag `v0.2.0-stage-2`)
> - Stage 3 closed: 2026-05-03 (`docs/stage-3/CLOSED.md`, tag `v0.3.0-stage-3`)
> - Stage 4 closed: 2026-05-03 (`docs/stage-4/CLOSED.md`, tag `v0.4.0-stage-4`)
> - Stage 5 closed: 2026-05-04 (`docs/stage-5/CLOSED.md`, tag `v0.5.0-stage-5`)
> - Repo: github.com/lazydevz-inc/agora (private indefinitely, ADR-0002 + ADR-0007 — public-release는 명시적 전략 결정 시에만)
> - Package: `@lazydevz/agora` (npm 미공개)

### 한 줄 정의

> **Agora is the alignment layer between human intent and AI execution — and it grows stronger as AI grows stronger.** (north-star.md)

Claude Code(또는 다른 AI 코딩 에이전트) 위에 올라가는 spec-first **Human-AI Alignment (HAA)** 도구. **Alignment Loop**로 인간 의도와 AI 스펙의 격차를 ~0%로 좁히고, **Ralph Loop**로 5개 검증 게이트를 모두 통과할 때까지 반복 구현한다.

### 핵심 통찰 (MANIFESTO.md 요약)

- **AI는 execution을 정복했다 → 인간에게 남는 영역은 *taste***
- **Taste는 인간 내면에 있고, 그것을 articulate 하는 검증된 기술이 *철학***
- **0.9^10 ≈ 34.87%**: alignment 격차는 매 iteration마다 기하급수적으로 누적된다. 그래서 Ralph 시작 *전에* alignment를 잡아야 한다
- **Linux 커널 → 디스트로** 비유: AI가 더 좋아지면 Agora도 자동으로 더 강해짐 (anti-fragile)

### 핵심 차별화 (vs Ouroboros)

| 영역 | Ouroboros | Agora |
|------|-----------|-------|
| CLI | 15+ 서브커맨드 | 단일 진입점 `agora` + 자동 흐름 안내 (≤7 서브커맨드 hard cap) |
| 설정 | global-only | per-project 기본 + global fallback |
| Brownfield/Greenfield | 사용자가 명시 | 자동 감지 |
| 인터뷰 UX | 자유 입력만 | 추천 옵션 + 자유 입력 (전문성 인식 분기) |
| 평가 | 다수결 투표 | Aquinas Disputatio (논점별 판결) |
| 검증 | 3단계 (mechanical/semantic/consensus) | **5단계 게이트** (Det / FuncQA / UI/UX / TechQ / **Alignment Check**) |
| 철학 | 표면적 차용 | 5명 1급 시민 모듈 + 6번째 추가는 ADR 필수 |
| 언어/스택 | Python | TypeScript (CLI ↔ TUI ↔ GUI 코드재사용) |
| Customization | 광범위한 옵션 | Biased — 베스트 옵션을 그냥 줌 |
| Claude 인증 | Agent SDK (API 과금) | **`claude --print` subprocess (Max 구독 사용)** (ADR-0005) |

---

## 5명의 철학자 (1급 시민 모듈)

`src/agora/philosophers/` 에 각각 1개 모듈로 존재 예정. 6번째 추가는 의도적으로 어렵게 만들어져 있음 (`docs/philosophy/06-*.md` 작성 + ADR 필수).

| # | 철학자 | 역할 | 적용 위치 | 상세 문서 |
|---|--------|------|----------|----------|
| 1 | **Husserl** | Epoché — 전제 괄호치기 | Alignment Loop **Phase −1** (선택적) | `docs/philosophy/01-husserl-epoche.md` |
| 2 | **Socrates** | Elenchus — case-probing → aporia | Alignment Loop **Phase 2 conductor** | `docs/philosophy/02-socrates-elenchus.md` |
| 3 | **Aristotle** | 4원인론 (telos primary) | Alignment Loop **Phase 2 구조** | `docs/philosophy/03-aristotle-four-causes.md` |
| 4 | **Plato** | Divided Line + Dihairesis | **종료 게이트** + **Alignment→Ralph 인계** | `docs/philosophy/04-plato-divided-line-and-dihairesis.md` |
| 5 | **Aquinas** | Disputatio (Videtur→Sed contra→Respondeo→Ad singula) | Ralph Loop **Gate 3 + 4** | `docs/philosophy/05-aquinas-disputatio.md` |

메타 문서: `docs/philosophy/00-why-philosophy.md` (왜 5명, 왜 철학)

---

## 두 루프 (Two-Loop) 구조

### Alignment Loop (구 Interview Loop)

> Goal: 인간 의도와 AI 스펙의 격차를 ~0%로 좁힘 — **HAA (Human-AI Alignment)**

```
Phase −1 (선택): Husserl Epoché — 전제 괄호치기
Phase 0 (자동):  폴더 스캔 → brownfield/greenfield 감지 → MD 파일 흡수
Phase 1 (개방): 모든 컨텍스트 한 번에 수집
Phase 2 (반복): 다철학자 라운드 (Aristotle 구조 + Socrates 검증 + Plato 성숙도)
종료 게이트:    Y2 (유저 동의 + 구조 검증) + Y3 (preview 퀄리티 OK 시)
산출:           X3 시드 (구조 시드 + 산문 요약, 시드가 SoT)
```

상세: `docs/loops/alignment-loop.md` (Stage 2-A 진행 중)

### Ralph Loop

> Goal: 시드 만족까지 검증 게이트 통과해 반복 구현

```
매 iteration 검증 게이트 (5개, 모두 통과 필요):
  Gate 0:  Pre-flight Infra Check       (ADR-0006 신규)
  Gate 1:  Deterministic                 (lint, typecheck, build, test)
  Gate 2:  Functional QA                 (Playwright CLI tests)
  Gate 3:  UI/UX Quality                 (Aquinas Disputatio)
  Gate 4:  Technical Quality             (Aquinas Disputatio)
  Gate 5:  Alignment Check               (output ↔ seed telos)

게이트 5 실패 시:
  Z1 — 다음 iteration에서 자가보정
  Z2 — N회 실패 누적 시 mini Alignment Loop 재진입 (유저 확인)
종료: 모든 게이트 통과 + 유저 만족
```

상세: `docs/loops/ralph-loop.md`

---

## Claude 인증 + 3 I/O 모드 (ADR-0005)

**Claude Agent SDK는 Max 구독 사용 못 함**. 따라서:

- **1차 (primary)**: `claude --print --output-format json` subprocess → Max 구독 사용
- **2차 (fallback)**: Claude Agent SDK + `ANTHROPIC_API_KEY` (Claude Code 미설치 환경)
- **시작 시 자동 감지** → 안전한 경로 선택

Agora는 3가지 I/O 모드를 지원:

| Mode | Trigger | I/O | LLM 호출 |
|------|---------|-----|---------|
| 1. Interactive TUI | 터미널에서 `agora` | `@clack/prompts` | `claude --print` (Max) |
| 2. JSON / Scripted | Claude Code Bash, CI | stdin/stdout JSON | `claude --print` (필요 시만) |
| 3. MCP Server | Claude Code 안에서 호출 | MCP protocol | **없음** (호스트 세션이 LLM) |

Mode 3는 nested LLM 낭비 방지. Mode 2/3에서는 Agora 자체가 LLM 호출하지 않고 *구조 + 의미 + 게이트 검증*만 제공.

---

## 기술 스택

| 영역 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Language | TypeScript | ≥ 5.9 strict | `tsconfig.json` 참조 |
| Runtime | Node.js | ≥ 22 LTS | `engines.node` |
| Package manager | pnpm | 10 | `packageManager` 필드 |
| CLI framework | commander | 14 | 검증된 표준 |
| Interactive UI | @clack/prompts | 0.11 | 모던, 미니멀 |
| Colors | picocolors | 1 | tiny |
| Dev runtime | tsx | 4 | 즉시 TypeScript 실행 |
| Build | tsc | (devDep) | dist/로 빌드 |
| Test | vitest | 3 | fast, ESM 네이티브 |
| Lint + Format | biome | 2 | 단일 도구 |
| Browser QA (Stage 4) | Playwright CLI | TBD | 결정적 실행 (Playwright MCP 미사용) |
| Claude 호출 (1차) | `claude` CLI subprocess | (system) | Max 구독 사용 (ADR-0005) |
| Claude 호출 (2차) | `@anthropic-ai/claude-agent-sdk` | TBD | API 키 필요 (fallback) |
| MCP (Stage 4) | `@modelcontextprotocol/sdk` | TBD | export 모드 |

ADR-0001, ADR-0005 참조.

---

## 프로젝트 구조

> **Canonical file-tree spec**: `docs/architecture/module-graph.md`
> (Stage 5-A.1, Accepted 2026-05-03). Stage 6+ implementation은 그 SPEC을 따른다.
> `src/agora/*` namespace prefix는 Stage 5-A.1에서 폐기됨 — `src/<feature>/` 직접 사용.

```
agora/
├── README.md                    # 비전 + 빠른 시작
├── CLAUDE.md                    # 👈 이 파일
├── LICENSE / CREDITS.md / MANIFESTO.md
├── package.json / tsconfig.json / tsconfig.build.json / biome.json / vitest.config.ts
├── docs/
│   ├── north-star.md            # 3-horizon (Stage 1)
│   ├── architecture/
│   │   ├── module-graph.md      # 👈 canonical src/ tree + dependency rules (Stage 5-A.1)
│   │   ├── prompt-library.md    # (Stage 5-A.4 예정)
│   │   └── decisions/           # ADR 디렉토리 (immutable historical record)
│   │       └── 0000-template.md ~ 0008-...md
│   ├── stage-{1..N}/CLOSED.md   # 각 stage 게이트 종료 기록 (immutable)
│   ├── stage-{N}/NOTES.md       # active stage 진입 plan + progress log
│   ├── philosophy/              # 5명 철학자 사상의 SW적 적용 (Stage 1)
│   ├── philosophers/runbooks/   # 5 runbooks (Stage 5-A.3 예정)
│   ├── loops/                   # alignment-loop + ralph-loop + handoff (Stage 2)
│   ├── cli/                     # CLI 표면 (Stage 3)
│   └── infra/                   # install + llm-integration + config + probes + errors-and-telemetry (Stage 4)
├── messages/                    # 로케일 카탈로그 (Stage 6 채움)
│   ├── en.json
│   └── ko.json
├── src/                         # 👇 module-graph.md SPEC 따름 (Stage 5-A.1)
│   ├── cli/        # entry + render + flags + commands/ × 7
│   ├── alignment/  # Alignment Loop (Stage 2-A)
│   ├── ralph/      # Ralph Loop (Stage 2-B + ADR-0008)
│   ├── handoff/    # Alignment → Ralph (Stage 2-C)
│   ├── philosophers/   # husserl/socrates/aristotle/plato/aquinas (5 modules)
│   ├── critics/    # Aquinas critic personas × 10 (Stage 2-B.3)
│   ├── probes/     # Stage 4-A.4 (types/runner/registry/cache/markers + definitions/× 19)
│   ├── llm/        # Stage 4-A.2 (runner/cli-runner/sdk-runner/cached-runner/cache/selection)
│   ├── config/     # Stage 4-A.3 (schema/loader/env/explain)
│   ├── mcp/        # Stage 4-A.5 (server/tools/host-action)
│   ├── errors/     # Stage 4-A.6 (types/codes/build/crash/handlers)
│   ├── i18n/       # Stage 3-A.1 + 4-A.6 (index/catalog)
│   ├── state/      # .agora/state.json (reader/writer/bypass)
│   ├── result/     # Result<T,E> (Stage 5-A.6)
│   └── shared/     # cross-cutting utils (path/io/fingerprint)
└── tests/
    ├── unit/        # mirrors src/ structure 1:1
    ├── integration/ # cross-module flows
    └── fixtures/    # synthetic projects + canonical seeds + llm-responses
```

상세 dependency rules (LAYER 0~3, forbidden imports, same-layer cross-feature 규약)는
`docs/architecture/module-graph.md` 참조. 그 SPEC이 file paths의 single source of truth.

---

## 핵심 아키텍처 규칙

### CLI 설계 (요약 — Stage 3에서 상세화)

- **진입점은 `agora` 단 하나**. 사용자는 다른 명령어를 외울 필요 없음
- **자동 다음 단계 안내**: 매 명령 후 "다음에 할 수 있는 것" 자동 제안
- **서브커맨드 ≤ 7개**: hard cap (현재 예상: `agora`, `new`, `resume`, `seed`, `ralph`, `status`, `doctor`)
- **모든 옵션은 reasonable default** — 플래그 없이 그냥 동작해야 함
- **AI 에이전트 친화**: 모든 명령은 `--json` 출력 모드 지원
- **비대화형(non-interactive) 모드**: CI/CD에서 사용 가능

### 설정 우선순위

```
.agora/config.toml (project)  ← 최우선
~/.agora/config.toml (global) ← fallback
hardcoded defaults            ← 최후
```

`.agora/` 디렉토리는 git 추적 가능 (팀 공유). `.agora/cache/`, `.agora/logs/`만 gitignore.

`.agora/` 내부 구조 (Stage 1 결정):
```
.agora/
├── seed.md          # 인간이 읽는 시드 (X3의 산문 부분)
├── seed.json        # 기계 친화 구조 (X3의 구조 부분, 충돌 시 우선)
├── state.json       # 현재 phase, 진행률, 마지막 활동
├── history/         # 과거 alignment + ralph 라운드 이력
├── cache/           # gitignored
└── logs/            # gitignored
```

### Brownfield/Greenfield 자동 감지

- `.git` + 코드 파일 존재 → brownfield
- 빈 디렉토리 또는 신규 → greenfield
- 사용자에게 묻지 않음. 잘못 감지 시 명시적 override 가능

### Per-folder 격리 (P5+ rule)

- **폴더 간 컨텍스트 누출 절대 금지** — 한 프로젝트의 alignment seed가 다른 프로젝트로 새지 않음
- 동일 폴더 내 다회 사용 시 컨텍스트 누적 환영
- 한 폴더 = 한 프로젝트 = 한 Agora 시스템

### 데이터 패턴

- TypeScript에서 immutable 강제는 `readonly` + `as const` + zod schema 활용
- zod 도입은 Stage 4-A.3에서 결정됨 (config가 첫 사용처, `docs/infra/config.md`). 도메인 모델 zod 적용은 Stage 5+에서 자연스럽게 확장.
- 비동기는 native Promise / async-await
- Result<T, E>는 Stage 5-A.6에서 **도입 결정됨** — `src/result/`. 모듈 boundary는 Result return, 내부 helper는 throw 자유. CLI top-level만 unwrap. 자세한 정책: `docs/architecture/result-type.md`.
- **에러는 모두 `AgoraError` (단일 catalog)** — Stage 4-A.6, `docs/infra/errors-and-telemetry.md`. Throw site에 string literal 금지, 모든 message는 locale catalog (en/ko) lookup.
- **Telemetry 절대 금지 (v1)** — phone-home/Sentry/PostHog 런타임 import 금지. 로컬 crash report만 (`~/.agora/crashes/`). MANIFESTO P6 + ADR-0007.

### 네이밍

- 파일: `kebab-case.ts` (TypeScript convention)
- 클래스: `PascalCase`
- 함수/변수: `camelCase`
- 상수: `SCREAMING_SNAKE_CASE`
- 이벤트: `domain.entity.verb_past_tense`
- 절대 import 금지 (path alias `@/` 활용)

---

## Interview UX 핵심 규칙 (Stage 1 합의)

`docs/loops/alignment-loop.md`에 8개 forbidden patterns (F1~F8) 명시:

1. ❌ 비영어 출력에 locale 검증 없음 (한글 타이포)
2. ❌ "왜 이 질문" purpose label 없음
3. ❌ 추상에 대한 추상 질문
4. ❌ 이전 답변 quote/build 없는 질문
5. ❌ Compound input에 강제 ranking
6. ❌ Multi-dim 가능한데 single-attribute drill
7. ❌ 단일 제안에 비교 대안 없음
8. ❌ 자유입력을 옵션으로 라벨링

UX expertise-aware split:
- **Mode A** (사용자가 도메인 전문성 있음): 추천 옵션 + 자유 입력
- **Mode B** (사용자가 도메인 전문성 없음): 단일 추천 + 근거 + 1~2개 대안 + 반론 환영

---

## 단계별 로드맵 (ADR-0004 요약)

| Stage | 목표 | Done When | 현재 |
|-------|------|-----------|------|
| **0** | Foundation | 골격 + 4 ADR + GitHub repo | ✅ 완료 |
| **1** | Philosophy + North Star | MANIFESTO, north-star, 5 philosophy docs | ✅ 완료 (2026-04-27, `docs/stage-1/CLOSED.md`) |
| **2** | Two-Loop Specification | alignment-loop, ralph-loop, handoff 검증 게이트 | ✅ 완료 (2026-05-03, `docs/stage-2/CLOSED.md`, tag `v0.2.0-stage-2`) |
| **3** | CLI Surface Detail | cli/spec, 모든 명령/플래그/스크린 | ✅ 완료 (2026-05-03, `docs/stage-3/CLOSED.md`, tag `v0.3.0-stage-3`) |
| **4** | Infra + LLM Integration + Install | install, llm-integration, config, probes, errors-and-telemetry | ✅ 완료 (2026-05-03, `docs/stage-4/CLOSED.md`, tag `v0.4.0-stage-4`) |
| **5** | Internal Architecture + Runbooks | 모듈 그래프, 철학자별 runbook, prompt library | 🟡 진행 중 (`docs/stage-5/NOTES.md`) |
| **6+** | Implementation (vertical slices) | 첫 vertical slice → 누적 | ⏳ |

각 Stage는 **명시적 게이트**: Sang의 승인 없이 다음 Stage 진입 금지.

---

## ADR Index

| # | 제목 | Status |
|---|------|--------|
| 0001 | Language and Runtime: TypeScript on Node 22+ LTS | Accepted |
| 0002 | Project Location and Visibility | Accepted |
| 0003 | Meta Dogfooding: Build Agora the Agora Way | Accepted |
| 0004 | Development Stages | Accepted |
| 0005 | Claude Integration via Subprocess (not Agent SDK) | Accepted |
| 0006 | Pre-Ralph Infrastructure Gate (Gate 0) | Accepted |
| 0007 | License Choice: MIT (Provisional), Public Release Deferred | Accepted (partially supersedes ADR-0002) |
| 0008 | Ralph: Sequential Default with Parallel-Ready Architecture | Accepted |

---

## 트러블슈팅

| 영역 | 체크 순서 |
|------|----------|
| `pnpm install` 실패 | Node 22+ 확인 → `engine-strict=true` (`.npmrc`) |
| typecheck 실패 | `pnpm typecheck` 단독 실행 → tsconfig strict 옵션 영향 확인 |
| lint 실패 | `pnpm lint:fix` 시도 → biome rule 확인 |
| 테스트 실패 | `pnpm test:watch` 로 isolation → tsx CLI 호출 경로 확인 |
| ADR 충돌 | 새 ADR로 supersede → 옛 ADR의 Status를 `Superseded by ADR-XXXX`로 변경 |
| `claude --print` 실패 | `claude auth status` → 미인증이면 `claude login` → 인증 후 재시도 |
| Ralph가 시작 안 됨 | `agora doctor` → Gate 0 실패 항목 확인 → 해당 CLI 인증 (gh, vercel, supabase 등) |

---

**Last Updated**: 2026-05-04
**Version**: 0.0.1-alpha.0 (Stage 5 closed, Stage 6 active — implementation begins)
