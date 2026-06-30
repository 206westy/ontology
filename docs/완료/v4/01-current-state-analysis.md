# Ontology Studio v3 - 현재 상태 분석

> 작성일: 2026-03-27 | 분석 대상: `ontology/src/` 전체 코드베이스 + Supabase DB

---

## 1. 프로젝트 아키텍처 개요

### 3-Layer Architecture ("Ontology Git" 패턴)

| Layer | 역할 | 기술 스택 |
|-------|------|-----------|
| **Layer 1 — Frontend** | 유저 인터랙션 + LLM 보조 | Next.js 15 (App Router, Turbopack), React 19, React Flow, shadcn/ui, Zustand + zundo, motion/react |
| **Layer 2 — Staging** | 커밋 로그, 변경 이력, 롤백 포인트 | Supabase (PostgreSQL), Drizzle ORM |
| **Layer 3 — Production** | 최종 온톨로지 그래프 | Neo4j (Cypher, vector index) |

### 디렉토리 구조

```
ontology/src/
├── app/
│   ├── page.tsx                    # 메인 페이지 (SPA)
│   ├── layout.tsx                  # Root layout (providers)
│   ├── providers.tsx               # ThemeProvider, QueryClientProvider
│   ├── not-found.tsx
│   └── api/                        # 26개 API route
│       ├── classes/                # CRUD (list/get/create/update/delete)
│       ├── properties/             # CRUD
│       ├── instances/              # CRUD
│       ├── instance-values/        # Upsert/Delete
│       ├── edges/                  # List/Create/Delete
│       ├── relation-types/         # CRUD
│       ├── axioms/                 # CRUD
│       ├── commits/                # List/Create
│       ├── constraints/            # CRUD (v3)
│       ├── validate/               # POST - 스키마 검증 (v3)
│       ├── batch/                  # POST - 일괄 작업 (v3)
│       ├── export/                 # GET - JSON 내보내기 (v3)
│       ├── import/                 # POST - JSON 가져오기 (v3)
│       ├── neo4j/
│       │   ├── push/               # POST - Neo4j 푸시 (dryRun 포함)
│       │   ├── rollback/           # POST - Neo4j 롤백
│       │   └── status/             # GET - Neo4j 연결 상태
│       └── llm/
│           ├── parse/              # POST - 자유 텍스트 → 온톨로지 파싱
│           ├── chat/               # POST - AI 어시스턴트 (스트리밍)
│           └── text2cypher/        # POST - 자연어 → Cypher (v3)
├── components/ui/                  # shadcn/ui 컴포넌트 26개
├── features/ontology/
│   ├── api.ts                      # 프론트엔드 API 클라이언트 함수
│   ├── components/                 # 기능 컴포넌트 20개
│   ├── constants/                  # colors.ts, sample-ontology.ts
│   ├── hooks/                      # 11개 커스텀 훅
│   └── lib/                        # types, schemas, elk-layout, popover-position
├── hooks/                          # use-toast.ts
└── lib/
    ├── api-error.ts                # 통합 에러 핸들러 (supabase/neo4j/llm 분류)
    ├── motion-presets.ts           # 애니메이션 프리셋
    ├── drizzle/
    │   └── schema.ts               # DB 스키마 (12 테이블)
    └── neo4j/
        └── cypher-builder.ts       # Cypher 구문 빌더 + 롤백 빌더
```

### 상태 관리

**Zustand Store (`useOntologyStore`)**:
- Graph data: classes, instances, properties, relationTypes, edges, axioms, instanceValues
- UI state: selectedNodeId, selectedNodeType, pendingChanges, popoverState, expandedNodes, focusNodeId, toolMode, zoomAction
- 모든 CRUD 액션이 `pendingChanges` 배열에 Change 객체를 추가 (ADD/MOD/DEL)
- `zundo` temporal middleware로 50단계 undo/redo 지원
- `useApiSync` 훅이 pendingChanges를 구독하여 백그라운드 API 동기화 수행 (optimistic UI)

**React Query**: 초기 데이터 로딩용 (`useLoadOntology`에서 6개 엔티티 병렬 fetch → Zustand에 일괄 로드)

---

## 2. DB 스키마 요약

### Supabase 테이블 (12개)

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `classes` | 온톨로지 클래스 | id, parent_id (자기참조), name, description, color, position_x/y |
| `properties` | 클래스 속성 (EAV key) | id, class_id, name, data_type, is_required, enum_values, constraint_rule, sort_order |
| `instances` | 클래스 인스턴스 | id, class_id, name |
| `instance_values` | 인스턴스 속성값 (EAV value) | id, instance_id, property_id, value |
| `relation_types` | 관계 유형 | id, name, description, source_class_id, target_class_id |
| `edges` | 관계 인스턴스 | id, relation_type_id, source_id, target_id, source_kind, target_kind, min_cardinality, max_cardinality |
| `axioms` | 제약/규칙 | id, description, rule_logic (JSONB), severity |
| `axiom_classes` | Axiom-Class M:N 연결 | axiom_id, class_id (복합PK) |
| `commits` | 커밋 로그 | id, message, pushed_to_neo4j, pushed_at |
| `commit_details` | 커밋 상세 변경사항 | id, commit_id, operation, target_table, target_id, before_snapshot, after_snapshot |
| `constraints` | 제약 조건 (v3) | id, constraint_type, source_class_id, target_class_id, relation_type_id, property_id, config (JSONB), severity, is_active |
| `validation_results` | 검증 결과 캐시 (v3) | id, run_id, severity, rule_code, message, target_table, target_id, constraint_id, resolved_at |

### 주요 관계 및 제약

- `classes.parent_id` → `classes.id` (자기참조, SET NULL)
- `properties`, `instances` → `classes.id` (CASCADE)
- `instance_values` → `instances.id`, `properties.id` (CASCADE)
- `edges` → `relation_types.id` (CASCADE), self-loop 방지 CHECK
- `constraints` → `classes.id`, `relation_types.id`, `properties.id` (CASCADE)
- 유니크: class name per parent, property per class, instance name per class, edge (rel+src+tgt)
- CHECK: color hex, data_type enum, operation enum, severity enum, cardinality range

---

## 3. 유저 시나리오 목록

### 시나리오 1: 첫 방문 — 온보딩
1. 앱 접속 → `useLoadOntology`가 6개 엔티티 병렬 fetch
2. DB가 비어있으면 `EmptyState` 표시
3. **OnboardingGuide** (localStorage 기반, 3단계 가이드)
   - Step 1: 텍스트 입력 or 더블클릭
   - Step 2: 노드 클릭 → 상세 정보
   - Step 3: 드래그 → 관계 연결

### 시나리오 2: 노드 생성
**방법 A — 캔버스 더블클릭**:
1. `GraphCanvas.onDoubleClick` → `openPopover({ type: 'newNode' })`
2. **NewNodePopover** 열림 (3개 탭: Quick/Text/CSV)
   - Quick 탭: 이름 입력 → 즉시 생성
   - Text 탭: 자유 텍스트 입력 → LLM 파싱 (`/api/llm/parse`) → 미리보기 → 확인
   - CSV 탭: CSV 입력 → 파싱 → 미리보기 → 확인
3. `addClass/addInstance` → `pendingChanges`에 ADD → `useApiSync`가 API 호출

**방법 B — ExplorerPanel 하단 "새 클래스 추가" 버튼**

**방법 C — Ctrl+N 단축키**

**방법 D — CommandPalette (Ctrl+K) → "새 노드 생성"**

### 시나리오 3: 노드 선택 및 편집
1. 캔버스에서 노드 클릭 → `selectNode(id, type)`
2. **RightPanel** 활성화 (2개 탭: 속성/AI)
   - 속성 탭:
     - 클래스: 이름(인라인 편집), 설명(인라인 편집), 색상(팔레트), 속성 목록, 하위 클래스 목록, 인스턴스 목록, 관계(인/아웃), 제약조건, 삭제 버튼
     - 인스턴스: 이름, 소속 클래스, 속성값(data type별 입력), 관계, 삭제
   - AI 탭: **AIAssistantTab** — 스트리밍 채팅, 선택된 노드 컨텍스트 전달

### 시나리오 4: 관계 연결
**방법 A — 노드 핸들 드래그**: `ReactFlow.onConnect` → **RelationPopover**
**방법 B — 노드 겹침 드래그**: `onNodeDragStop` → 60px 근접 감지 → **HierarchyPopover** (is-a 관계)
**방법 C — RightPanel "관계 추가" 버튼**: `openPopover({ type: 'relation' })`

### 시나리오 5: 계층 이동
- **HierarchyPopover**: 순환 참조 검사 → `updateClass(childId, { parentId: parentId })`
- 트리 미리보기 표시

### 시나리오 6: 저장 (커밋)
1. `CommitBar`에 변경사항 건수 표시 (ADD/MOD/DEL 각각)
2. "저장" 클릭 → `commitsApi.create()` → Supabase에 커밋+상세 저장 → `clearChanges()`
3. "변경 내역" 시트: 전체 변경 로그 확인

### 시나리오 7: Neo4j 푸시 (반영)
1. "반영" 클릭 → **NeoConfirmSheet** 열림
2. Phase 1 (Loading): 먼저 Supabase에 커밋 → dryRun으로 Cypher 미리보기 생성
3. Phase 2 (Confirm): **PushSummary** + **CypherPreview** 표시
4. Phase 3 (Pushing): 단일 트랜잭션으로 실행, **PushProgress** 표시
5. Phase 4 (Result): **PushResult** — 성공/부분실패/재시도/건너뛰기 옵션

### 시나리오 8: 되돌리기 (Undo/Redo)
- Toolbar 또는 Ctrl+Z / Ctrl+Shift+Z
- zundo의 50단계 temporal 히스토리 사용

### 시나리오 9: 검증
- Toolbar "검증" 버튼 → `/api/validate` POST
- 5개 규칙: cyclic_isa, required_properties, cardinality, orphan_nodes, similar_names
- 결과를 `validation_results` 테이블에 저장
- toast로 요약 표시

### 시나리오 10: 내보내기/가져오기
- 내보내기: 전체 온톨로지 JSON 파일 다운로드
- 가져오기: JSON 파일 업로드 (replace/merge 전략)

### 시나리오 11: AI 어시스턴트
- RightPanel AI 탭에서 스트리밍 채팅
- 선택된 노드 + 온톨로지 요약 컨텍스트 전달
- `/api/llm/chat` (ai SDK + gpt-4o-mini)

### 시나리오 12: 커맨드 팔레트
- Ctrl+K → **CommandPalette** (cmdk 기반)
- 명령: 새 노드, 저장, 반영, 레이아웃 정리, 검증
- 노드 검색: 클래스/인스턴스 이름으로 검색 → 포커스

### 시나리오 13: 키보드 단축키
| 단축키 | 기능 |
|--------|------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+N | 새 노드 |
| Ctrl+S | 저장 (커밋) |
| Ctrl+Enter | Neo4j 푸시 |
| Ctrl+K | 커맨드 팔레트 |
| Ctrl+F | ExplorerPanel 검색 포커스 |
| Ctrl+Shift+F | 커맨드 팔레트 |
| Delete/Backspace | 선택 노드 삭제 (확인 다이얼로그) |
| V | 선택 도구 |
| H | 이동 도구 |

---

## 4. 핵심 기능 상세

### 4.1 온톨로지 CRUD

**클래스 관리**:
- 생성: NewNodePopover (Quick/Text/CSV 3종 입력)
- 수정: RightPanel 인라인 편집 (name, description, color)
- 삭제: Delete 키 or RightPanel 삭제 → DeleteConfirmDialog → cascade (instances, properties, edges, axioms)
- 계층: parentId 자기참조, HierarchyPopover로 이동, 순환 검사

**인스턴스 관리**:
- 생성: RightPanel "AddInstanceInline"
- 수정: RightPanel 인라인 편집 (name)
- 속성값: data type별 입력 (string/integer/float/boolean/date/enum), EAV 패턴
- 삭제: cascade (edges, instanceValues)

**속성 관리**:
- 생성: RightPanel "AddPropertyInline" (name + dataType)
- 삭제: RightPanel 휴지통 아이콘
- 지원 타입: string, integer, float, boolean, date, enum
- enum인 경우 enumValues 필수

**관계 관리**:
- RelationType: 이름+설명, domain/range 클래스 매핑
- Edge: 방향성 (source → target), kind (class/instance)
- 생성: 노드 핸들 드래그, RightPanel, RelationPopover
- 삭제: RightPanel

**제약/공리 관리**:
- Axiom: description + ruleLogic (JSONB) + severity
- AddConstraintInline in RightPanel
- Constraint (v3): cardinality, disjoint, domain_range, property_value 4종

### 4.2 그래프 시각화

**GraphCanvas** (React Flow):
- 3단계 LOD: dot (zoom < 0.5) → name (0.5-1.0) → full (zoom >= 1.0)
- **ClassNode**: 원형, 크기 = 44~80px (인스턴스 수 비례), 역할 아이콘 뱃지 (root/mid/leaf), 도메인 타입 아이콘 뱃지
- **InstanceNode**: 둥근 사각형, 72x44px
- Edge 3종: is-a (실선+filled arrow), instance-of (점선+open arrow), relation (실선+label capsule)
- ELK 자동 레이아웃 (`elk-layout.ts`)
- MiniMap (색상 반영), Controls, Background (dots)
- 포커스 애니메이션 (1.5s ring pulse)

### 4.3 커밋 시스템 ("Ontology Git")

- 모든 변경이 Change 객체로 추적 (operation, targetTable, targetId, before/afterSnapshot)
- `CommitBar`: 변경 건수 표시, 저장/반영 버튼
- `commitsApi.create()`: commits + commit_details 테이블에 기록
- `useApiSync`: 변경 즉시 Supabase에 동기화 (optimistic UI) — 우선순위별 순서 보장 (classes → properties → edges)

### 4.4 Neo4j 푸시

- `cypher-builder.ts`: CommitDetail → CypherStatement 변환
  - 테이블별 Cypher: classAdd/Mod/Del, instanceAdd/Mod/Del, edgeAdd/Del, propertyAdd/Del, relationTypeAdd/Del
  - IS_A, INSTANCE_OF 관계 자동 생성
  - 정렬: ADD → MOD → DEL, classes → instances → edges
- `buildRollbackStatements()`: 역방향 Cypher 생성
- Push API: dryRun(미리보기) → 단일 트랜잭션 실행 → 커밋 상태 업데이트

### 4.5 LLM 통합

| API | 모델 | 기능 |
|-----|------|------|
| `/api/llm/parse` | gpt-5.4-mini | 자유 텍스트 → 온톨로지 구조화 (classes, properties, instances, relations) |
| `/api/llm/chat` | gpt-4o-mini | AI 어시스턴트 스트리밍 채팅 (ai SDK) |
| `/api/llm/text2cypher` | gpt-4o | 자연어 → Cypher 쿼리 변환 + 실행 (tool calling, 자동 수정 루프) |

---

## 5. 부가 기능 상세

### 5.1 ExplorerPanel (좌측 트리)
- 클래스 계층 트리 + 인스턴스 하위 표시
- 검색 필터링 (Ctrl+F)
- 클릭 시 selectNode + focusNode (캔버스 이동)
- "새 클래스 추가" 버튼
- 260px 고정 너비, spring 애니메이션

### 5.2 CommandPalette (Ctrl+K)
- cmdk 기반 검색 가능 커맨드 팔레트
- 명령 5개: 새 노드, 저장, 반영, 레이아웃, 검증
- 노드 검색: 모든 클래스/인스턴스 (클래스명 표시)

### 5.3 OnboardingGuide
- localStorage 기반 (최초 1회)
- 3단계 하이라이트 가이드 (backdrop cutout + tooltip)

### 5.4 키보드 단축키
- `useKeyboardShortcuts`: Delete, Ctrl+Z, Ctrl+Shift+Z, Ctrl+N, Ctrl+S, Ctrl+Enter, Ctrl+Shift+F
- input 요소 포커스 시 Delete/Backspace 무시

### 5.5 에러 처리
- `api-error.ts`: 통합 에러 핸들러
  - DB 에러: unique violation, FK violation, table not found, connection errors
  - Neo4j 에러: constraint, entity not found, auth, connection
  - LLM 에러: auth, rate limit, server error
- 한국어 유저 메시지 + suggestion 필드

### 5.6 테마
- next-themes 기반 system/light/dark
- CSS 변수로 노드 색상 관리 (10가지 시맨틱 컬러)

---

## 6. 미구현/부분구현 현황

### 완전 구현됨
- 클래스/인스턴스/속성/관계 CRUD
- 그래프 시각화 (React Flow + ELK 레이아웃)
- 커밋 시스템 (Supabase 저장)
- Neo4j 푸시 (dryRun + 실행 + 롤백 빌더)
- LLM 텍스트 파싱 (NewNodePopover)
- AI 어시스턴트 채팅 (RightPanel)
- 검증 5개 규칙
- 내보내기/가져오기 (JSON)
- 일괄 작업 (batch API)
- 제약 조건 CRUD (constraints API)
- 커맨드 팔레트
- 온보딩 가이드
- 키보드 단축키
- Undo/Redo (50단계)

### 부분 구현됨
| 기능 | 현재 상태 | 비고 |
|------|----------|------|
| Text2Cypher | API 완성, 프론트엔드 미연결 | `/api/llm/text2cypher` 구현됨, UI 없음 |
| 제약 조건 UI | API 완성, 프론트엔드 미연결 | `constraintsApi` 존재, RightPanel에서 axiom만 사용 |
| Neo4j 롤백 | 빌더 완성, API route 파일 있으나 내용 미확인 | `buildRollbackStatements()` 구현됨 |
| Toolbar 가져오기 | 버튼 존재하나 newNode popover로 연결 | 파일 업로드 UI 부재, `importExportApi.importFromFile` 미사용 |
| AI 기반 추천 | 채팅만, 구조화된 추천 액션 없음 | 텍스트 응답만, "적용" 버튼 없음 |
| 검증 결과 UI | toast만 표시 | 상세 결과 패널 없음, `validation_results` 테이블 저장은 됨 |

### 미구현
| 기능 | 비고 |
|------|------|
| 멀티유저/실시간 협업 | 단일 유저 전용 |
| 버전 히스토리 UI | 커밋 목록 조회 API 있으나 UI 없음 |
| Neo4j 상태 대시보드 | `/api/neo4j/status` 존재, UI 없음 |
| 속성 상속 (프로퍼티 전파) | 하위 클래스에 상위 속성 자동 적용 없음 |
| 드래그 앤 드롭 파일 가져오기 | file-upload 컴포넌트 존재하나 미연결 |
| 고급 필터/쿼리 | ExplorerPanel 검색만 (이름 기반) |

---

## 7. v4 기능별 현재 상태 매핑

> v4에서 언급되는 기능 ID와 현재 구현 상태를 대조합니다.

### A9 — AI 기반 온톨로지 자동 구조화
- **현재**: `/api/llm/parse`에서 gpt-5.4-mini로 텍스트 → 구조화. NewNodePopover Text 탭에서 사용.
- **갭**: 반복적 개선(iterative refinement), 스키마 제안(suggest next step), 대량 텍스트 처리 미지원.

### B4 — 유효성 검증 프레임워크
- **현재**: 5개 규칙 구현 (cyclic_isa, required_properties, cardinality, orphan_nodes, similar_names). 결과 DB 저장. toast 알림.
- **갭**: 검증 결과 상세 UI 없음, 자동 수정 제안 없음, 사용자 정의 규칙 없음.

### C4 — 제약 조건 관리
- **현재**: constraints 테이블 + API (CRUD) 완성. 4가지 타입 (cardinality, disjoint, domain_range, property_value).
- **갭**: 프론트엔드 관리 UI 없음 (RightPanel에서 axiom만 표시), 시각적 제약 표시 없음.

### C5 — 일괄 작업 (Batch)
- **현재**: `/api/batch` 완성. 최대 200개 작업, 트랜잭션 내 실행, 토폴로지 정렬.
- **갭**: 프론트엔드 UI 없음, LLM 파싱 결과 적용 시에만 간접 사용 가능.

### D6 — 내보내기/가져오기
- **현재**: JSON 형식 내보내기/가져오기 완성. replace/merge 전략 지원.
- **갭**: OWL/RDF 형식 미지원, 가져오기 UI 개선 필요 (Toolbar 버튼이 newNode popover로 연결됨).

### D7-D8 — Neo4j 푸시 개선
- **현재**: dryRun Cypher 미리보기, 단일 트랜잭션 실행, 롤백 빌더, 4단계 UI (loading → confirm → pushing → result).
- **갭**: 부분 실행(partial commit) 없음, 개별 쿼리 재시도 없음, 실시간 진행 표시(streaming) 없음.

### E9 — AI 어시스턴트
- **현재**: RightPanel AI 탭. gpt-4o-mini 스트리밍 채팅. 선택 노드 + 온톨로지 요약 컨텍스트.
- **갭**: 구조화된 액션 제안 없음 (채팅만), "적용" 버튼 없음, 히스토리 저장 없음.

### E11 — Text2Cypher
- **현재**: `/api/llm/text2cypher` 완성. gpt-4o + tool calling (execute + correct 루프). Neo4j 스키마 자동 추출.
- **갭**: 프론트엔드 UI 완전 미구현.

### F3-F4 — 커맨드 팔레트 / 온보딩
- **현재**: 둘 다 완전 구현됨.
- **갭**: CommandPalette에 더 많은 명령 추가 가능 (검증 결과 보기, 내보내기 등).

---

## 부록: 컴포넌트-API 매핑

| 컴포넌트 | 사용하는 API/Hook |
|----------|-------------------|
| `GraphCanvas` | useOntologyStore (classes, instances, edges, relationTypes, toolMode, zoom) |
| `ExplorerPanel` | useOntologyStore (classes, instances, selectNode, focusNode) |
| `RightPanel` | useOntologyStore (전체), AIAssistantTab |
| `CommitBar` | useOntologyStore (pendingChanges), commitsApi, NeoConfirmSheet |
| `Toolbar` | useOntologyStore (toolMode, zoom), validateApi, importExportApi |
| `NewNodePopover` | useOntologyStore (addClass, addInstance, addProperty, addRelationType, addEdge), llmApi.parse |
| `RelationPopover` | useOntologyStore (addRelationType, addEdge) |
| `HierarchyPopover` | useOntologyStore (updateClass) |
| `CommandPalette` | useOntologyStore (openPopover, triggerZoom, focusNode, selectNode) |
| `AIAssistantTab` | fetch('/api/llm/chat') 직접 호출 (스트리밍) |
| `NeoConfirmSheet` | commitsApi, neo4jApi.push |
| `DeleteConfirmDialog` | useOntologyStore (deleteSelectedNode) |
| `OnboardingGuide` | localStorage |
| `useApiSync` | classesApi, propertiesApi, instancesApi, edgesApi, relationTypesApi, axiomsApi, instanceValuesApi |
| `useLoadOntology` | useClasses, useAllInstances, useAllProperties, useEdges, useRelationTypes, useAxioms |
