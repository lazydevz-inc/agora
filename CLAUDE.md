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
- **5명의 철학자 외 추가 금지** (허락 없이) — 사고 모듈은 의도적으로 제한된 집합
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

---

## 프로젝트 개요

**Agora = 고대 철학자들이 모이는 광장. AI 코딩 에이전트의 harness.**

> - License: MIT (Q00의 Ouroboros에서 컨셉 차용, CREDITS.md 참조)
> - Status: Stage 0 (Foundation) — pre-1.0
> - Repo: github.com/lazydevz-inc/agora (private 단계)
> - Package: `@lazydevz/agora` (npm 미공개)

Claude Code(또는 다른 AI 코딩 에이전트) 위에 올라가는 spec-first 워크플로우 엔진. **Interview Loop**로 인간 의도와 AI 스펙의 완전한 싱크를 맞추고, **Ralph Loop**로 검증 게이트가 모두 통과될 때까지 반복 구현한다.

### 핵심 차별화 (vs Ouroboros)

| 영역 | Ouroboros | Agora |
|------|-----------|-------|
| CLI | 15+ 서브커맨드 | 단일 진입점 `agora` + 자동 흐름 안내 |
| 설정 | global-only | per-project 기본 + global fallback |
| Brownfield/Greenfield | 사용자가 명시 | 자동 감지 |
| 인터뷰 UX | 자유 입력만 | 추천 옵션 + 자유 입력 (타이핑 부담 감소) |
| 평가 | 다수결 투표 | Aquinas Disputatio (논점별 판결) |
| 검증 | 3단계 (mechanical/semantic/consensus) | 4단계 게이트 (det/QA/UI/tech) |
| 철학 | 표면적 차용 | 5명 1급 시민 모듈 |
| 언어/스택 | Python | TypeScript (CLI ↔ GUI 코드재사용) |
| Customization | 광범위한 옵션 | Biased — 베스트 옵션을 그냥 줌 |

---

## 5명의 철학자 (1급 시민 모듈)

`src/agora/philosophers/` 에 각각 1개 모듈로 존재. 다른 사고법 모듈 추가는 신중히 검토.

| 철학자 | 역할 | 적용 위치 |
|--------|------|----------|
| **Husserl** | Epoché — 전제 괄호치기 | Interview Loop Phase −1 (선택적) |
| **Socrates** | Elenchus — 질문을 통한 가정 노출 | Interview Loop의 conductor |
| **Aristotle** | 4원인론 (질료/형상/작용/목적) | Interview Loop의 분류 프레임 |
| **Plato** | Divided Line (앎의 성숙도) + Dihairesis (자연적 분할) | 성숙도 측정 + AC 분해 |
| **Aquinas** | Disputatio (Videtur → Sed contra → Respondeo → Ad primum) | Ralph Loop 평가 게이트 |

각 모듈의 철학적 근거는 `docs/philosophy/` 에 분리 문서로 존재 (Stage 1 산출물).

---

## 두 루프 (Two-Loop) 구조

### Interview Loop

> Goal: 인간 의도와 AI 스펙의 완전한 싱크

```
Phase 0 (자동): 폴더 스캔 → brownfield/greenfield 자동 감지
              → *.md / README / CLAUDE.md / AGENTS.md 자동 흡수
Phase 1 (개방): "뭘 하고 싶어?" — 유저가 줄 수 있는 모든 컨텍스트 수집
Phase 2 (반복): 누적 컨텍스트로 다관점 라운드
              UX: 매 질문에 추천 옵션 제공 + 항상 자유 입력 가능
종료 조건: telos가 Noesis-level 도달 (Plato 분할선 기준)
```

상세 설계는 `docs/loops/interview-loop.md` (Stage 2 산출물).

### Ralph Loop

> Goal: 시드 만족까지 검증 게이트 통과해 반복 구현

```
매 iteration 검증 게이트:
  1. Deterministic: lint, typecheck, build, test
  2. Functional QA: Playwright CLI 테스트 (LLM이 생성, deterministic 실행)
  3. UI/UX Quality: 전문가 페르소나 정성 평가
  4. Technical Quality: Aquinas Disputatio (논점별 판결)
종료 조건: 모든 게이트 통과 + 유저 만족
```

상세 설계는 `docs/loops/ralph-loop.md` (Stage 2 산출물).

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
| Browser QA (예정) | Playwright CLI | TBD | Stage 2-B 결정 |
| LLM SDK | @anthropic-ai/sdk | TBD | Stage 4 도입 |
| MCP | @modelcontextprotocol/sdk | TBD | Stage 4 도입 |

ADR-0001 참조.

---

## 프로젝트 구조

```
agora/
├── README.md                    # 비전 + 빠른 시작
├── CLAUDE.md                    # 👈 이 파일
├── LICENSE                      # MIT (Q00 저작권 보존)
├── CREDITS.md                   # Ouroboros + 5명 철학자 어트리뷰션
├── MANIFESTO.md                 # 제품 철학 선언 (Stage 1)
├── package.json
├── tsconfig.json / tsconfig.build.json
├── biome.json
├── vitest.config.ts
├── docs/
│   ├── architecture/
│   │   └── decisions/           # ADR 디렉토리 (architectural changes 영구 기록)
│   │       ├── 0000-template.md
│   │       ├── 0001-language-and-runtime.md
│   │       ├── 0002-project-location.md
│   │       ├── 0003-meta-dogfooding.md
│   │       └── 0004-development-stages.md
│   ├── philosophy/              # 5명 철학자 사상의 SW적 적용 (Stage 1+)
│   ├── loops/                   # Interview/Ralph 루프 상세 (Stage 2)
│   └── cli/                     # CLI 표면 상세 설계 (Stage 3)
├── src/agora/
│   └── (Stage 6+ 구현 시 채워짐)
├── src/cli/
│   └── index.ts                 # CLI 진입점 (현재 placeholder)
└── tests/
    └── smoke.test.ts            # Stage 0 smoke
```

상세 구조는 Stage 5에서 확정.

---

## 핵심 아키텍처 규칙

### CLI 설계 (요약 — Stage 3에서 상세화)

- **진입점은 `agora` 단 하나**. 사용자는 다른 명령어를 외울 필요 없음
- **자동 다음 단계 안내**: 매 명령 후 "다음에 할 수 있는 것" 자동 제안
- **서브커맨드 ≤ 7개**: hard cap
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

### Brownfield/Greenfield 자동 감지

- `.git` + 코드 파일 존재 → brownfield
- 빈 디렉토리 또는 신규 → greenfield
- 사용자에게 묻지 않음. 잘못 감지 시 명시적 override 가능

### 데이터 패턴

- TypeScript에서 immutable 강제는 `readonly` + `as const` + zod schema 활용
- 도메인 모델은 zod로 검증 (도입은 Stage 5 결정)
- 비동기는 native Promise / async-await
- Result 패턴은 `Result<T, E>` 헬퍼 도입 검토 (Stage 5)

### 네이밍

- 파일: `kebab-case.ts` (TypeScript convention)
- 클래스: `PascalCase`
- 함수/변수: `camelCase`
- 상수: `SCREAMING_SNAKE_CASE`
- 이벤트: `domain.entity.verb_past_tense`
- 절대 import 금지 (path alias `@/` 활용)

---

## 단계별 로드맵 (ADR-0004 요약)

| Stage | 목표 | Done When |
|-------|------|-----------|
| **0** | Foundation (현재) | 골격 + 4 ADR + GitHub repo |
| **1** | Philosophy + North Star | MANIFESTO, north-star, 5 philosophy docs |
| **2** | Two-Loop Specification | interview-loop, ralph-loop, 검증 게이트 |
| **3** | CLI Surface Detail | cli/spec, 모든 명령/플래그/스크린 |
| **4** | Infra + LLM Integration + Install | install, llm-integration, MCP plan |
| **5** | Internal Architecture + Runbooks | 모듈 그래프, 철학자별 runbook, prompt library |
| **6+** | Implementation (vertical slices) | 첫 vertical slice → 누적 |

각 Stage는 **명시적 게이트**: Sang의 승인 없이 다음 Stage 진입 금지.

---

## 트러블슈팅

| 영역 | 체크 순서 |
|------|----------|
| `pnpm install` 실패 | Node 22+ 확인 → `engine-strict=true` (`.npmrc`) |
| typecheck 실패 | `pnpm typecheck` 단독 실행 → tsconfig strict 옵션 영향 확인 |
| lint 실패 | `pnpm lint:fix` 시도 → biome rule 확인 |
| 테스트 실패 | `pnpm test:watch` 로 isolation → tsx CLI 호출 경로 확인 |
| ADR 충돌 | 새 ADR로 supersede → 옛 ADR의 Status를 `Superseded by ADR-XXXX`로 변경 |

---

**Last Updated**: 2026-04-26
**Version**: 0.0.1-alpha.0 (Stage 0)
