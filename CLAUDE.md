# Agora — AI Context Document

> 이 문서는 AI(Claude)가 프로젝트를 정확하게 이해하기 위한 Single Source of Truth입니다.
> **이 문서에 없는 것은 구현하지 마세요. 이 문서와 다른 것은 버그입니다.**

---

## 🚦 새 세션 시작 시 — 반드시 먼저 읽을 것

> **새 AI 세션이 시작되면 `docs/SESSION_HANDOFF.md`를 가장 먼저 읽으세요.**
>
> CLAUDE.md (이 파일)는 정적 reference입니다. SESSION_HANDOFF.md는 **현재 세션이
> 어디부터 어떻게 작업해야 하는지** 가이드입니다 — 읽기 순서 (5,300줄 SPEC을
> 다 읽지 않게), 코드 컨벤션 (실제 코드에서 검증된 것), 과거 세션이 발견한
> 함정 (claude --max-tokens 같은 surprise들), Sang과의 대화 스타일 (Mode B
> 패턴), 현재 stage 진행 상태.
>
> 새 세션마다 SESSION_HANDOFF.md를 안 읽으면 같은 실수를 반복합니다.

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

> - License: MIT (ADR-0007에서 provisional 채택 → ADR-0011에서 확정 — Q00의 Ouroboros 저작권 보존, CREDITS.md 참조)
> - Status: **Stage 6 (Implementation — vertical slices) — 진행 중**
> - Stage 1 closed: 2026-04-27 (`docs/stage-1/CLOSED.md`, tag `v0.1.0-stage-1`)
> - Stage 2 closed: 2026-05-03 (`docs/stage-2/CLOSED.md`, tag `v0.2.0-stage-2`)
> - Stage 3 closed: 2026-05-03 (`docs/stage-3/CLOSED.md`, tag `v0.3.0-stage-3`)
> - Stage 4 closed: 2026-05-03 (`docs/stage-4/CLOSED.md`, tag `v0.4.0-stage-4`)
> - Stage 5 closed: 2026-05-04 (`docs/stage-5/CLOSED.md`, tag `v0.5.0-stage-5`)
> - Repo: github.com/lazydevz-inc/agora (**public** — 2026-06-04 ADR-0011로 전환; ADR-0002/0007의 "private 유지" 결정을 대체)
> - Package: `@lazydevz/agora` (npm 게시됨 — 현재 v0.0.1-alpha.2; 정확한 기능 스냅샷은 하단 Version 단락 참조)

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
| CLI | 15+ 서브커맨드 | 단일 진입점 `agora` + 자동 흐름 안내 (대부분 `agora` 하나로 다음 단계 안내; 세부 단계는 `agora round`/`resume`가 자동 라우팅) |
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

## Claude 인증 + 3 I/O 모드 (ADR-0005 → **ADR-0009 재정렬**)

**핵심 포지셔닝: Agora = Claude Code의 Spring (프레임워크).** Java/JVM이 코드를
실행하듯 Claude Code가 코드를 짜고, Spring이 구조·생명주기를 잡듯 Agora가 정렬
방법 + 게이트 + 루프를 지휘한다. **Agora 자신은 LLM을 호출하지 않는다** (주력
모드 기준).

**왜 바뀌었나 (ADR-0009)**: 2026-06-15부터 Anthropic이 `claude -p`(=`claude
--print`) + Agent SDK 구독 사용분을 **별도 종량 크레딧 풀($20~$200/월, API 요율)**
로 분리. 즉 ADR-0005가 주력으로 삼았던 subprocess 경로가 비용 폭탄이 됨. 그래서
**호스트 Claude Code 세션이 추론을 담당하는 MCP 플러그인(Mode 3)을 주력으로 승격.**

| 우선순위 | Mode | LLM 호출 | 과금 |
|------|------|---------|------|
| **1 (주력)** | **MCP 플러그인 (Claude Code 내부)** | 호스트 세션이 추론; Agora는 0회 | 인터랙티브 구독 풀 (추가 과금 X) |
| 2 (레거시/standalone) | `claude --print` subprocess | Agora가 `claude -p` 호출 | **종량 크레딧 풀** (2026-06-15~) — 비용 경고 표시 |
| 3 (사장) | Agent SDK + `ANTHROPIC_API_KEY` | 직접 API | API 과금 |

Mode 1(주력)은 nested LLM 낭비 + 추가 과금을 모두 방지. Agora는 *구조 + 의미 +
게이트 검증*만 제공하고, 추론이 필요하면 호스트 Claude Code 세션이 수행.
**ADR-0010 Slices A-E (2026-05-24)**: MCP 플러그인 레이어(`src/mcp/`) 구현됨 —
`agora_align_step`/`agora_ralph_step` 두 stepped tool이 alignment + Ralph
loop 전체를 호스트-추론 방식으로 노출. Mode 2(subprocess)는 Mode 3 미사용
시에만 fallback.

---

## 기술 스택

| 영역 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Language | TypeScript | ≥ 5.9 strict | `tsconfig.json` 참조 |
| Runtime | Node.js | ≥ 22 LTS | `engines.node` |
| Package manager | pnpm | 10 | `packageManager` 필드 |
| CLI 파싱 | (직접 구현) | — | `src/cli/flags.ts` 수동 argv 파싱. commander는 의존성에서 제거됨 (미사용) |
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
- **핵심 명령어는 소수 + 안내형 흐름**: 사용자는 주로 `agora`/`new`/`resume`/`status`/`ralph`/`handoff`/`doctor`만 쓰고, Phase 2 세부 단계(telos/form/material/efficient/maturity/ac/bracket/intake)는 `agora round`·`agora resume`가 자동으로 다음 걸 골라줌. (Stage 6 기준 17개 명령이 wired 됐지만 대부분 자동 라우팅 대상 — "≤7 hard cap"이라는 초기 표현은 폐기; 원칙은 "외울 필요 없는 안내형 UX")
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

- `.git` 존재 → brownfield (코드/문서 파일이 충분하면 high, sparse면 low confidence — SPEC R1-A; low-confidence의 Phase 1 한-줄 확인은 미구현/defer)
- `.git` 없는 빈/신규 디렉토리 → greenfield
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
| 0005 | Claude Integration via Subprocess (not Agent SDK) | Accepted, **amended by ADR-0009** |
| 0006 | Pre-Ralph Infrastructure Gate (Gate 0) | Accepted |
| 0007 | License Choice: MIT (Provisional), Public Release Deferred | Accepted (partially supersedes ADR-0002) |
| 0008 | Ralph: Sequential Default with Parallel-Ready Architecture | Accepted |
| 0009 | Claude Code Plugin (MCP) as Primary Mode | Accepted (re-ranks ADR-0005; June-15 billing pivot) |
| 0010 | Host-Reasoning Stepped MCP Tools (Align + Ralph) | Accepted (implements ADR-0009 §"Implementation notes" #2) |
| 0011 | Public Release + License Confirmation (MIT) | **Accepted** (2026-06-04 — repo → public; confirms ADR-0007 license MIT) |

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

**Last Updated**: 2026-06-11
**Version**: 0.0.1-alpha.2 (Stage 6 active — 34 vertical slices done: alignment loop end-to-end + Ralph Gate 1/3/4/5 + audit log + `agora trace` + non-interactive/agent-driven mode. **ADR-0010 Slices A-E shipped**: `agora_align_step` + `agora_ralph_step` MCP tools drive the alignment + Ralph loops via host-supplied reasoning — Mode 3 (MCP plugin) is now load-bearing. **Public release (2026-06-04, ADR-0011 Accepted)**: repo → public + MIT confirmed; Claude Code plugin manifest (`.claude-plugin/`) + `agora_new` MCP tool + `docs/getting-started.md` + OSS meta (CONTRIBUTING/SECURITY/CoC/CHANGELOG/CI) + `shared/version.ts` dedup (−244 LOC). **Self-QA bug-fix pass (2026-06-09)**: 8 MCP tools now (added `agora_intake` so the host-reasoning alignment loop bootstraps without the interactive CLI) + `agora_doctor` accepts include_disabled/refresh; unified CLI exit codes on ERROR_CATALOG (envelope ↔ process now agree; user category → 2); unknown command errors instead of silently printing version; Ralph Gate 5 judges the uncommitted working-tree diff first (was prior commit); Ralph gate/drift/Disputatio events now hit the audit log; drift history no longer drops Z2-declined spikes or double-records passes; Socrates refinement stored in `elenchus_refinement` instead of clobbering the clean telos statement; `agora status` + brownfield `resume` give correct next-step guidance. **Self-QA dogfood pass #2 (2026-06-10)**: greenfield+brownfield 풀 루프 dogfood (mdtoc 프로젝트, MCP host-reasoning으로 align→handoff→Ralph 13-leaf 완주 ×2) — 16건 발견·수정: 세션 판정 state.json 기준(hasAgoraSession, doctor→new 순서 복구); Gate 5 diff에서 .agora/락파일 제외 + untracked 포함 + 루트커밋 폴백 + no-git 경고; Z2-yes 데드락 해소(maturity/seed 무효화 + align done-branch reconcile); handoff 거절 재시도가 보존된 ac_tree 재사용; Disputatio objection id 네임스페이스(F-Aquinas-4 구멍) + 무반론 시 Sed contra 스킵; Socrates aporia 마커 확장(refinement 유실 방지); gate 실패 envelope에 failed_detail; resume@ralph_complete 비대화형 플래그 안내; 'Sang' 예시 중립화. **Dogfood round 3 + npm release (2026-06-10)**: 웹앱 dogfood로 첫 라이브 Playwright Gate 2 완주; Gate-1 tree-fingerprint 캐시(트리 상태당 deterministic gate 1회 실행); critic 선택에 실제 신호 주입(Gate-5 diff 파일 + seed tech stack); MCP envelope `next[]`에 `mcp_tool` 힌트; env 유래 비지원 locale은 en 폴백; **v0.0.1-alpha.1 npm 게시 완료** (`@lazydevz/agora` — alpha.0 2026-06-04, alpha.1 2026-06-10). **Host-relay UX → v0.0.1-alpha.2 npm 게시 (2026-06-10, PR #7)**: 라이브 dogfood에서 호스트 세션이 개방형 검증 질문(Socrates probe, Plato Noesis 등)을 "(Recommended)" 객관식 + 자가채점으로 바꿔 maturity reloop이 구조적으로 못 뜨는 문제 발견 — 16개 개방형 질문에 `StepQuestion.open_question` 릴레이 플래그 + `agora_align_step` 설명에 릴레이 계약(드래프트 옵션은 유지하되 개방형임을 명시, 유저 본인의 말 환영, 유저가 실제 답한 것만 제출; handoff confirm·Z2 같은 닫힌 결정은 의도적으로 미플래그); env→locale 스니핑 4곳 → 단일 리졸버(backlog M6 해소); stepped-tool 설명의 낡은 Slice A/D 스코프 표기 수정. npm이 프리릴리즈 publish에 dist-tag 명시를 요구하게 되어 `pnpm publish --tag latest`로 게시. **Intake 캡 재산정 + 무손실 컷 (2026-06-11, R3-A 개정)**: 16 KB 하드캡이 영어 바이트 기준 산수(한글은 UTF-8 3바이트/음절이라 절반 지점에서 캡)였고 MCP host-relay 시대의 의도적 대용량 relay와 충돌 → soft 16 KB / hard 64 KB로 상향; 하드캡 도달 시 원본 전체를 `.agora/history/intake-original-{ts}.md`에 먼저 보존(절단은 절대 데이터를 파괴하지 않음, `intake_original_path`/`intake_original_byte_size` 기록); 부수 발견 — `process.exit()`가 stdout 플러시를 안 기다려 64 KB 초과 `--json` envelope이 파이프 버퍼에서 잘리던 버그를 `exitAfterFlush()`로 전 종료 지점 수정. 537 tests. 🚧 남은 작업: code-quality backlog (`docs/architecture/code-quality-backlog.md`), Mode 2 cost-warning UX, prompt-library refactor.)
