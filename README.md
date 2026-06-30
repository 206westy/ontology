# Ontology Studio

> 도메인 전문가가 코드/쿼리 없이, **자기 업무 지식만으로** 온톨로지(지식 그래프)를 구축·운영하는 그래프 스튜디오.

![Ontology Studio](docs/assets/hero.png)

<br/>

## 이 시스템을 관통하는 세 가지 축

Ontology Studio는 기능의 합이 아니라, 아래 세 명제를 끝까지 밀어붙인 결과물입니다. 모든 화면과 API는 이 축 위에 있습니다.

### 1. 온톨로지의 Git — *편집 → 커밋 → 푸시*

지식 그래프를 "한 번 만들고 끝"이 아니라 **버전 관리되는 자산**으로 다룹니다. 작업은 스테이징(Supabase)에 자동 저장되고, 의미 있는 시점에 커밋해 스냅샷을 남기며, 검증된 변경만 프로덕션(Neo4j)으로 푸시합니다. 되돌리기(Undo)와 롤백이 항상 가능합니다.

| 동작 | Git 비유 | 실제 |
|------|---------|------|
| 편집 | working directory | 자동 저장 → Supabase |
| 커밋 | `git commit` | 스냅샷 생성 (롤백 지점) |
| 푸시 | `git push` | Neo4j 프로덕션 반영 |

### 2. 스케치북 → 운영 온톨로지

대부분의 그래프 도구는 "예쁜 그림"에서 멈춥니다. 여기서의 목표는 **믿고 의사결정에 쓸 수 있는 단일 진실 모델**입니다. 그래서 노드·선은 설명 없이도 의미가 읽히도록 시각 언어를 재설계했고(클래스=원, 인스턴스=점, 계층=파선, 관계=실선), 세부(속성·제약·인스턴스)는 친절한 패널에서 컨펌만으로 채우게 했습니다.

### 3. AI의 역할 전환 — *그림쟁이 → 모델 수호자(Critic)*

AI가 입력마다 새 그래프를 *낳는* 도구(`AI → 온톨로지`)에서, **지속되는 하나의 모델을 수호·접지·강화하는 부조종사**(`온톨로지 ⇄ AI`)로 엔진을 성숙시킵니다. 새 입력은 "새 그래프"가 아니라 **현재 모델에 대한 검증된 diff 제안**으로 들어오고, 중복·설계위반·일관성을 확정 전에 자동 검수합니다.

> 북극성: **AI는 온톨로지를 "만드는 자"가 아니라 온톨로지 "안에서 작동하는 행위자"다.** ([Palantir Foundry](https://www.palantir.com/platforms/foundry/) 벤치마크)

<br/>

## 3-레이어 아키텍처

```
┌─────────────────────────────────────────────┐
│  Layer 1 · 스튜디오 (Frontend)                │
│  사용자 조작 + LLM 보조                        │
│  Next.js + Cytoscape.js + shadcn/ui          │
└──────────────┬──────────────────────────────┘
               │ 자동 저장 (debounced)
               ▼
┌─────────────────────────────────────────────┐
│  Layer 2 · 스테이징 (Supabase / PostgreSQL)   │
│  온톨로지 CRUD + 커밋 로그 + 롤백 + 임베딩      │
└──────────────┬──────────────────────────────┘
               │ 커밋 → 검증된 분만 푸시
               ▼
┌─────────────────────────────────────────────┐
│  Layer 3 · 프로덕션 (Neo4j)                    │
│  확정된 지식 그래프 + 벡터 인덱스 + Cypher       │
└─────────────────────────────────────────────┘
```

<br/>

## 핵심 루프 한눈에

**자유 텍스트 / CSV → AI 구조화 → 컨펌 → 그래프 → 커밋 → 푸시.**

| 1. 지식 입력 | 2. AI 구조화 + 컨펌 |
|---|---|
| ![입력](docs/assets/knowledge-input.png) | ![프리뷰](docs/assets/ai-preview.png) |
| 자유 형식 텍스트나 표(CSV)를 붙여넣습니다. | AI가 클래스·인스턴스·속성·관계로 정리하고, 검수 리포트와 함께 미리보기로 보여줍니다. 확정해야 그래프에 반영됩니다. |

| 3. 표(CSV)도 그대로 | 4. 친절한 속성 패널 |
|---|---|
| ![CSV](docs/assets/csv-input.png) | ![패널](docs/assets/property-panel.png) |
| 조직의 표 데이터를 컬럼·값·구조까지 분석해 "데이터를 설명하는 온톨로지 + 인사이트"로 만듭니다. | 서브클래스·속성·제약·인스턴스를 안내와 함께 컨펌형으로 채웁니다. |

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
| **온톨로지 Git · 인증** | 자동저장/커밋/롤백/Neo4j 푸시, 인증·RLS | [docs/guide/06-staging-commit-push.md](docs/guide/06-staging-commit-push.md) |

> 구현 현황·기획 문서는 [docs/STATUS.md](docs/STATUS.md) (칸반: `진행전/` → `진행중/` → `완료/`).

<br/>

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 15.1 (App Router, Turbopack) · React 19 · TypeScript 5 |
| UI | Tailwind CSS 3.4 · shadcn/ui · Lucide · motion |
| 그래프 엔진 | **Cytoscape.js** (fcose/dagre 레이아웃, 줌 LOD) |
| 상태 관리 | Zustand (+ zundo undo/redo) · TanStack Query |
| 스테이징 DB | Supabase PostgreSQL · Drizzle ORM · pgvector(임베딩) |
| 프로덕션 DB | Neo4j (neo4j-driver, 벡터 인덱스) |
| 인증 | Supabase Auth (SSR 세션 + RLS) |
| LLM | OpenAI (구조화 파싱·검수·임베딩) |
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

## 라이선스

Private
