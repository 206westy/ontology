# Ontology Studio

> 도메인 전문가가 코드/쿼리 없이, 자기 업무 지식만으로 온톨로지(지식 그래프)를 구축할 수 있는 **그래프 편집 스튜디오**

<br/>

## 왜 이 제품인가

많은 기업이 GraphRAG나 지식 그래프를 도입하고 싶어 하지만, Neo4j 세팅과 Cypher 쿼리의 높은 진입장벽 때문에 포기합니다. Ontology Studio는 이 장벽을 완전히 제거합니다.

- **제로 코딩** — "클래스", "인스턴스" 같은 용어를 몰라도 됩니다
- **LLM 자동 구조화** — 자유 형식 텍스트를 넣으면 AI가 온톨로지로 변환합니다
- **HITL 교정** — AI 결과를 사용자가 프리뷰에서 수정/확정합니다
- **시각적 편집** — 드래그&드롭으로 관계 연결, 계층 이동
- **안전한 배포** — Git 방식 스테이징/커밋/푸시로 실수 방지 + 롤백 가능

<br/>

## 아키텍처 — "온톨로지의 Git"

```
┌─────────────────────────────────────────┐
│  Layer 1: 온톨로지 스튜디오 (Frontend)    │
│  사용자 조작 + LLM 보조                   │
│  Next.js + React Flow + shadcn/ui        │
└──────────────┬──────────────────────────┘
               │ 자동 저장 (debounced 2초)
               ▼
┌─────────────────────────────────────────┐
│  Layer 2: 스테이징 (Supabase)            │
│  온톨로지 CRUD + 커밋 로그 + 롤백 포인트   │
└──────────────┬──────────────────────────┘
               │ 수동 커밋 → 확정분만 푸시
               ▼
┌─────────────────────────────────────────┐
│  Layer 3: 프로덕션 (Neo4j)               │
│  확정된 온톨로지 그래프                    │
│  벡터 인덱스 + Cypher 탐색               │
└─────────────────────────────────────────┘
```

| 동작 | 비유 | 설명 |
|------|------|------|
| **편집** | working directory | 자동 저장 → Supabase |
| **커밋** | git commit | 수동 커밋 → 스냅샷 생성 |
| **푸시** | git push | Neo4j에 프로덕션 반영 |

<br/>

## 화면 구조

```
┌──────────┬──────────────────────────────────┬────────────┐
│          │          Toolbar (46px)           │            │
│          ├──────────────────────────────────┤            │
│ Explorer │                                  │   Right    │
│ (트리)   │       Graph Canvas               │   Panel    │
│          │       (그래프 시각화)              │  (노드상세) │
│  260px   │                                  │   320px    │
│          │      [Empty State / MiniMap]      │            │
│          ├──────────────────────────────────┤            │
│          │          Commit Bar (38px)        │            │
└──────────┴──────────────────────────────────┴────────────┘
```

<br/>

## 기능 사용법

### 1. 첫 시작 — 빈 캔버스

앱을 처음 열면 빈 캔버스에 안내가 표시됩니다.

- **예시 온톨로지 불러오기** — 반도체 장비 도메인 샘플(클래스 6개, 인스턴스 12개, 관계 3개)을 즉시 로딩하여 체험할 수 있습니다
- **직접 시작하기** — 입력 팝오버가 열리며 바로 지식을 입력할 수 있습니다
- **캔버스 더블클릭** — 클릭한 위치에 입력 팝오버가 열립니다

### 2. 지식 입력 (Knowledge Dump)

캔버스 빈 공간을 **더블클릭**하면 입력 팝오버가 열립니다.

1. 자유 형식으로 텍스트를 입력합니다 (이름 하나, 장비 목록, CSV 등 형식 제한 없음)
2. **[생성]** 클릭 → AI가 클래스/프로퍼티/인스턴스/관계를 자동 추출합니다
3. **프리뷰 모드**에서 결과를 확인하고 수정할 수 있습니다 (이름 변경, 항목 삭제)
4. **[확정]** 클릭 → 캔버스에 노드와 엣지가 생성됩니다

> 대량 텍스트(100자 이상) 입력 시 5단계 진행률이 표시되며, 취소도 가능합니다.

### 3. 노드 편집

- **캔버스에서 노드 클릭** → 우측 Right Panel에 상세 정보가 표시됩니다
- **Explorer 트리에서 클릭** → 동일하게 Right Panel이 교체됩니다

Right Panel에서 직접 편집할 수 있는 항목:

| 섹션 | 설명 |
|------|------|
| Description | 노드 설명 |
| Subclasses | 하위 클래스 목록 + 추가 |
| Properties | 프로퍼티 이름/타입/필수여부 + 추가 |
| Relations | 다른 노드와의 관계 + 추가 |
| Constraints | 제약조건 (기본 접힘) |
| Instances | 인스턴스 목록 (기본 접힘) |

### 4. 관계 연결

**드래그 방식**: 캔버스에서 노드 A → 노드 B로 드래그하면 관계 설정 팝오버가 열립니다.

1. 기존 관계 타입에서 선택하거나 새 관계 이름을 입력합니다
2. **[연결]** 클릭 → 엣지가 생성됩니다

**계층 이동**: 노드를 다른 노드 위에 드롭하면 "하위 클래스로 설정할까요?" 확인이 나타납니다.

### 5. 검색 + 탐색

- **Explorer 검색창**에 이름을 입력하면 클래스/인스턴스가 필터링됩니다
- 검색 결과를 클릭하면 캔버스가 해당 노드로 **줌/패닝** + 하이라이트 링이 1.5초 표시됩니다
- **Ctrl+F** 단축키로 검색창에 즉시 포커스합니다
- **MiniMap** (우하단)으로 전체 그래프 구조를 한눈에 파악할 수 있습니다

### 6. 줌 레벨에 따른 노드 표시 (Level of Detail)

| 줌 레벨 | 노드 표시 |
|---------|----------|
| 100% 이상 | 이름 + 인스턴스 수 뱃지 + 프로퍼티 |
| 50~99% | 이름만 표시 |
| 50% 미만 | 색상 dot만 표시 |

### 7. 커밋 (Supabase 저장)

하단 **Commit Bar**에 변경사항이 실시간으로 누적됩니다.

- **변경사항 N건** — 총 변경 수 (추가/수정/삭제)
- **[되돌리기]** — Ctrl+Z와 동일 (최대 50단계)
- **[변경 내역]** — diff 뷰 시트 (추가: 초록, 수정: amber, 삭제: 빨강)
- **[커밋]** — Supabase에 스냅샷을 저장합니다

### 8. Neo4j 푸시 (프로덕션 반영)

커밋된 변경사항을 Neo4j 프로덕션 그래프에 반영합니다.

1. Commit Bar의 **[Neo4j 푸시]** 클릭
2. **확인 시트**가 올라옵니다:
   - 변경 요약 (+N class, ~N modified, -N deleted)
   - Cypher 미리보기 (접기/펼치기, 구문 하이라이팅, 복사 버튼)
3. **[푸시 실행]** 클릭 → 진행률 바 + 단계별 체크리스트가 표시됩니다
4. 완료 시: 성공 알림 + Neo4j 브라우저 링크 / 실패 시: 에러 목록 + 재시도/건너뛰기

> 푸시 진행 중에는 시트를 닫을 수 없습니다 (Esc, 바깥 클릭 차단).

### 9. 노드 삭제

- **Delete 키** 또는 Right Panel 삭제 버튼 클릭
- 하위 항목이 있으면 영향 범위 트리가 표시됩니다
- **cascade** (하위 모두 삭제) 또는 **promote** (하위를 상위로 승격) 중 선택
- 삭제 후에도 Undo(Ctrl+Z)로 되돌릴 수 있습니다

### 10. 다크모드

시스템 테마를 따라 자동 전환됩니다. 다크모드에서 모든 노드, 엣지, 패널이 최적화된 색상으로 표시됩니다.

<br/>

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+Z` | 되돌리기 (Undo) |
| `Ctrl+Shift+Z` / `Ctrl+Y` | 다시하기 (Redo) |
| `Delete` / `Backspace` | 선택 노드/엣지 삭제 |
| `Ctrl+F` | Explorer 검색 포커스 |
| `Esc` | 팝오버 닫기 / 선택 해제 |
| 더블클릭 (빈 공간) | 새 노드 생성 팝오버 |

<br/>

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 15.1 (App Router, Turbopack) |
| UI | React 19 + TypeScript 5 + Tailwind CSS 3.4 |
| 컴포넌트 | shadcn/ui + Lucide React (아이콘) |
| 그래프 엔진 | React Flow 12 + ELKjs (자동 레이아웃) |
| 상태 관리 | Zustand (+ immer, zundo) + React Query |
| 애니메이션 | Framer Motion |
| DB (스테이징) | Supabase PostgreSQL + Drizzle ORM |
| DB (프로덕션) | Neo4j (neo4j-driver) |
| LLM | Claude API (Anthropic) |
| 테스트 | Vitest + Playwright |

<br/>

## 시작하기

### 사전 요구사항

- Node.js 18+
- npm
- Supabase 프로젝트 (원격)
- Neo4j 인스턴스 (선택 — 푸시 기능 사용 시)

### 설치

```bash
cd ontology
npm install
```

### 환경변수 설정

`ontology/.env.local` 파일을 생성합니다:

```env
# Supabase (필수)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]

# Neo4j (선택 — 푸시 기능 사용 시)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[PASSWORD]

# LLM (필수 — AI 구조화 기능)
OPENAI_API_KEY=[API_KEY]
```

### DB 마이그레이션

`supabase/migrations/` 디렉토리의 SQL 파일을 순서대로 Supabase에 적용합니다.

### 실행

```bash
cd ontology
npm run dev
```

http://localhost:3000 에서 확인합니다.

### 테스트

```bash
# 유닛 테스트
npm run test

# E2E 테스트 (dev 서버 자동 시작)
npx playwright test
```

<br/>

## 프로젝트 구조

```
ontology/src/
├── app/                    # Next.js App Router
│   ├── api/                # REST API 라우트
│   │   ├── classes/        # 클래스 CRUD
│   │   ├── instances/      # 인스턴스 CRUD
│   │   ├── properties/     # 프로퍼티 CRUD
│   │   ├── edges/          # 엣지 CRUD
│   │   ├── relation-types/ # 관계 타입 CRUD
│   │   ├── axioms/         # 공리 CRUD
│   │   ├── commits/        # 커밋 생성
│   │   ├── neo4j/          # Neo4j 푸시/롤백/상태
│   │   └── llm/parse/      # LLM 구조화
│   └── globals.css         # 디자인 토큰 + 다크모드
├── components/ui/          # shadcn/ui 컴포넌트
├── features/ontology/
│   ├── components/         # 핵심 UI 컴포넌트
│   │   ├── GraphCanvas     # 캔버스 (React Flow)
│   │   ├── ExplorerPanel   # 좌측 트리
│   │   ├── RightPanel      # 우측 상세 패널
│   │   ├── CommitBar       # 하단 커밋 바
│   │   ├── Toolbar         # 상단 도구 바
│   │   ├── EmptyState      # 빈 캔버스 안내
│   │   ├── neo4j/          # Neo4j 푸시 UI
│   │   └── skeletons/      # 로딩 스켈레톤
│   ├── hooks/              # Zustand 스토어 + React Query
│   ├── constants/          # 색상, 샘플 데이터
│   └── lib/                # 타입, 스키마, 유틸
├── lib/
│   ├── drizzle/            # Drizzle ORM 스키마
│   ├── neo4j/              # Neo4j 클라이언트 + Cypher 빌더
│   ├── supabase/           # Supabase 클라이언트
│   └── api-error.ts        # 에러 처리 전략
└── e2e/                    # Playwright E2E 테스트
```

<br/>

## 라이선스

Private
