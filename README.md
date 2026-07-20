# Ontology Studio

> 도메인 전문가가 코드/쿼리 없이, **자기 업무 지식만으로** 온톨로지(지식 그래프)를 구축·운영하고, 그 위에서 **문제를 정의하고 해결**하는 그래프 플랫폼.

![Ontology Studio](docs/assets/hero.png)

<br/>

## 이 시스템을 관통하는 세 가지 축

Ontology Studio는 기능의 합이 아니라, 아래 세 명제를 끝까지 밀어붙인 결과물입니다. 모든 화면과 API는 이 축 위에 있습니다.

### 1. 온톨로지의 Git — *편집 → 커밋 → 푸시*

지식 그래프를 "한 번 만들고 끝"이 아니라 **버전 관리되는 자산**으로 다룹니다. 작업은 스테이징(Supabase)에 자동 저장되고, 의미 있는 시점에 커밋해 스냅샷을 남기며, 검증된 변경만 프로덕션(Neo4j)으로 푸시합니다. **브랜치**로 격리 편집하고 **병합(MR)**으로 main에 반영하며, 되돌리기(Undo)와 롤백이 항상 가능합니다.

| 동작 | Git 비유 | 실제 |
|------|---------|------|
| 편집 | working directory | 자동 저장 → Supabase |
| 브랜치 | `git branch` | 격리된 작업 공간 (스냅샷 체인) |
| 커밋 | `git commit` | 스냅샷 생성 (롤백 지점) |
| 병합 | `git merge` | 3-way 병합 · 충돌 해소(mine/theirs) |
| 푸시 | `git push` | Neo4j 프로덕션 반영 (main 전용) |

### 2. 스케치북 → 운영 온톨로지

대부분의 그래프 도구는 "예쁜 그림"에서 멈춥니다. 여기서의 목표는 **믿고 의사결정에 쓸 수 있는 단일 진실 모델**입니다. 그래서 노드·선은 설명 없이도 의미가 읽히도록 시각 언어를 재설계했고(클래스=원, 인스턴스=점, 계층=파선, 관계=실선), 세부(속성·제약·인스턴스)는 친절한 패널에서 컨펌만으로 채우게 했습니다. 그리고 여기서 멈추지 않고 — 그 모델 위에서 **결정함수·SPC/FDC·대시보드·AIP**로 실제 문제를 풉니다.

### 3. AI의 역할 전환 — *그림쟁이 → 모델 수호자(Critic)*

AI가 입력마다 새 그래프를 *낳는* 도구(`AI → 온톨로지`)에서, **지속되는 하나의 모델을 수호·접지·강화하는 부조종사**(`온톨로지 ⇄ AI`)로 엔진을 성숙시킵니다. 새 입력은 "새 그래프"가 아니라 **현재 모델에 대한 검증된 diff 제안**으로 들어오고, 중복·설계위반·일관성을 확정 전에 자동 검수합니다.

> 북극성: **AI는 온톨로지를 "만드는 자"가 아니라 온톨로지 "안에서 작동하는 행위자"다.** ([Palantir Foundry](https://www.palantir.com/platforms/foundry/) 벤치마크)

<br/>

## 두 개의 진입점 — 스튜디오 · 문제해결 플랫폼

첫 화면은 **공개 랜딩 페이지**입니다. `시작하기`를 누르면 두 갈래의 **런처**(`/platform`)가 열립니다.

| 랜딩 (`/`) | 런처 (`/platform`) |
|---|---|
| ![랜딩](docs/assets/landing.png) | ![런처](docs/assets/platform-chooser.png) |
| 코드 없이 지식을 온톨로지로 — 한 문장의 제안. | **온톨로지 스튜디오**(단독) vs **문제해결 플랫폼**(7단계) 중 선택. |

- **온톨로지 스튜디오** (`/studio`) — 문제 절차 없이 바로 지식 그래프를 스케치하고 AI가 비평합니다.
- **문제해결 플랫폼** (`/problems`) — 문제를 정의하고 데이터를 연결하면, AI가 온톨로지·결정함수·보드를 초안으로 지어 주고 사람이 단계마다 확정합니다. **온톨로지는 다음 문제에서 재사용**됩니다.

두 버전은 같은 온톨로지 엔진을 공유합니다. 스튜디오에서 만든 그래프를 플랫폼 문제에서 이어받고, 플랫폼에서 키운 온톨로지를 스튜디오에서 정교화할 수 있습니다.

<br/>

## 온톨로지 생성 로직

이 스튜디오의 심장은 **"입력 한 덩어리 → 믿고 쓸 수 있는 지식 그래프"** 로 가는 과정입니다.
아래 세 가지 원칙이 이 과정 전체를 관통합니다.

> **① AI가 판정하고, 당신은 컨펌만 합니다.** 매 단계 AI가 초안을 제시하고, 당신은 확인·수정만 하면 됩니다. AI가 몰래 확정하는 일은 없습니다.
> **② 모든 판단에는 근거와 출처가 붙습니다.** "왜 이렇게 판단했는지"와 "어디서 가져왔는지"가 카드에 그대로 노출됩니다.
> **③ Supabase가 항상 최신 기준(SoT)입니다.** 작업은 Supabase에 저장되고, 검증된 것만 Neo4j로 발행됩니다.

### 온톨로지의 구성요소

먼저, 그래프가 무엇으로 이루어지는지부터 봅니다.

| 구성요소 | 쉬운 말 | 예시 |
|---|---|---|
| **클래스(Class)** | 개념·유형 (원 ●) | `설비`, `고장`, `조치` |
| **인스턴스(Instance)** | 실제 사례 (점) | `식각기 1호(EQ-001)` |
| **속성(Property)** | 클래스가 갖는 특성 | `설비.공급사`, `설비.정격출력(kW)` |
| **관계(Relation)** | 개념·사례를 잇는 선 (실선) | `고장 —발생—> 설비` |
| **계층(is-a)** | 상·하위 관계 (파선) | `식각기`는 `설비`의 하위 |
| **제약·공리(Constraint·Axiom)** | 규칙 | "고장은 반드시 설비 1개에 연결" |
| **구획(Partition)** | 도메인별 격리 칸 | `설비보전` 구획, `설비공급망` 구획 |
| **패턴(Pattern)** | 재사용되는 설계 템플릿 (학습 캐시) | `semiconductor_process` 패턴 |

### 만들어지는 순서 (동작 시퀀스)

```mermaid
flowchart TD
    IN["📥 입력 — 자유 텍스트 · 표(CSV)"]

    n1["① 인지 및 라우팅<br/>AI: 도메인 감지 · 신뢰도 · 혼합 비율 · 확인질문(CQ) 생성<br/>🙋 컨펌: 도메인 요약 카드"]
    n2["② 패턴 확보 · 학습형 캐시<br/>AI: 캐시 재사용 또는 발견<br/>발견 = 공개 온톨로지 검색 → 적응 → 합성<br/>🙋 컨펌: 발견 카드 (출처 공개)"]
    n3["③ 패턴-시드 생성<br/>AI: 역할 부여 · 근거 기반 관계 · 중복 병합 · 실시간 렌더<br/>🙋 컨펌: 병합 미리보기"]
    n4["④ 용어 해소 (맥락 주입)<br/>AI: 모호·미정의어 감지 → 사전 → 맥락 → 웹 순서로 뜻 확정·재주입<br/>🙋 컨펌: 용어 확인 카드"]
    n5["⑤ 스키마 적응<br/>AI: 신규 요소를 재사용(map) · 확장(extend) · 분기(fork) 판정<br/>🙋 컨펌: 확장·분기 결정"]
    n6["⑥ 구획 및 크로스-구획 브릿지<br/>AI: 도메인별 격리 · 같은 대상을 구획 간 연결 제안<br/>🙋 컨펌: 브릿지 제안"]
    n7["⑦ 검증<br/>연결성(WCC · 도달성) + 확인질문(CQ) 통과율 점검"]
    n8["⑧ 커밋 및 발행<br/>Supabase(최신 기준·SoT) → Neo4j(발행 스냅샷) · 언제든 롤백"]
    n9["⑨ 소비 — AIP / 답변엔진<br/>패턴 기반 질의 · 온톨로지 근거 RAG · 멀티홉 탐색"]

    IN --> n1 --> n2 --> n3 --> n4 --> n5 --> n6 --> n7 --> n8 --> n9
    n9 -. "fork → 새 패턴 재발견" .-> n2
    n2 -. "확정 → 캐시 승격 · 수렴" .-> n2

    subgraph DATA["🗄️ 데이터 기반 (전 과정이 공유)"]
      direction LR
      D1["Supabase<br/>최신 기준(SoT)"]
      D2["Neo4j<br/>발행본"]
      D3["학습 캐시<br/>patterns"]
      D4["도메인 용어사전<br/>glossary"]
    end

    n8 -. "기록 · 발행" .-> DATA
    n2 -. "읽기 · 승격" .-> D3
    n4 -. "읽기 · 저장" .-> D4
```

### 각 단계가 하는 일 (풀어서)

| 단계 | AI가 하는 판정 | 당신이 하는 컨펌 | 왜 좋은가 |
|---|---|---|---|
| **① 인지 · 라우팅** | 입력이 어느 분야 이야기인지 감지하고, 신뢰도·혼합 비율과 "이 온톨로지가 답해야 할 질문(CQ)"을 뽑습니다. | 도메인 요약 카드 확인 | 엉뚱한 틀로 만들지 않도록 방향을 먼저 맞춥니다. |
| **② 패턴 확보** | 이미 배운 설계(캐시)가 있으면 재사용하고, 없으면 **공개 온톨로지를 검색 → 우리 도메인에 맞게 적응 → 부족하면 합성**합니다. | 발견 카드 확인 (출처·라이선스 노출) | 매번 맨바닥부터 그리지 않고, 검증된 설계를 물려받습니다. |
| **③ 시드 생성** | 각 요소에 역할을 부여하고, 근거·신뢰도가 붙은 관계를 만들며, 중복을 canonical로 병합해 실시간으로 그려냅니다. | 병합 미리보기 확인 | 같은 대상이 여러 개로 쪼개지지 않습니다. |
| **④ 용어 해소** | 모호하거나 정의 안 된 약어를 잡아, **용어사전 → 맥락 → 웹(도메인 범위)** 순으로 뜻을 확정하고 다시 주입합니다. | 용어 확인 카드 | 사내 약어(예: `VV`)도 뜻이 고정되어 일관됩니다. |
| **⑤ 스키마 적응** | 새 요소를 기존 것에 붙일지(map), 도메인을 넓힐지(extend), 새 갈래로 나눌지(fork) 판정합니다. | 확장·분기 결정 | 모델이 무질서하게 부풀지 않고 규칙적으로 자랍니다. |
| **⑥ 구획 · 브릿지** | 도메인을 칸(구획)으로 격리하되, 서로 다른 칸의 **같은 대상**을 찾아 연결(bridge)을 제안합니다. | 브릿지 제안 확인 | 분야는 분리하면서도 필요한 연결은 놓치지 않습니다. |
| **⑦ 검증** | 그래프 연결성(고립 노드·도달성)과 확인질문(CQ) 통과율을 점검합니다. | — (헬스 대시보드에서 확인) | "쓸 수 있는 그래프"인지 발행 전에 걸러냅니다. |
| **⑧ 커밋 · 발행** | Supabase에 스냅샷으로 커밋하고, 검증된 것만 Neo4j로 발행합니다. 언제든 롤백 가능. | 커밋·푸시 시점 선택 | 버전 관리되는 자산으로 안전하게 운영됩니다. |
| **⑨ 소비 (AIP)** | 발행된 그래프 위에서 패턴 기반 질의·근거 RAG·멀티홉 탐색을 합니다. | 질의·확인 | 만든 지식을 실제 답변에 곧바로 씁니다. |

> **되먹임(수렴):** 소비 중 새 갈래가 나오면 `fork`로 ②로 돌아가 패턴을 다시 발견하고, 확정된 패턴은 캐시로 **승격**되어 다음 작업이 점점 빨라집니다.

<br/>

## 핵심 루프 한눈에

**빈 캔버스 → 지식 입력 → AI 구조화 → 컨펌 → 그래프 → 커밋 → 푸시.**

| 1. 빈 온톨로지에서 시작 | 2. 지식 입력 (자유 텍스트) |
|---|---|
| ![빈 상태](docs/assets/studio-empty.png) | ![입력](docs/assets/knowledge-input.png) |
| 새 온톨로지는 안내 카드로 시작합니다 — 붙여넣기 · 예시 체험 · 패턴/템플릿. | 자유 형식 텍스트를 붙여넣으면 **입력 → 분석 → 검토 → 확정** 4단계로 진행됩니다. |

| 3. AI 구조화 + 컨펌 | 4. 친절한 속성 패널 |
|---|---|
| ![프리뷰](docs/assets/ai-preview.png) | ![패널](docs/assets/property-panel.png) |
| AI가 클래스·인스턴스·속성·관계로 정리하고, **검수 리포트·구조 검수**와 함께 미리보기로 보여줍니다. 확정해야 그래프에 반영됩니다. | 서브클래스·속성(타입 배지)·제약·인스턴스를 안내와 함께 컨펌형으로 채웁니다. |

표(CSV)도 그대로 넣을 수 있습니다. 컬럼·값·구조까지 분석해 **"데이터를 설명하는 온톨로지 + 인사이트"**로 만듭니다.

| CSV 입력 | AI Critic · 거버넌스 |
|---|---|
| ![CSV](docs/assets/csv-input.png) | ![Critic](docs/assets/ai-critic.png) |
| 첫 줄=헤더, 각 행=레코드. 실시간 글자수와 함께 붙여넣습니다. | 구획 분기·크로스-구획 브릿지·중복·설계위반을 **확정 전** 제안합니다(출처·유사도 공개). |

<br/>

## 문제해결 플랫폼 — 7단계 워크플로우

온톨로지를 그리는 데서 멈추지 않습니다. **문제해결 플랫폼**은 "무슨 문제를 푸는가"에서 시작해, 데이터·온톨로지·결정함수·통계·보드·자동화까지 **한 줄로 이어진 7단계**로 풀되, 각 단계는 **사람이 확정**해야 다음이 열립니다(격리 게이팅).

![문제 워크플로우 스텝퍼](docs/assets/problem-workflow.png)

| # | 단계 | 무엇을 하나 |
|---|------|------------|
| 1 | **문제정의** | 한 줄 문제·목표 지표(방향)·사전 정의 액션·결정 질문(CQ)을 정의. 패턴에서 CQ 초안을 불러올 수 있습니다. |
| 2 | **데이터 연결** | 정제된 CSV를 등록하면 여러 문제가 재사용. **데이터 충분성 코파일럿**이 도메인 필수 컬럼 대비 충분한지 진단. |
| 3 | **온톨로지 구축** | 온톨로지를 **재사용·확장·분기** 중 선택해 연결하고, 스튜디오 엔진으로 구축. |
| 4 | **결정함수** | 속성을 읽어 통과/불통과·점수·추천을 산출하는 함수. **자연어 규칙 → 조건식 초안**(사람이 확정, 자동 반영 없음). |
| 5 | **SPC/FDC** | 제품 측정값(SPC)·설비 센서(FDC)의 통계 판정. Western Electric 규칙 위반을 엔진이 계산(준실시간·배치). |
| 6 | **대시보드·액션** | 위젯을 코드 없이 조립하는 대시보드 + **액션보드**(처리 큐, 확정은 사람 HITL·완전자동 금지). |
| 7 | **AIP·자동화** | 모델 위에서 근거로 답하는 **답변엔진**(읽기전용·근거경로)과 **트리거**(이벤트→결정함수, 자율 실행 금지). |

### 단계별 화면

| 1·2. 문제정의 → 데이터 연결 | 4. 결정함수 (키네틱) |
|---|---|
| ![문제 정의](docs/assets/problem-define.png) | ![결정함수](docs/assets/decision-functions.png) |
| 목표 지표·액션·결정 질문을 정의하고, 데이터셋을 연결·진단합니다. | 자연어로 규칙을 쓰면 AI가 조건식 초안을 만들고 사람이 확정합니다. |

| 5. SPC/FDC 공정 스펙관리 | 6. 대시보드 · 액션보드 |
|---|---|
| ![SPC/FDC](docs/assets/spc-fdc.png) | ![액션보드](docs/assets/action-board.png) |
| 대상 클래스·공정변수·관리도(I-MR/X-bar)를 골라 판정 — WE 규칙 위반을 엔진이 계산. | 이상 항목은 액션보드로 올라오고, 확정/기각은 **행위자·사유가 기록**됩니다. |

> 데이터 연결 화면: [데이터 연결·충분성 진단](docs/assets/problem-data.png) · AIP·자동화 화면: [답변엔진·트리거](docs/assets/aip-operate.png)

<br/>

## 스튜디오 심화 — 운영 도구

| 구조 건강도 대시보드 | 커밋 히스토리 |
|---|---|
| ![건강도](docs/assets/health-dashboard.png) | ![히스토리](docs/assets/commit-history.png) |
| 클래스·인스턴스·커버리지·고아 노드·바인딩률·검증 위반·연결성을 한눈에. | 변경 이력(수동/자동 커밋)을 확인하고 롤백 지점으로 삼습니다. |

**패턴 마켓플레이스** — 도메인 전문가가 수렴시킨 패턴을 골라 한 번의 컨펌으로 새 구획에 시딩합니다. 출처·라이선스·사용 빈도·헬스가 카드에 그대로 드러납니다.

![마켓플레이스](docs/assets/marketplace.png)

<br/>

## 기능 가이드

각 항목은 별도 문서로 자세히 다룹니다.

| 기능 | 무엇을 하나 | 문서 |
|------|------------|------|
| **지식 입력 · AI 컨펌형 작성** | 자유 텍스트를 2단계로 추출(엔티티→관계), 미리보기에서 수정·확정 | [docs/guide/01-knowledge-input.md](docs/guide/01-knowledge-input.md) |
| **그래프 시각 언어** | 클래스/인스턴스/계층/관계를 설명 없이 구분, 인스턴스 점·접힘, 줌 LOD | [docs/guide/02-graph-visual-language.md](docs/guide/02-graph-visual-language.md) |
| **친절한 속성 패널** | 서브클래스·속성·제약·인스턴스·값·관계 조회/입력 | [docs/guide/03-property-panel.md](docs/guide/03-property-panel.md) |
| **CSV 분석** | 표를 데이터-설명 온톨로지 + 인사이트(참조 엔티티/범주/관계)로 변환 | [docs/guide/04-csv-ingestion.md](docs/guide/04-csv-ingestion.md) |
| **AI Critic · 거버넌스** | 중복대조·설계위반 검수·제약 제안·보강(HITL) | [docs/guide/05-ai-critic-governance.md](docs/guide/05-ai-critic-governance.md) |
| **온톨로지 Git · 브랜치 · 인증** | 자동저장/커밋/롤백/브랜치·병합/Neo4j 푸시, 인증·RLS | [docs/guide/06-staging-commit-push.md](docs/guide/06-staging-commit-push.md) |
| **문제해결 플랫폼 (7단계)** | 문제정의→데이터→온톨로지→결정함수→SPC/FDC→보드→AIP | [docs/guide/07-problem-solving-platform.md](docs/guide/07-problem-solving-platform.md) |
| **패턴 마켓플레이스 · 재사용** | 학습 캐시·구획·브릿지·패턴 발행/시딩 | [docs/guide/08-marketplace-patterns.md](docs/guide/08-marketplace-patterns.md) |

> 구현 현황·기획 문서는 [docs/STATUS.md](docs/STATUS.md) (칸반: `진행전/` → `진행중/` → `완료/`).

<br/>

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 15.1 (App Router, Turbopack) · React 19 · TypeScript 5 |
| UI | Tailwind CSS 4 · shadcn/ui · Lucide · motion |
| 그래프 엔진 | **Cytoscape.js** (fcose/dagre 레이아웃, 줌 LOD) |
| 데이터 시각화 | **ECharts** (대시보드 위젯) |
| 통계 엔진 | **인프로세스 JS** (SPC/FDC — I-MR·X-bar/R·Western Electric 규칙) |
| 상태 관리 | Zustand (+ zundo undo/redo) · TanStack Query |
| 스테이징 DB | Supabase PostgreSQL · Drizzle ORM · pgvector(임베딩) |
| 프로덕션 DB | Neo4j (neo4j-driver, 벡터 인덱스) |
| 인증 | Supabase Auth (SSR 세션 + RLS) |
| LLM | Vercel AI SDK · OpenAI (구조화 파싱·검수·임베딩·RAG) |
| 테스트 | Vitest · Playwright |

<br/>

## 시작하기

### 사전 요구사항
- Node.js 18+ / npm
- Supabase 프로젝트(원격) · (선택) Neo4j 인스턴스 · OpenAI API 키

### 설치 & 실행
```bash
cd ontology
npm install
npm run dev          # http://localhost:3000
```

### 주요 라우트

| 경로 | 화면 |
|------|------|
| `/` | 공개 랜딩 페이지 |
| `/platform` | 런처 — 스튜디오 vs 문제해결 플랫폼 |
| `/studio` | 온톨로지 스튜디오 (그래프 편집기) |
| `/problems` · `/problems/new` | 문제 목록 · 새 문제 |
| `/problems/[id]/{define,data,ontology-link,studio,functions,spc,board,operate}` | 문제 7단계 워크플로우 |
| `/marketplace` | 패턴 마켓플레이스 |

### 환경변수 — `ontology/.env.local`
```env
# Supabase (필수)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]

# LLM (필수)
OPENAI_API_KEY=[API_KEY]

# Neo4j (선택 — 푸시 기능)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[PASSWORD]

# 인증 이메일 링크 기준 URL (배포 시 실제 도메인)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### DB 마이그레이션
`supabase/migrations/`의 SQL을 순서대로 Supabase에 적용합니다.

### 테스트
```bash
npm run test                                   # 유닛 (Vitest)
npx playwright test e2e/auth.spec.ts           # E2E (dev 서버 자동 시작)
```

> 문서/README용 스크린샷은 `e2e/screenshots.spec.ts`로 재현 캡처합니다(확인된 시드 계정 `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` 필요). 회사망 환경에서는 dev 서버에 `NODE_EXTRA_CA_CERTS`가 필요합니다(`scripts/run-next.mjs`가 주입).

<br/>

## 라이선스 / License

**이 프로젝트는 오픈소스가 아닙니다.** 저작권자의 사전 서면 허가 없이 이 저장소의 어떤 부분도 복제·클론·수정·배포·사용할 수 없습니다. GitHub에서 소스를 열람하는 것만으로는 어떠한 사용 권리도 부여되지 않습니다. 무단 사용·복제·배포는 법적 책임을 초래할 수 있습니다.

**This project is not open source.** All Rights Reserved. No part of this repository may be copied, cloned, modified, distributed, or used without the prior written permission of the copyright holder. See the [LICENSE](./LICENSE) file for full terms.

Copyright (c) 2026 Youngbae Jeon. All Rights Reserved.
