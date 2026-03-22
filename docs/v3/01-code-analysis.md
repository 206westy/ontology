# 코드베이스 및 DB 분석 보고서

> **분석일**: 2026-03-22
> **분석 대상**: Ontology Studio MVP (ontology/ 디렉토리)
> **분석자**: 코드분석자 (v3 기획단)

---

## 1. 프로젝트 구조

### 1.1 전체 디렉토리 트리

```
ontology/src/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # 루트 레이아웃 (providers 래핑)
│   ├── page.tsx                   # 메인 스튜디오 페이지 (SPA 단일 페이지)
│   ├── not-found.tsx              # 404 페이지
│   ├── providers.tsx              # ThemeProvider + QueryClientProvider
│   ├── globals.css                # Tailwind + CSS 변수 + 노드 색상 토큰
│   └── api/                       # API Routes (서버사이드)
│       ├── classes/               # 클래스 CRUD
│       ├── properties/            # 프로퍼티 CRUD
│       ├── instances/             # 인스턴스 CRUD
│       ├── instance-values/       # 인스턴스 값 upsert/delete
│       ├── edges/                 # 엣지 CRUD
│       ├── relation-types/        # 관계 타입 CRUD
│       ├── axioms/                # 공리 CRUD
│       ├── commits/               # 커밋 생성/조회
│       ├── llm/parse/             # LLM 자유 입력 구조화
│       └── neo4j/                 # Neo4j 푸시/롤백/상태
│           ├── push/route.ts
│           ├── rollback/route.ts
│           └── status/route.ts
│
├── components/ui/                 # shadcn/ui 컴포넌트 (28개)
│
├── features/ontology/             # 핵심 피처 (feature-sliced)
│   ├── api.ts                     # 프론트엔드 API 클라이언트 (fetch 래퍼)
│   ├── components/                # 피처 컴포넌트
│   │   ├── ClassNode.tsx          # React Flow 커스텀 클래스 노드
│   │   ├── InstanceNode.tsx       # React Flow 커스텀 인스턴스 노드
│   │   ├── GraphCanvas.tsx        # 메인 그래프 캔버스 (React Flow)
│   │   ├── ExplorerPanel.tsx      # 좌측 트리 패널
│   │   ├── RightPanel.tsx         # 우측 상세 패널
│   │   ├── Toolbar.tsx            # 상단 도구 모음
│   │   ├── CommitBar.tsx          # 하단 커밋 바
│   │   ├── NewNodePopover.tsx     # 새 노드 생성 팝오버 (LLM 연동)
│   │   ├── RelationPopover.tsx    # 관계 설정 팝오버
│   │   ├── HierarchyPopover.tsx   # 계층 이동 확인 팝오버
│   │   ├── DeleteConfirmDialog.tsx# 삭제 확인 다이얼로그
│   │   ├── EmptyState.tsx         # 빈 캔버스 상태
│   │   ├── neo4j/                 # Neo4j 관련 UI
│   │   │   ├── NeoConfirmSheet.tsx
│   │   │   ├── CypherPreview.tsx
│   │   │   ├── PushProgress.tsx
│   │   │   ├── PushResult.tsx
│   │   │   └── PushSummary.tsx
│   │   └── skeletons/             # 로딩 스켈레톤
│   │       ├── CanvasSkeleton.tsx
│   │       ├── ExplorerSkeleton.tsx
│   │       └── RightPanelSkeleton.tsx
│   ├── constants/
│   │   ├── colors.ts              # 노드 색상 체계 (JS + CSS var)
│   │   └── sample-ontology.ts     # 샘플 데이터
│   ├── hooks/
│   │   ├── useOntologyStore.ts    # Zustand 메인 스토어 (+ zundo undo/redo)
│   │   ├── useLoadOntology.ts     # 초기 데이터 로딩 (React Query → Zustand)
│   │   ├── useApiSync.ts          # 낙관적 동기화 (Zustand → API)
│   │   ├── useKeyboardShortcuts.ts# 키보드 단축키
│   │   ├── useClasses.ts          # React Query - classes
│   │   ├── useInstances.ts        # React Query - instances
│   │   ├── useProperties.ts       # React Query - properties
│   │   ├── useEdges.ts            # React Query - edges
│   │   ├── useRelationTypes.ts    # React Query - relation types
│   │   ├── useAxioms.ts           # React Query - axioms
│   │   ├── useCommits.ts          # React Query - commits
│   │   └── index.ts               # 배럴 export
│   └── lib/
│       ├── types.ts               # 전체 TypeScript 타입 정의
│       ├── schemas.ts             # Zod 스키마 (입력 검증)
│       ├── elk-layout.ts          # ELKjs 자동 레이아웃
│       └── popover-position.ts    # 팝오버 위치 계산
│
├── hooks/
│   └── use-toast.ts               # 토스트 훅
│
├── lib/
│   ├── utils.ts                   # cn() 유틸리티
│   ├── api-error.ts               # API 에러 헬퍼
│   ├── drizzle/
│   │   ├── index.ts               # Drizzle DB 클라이언트
│   │   └── schema.ts              # Drizzle ORM 스키마 (10개 테이블)
│   ├── neo4j/
│   │   ├── client.ts              # Neo4j 드라이버
│   │   └── cypher-builder.ts      # 변경사항 → Cypher 변환 + 롤백
│   └── supabase/
│       ├── client.ts              # Supabase 브라우저 클라이언트
│       └── server.ts              # Supabase 서버 클라이언트
│
└── __tests__/                     # 테스트 (Vitest + Testing Library)
    ├── components/                # 컴포넌트 테스트 (10개)
    ├── lib/                       # 유틸리티 테스트 (2개)
    ├── schemas/                   # 스키마 테스트 (1개)
    └── store/                     # 스토어 테스트 (2개)
```

### 1.2 shadcn/ui 컴포넌트 목록 (28개)

accordion, alert-dialog, avatar, badge, button, card, checkbox, collapsible, command, dialog, dropdown-menu, file-upload, form, input, label, popover, scroll-area, select, separator, sheet, skeleton, table, tabs, textarea, toast, toaster, tooltip

---

## 2. 페이지 라우트 및 화면 구성

### 2.1 라우트 구조

| 경로 | 파일 | 설명 |
|------|------|------|
| `/` | `app/page.tsx` | 메인 스튜디오 (SPA 단일 페이지) |
| `/api/classes` | `api/classes/route.ts` | 클래스 목록/생성 |
| `/api/classes/[id]` | `api/classes/[id]/route.ts` | 클래스 조회/수정/삭제 |
| `/api/properties` | `api/properties/route.ts` | 프로퍼티 목록/생성 |
| `/api/properties/[id]` | `api/properties/[id]/route.ts` | 프로퍼티 수정/삭제 |
| `/api/instances` | `api/instances/route.ts` | 인스턴스 목록/생성 |
| `/api/instances/[id]` | `api/instances/[id]/route.ts` | 인스턴스 수정/삭제 |
| `/api/instance-values` | `api/instance-values/route.ts` | 인스턴스 값 upsert/삭제 |
| `/api/edges` | `api/edges/route.ts` | 엣지 목록/생성/삭제 |
| `/api/edges/[id]` | `api/edges/[id]/route.ts` | 엣지 삭제 |
| `/api/relation-types` | `api/relation-types/route.ts` | 관계 타입 CRUD |
| `/api/relation-types/[id]` | `api/relation-types/[id]/route.ts` | 관계 타입 수정/삭제 |
| `/api/axioms` | `api/axioms/route.ts` | 공리 CRUD |
| `/api/axioms/[id]` | `api/axioms/[id]/route.ts` | 공리 수정/삭제 |
| `/api/commits` | `api/commits/route.ts` | 커밋 목록/생성 |
| `/api/llm/parse` | `api/llm/parse/route.ts` | LLM 구조화 |
| `/api/neo4j/push` | `api/neo4j/push/route.ts` | Neo4j 푸시 |
| `/api/neo4j/rollback` | `api/neo4j/rollback/route.ts` | Neo4j 롤백 |
| `/api/neo4j/status` | `api/neo4j/status/route.ts` | Neo4j 연결 상태 |

### 2.2 메인 화면 구성

```
+------------+-------------------------------+------------+
|            |          Toolbar (46px)        |            |
|            +-------------------------------+            |
|  Explorer  |                               |   Right    |
|  (260px)   |      GraphCanvas              |   Panel    |
|  좌측 트리  |      (React Flow)             |  (320px)   |
|            |                               |  상세 패널  |
|            +-------------------------------+            |
|            |       CommitBar (38px)         |            |
+------------+-------------------------------+------------+
             |  NewNodePopover (overlay)      |
             |  RelationPopover (overlay)     |
             |  HierarchyPopover (overlay)    |
             |  DeleteConfirmDialog (overlay) |
```

---

## 3. 핵심 기능 상세

### 3.1 온톨로지 데이터 모델 (CRUD)

**구성 요소**:
- **Classes**: 계층적 카테고리 (Adjacency List 패턴, `parent_id` 자기참조)
- **Properties**: 클래스 속성 정의 (6가지 데이터 타입: string, integer, float, boolean, date, enum)
- **Instances**: 클래스의 실체
- **Instance Values**: EAV 패턴의 인스턴스별 속성값
- **Relation Types**: 전역 관계 타입 팔레트 (이름 unique)
- **Edges**: 실제 연결 (폴리모픽 FK - class/instance 간 관계)
- **Axioms**: 공리/제약조건 (M:N 클래스 매핑)

**상태 관리 패턴**:
- Zustand 스토어가 모든 온톨로지 데이터를 메모리에 보유
- 변경은 즉시 Zustand에 반영 (낙관적 UI)
- `useApiSync` 훅이 변경사항을 비동기로 API에 동기화
- zundo 미들웨어로 Undo/Redo (최대 50단계)

### 3.2 그래프 캔버스 (GraphCanvas)

**기능**:
- React Flow 12 기반 그래프 시각화
- ELKjs layered 알고리즘 자동 레이아웃
- 커스텀 노드 타입 2종: ClassNode (원형, 색상 구분), InstanceNode (소형)
- 엣지 3종: is-a (부모-자식), instance-of (인스턴스-클래스), relation (사용자 정의)
- 줌/패닝, 미니맵, 도트 그리드 배경
- 노드 선택 → Explorer + RightPanel 동기화
- 노드 드래그 후 겹침 → 계층 이동 팝오버
- 엣지 드래그 연결 → 관계 설정 팝오버
- 빈 공간 더블클릭 → 새 노드 생성 팝오버
- 포커스 노드 하이라이트 (1.5초 pulse)
- 도구 모드: 선택/패닝 전환
- 빈 캔버스 EmptyState 표시

### 3.3 Explorer 패널 (좌측)

**기능**:
- 계층 트리 렌더링 (클래스 + 인스턴스)
- 접기/펼치기 (캐럿 클릭 시 선택 변경 없음)
- 클래스: 색상 dot + 굵은 이름 + 인스턴스 카운트
- 인스턴스: 연한 green dot + 보조 색상 이름
- 빈 클래스: opacity 0.5
- 검색 필터링 (Ctrl+F 단축키)
- 노드 클릭 → 캔버스 포커스 + 선택
- 하단 "새 클래스 추가" 버튼

### 3.4 Right Panel (우측 상세 패널)

**구성** (탭 3개):
1. **상세 탭**:
   - 노드 이름 (인라인 편집)
   - 타입 배지 (CLASS/INSTANCE)
   - 삭제 버튼
   - Description (인라인 편집, 멀티라인)
   - Subclasses 섹션 (접기/펼치기, + 추가)
   - Properties 섹션 (타입 배지, req 배지, + 추가, 삭제)
   - Constraints 섹션 (기본 접힘, + 추가, 삭제)
   - Instances 섹션 (기본 접힘, 테이블 형식, + 추가, 삭제)
   - 인스턴스 선택 시: Property Values 편집 (타입별 에디터)

2. **관계 탭**:
   - 방향 표시 (outgoing/incoming)
   - 관계 타입 배지
   - 대상 노드 네비게이션
   - 관계 추가 (팝오버 트리거)
   - 관계 삭제

3. **AI 탭**:
   - 자연어 입력창 (현재 미구현, toast 안내)
   - Sparkles 아이콘 + 안내 메시지

**인스턴스 상세 뷰**: 부모 클래스 브레드크럼, Property Values 편집 (타입별: boolean 토글, enum 드롭다운, 텍스트/숫자/날짜 인라인)

### 3.5 새 노드 생성 (NewNodePopover)

**3단계 흐름**:
1. **입력 Phase**: 자유 형식 텍스트 입력 (textarea)
2. **로딩 Phase**: 100자 이상 시 5단계 진행 표시 (텍스트 파싱 → 엔티티 추출 → 관계 추론 → 기존 온톨로지 매칭 → 계층 구조 최적화)
3. **프리뷰 Phase**: 계층 트리 + 프로퍼티 + 관계 미리보기, 개별 항목 삭제 가능

**LLM 연동**:
- 프론트엔드에서 `llmApi.parse()` 호출
- 서버에서 OpenAI API (gpt-5.4-mini 모델) 사용
- 기존 클래스/관계 타입을 컨텍스트로 전달 (중복 방지)
- LLM 실패 시 `mockParse()` 로컬 파서 폴백

**확정 시**: 토폴로지 정렬 후 순차 생성 (클래스 → 프로퍼티 → 관계 타입 + 엣지 → 인스턴스)

### 3.6 관계 연결 (RelationPopover)

- 노드 간 드래그 완료 시 트리거
- 기존 관계 팔레트에서 선택 (라디오)
- 새 관계 이름 입력 가능
- 소스/타겟 노드 표시

### 3.7 계층 이동 (HierarchyPopover)

- 노드를 다른 노드 위에 60px 이내로 드롭 시 트리거
- 트리 프리뷰로 이동 결과 미리 보기
- 확정 시 `parent_id` 업데이트

### 3.8 커밋 시스템 (CommitBar)

**변경 추적**:
- 모든 CRUD 작업이 `pendingChanges` 배열에 자동 기록
- 변경 유형별 카운트 표시 (ADD/MOD/DEL, 색상 구분)
- 변경 없을 시 비활성

**주요 액션**:
- **되돌리기**: zundo undo (Zustand temporal 미들웨어)
- **변경 내역**: Sheet 바텀 시트로 상세 diff 표시
- **커밋**: 변경사항을 Supabase `commits` + `commit_details` 테이블에 저장 후 `pendingChanges` 클리어
- **Neo4j 푸시**: NeoConfirmSheet 열기

### 3.9 Neo4j 푸시 시스템

**흐름**:
1. 커밋된 변경사항에서 Cypher 구문 자동 생성 (`cypher-builder.ts`)
2. Dry run으로 Cypher 프리뷰 표시 (`CypherPreview.tsx`)
3. 확정 시 Neo4j 트랜잭션 실행 (`PushProgress.tsx` → `PushResult.tsx`)
4. 성공 시 `pushed_to_neo4j = true` 마킹

**Cypher 생성 규칙**:
- ADD 먼저 처리, DEL 나중에 처리 (노드 존재 보장)
- 테이블 우선순위: classes → relation_types → properties → instances → instance_values → edges → axioms
- Class: CREATE/SET/DETACH DELETE + IS_A 관계
- Instance: CREATE + INSTANCE_OF 관계
- Edge: 관계 타입명을 대문자 Snake Case로 변환하여 관계 이름 사용
- Property: 클래스 노드의 속성으로 추가/제거
- 롤백: 역순으로 반대 연산 생성

### 3.10 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | 선택 노드 삭제 (확인 다이얼로그) |
| `Ctrl+F` / `Cmd+F` | Explorer 검색 포커스 |
| `Esc` | 팝오버 닫기 |

---

## 4. 부가 기능 상세

### 4.1 테마 시스템

- `next-themes` ThemeProvider (system/light/dark)
- CSS 변수 기반 색상 토큰 (`globals.css`)
- 노드 색상: 라이트/다크 별도 팔레트 (`colors.ts`)
- MiniMap: JS 색상값 사용 (CSS var 불가)

### 4.2 도구 모드 (Toolbar)

- 선택 도구 (V): 노드 선택 + 드래그
- 이동 도구 (H): 캔버스 패닝
- 줌 도구: 확대/축소/전체 보기
- Undo/Redo 버튼 (zundo 연동)
- 내보내기 버튼 (disabled, 미구현)
- 가져오기 버튼 (= NewNodePopover 트리거)
- AI 어시스턴트 버튼 (disabled, 미구현)

### 4.3 로딩 스켈레톤

- CanvasSkeleton, ExplorerSkeleton, RightPanelSkeleton
- 초기 데이터 로딩 중 표시

### 4.4 토스트 알림

- `sonner` 라이브러리 사용
- 커밋 성공/실패, 동기화 실패, AI 기능 미지원 안내 등

---

## 5. DB 스키마 (테이블, 관계)

### 5.1 Supabase 테이블 구조 (실제 DB 확인)

| 테이블 | 행 수 | RLS | PK | 설명 |
|--------|-------|-----|-----|------|
| `classes` | 0 | OFF | `id` (uuid) | 온톨로지 클래스 (계층 구조) |
| `properties` | 0 | OFF | `id` (uuid) | 클래스 프로퍼티 정의 |
| `instances` | 0 | OFF | `id` (uuid) | 인스턴스 (클래스의 실체) |
| `instance_values` | 0 | OFF | `id` (uuid) | 인스턴스별 속성값 (EAV) |
| `relation_types` | 0 | OFF | `id` (uuid) | 관계 타입 팔레트 |
| `edges` | 0 | OFF | `id` (uuid) | 실제 연결 (관계 인스턴스) |
| `axioms` | 0 | OFF | `id` (uuid) | 공리/제약조건 |
| `axiom_classes` | 0 | OFF | `axiom_id + class_id` (복합) | 공리-클래스 M:N 매핑 |
| `commits` | 16 | OFF | `id` (uuid) | 커밋 로그 |
| `commit_details` | 20 | OFF | `id` (uuid) | 커밋별 변경사항 |

### 5.2 ER 다이어그램

```
classes (자기참조)
  ├─1:N─→ properties ──1:N──→ instance_values ←──N:1── instances
  ├─1:N─→ instances
  ├─M:N─→ axiom_classes ←──M:N── axioms
  └─ ref ─→ relation_types (source/target class 힌트)
               └─1:N─→ edges (source_id/target_id 폴리모픽)

commits ──1:N──→ commit_details
```

### 5.3 주요 FK 관계

| 소스 | 타겟 | ON DELETE |
|------|------|-----------|
| `classes.parent_id` → `classes.id` | 자기참조 | SET NULL (고아 방지) |
| `properties.class_id` → `classes.id` | | CASCADE |
| `instances.class_id` → `classes.id` | | CASCADE |
| `instance_values.instance_id` → `instances.id` | | CASCADE |
| `instance_values.property_id` → `properties.id` | | CASCADE |
| `edges.relation_type_id` → `relation_types.id` | | CASCADE |
| `relation_types.source_class_id` → `classes.id` | | SET NULL |
| `relation_types.target_class_id` → `classes.id` | | SET NULL |
| `axiom_classes.axiom_id` → `axioms.id` | | CASCADE |
| `axiom_classes.class_id` → `classes.id` | | CASCADE |
| `commit_details.commit_id` → `commits.id` | | CASCADE |

### 5.4 CHECK 제약조건

- `classes.color`: HEX 형식 (`^#[0-9a-fA-F]{6}$`)
- `properties.data_type`: `IN ('string','integer','float','boolean','date','enum')`
- `edges.source_kind`, `edges.target_kind`: `IN ('class','instance')`
- `edges.source_id != target_id`: 자기 루프 방지
- `axioms.severity`: `IN ('info','warning','error')`
- `commit_details.operation`: `IN ('ADD','MOD','DEL')`

### 5.5 UNIQUE 제약조건

- `classes`: `(parent_id, name)` - 같은 부모 밑 동명 금지
- `properties`: `(class_id, name)` - 같은 클래스 내 동명 금지
- `instances`: `(class_id, name)` - 같은 클래스 내 동명 금지
- `instance_values`: `(instance_id, property_id)` - 1인스턴스 1프로퍼티 1값
- `relation_types`: `name` (전역 유일)
- `edges`: `(relation_type_id, source_id, target_id)` - 동일 관계 중복 방지

### 5.6 마이그레이션 파일 (10개)

```
supabase/migrations/
├── 20260322000001_create_classes_table.sql
├── 20260322000002_create_properties_table.sql
├── 20260322000003_create_instances_table.sql
├── 20260322000004_create_instance_values_table.sql
├── 20260322000005_create_relation_types_table.sql
├── 20260322000006_create_edges_table.sql
├── 20260322000007_create_axioms_tables.sql
├── 20260322000008_create_commits_tables.sql
├── 20260322000009_create_triggers_and_disable_rls.sql
└── 20260322100001_add_neo4j_push_columns.sql
```

---

## 6. 유저 시나리오 (사용자 흐름)

### 시나리오 1: 최초 접속 및 온톨로지 생성

1. 사용자가 앱 접속 → 로딩 스피너 → 빈 캔버스 + EmptyState 표시
2. 캔버스 빈 공간 더블클릭 (또는 Explorer "새 클래스 추가", Toolbar "가져오기")
3. NewNodePopover Phase 1: 자유 텍스트 입력 (예: "반도체 공정 장비: DryAsher, WetStation...")
4. "생성" 클릭 → LLM API 호출 (100자 이상 시 로딩 Phase 표시)
5. Phase 3 프리뷰: 추출된 클래스/프로퍼티/관계/인스턴스 확인
6. 불필요 항목 삭제, "확정" 클릭
7. 캔버스에 노드/엣지 자동 생성 + ELK 레이아웃
8. `useApiSync`가 변경사항을 Supabase에 동기화
9. CommitBar에 변경사항 누적

### 시나리오 2: 기존 노드 편집

1. 캔버스 또는 Explorer에서 노드 클릭
2. RightPanel에 상세 정보 표시
3. 이름 클릭 → 인라인 편집
4. Description 클릭 → 인라인 텍스트 편집
5. Properties에서 "프로퍼티 추가" → 이름 + 타입 지정
6. Instances에서 "인스턴스 추가" → 이름 입력
7. Constraints에서 "제약조건 추가" → 자연어 설명 입력

### 시나리오 3: 관계 연결

1. 캔버스에서 노드 A의 핸들에서 노드 B로 드래그
2. RelationPopover 등장
3. 기존 관계 타입 선택 또는 새 관계 이름 입력
4. "연결" 클릭 → 엣지 생성

### 시나리오 4: 계층 이동 (is-a)

1. 캔버스에서 클래스 노드를 다른 클래스 노드 위에 드롭 (60px 이내)
2. HierarchyPopover 등장: "A를 B의 하위로 이동할까요?"
3. 트리 프리뷰 확인
4. "확정" → parent_id 업데이트, 트리 갱신

### 시나리오 5: 커밋

1. CommitBar에서 변경사항 확인 (ADD/MOD/DEL 카운트)
2. "변경 내역" 클릭 → Sheet에서 상세 diff 확인
3. "커밋" 클릭 → commits + commit_details 테이블에 저장
4. pendingChanges 클리어, 토스트 알림

### 시나리오 6: Neo4j 푸시

1. CommitBar에서 "Neo4j 푸시" 클릭
2. NeoConfirmSheet 등장: 미푸시 커밋 목록 + Cypher 프리뷰
3. "프로덕션 반영" 클릭
4. Neo4j 트랜잭션 실행 (단계별 진행 표시)
5. 성공/실패 결과 표시
6. 성공 시 pushed_to_neo4j = true 마킹

### 시나리오 7: 점진적 확장

1. 다음 방문 시 useLoadOntology로 Supabase에서 기존 그래프 로드
2. 새 더블클릭으로 데이터 추가
3. LLM이 기존 클래스/관계 컨텍스트를 참조 (existingClasses 전달)
4. 기존 온톨로지와 매칭된 결과 프리뷰에서 "기존" 표시

### 시나리오 8: Undo/Redo

1. Ctrl+Z → zundo undo (최대 50단계)
2. Ctrl+Shift+Z / Ctrl+Y → zundo redo
3. CommitBar "되돌리기" → undo 1단계

### 시나리오 9: 노드 삭제

1. 노드 선택 후 Delete/Backspace 키 (또는 RightPanel 삭제 버튼)
2. DeleteConfirmDialog 표시
3. 확정 시 cascading 삭제:
   - 클래스: 하위 인스턴스, 프로퍼티, 엣지, 공리 일괄 삭제, 자식 클래스는 루트로 승격
   - 인스턴스: 관련 엣지, 값 삭제

### 시나리오 10: 검색

1. Explorer 검색창에 텍스트 입력 (또는 Ctrl+F)
2. 클래스/인스턴스 이름 실시간 필터링
3. 매칭되는 항목만 트리에 표시 (부모 경로 유지)

---

## 7. 현재 기술 스택 정리

### 7.1 Core

| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 15.1 | App Router, API Routes, Turbopack |
| React | 19 | UI 렌더링 |
| TypeScript | 5 | 타입 안전성 |
| Tailwind CSS | 3.4 | 유틸리티 CSS |

### 7.2 UI

| 패키지 | 용도 |
|--------|------|
| shadcn/ui (28개 컴포넌트) | UI 컴포넌트 라이브러리 |
| lucide-react | 아이콘 (유일 소스) |
| framer-motion 11 | 애니메이션 (패널 전환, 팝오버) |
| class-variance-authority | 컴포넌트 variant |
| clsx + tailwind-merge | 조건부 className |
| sonner | 토스트 알림 |
| next-themes | 다크모드 |

### 7.3 그래프

| 패키지 | 용도 |
|--------|------|
| @xyflow/react 12 | 그래프 캔버스 |
| elkjs | 자동 레이아웃 (layered) |

### 7.4 상태 관리

| 패키지 | 용도 |
|--------|------|
| zustand 4 | 전역 상태 (온톨로지 데이터 + UI) |
| zundo 2.3 | Undo/Redo (temporal 미들웨어) |
| @tanstack/react-query 5 | 서버 상태 (데이터 페칭/캐싱) |

### 7.5 백엔드/데이터

| 패키지 | 용도 |
|--------|------|
| drizzle-orm 0.45 | ORM (Supabase PostgreSQL) |
| drizzle-kit 0.31 | 마이그레이션 |
| postgres 3.4 | PostgreSQL 드라이버 |
| @supabase/ssr 0.5 | Supabase SSR 통합 |
| neo4j-driver 6 | Neo4j Cypher 실행 |

### 7.6 LLM

| 패키지 | 용도 |
|--------|------|
| openai 6.32 | OpenAI API 클라이언트 (gpt-5.4-mini) |

### 7.7 검증/폼

| 패키지 | 용도 |
|--------|------|
| zod 3 | 스키마 검증 (API 입출력) |
| react-hook-form 7 | 폼 상태 관리 |
| @hookform/resolvers 4 | zod 연동 |

### 7.8 유틸리티

| 패키지 | 용도 |
|--------|------|
| date-fns 4 | 날짜 포맷팅 |
| ts-pattern 5 | 패턴 매칭 |
| es-toolkit 1 | 유틸리티 함수 |
| react-use 17 | React 훅 모음 |
| axios 1.7 | HTTP 클라이언트 (미사용, fetch 직접 사용 중) |

### 7.9 개발 도구

| 패키지 | 용도 |
|--------|------|
| vitest 4.1 | 테스트 러너 |
| @testing-library/react 16 | 컴포넌트 테스트 |
| @playwright/test 1.58 | E2E 테스트 |
| eslint 9 + eslint-config-next | 린팅 |
| jsdom 29 | 테스트 DOM |

---

## 8. 발견된 이슈 및 개선 가능 영역

### 8.1 미구현 기능 (PRD 대비)

| 기능 | PRD 명세 | 현재 상태 |
|------|----------|----------|
| AI 보조 입력창 | 패널 하단에서 자연어 → 변경 제안 | UI만 존재, toast "준비 중" 표시 |
| AI 어시스턴트 (Toolbar) | AI 전역 어시스턴트 | disabled 상태 |
| 파일 첨부 | NewNodePopover에서 파일 업로드 | 버튼만 존재, 기능 미연결 |
| 붙여넣기 | NewNodePopover에서 클립보드 | 버튼만 존재, 기능 미연결 |
| 내보내기 | Toolbar 내보내기 | disabled 상태 |
| Neo4j 롤백 | 커밋 되돌리기 (Neo4j) | API route 존재, UI 미연결 |
| 벡터 검색 | Neo4j 벡터 인덱스 연동 | 미구현 |
| Instance Values 로딩 | 초기 로딩 시 instance_values | `loadOntology`에서 빈 배열 전달 |
| 노드 설명 자동 생성 | LLM Haiku로 설명 자동 생성 | 미구현 |
| 관계 자동 제안 | 신규 인스턴스 시 관계 추천 | 미구현 |
| 공리 해석 | 자연어 → rule_logic JSON | 미구현 |

### 8.2 PRD와의 차이점

| 항목 | PRD 명세 | 실제 구현 |
|------|----------|----------|
| LLM 모델 | Claude Sonnet/Haiku (Anthropic) | OpenAI gpt-5.4-mini |
| AI SDK | AI SDK 6 (@ai-sdk/react) | openai 패키지 직접 사용 |
| Tailwind | 4.x | 3.4 |
| 리치 텍스트 | @tiptap/react | 일반 textarea/input 인라인 편집 |
| 린팅 | Biome + Ultracite | ESLint (next 기본) |
| URL 상태 | nuqs | 미사용 |
| Immer | zustand immer 미들웨어 | 미사용 (직접 스프레드) |
| dagre | @dagrejs/dagre | 미사용 (elkjs만) |
| ai-elements | 선택적 컴포넌트 | 미설치 |
| uuid | uuid 패키지 | crypto.randomUUID() 사용 |
| RightPanel 구조 | 6개 섹션 순차 | 3탭 구조 (상세/관계/AI) |

### 8.3 코드 품질 이슈

1. **axios 미사용**: package.json에 설치되어 있으나 실제로는 `fetch` 직접 사용
2. **Instance Values 미로딩**: `useLoadOntology`에서 `instanceValues: []`로 하드코딩 — DB에서 가져오지 않음
3. **RightPanel 단일 파일**: 1078줄 — 컴포넌트 분리 필요 (CollapsibleSection, InlineEditableText, PropertyRow, AddPropertyInline 등이 모두 한 파일)
4. **API Sync 실패 처리**: 실패 시 toast만 표시, 롤백 없음 (zundo undo에 의존)
5. **NewNodePopover mockParse**: LLM 실패 시 매우 단순한 로컬 파서 사용 — 프로퍼티/관계 추출 제한적
6. **타입 캐스팅**: `as unknown as Record<string, unknown>` 패턴 빈번 — 타입 안전성 약화
7. **Drizzle 스키마와 Zustand 타입 불일치**: camelCase(TS) ↔ snake_case(DB) 변환이 API 레이어에서 수동 처리

### 8.4 성능 고려사항

1. **전체 온톨로지 메모리 로딩**: 대규모 그래프에서 메모리 부담 가능
2. **ELK 레이아웃 재계산**: 노드 추가/삭제 시마다 전체 레이아웃 재계산
3. **useApiSync fire-and-forget**: 동시 다수 변경 시 API 과부하 가능
4. **React Flow 리렌더링**: flowNodes/flowEdges useMemo 사용 중이나, 선택 변경 시 전체 엣지 재생성

### 8.5 향후 확장 시 고려사항

1. **다중 사용자**: RLS 비활성화 상태, 인증 없음
2. **온톨로지 버전 관리**: commits 테이블은 존재하나 브랜칭/머지 미지원
3. **대규모 그래프**: WebGL 렌더링 미지원, 가상화 없음
4. **모바일**: 반응형 미대응, 터치 인터랙션 미고려
5. **Export**: OWL/RDF/YAML 등 표준 포맷 미지원

---

## 부록: 데이터 흐름 요약

```
[사용자 인터랙션]
       ↓
[Zustand Store] ← 즉시 반영 (낙관적 UI)
       ↓
[pendingChanges 배열에 Change 기록]
       ↓
[useApiSync] → fire-and-forget API 호출
       ↓
[Next.js API Routes] → Drizzle ORM → Supabase PostgreSQL
       ↓
[커밋 시] → commits + commit_details 테이블 저장
       ↓
[Neo4j 푸시 시] → cypher-builder → Neo4j 트랜잭션
```

```
[앱 로딩 시]
[useLoadOntology]
  → useClasses() → /api/classes → Drizzle → Supabase
  → useInstances() → /api/instances → Drizzle → Supabase
  → useProperties() → /api/properties → Drizzle → Supabase
  → useEdges() → /api/edges → Drizzle → Supabase
  → useRelationTypes() → /api/relation-types → Drizzle → Supabase
  → useAxioms() → /api/axioms → Drizzle → Supabase
       ↓
  전체 데이터 → Zustand loadOntology()
       ↓
  [GraphCanvas] React Flow 렌더링
  [ExplorerPanel] 트리 렌더링
```
