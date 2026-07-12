# PRD-PF-C — 문제정의 진입점 + 다단계 워크플로우 셸

> **범위:** 멀티페이지(App Router 라우트) 전환 + `problems` 최상위 스코프 신설 + 단계별 confirm-gate
> **의존:** PRD-PF-A(온톨로지·워크스페이스 컨테이너·테넌시) — **선행 필수**. PRD-PF-B(레이어)와 병행 가능.
> **관련:** PRD-PF-D(데이터셋 레지스트리), PRD-PF-E(AI 어시스트 패널 상세) — 본 PRD는 라우트·자리만 예약, 구현은 위임.
> **작성일:** 2026-07-12
> **원칙:** 비판적 옹호 · 재배치 우선(기존 단일 캔버스 자산 보존) · shadcn/ui · 한국어 UI · HITL(자동초안+컨펌) · 시각언어(원/점/파선/실선) 보존

---

## 0. 한 줄 요지

지금 제품은 진입하자마자 빈 캔버스다 — "무엇을 위해 이 온톨로지를 짓는가"를 묻지 않는다. 이 PRD는 진입점을 **문제정의(`problems`)** 로 바꾸고, 한 페이지에 뭉쳐 있던 저작 경험을 **[문제정의]→[데이터연결]→[온톨로지구축]→[함수/키네틱]→[대시보드·액션보드]** 5단계 라우트로 쪼개 각 단계를 엔지니어가 **확정(confirm-gate)** 하고 넘어가게 만든다. 기존 단일 캔버스는 지워지지 않고 "온톨로지 구축" 단계로 그대로 편입되며, 그 위에 **"문제마다 온톨로지를 재사용·확장·분기"** 하는 팔란티어도 못 주는 포지션을 얹는다.

---

## 1. 목적 (Purpose)

**왜 지금 이 구조 전환인가.**

`2026-07-12-platform-expansion-plan.md`의 코드 실태 판정이 출발점이다: 진입 = 단일 캔버스(`app/page.tsx`), 문제·목표를 담는 상위 스코프가 없다(`competency_questions`는 `patterns` 테이블 내부 jsonb — 도메인 템플릿 캐시일 뿐, 문제 인스턴스가 아니다). 팔란티어/달핀통형 여정은 **결정(액션)을 먼저 확정하고 데이터를 역산**하는데, 우리는 그 반대 방향(문서→구조화)에서 강하다. `2026-07-12-semantic-to-kinetic-function-layer.md`의 결론대로 두 방향은 경쟁이 아니라 스펙트럼의 양 끝이며, 그 다리가 **"CQ(확인질문)→결정 프레이밍" 승격**이다. 이 PRD가 그 다리의 UX 뼈대다.

동시에 지금 단일페이지 구조는 두 가지를 구조적으로 막는다.
1. **"이 온톨로지가 무슨 문제를 풀기 위한 것인가"를 저장할 곳이 없다.** 캔버스는 언제나 하나의 전역 그래프를 편집할 뿐, 어떤 문제·목표·액션에 복무하는지 스코프가 없다.
2. **"이미 만든 온톨로지를 다음 문제가 재사용/확장/분기"하는 흐름이 UX로 존재하지 않는다.** `branches`(git-for-data)는 있지만 "왜 분기했는가(어느 문제 때문에)"를 기록하지 못한다. 2차·3차 문제가 1차 온톨로지 위에 복리로 쌓이는 이 흐름 자체가 팔란티어·달핀통도 강하게 밀지 않는 우리만의 자리다(그들은 프로젝트당 온톨로지가 대체로 1개 중심 모델이다).

**정직한 전제:** 이 PRD는 `problems.ontology_id`, `problems.workspace_id`가 가리킬 컨테이너(`ontologies`/`workspaces`)가 PRD-PF-A에서 신설되는 것을 전제로 한다. PF-A 이전에 이 PRD만 단독 시행하면 `problems`가 가리킬 곳이 없다 — §8에서 순서를 명시한다.

---

## 2. 목표 & 지표 (Goals & Metrics)

| 목표 | 지표 | 현재 | 목표 |
|---|---|---|---|
| 문제-우선 진입 | 신규 세션이 빈 캔버스가 아니라 문제정의 폼에서 시작하는 비율 | 0%(진입=캔버스) | 100% |
| CQ→결정 승격 | 문제에 연결된 "결정 질문+액션" 보유율 (vs 과거 patterns.competencyQuestions 방치율) | 0(문제 스코프 없음) | 신규 문제 90%+ 작성 |
| 단계 확정 추적성 | 각 단계의 confirm 시각·확정자가 남는 문제 비율 | 0 | 100%(신규 문제 기준) |
| 온톨로지 복리 재사용 | 2차 이상 문제가 기존 온톨로지를 재사용/확장/분기로 시작하는 비율(신규 생성 대비) | 측정 불가(단일 전역 그래프) | 3개월 내 30%+ |
| 기존 경험 무손실 | 온톨로지 구축 단계 진입 후 캔버스 기능(파싱·HITL·Critic·커밋) 회귀 0건 | — | 0건 |
| 이관 완주율 | 기존 단일페이지 사용자가 신규 워크플로우로 문제 없이 이관(재입력 없이) | — | 100%(마이그레이션 스크립트로 기존 그래프 = 문제 1건 백필) |

---

## 3. 기술 스택 (재배치 우선)

| 필요 능력 | 재사용 자산 | 신규/보강 |
|---|---|---|
| 단계별 라우트 | Next.js 15 App Router(이미 사용 중) | `/problems`, `/problems/[id]/(define|data|studio|functions|board)` 세그먼트 신설 |
| 캔버스 경험 보존 | `app/page.tsx`의 3패널 레이아웃(Explorer/Canvas/RightPanel) + `GraphCanvas`/`Toolbar`/`CommitBar`/`ExplorerPanel`/`RightPanel` 전부 | 그대로 `/problems/[id]/studio/page.tsx`로 이동(로직 변경 없음, `problem_id`→`ontology_id` 스코프 주입만 추가) |
| 상태관리 | zustand5(`useOntologyStore`) + zundo | 문제 워크플로우 상태를 위한 얇은 `useProblemWorkflowStore` 신설(단계 상태·confirm 여부만, 그래프 상태와 분리 유지) |
| 스텝퍼 UI | shadcn `Breadcrumb`/`Progress`/`Badge` 프리미티브 + 기존 배지 taxonomy(PRD-K/L 컨벤션) | shadcn에 기성 Stepper 없음 → 위 프리미티브 조합한 `StepperNav` 컴포넌트 신규(신규 라이브러리 도입 안 함) |
| confirm-gate | `ConfirmCard`(HITL 카드 패턴 재사용) | 단계별 "확정" 액션에 동일 카드 스타일 적용 — 새 컴포넌트 아님, 기존 패턴 재적용 |
| 버전관리 결합 | `commits`/`branches`/`merge_requests`/`base_snapshot`(git-for-data, PRD-J) | 문제→온톨로지 링크에 `branch_id` 결합(분기 시 해당 브랜치로 라우팅) |
| CQ 승격 | `patterns.competencyQuestions`(도메인 템플릿 캐시) | 문제 생성 시 관련 패턴의 CQ를 **초안으로 복사**해 `problems.decision_questions`로 인스턴스화(패턴 캐시 자체는 안 건드림 — 재배치, 파괴 없음) |
| 온보딩 정합 | `OnboardingGuide`(첫 방문 전용, 단일페이지 대상) · `GuidedJourney`(오버레이) | `OnboardingGuide`는 `/problems`(문제 목록) 최초 진입으로 트리거 지점 이동, `GuidedJourney`는 단계별 툴팁으로 재활용 |
| AI 어시스트 패널 자리 | 없음(신규) | 각 단계 우측 패널 슬롯만 이 PRD에서 예약 — 실제 AI 동작은 PRD-PF-E |
| 데이터 연결 자리 | `api/llm/parse`/`api/import`(CSV·텍스트) | `/problems/[id]/data` 단계 페이지는 기존 파싱 진입 UI를 재배치, 데이터셋 레지스트리 자체는 PRD-PF-D |
| 함수/대시보드 자리 | 없음(라벨만: `relation_types.layer`) | `/problems/[id]/functions`, `/problems/[id]/board`는 이 PRD에서 **빈 스텁 라우트 + "다음 마일스톤" 안내 카드**만. 실제 구현은 별도 PRD |

---

## 4. 방향 (마일스톤)

> 순서 근거: **데이터 안 깨는 것부터.** 기존 캔버스를 옮기기 전에 먼저 새 스코프(`problems`)를 얹고, 캔버스 이동은 라우트만 바꾸는 무손실 리팩터로 마지막에 검증.

### M1 — `problems` 테이블 + 문제정의 페이지 (척추)
- `problems` 테이블 신설(§5.2). `/problems`(목록) · `/problems/new`(정의 폼) · `/problems/[id]/define`(상세/재편집) 라우트.
- 정의 폼: 문제(자연어) · 목표(측정지표) · 사전정의 액션 슬롯(예: 통과/불통과) · 결정 질문(패턴에서 초안 복사 가능) 입력 → 확정 시 `workflow_state.define = 'confirmed'`.
- 이 단계에서는 아직 온톨로지 연결 없음(다음 단계에서 결정).

### M2 — 온톨로지 연결 UX(재사용/확장/분기) — 복리 재사용의 핵심
- `define` 확정 직후 "이 문제, 어떤 온톨로지에서 시작할까요?" 선택 화면: **새로 만들기 / 기존 재사용(참조) / 기존 확장(같은 온톨로지에 커밋) / 기존에서 분기(새 브랜치)**.
- 재사용/확장/분기 선택 시 대상 온톨로지 목록(PF-A `ontologies` 컨테이너에서 조회) + 미리보기(클래스 수·최근 커밋).
- 확정 시 `problem_ontology_links` 레코드 생성(§5.2), 분기 선택 시 `branches` API 호출로 신규 브랜치 즉시 생성.
- 팔란티어·달핀통도 "문제별 다중 온톨로지 복리 재사용"은 강하게 제공하지 않는 지점 — 여기가 우리 포지션.

### M3 — 스텝퍼 셸 + confirm-gate 프레임워크
- 상단 `StepperNav`: 5단계 표시, 각 단계 상태 배지(잠김/진행중/확정됨), 클릭 시 확정된 단계로는 자유 이동, 잠긴 단계는 이전 단계 확정 전까지 비활성.
- confirm-gate 공통 컴포넌트: 각 단계 하단 "이 단계 확정하고 다음으로" 버튼 → `ConfirmCard` 스타일 요약 → 확정 시 `workflow_state[step] = 'confirmed'` 기록(확정자·시각 포함).
- 뒤로 가서 수정: 확정된 단계도 재오픈 가능하나, 재오픈 시 이후 단계는 `workflow_state[laterStep] = 'stale'`로 표시(강제 롤백 아님, 경고만) — git-for-data의 브랜치/커밋과 결합해 실제 데이터는 그대로 두고 "재검토 필요" 배지만 얹는다.

### M4 — 온톨로지 구축 단계로 캔버스 편입(무손실 이동)
- `app/page.tsx`의 전체 레이아웃·컴포넌트 트리를 `/problems/[id]/studio/page.tsx`로 이동. 로직 변경 없이 `partitionId`/`ontology_id` 스코프만 URL 파라미터로 주입.
- 기존 `SplashScreen`/`CommandPalette`/`GuidedJourney`는 studio 단계 내부에서 그대로 동작.
- 회귀 테스트: 파싱 파이프라인(Stage1/2)·HITL ActionCard·Critic 9룰·커밋/브랜치/머지·Health 대시보드 시트 — 전부 studio 라우트에서 동일 동작 확인.

### M5 — 데이터연결/함수/대시보드 단계 자리 예약(스텁)
- `/problems/[id]/data`: 기존 CSV·텍스트 임포트 UI를 재배치(신규 데이터셋 레지스트리는 PRD-PF-D에 위임, 이 단계는 "연결된 데이터셋" 카드 리스트 + 임포트 진입만).
- `/problems/[id]/functions`, `/problems/[id]/board`: 빈 스텁 + "이 단계는 준비 중" 안내 + 스텝퍼상 위치만 확보. 과대약속 금지 — 실제 기능 없음을 명시.

### M6 — 기존 사용자 이관
- 마이그레이션 스크립트: 현재 단일 전역 그래프를 `problem_id = 'legacy-default'` 문제 1건 + 기본 온톨로지로 백필. 기존 사용자는 로그인 시 이 문제로 자동 랜딩(재입력 없음).

---

## 5. 방법론

### 5.1 정보구조 / 라우트 트리

```
/problems                          목록(카드: 문제명·상태·귀속 온톨로지·최근 활동)
/problems/new                      문제정의 폼(M1)
/problems/[id]/define              문제정의 상세·재편집
/problems/[id]/ontology-link       온톨로지 연결 선택(M2, define 확정 후 1회성 진입 + 재방문 가능)
/problems/[id]/data                데이터 연결 단계(M5 스텁 → PRD-PF-D 확장)
/problems/[id]/studio              온톨로지 구축(=기존 app/page.tsx, M4)
/problems/[id]/functions           함수/키네틱 단계(스텁 → 별도 PRD)
/problems/[id]/board               대시보드·액션보드 단계(스텁 → 별도 PRD)
```

모든 `/problems/[id]/*`는 공통 레이아웃(`layout.tsx`)에서 `StepperNav` + 좌측 작업영역/우측 AI 어시스트 패널 슬롯을 감싼다. `studio`만 예외적으로 기존 3패널 레이아웃을 풀 와이드로 사용(캔버스 공간 보존이 우선).

### 5.2 데이터 모델 (신규 테이블 컬럼 스케치)

**`problems`** (신규, PF-A `ontologies`/`workspaces` 대상 FK — PF-A 선행 필요)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid FK→workspaces(PF-A) | 테넌시 스코프 |
| `title` | text NOT NULL | 문제명(자연어 한 줄) |
| `description` | text | 문제정의 서술 |
| `goal_metric` | jsonb | `{name, target, unit, direction}` — 측정지표 |
| `action_slots` | jsonb DEFAULT '[]' | 사전정의 액션 슬롯 `[{key:'approve', label:'승인'}, {key:'reject', label:'거절'}]` |
| `decision_questions` | jsonb DEFAULT '[]' | CQ→결정 승격: `[{question, decision, sourcePatternId?}]`. `patterns.competencyQuestions`에서 초안 복사, 이후 독립 편집 |
| `status` | text CHECK IN ('defining','in_progress','completed','archived') | |
| `workflow_state` | jsonb DEFAULT '{}' | 단계별 상태: `{define:'confirmed', data:'draft', studio:'locked', functions:'locked', board:'locked'}` (값: `locked`/`draft`/`confirmed`/`stale`) |
| `confirmed_by` / `confirmed_at` (단계별, jsonb 내부 또는 별도 감사 테이블) | | 각 confirm-gate 통과 시 확정자·시각 |
| `created_by`, `created_at`, `updated_at` | | |

**`problem_ontology_links`** (신규, 문제↔온톨로지 다대다 + 재사용 계보)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `problem_id` | uuid FK→problems | |
| `ontology_id` | uuid FK→ontologies(PF-A) | |
| `link_mode` | text CHECK IN ('new','reuse','extend','branch') | M2 선택 결과 |
| `branch_id` | uuid FK→branches, nullable | `branch` 모드일 때 신규 브랜치 참조 |
| `is_primary` | boolean DEFAULT true | 문제당 주(主) 온톨로지 표시(다중 온톨로지 참조 확장 여지) |
| `created_at` | | |

> 재배치 메모: `patterns` 테이블은 그대로 둔다(도메인 템플릿 캐시). `problems.decision_questions`는 그 캐시의 **인스턴스화 결과**이지 대체가 아니다 — 패턴 재사용(수렴) 자산을 깨지 않는다.

### 5.3 화면 흐름

1. **`/problems`** → "새 문제" → **`/problems/new`**: 문제·목표·액션 슬롯·결정 질문(패턴 추천 있으면 초안 노출) 입력 → 확정.
2. 확정 즉시 **`/problems/[id]/ontology-link`**: 4택(새로 만들기/재사용/확장/분기) 카드. 재사용·확장·분기는 기존 온톨로지 리스트 + 미리보기 모달.
3. 선택 확정 → **`/problems/[id]/studio`**로 이동(스텝퍼는 `data` 단계도 노출되지만 잠금 아님 — 순서 강제는 `studio`와 `functions/board` 사이만 엄격, `data`↔`studio`는 자유 왕복 허용. 이유는 §5.5 리스크 R1 참조).
4. studio에서 평소처럼 파싱·저작·HITL·커밋·머지. 우측 패널 상단에 "이 단계 확정" 버튼 상시 노출(강제 이동 아님, 언제든 다음 단계 열기 가능).
5. studio 확정 → `functions`/`board` 잠금 해제(현재는 스텁 화면). 뒤로 가서 studio 재편집 시 `functions`/`board`가 `stale` 배지로 전환(§4 M3).

좌측 작업영역 / 우측 AI 어시스트 패널 레이아웃은 `define`/`data`/`functions`/`board`에 공통 적용, `studio`만 기존 3패널(Explorer/Canvas/RightPanel) 유지 — RightPanel이 사실상 AI 어시스트 패널 역할을 이미 하고 있으므로 슬롯 중복 없음.

### 5.4 온톨로지 재사용·확장·분기 UX 상세 (M2 핵심)

| 모드 | 동작 | git-for-data 결합 |
|---|---|---|
| 새로 만들기 | 빈 온톨로지 신규 생성, `problem_ontology_links(link_mode='new')` | 신규 `ontology_id` + 초기 커밋 |
| 재사용(참조) | 기존 온톨로지를 **읽기 우선** 참조. 이 문제에서의 편집은 기본적으로 해당 온톨로지 본체에 직접 반영 | 동일 `ontology_id`, 별도 브랜치 없음 |
| 확장 | 같은 온톨로지에 이 문제 맥락의 커밋을 쌓음(다른 문제와 동일 트렁크 공유) | 동일 `ontology_id`, `main` 브랜치 계속 사용 |
| 분기 | 기존 온톨로지에서 새 브랜치를 떠서 이 문제 전용으로 격리 편집, 이후 머지 제안 가능 | 신규 `branch_id`(PRD-J 브랜치 로직 그대로), 머지는 기존 `merge_requests` 플로우 재사용 |

머지 제안 UX는 신규 개발 없음 — PRD-J의 기존 MR 화면을 문제 컨텍스트(`problem_ontology_links`)에서 진입할 수 있게 링크만 추가.

### 5.5 리스크 & 완화

- **R1. 단계 강제의 경직성 vs 자유도.** 5단계를 전부 순차 강제하면 "먼저 캔버스에서 탐색하다가 문제를 발견"하는 실제 작업 패턴(현재 사용자 다수)을 막는다. **완화:** 엄격 게이트는 `define→ontology-link`(스코프 결정은 필수 선행)와 `studio→functions/board`(미완 스텁 보호)에만 걸고, `data↔studio`는 자유 왕복 허용.
- **R2. 미완 단계 상태관리.** `workflow_state`가 `stale`로 남는 문제가 방치되면 신뢰도가 떨어진다. **완화:** `/problems` 목록에서 `stale` 단계 보유 문제를 배지로 눈에 띄게 표시, 90일 이상 `stale` 방치 시 알림(후속 PRD 대상, 이 PRD는 배지 노출까지만).
- **R3. 기존 단일페이지 사용자 이관.** URL 북마크(`/`)가 깨지면 혼란. **완화:** `/`는 리다이렉트 라우트로 남겨 `problem_id='legacy-default'`의 `studio`로 302, M6 마이그레이션과 결합.
- **R4. PF-A 미완 상태에서 선행 착수 압력.** `problems.workspace_id`/`ontology_id`가 가리킬 테이블이 없으면 이 PRD는 시행 불가. **완화:** 착수 순서를 PF-A → 본 PRD로 문서 상단에 명시(이미 반영), PF-A 스키마 확정 전에는 M1 테이블 마이그레이션도 보류.
- **R5. AI 어시스트 패널 자리만 예약하고 내용 없음.** 사용자가 빈 패널에 실망할 수 있음. **완화:** PRD-PF-E 착수 전까지는 "AI 어시스트는 준비 중" 카드로 명확히 표시, 침묵하는 빈 공간 금지.

---

## 6. 수용 기준 (Acceptance Criteria)

- [ ] **M1:** `/problems/new`에서 문제·목표·액션 슬롯·결정 질문을 입력·확정하면 `problems` 레코드가 생성되고 `workflow_state.define='confirmed'`가 기록된다.
- [ ] **M2:** 문제정의 확정 직후 온톨로지 연결 화면(4택)이 뜨고, 각 선택이 `problem_ontology_links`에 올바른 `link_mode`로 저장되며 분기 선택 시 실제 `branches` 레코드가 생성된다.
- [ ] **M3:** `StepperNav`가 5단계 상태(잠김/진행중/확정)를 정확히 표시하고, 잠긴 단계 직접 URL 접근 시 안내와 함께 이전 단계로 리다이렉트한다.
- [ ] **M3:** 확정된 단계를 재오픈해 수정하면 이후 단계가 `stale` 배지로 전환되고, 그래프 데이터 자체는 파괴되지 않는다(회귀 없음).
- [ ] **M4:** `/problems/[id]/studio`에서 기존 파싱(Stage1/2)·HITL ActionCard·Critic 9룰·커밋/브랜치/머지·Health 대시보드가 `app/page.tsx` 시절과 동일하게 동작한다(회귀 테스트 통과).
- [ ] **M5:** `functions`/`board` 스텁 라우트가 존재하고 "준비 중" 상태를 명확히 표시하며, 스텝퍼상 위치는 정상 노출된다.
- [ ] **M6:** 기존 사용자가 `/` 접속 시 재입력 없이 `legacy-default` 문제의 studio 단계로 이동한다.
- [ ] **공통:** 신규 UI는 shadcn/ui·한국어·기존 배지 taxonomy(원/점/파선/실선 시각언어 포함) 준수, lint·프로덕션 빌드·기존 테스트 회귀 0.
- [ ] **의존성 검증:** 본 PRD의 마이그레이션은 PF-A의 `ontologies`/`workspaces` 스키마가 먼저 머지된 뒤에만 적용된다(순서 위반 시 CI 차단 권장).

---

## 7. 결론 (비판적 옹호 요약)

지금 우리는 "세계 수준의 온톨로지 에디터"이지만 그 에디터가 **무슨 문제를 풀고 있는지 저장할 곳이 없다.** 이 PRD는 새 기능을 발명하지 않는다 — 이미 가진 자산(단일 캔버스 경험 그대로, `patterns`의 CQ, `commits`/`branches`/`merge_requests`)을 **문제라는 상위 스코프 아래 재배치**할 뿐이다. 그런데 이 재배치 하나가 팔란티어·달핀통도 정면으로 안 미는 자리를 연다 — **"문제마다 온톨로지를 재사용·확장·분기하며 복리로 키운다"**는 UX. 결정-우선 여정(문제→액션→역산)의 입구를 열면서도, 우리가 이긴 지식-우선 저작 경험을 한 줄도 안 버린다. 단계 강제는 경직성 리스크가 실재하므로 §5.5에서 게이트를 최소한(스코프 결정·미완 보호)으로 좁혔다. 이 셸이 서야 PRD-PF-D(데이터셋)·PF-E(AI 어시스트)·향후 함수/대시보드 PRD가 붙을 자리가 생긴다.

---

## 8. 열린 결정 / 불가 기능

**열린 결정**
1. `data↔studio` 자유 왕복을 허용했는데, 이게 "단계별 확정"이라는 북극성 원칙을 얼마나 희석하는지 — 실사용 데이터로 재검토 필요.
2. `problem_ontology_links`를 문제당 다중 온톨로지(참조 다건)로 확장할지, 이번 PRD는 `is_primary` 컬럼만 얹고 실제 다중 연결 UX는 보류 — 범위 확정 필요.
3. `workflow_state`를 jsonb 한 컬럼에 둘지, 감사추적 강화를 위해 별도 `problem_step_confirmations` 테이블(PRD-BM-D02 스타일 append-only)로 분리할지 — PRD-BM-D02(계보·감사추적)와의 통합 시점에 재결정.
4. "재사용(참조)" 모드에서 여러 문제가 같은 온톨로지 `main`을 동시 편집할 때의 충돌 정책(락? 실시간 CRDT? 순차 커밋만 허용?) — 별도 동시편집 PRD 필요, 이번 범위 밖.
5. `legacy-default` 마이그레이션 이후 기존 사용자에게 "이제부터 문제 단위로 작업하라"를 어떻게 안내할지(강제 유도 vs 선택적 노출) — UX 카피는 PRD-PF-E 또는 별도 온보딩 PRD에서.

**불가 기능(이번 PRD 범위 아님, 과대약속 금지)**
- 함수/키네틱 엔진(결정 규칙 실행) — `functions` 단계는 스텁만, 실제 엔진은 별도 PRD(`constraints.kind=decision` 계열).
- 대시보드·액션보드 실제 시각화(차트 라이브러리 도입 포함) — `board` 단계는 스텁만.
- 데이터셋 레지스트리·외부 커넥터 — `data` 단계는 기존 임포트 UI 재배치일 뿐, PRD-PF-D가 실물 구현.
- AI 어시스트 패널의 실제 제안 로직 — 자리만 예약, PRD-PF-E가 구현.
- 워크스페이스·온톨로지 컨테이너 자체(테이블·RLS·테넌시) — PRD-PF-A 선행 산출물이며 본 PRD는 그 존재를 전제만 함.
- 다중 사용자 동시 편집(실시간 협업 커서 등) — 별도 스코프.
