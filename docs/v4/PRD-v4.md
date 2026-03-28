# Ontology Studio v4 — Product Requirements Document

> **버전**: v4.0 Draft
> **작성일**: 2026-03-27
> **작성자**: v4 기획단 (코드분석자, 온톨로지 전문가, UX설계자, UI/BX디자이너, 테크리더, 메인리더)
> **상태**: 검토 대기

---

## 1. 개요

### 1.1 프로젝트 비전

Ontology Studio는 도메인 전문가가 **코드/쿼리 없이** 온톨로지(지식그래프)를 구축하는 그래프 편집 스튜디오이다. "Ontology Git" 패턴으로 변경을 스테이징(Supabase)하고, 확정 시 프로덕션(Neo4j)에 푸시한다.

### 1.2 v4 목표

v3에서 구축한 핵심 CRUD + 커밋/푸시 시스템 위에, **탐색성·상호운용성·지능형 보조**를 강화한다.

| 카테고리 | v4 핵심 방향 |
|---------|-------------|
| **탐색** | Text2Cypher 자연어 패널, 고급 필터, 포커스 모드 |
| **모델링** | 프로퍼티 상속 시각화, 도메인 템플릿 5종 |
| **지능** | 온톨로지 자동 완성 (LLM 기반 클래스/프로퍼티/관계 추천) |
| **상호운용** | JSON-LD, Turtle Export/Import |
| **편의** | 자동 저장, 우클릭 메뉴, 패널 리사이저 |
| **품질** | 기술 부채 해소 (AI SDK 통합, ELK Worker, Tailwind v4) |
| **아이덴티티** | 브랜딩 (로고, 시그니처 컬러, 스플래시) |

### 1.3 현재 아키텍처 (v3)

```
Layer 1 — Frontend       : Next.js 15 + React 19 + React Flow v12 + Zustand v5 + shadcn/ui
Layer 2 — Staging        : Supabase (PostgreSQL) + Drizzle ORM (12 테이블)
Layer 3 — Production     : Neo4j (Cypher, vector index)
LLM Integration          : Vercel AI SDK 6.x + OpenAI (gpt-5.4-mini, gpt-4o-mini, gpt-4o)
```

### 1.4 v3 구현 완료 기능

- 클래스/인스턴스/프로퍼티/관계 전체 CRUD
- React Flow 그래프 시각화 (3단계 LOD, ELK 레이아웃, 10색 시맨틱 컬러)
- 커밋 시스템 + Neo4j 푸시 (dryRun + 트랜잭션 + 롤백 빌더)
- LLM 텍스트 파싱 + AI 채팅 어시스턴트
- 5개 검증 규칙 + 제약조건 API
- JSON Import/Export + Batch API
- 커맨드 팔레트 + 온보딩 + 키보드 단축키
- 50단계 Undo/Redo (zundo)

---

## 2. Phase 0 — 기반 정비

> 기술 부채를 해소하여 v4 기능 개발의 안정적 토대를 마련한다.

### 2.1 P0-1: openai 패키지 제거 → AI SDK 통합

**현재 문제**: `parse/route.ts`에서 `openai` 패키지를 직접 사용하고, `chat/route.ts`에서는 Vercel AI SDK를 사용. 이중 LLM 클라이언트 유지 중.

**변경 내용**:
- `openai` 패키지 의존성 제거
- `parse/route.ts`에서 AI SDK `generateObject` + Zod 스키마로 전환
- 기존 gpt-5.4-mini 모델 및 JSON 출력 구조 유지

**영향 범위**: `ontology/src/app/api/llm/parse/route.ts`

### 2.2 P0-2: AIAssistantTab → AI SDK useChat 훅 전환

**현재 문제**: `AIAssistantTab.tsx`에서 수동 `fetch` + `ReadableStream` 파싱으로 약 200줄의 스트리밍 로직 직접 구현.

**변경 내용**:
- AI SDK 6.x `useChat` 훅으로 전환 (약 40줄로 축소)
- `DefaultChatTransport` 사용, `sendMessage` API 적용
- `message.parts[]` 기반 렌더링으로 전환
- 서버 `chat/route.ts`는 이미 `streamText` 사용 중이므로 변경 불필요

**AI SDK 6.x 핵심 변경사항** (context7 검증):
```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/api/llm/chat' }),
});

// v5: handleSubmit → v6: sendMessage
// v5: message.content → v6: message.parts[].text
```

### 2.3 P0-3: ELK Web Worker 분리

**현재 문제**: `elk-layout.ts`에서 `elkjs/lib/elk.bundled.js`를 메인스레드 import. 노드 100+ 시 UI 블로킹 가능.

**변경 내용**:
1. `elkjs/lib/elk-worker.min.js`를 `public/`에 배치
2. `new ELK({ workerUrl: '/elk-worker.min.js' })` 로 변경
3. 컴포넌트 언마운트 시 `elk.terminateWorker()` 호출
4. Worker 로드 실패 시 bundled 버전으로 fallback

**영향 범위**: `ontology/src/features/ontology/lib/elk-layout.ts`

### 2.4 P0-4: Tailwind CSS v4 마이그레이션

**현재 문제**: Tailwind v3.4 사용. v4 Oxide 엔진으로 빌드 성능 2~5x 개선 가능.

**변경 내용**:
- `tailwindcss` v3 → v4 업그레이드
- CSS 변수 기반 설정 마이그레이션
- `@apply` 사용처 검토 및 전환
- 점진적 전환 권장 (config 호환 모드 활용)

---

## 3. Phase 1 — 핵심 기능

> 모든 기능이 독립적이므로 병렬 개발 가능.

### 3.1 P1-1: 패널 리사이저 (E9)

**요구사항**: ExplorerPanel(좌)과 RightPanel(우)의 너비를 드래그로 조절, 더블클릭으로 접기/펼치기.

**기술 스택**: `react-resizable-panels` (Brian Vaughn, 전 React 코어팀 유지보수, ~8KB)

**구현 설계**:
```tsx
import { Group, Panel, Separator } from "react-resizable-panels";

<Group orientation="horizontal">
  <Panel defaultSize={20} minSize={15} maxSize={30}>
    <ExplorerPanel />
  </Panel>
  <Separator />
  <Panel defaultSize={55}>
    <GraphCanvas />
  </Panel>
  <Separator />
  <Panel defaultSize={25} minSize={15} maxSize={35}>
    <RightPanel />
  </Panel>
</Group>
```

**UX 사양**:
- 리사이저 기본: 1px border, 4px 히트영역
- 호버: 2px primary/40 border, `col-resize` 커서
- 드래그 중: 2px primary border
- 더블클릭: 패널 접기/펼치기 (이전 너비 기억)
- 접힌 상태: 아이콘만 표시하는 미니 탭
- 레이아웃 `localStorage` 영속화

**제약**:
| 패널 | 최소 | 최대 | 기본 |
|------|------|------|------|
| Explorer | 200px | 400px | 260px |
| Canvas | 400px (보장) | - | flex-1 |
| RightPanel | 280px | 500px | 320px |

### 3.2 P1-2: 자동 저장 (D6)

**요구사항**: 변경 후 일정 시간 경과 시 자동 커밋. 수동/자동 전환 가능.

**구현 설계**:

현재 아키텍처는 이미 "변경 즉시 Supabase 동기화" (useApiSync). 자동 저장 = **자동 커밋**.

```typescript
import { debounce } from 'es-toolkit'; // 이미 의존성에 포함

const autoCommit = debounce(() => {
  const { pendingChanges, commitChanges } = useOntologyStore.getState();
  if (pendingChanges.length > 0) {
    commitChanges('자동 저장', { isAutoSave: true });
  }
}, 30_000); // 30초 디바운스
```

**CommitBar 상태 머신**:

```
idle ─(변경 감지)→ unsaved ─(디바운스 만료)→ saving ─(성공)→ saved ─(2초)→ idle
                                              └─(실패)→ error ─(재시도 3회)→ paused
```

| 상태 | 인디케이터 | 텍스트 |
|------|-----------|--------|
| idle | 없음 | "저장됨" (muted) |
| unsaved | amber dot (pulse) | "변경 있음" |
| saving | spinner (12px) | "저장 중..." |
| saved | check (fade 1.5s) | "저장됨" (success) |
| error | error 아이콘 | "저장 실패" |

**UX**:
- CommitBar 좌측에 `[Auto]` 토글 배지
- Auto ON: "저장" 버튼 숨김, 상태 텍스트로 대체
- Auto OFF: 기존 수동 방식 유지
- 설정 `localStorage` persist
- `beforeunload` 이벤트에서 미저장 변경 경고

**DB 변경**: `commits` 테이블에 `is_auto_save: boolean default false` 컬럼 추가

### 3.3 P1-3: 우클릭 컨텍스트 메뉴 (D8)

**요구사항**: 노드/엣지/캔버스 빈 공간에서 우클릭 시 컨텍스트별 메뉴 표시.

**기술 스택**: `@radix-ui/react-context-menu` (shadcn/ui: `npx shadcn@latest add context-menu`)

**React Flow 이벤트** (context7 검증):
```tsx
<ReactFlow
  onNodeContextMenu={(event, node) => { event.preventDefault(); /* 메뉴 표시 */ }}
  onPaneContextMenu={(event) => { event.preventDefault(); /* 캔버스 메뉴 */ }}
/>
```

**컨텍스트별 메뉴 항목**:

| 컨텍스트 | 항목 |
|---------|------|
| 캔버스 빈 공간 | 새 클래스 생성 (N), 새 인스턴스 생성, 레이아웃 정리, 전체 보기 (Fit), 붙여넣기 (Ctrl+V) |
| 클래스 노드 | 이름 변경 (F2), 색상 변경 >, 관계 추가, 하위 클래스 추가, 인스턴스 추가, 포커스 모드, Explorer에서 보기, 삭제 (Delete) |
| 인스턴스 노드 | 이름 변경 (F2), 관계 추가, 부모 클래스 이동 >, 포커스 모드, Explorer에서 보기, 삭제 (Delete) |
| 엣지 | 관계 유형 변경, 방향 반전, 삭제 |
| Explorer 트리 항목 | 이름 변경, 캔버스에서 찾기, 하위 항목 추가, 삭제 |

**일관성 보장**: 우클릭 시 먼저 `selectNode` 호출하여 선택 상태 동기화.

### 3.4 P1-4: 고급 필터 + 포커스 모드 (D7)

**요구사항**: 타입별/색상별 노드 필터링 + 선택 노드 N-hop 이웃만 표시하는 포커스 모드.

**구현 설계**:

Zustand에 필터 상태 추가:
```typescript
interface FilterState {
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: Set<string>;
  focusNodeId: string | null;
  focusDepth: number; // N-hop (1-3)
}
```

GraphCanvas에서 필터 적용:
```typescript
const filteredNodes = useMemo(() => {
  let nodes = allNodes;
  if (!filter.showInstances) nodes = nodes.filter(n => n.type !== 'instanceNode');
  if (filter.colorFilter.size) nodes = nodes.filter(n => filter.colorFilter.has(n.data.color));
  if (filter.focusNodeId) nodes = getNeighborhood(filter.focusNodeId, filter.focusDepth, allNodes, allEdges);
  return nodes;
}, [allNodes, allEdges, filter]);
```

**필터 UI**: Toolbar 우측에 Filter 아이콘 → 드롭다운 패널
- 노드 타입: [x] 클래스 [x] 인스턴스
- 색상: 10색 칩 토글
- 관계: 관계 있는 노드만 / 고립 노드만

**포커스 모드 UI**:
- 진입: 노드 우클릭 > "포커스 모드" 또는 RightPanel 버튼
- 표시: 선택 노드 + N-hop 이웃 = opacity 1.0, 나머지 = opacity 0.15
- N-hop 슬라이더: 하단 힌트바 위치에 오버레이 (1~3 범위)
- 해제: Esc 키 또는 Toolbar "해제" 버튼
- 전환 애니메이션: 250ms ease-in-out (`focusTransition` 프리셋)

### 3.5 P1-5: 프로퍼티 상속 시각화 (B4)

**요구사항**: 하위 클래스의 RightPanel에서 상위 클래스의 프로퍼티를 "상속된 프로퍼티"로 읽기전용 표시.

**온톨로지 원칙**: Copy-on-Write 패턴
- 상속 프로퍼티는 읽기전용으로 표시
- "오버라이드" 버튼으로 현재 클래스에 복사 → 편집 가능
- OWL의 `rdfs:subClassOf` 프로퍼티 전파 메커니즘 적용

**구현 설계** (DB 변경 없음, 런타임 계산):

```typescript
// ontology/src/features/ontology/lib/property-inheritance.ts

interface InheritedProperty extends OntologyProperty {
  inheritedFrom: string | null;  // 원본 classId (null = 자기 것)
  isOverridden: boolean;
  depth: number;                 // 0 = 자기 것, 1 = 부모, 2 = 조부모
}

function getInheritedProperties(
  classId: string,
  allClasses: OntologyClass[],
  allProperties: OntologyProperty[],
): InheritedProperty[] {
  const inherited: InheritedProperty[] = [];
  const visited = new Set<string>(); // 순환 참조 방지
  let current = allClasses.find(c => c.id === classId);
  let depth = 0;

  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    depth++;
    const parent = allClasses.find(c => c.id === current!.parentId);
    if (!parent) break;
    const parentProps = allProperties.filter(p => p.classId === parent.id);
    inherited.push(...parentProps.map(p => ({
      ...p,
      inheritedFrom: parent.id,
      isOverridden: allProperties.some(op => op.classId === classId && op.name === p.name),
      depth,
    })));
    current = parent;
  }
  return inherited;
}
```

**RightPanel 시각화**:
```
PROPERTIES (3 + 2 inherited)
────────────────────────────
● serialNumber [string] *        ← 자기 것
● processTemp  [float]           ← 자기 것
● status       [enum] *          ← 자기 것
── inherited from Equipment ────
↗ name         [string] *        ← 읽기전용
↗ manufacturer [string]  [오버라이드]  ← 클릭 시 Copy-on-Write
```

**인스턴스 값 입력**: 상속 프로퍼티도 `instance_values`에 값 저장 가능 (원본 propertyId 참조).

### 3.6 P1-6: 도메인 템플릿 5종 (C5)

**요구사항**: EmptyState에서 5개 도메인 중 선택하여 미리 구성된 온톨로지로 시작.

**저장 방식**: 정적 JSON 파일 (기존 Import API 재사용)

```
ontology/src/features/ontology/constants/templates/
├── semiconductor.json      # 반도체 FAB
├── it-infrastructure.json  # IT 인프라 / CMDB
├── organization.json       # 조직 / 인사
├── healthcare.json         # 의료
└── supply-chain.json       # 공급망
```

**템플릿 규모**:

| 도메인 | 클래스 | 관계 타입 | 프로퍼티 | 인스턴스 (예시) |
|--------|--------|----------|---------|---------------|
| 반도체 FAB | 15 | 6 | 25 | 5 |
| IT 인프라 | 18 | 7 | 30 | 5 |
| 조직/인사 | 14 | 6 | 20 | 5 |
| 의료 | 17 | 7 | 28 | 5 |
| 공급망 | 13 | 6 | 22 | 5 |

**UX**: EmptyState에서 카드 형태로 표시
- 각 카드: 아이콘 + 이름 + 한줄 설명 + 규모 (N classes, M relations)
- 클릭 시 트리 미리보기 팝오버
- "사용" 버튼으로 Import 실행

### 3.7 P1-7: 브랜딩 (E11)

**요구사항**: 로고, 시그니처 컬러, 파비콘, 스플래시 화면.

**로고 컨셉**: "연결된 3노드 삼각형"
```
    (A)
   / \
 (B)---(C)
```
- 3개 원형 노드 + 3개 연결선
- Violet→Blue 그라데이션 (`linear-gradient(135deg, #7c3aed, #3b82f6)`)
- 사이즈: 16px (favicon), 28px (Toolbar), 32px (스플래시)

**적용 위치**:
| 요소 | 현재 | v4 |
|------|------|-----|
| ExplorerPanel 로고 | Box 아이콘 + bg-primary | 커스텀 SVG + gradient-brand |
| Toolbar 타이틀 | 일반 텍스트 | 그라데이션 텍스트 |
| Favicon | Next.js 기본 | SVG 3노드 마크 |
| 스플래시 화면 | Loader2 스피너 | 로고 + 프로그레스 바 + 브랜드 텍스트 |
| AI 기능 아이콘 | text-primary | gradient-brand + 글로우 |

---

## 4. Phase 2 — 고급 기능

### 4.1 P2-1: 온톨로지 자동 완성 (C4)

**요구사항**: 새 클래스/프로퍼티/관계 생성 시 AI가 추천 항목을 제안.

**SchemaContext 빌더**:
LLM에 풍부한 온톨로지 컨텍스트를 전달하여 추천 품질을 높인다.

```typescript
interface SchemaContext {
  classHierarchy: string;   // 들여쓰기 트리
  propertyMap: string;      // 클래스별 프로퍼티
  relationTypes: string;    // 관계 + domain/range
  constraints: string;      // 제약 조건
  statistics: string;       // 클래스당 인스턴스 수
}
```

**3가지 추천 시나리오**:

| 시나리오 | 트리거 | 컨텍스트 | LLM 요청 |
|---------|--------|---------|---------|
| 클래스 추천 | NewNodePopover | 부모 클래스 + 형제 패턴 | "하위 클래스 3개 추천" |
| 프로퍼티 추천 | RightPanel "+" | 클래스명/설명 + 기존 프로퍼티 | "빠진 프로퍼티 추천" |
| 관계 추천 | RelationPopover | 두 클래스 전체 정보 | "적합한 관계 추천" |

**트리거 전략**:
- 자동: 로컬 fuzzy match (기존 데이터 기반, 비용 없음)
- 수동: Ctrl+Space → LLM 호출 (debounce 500ms)
- API 비용 제어: 분당 최대 3회 rate limit

**표준 온톨로지 힌트**: Schema.org, Dublin Core 매핑 테이블을 LLM 컨텍스트에 포함.

### 4.2 P2-2: JSON-LD Export/Import (F3)

**요구사항**: 온톨로지를 JSON-LD 형식으로 내보내기/가져오기.

**기술 스택**: `jsonld.js` (~45KB, Digital Bazaar 유지보수)

**@context 설계**:
```json
{
  "@context": {
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "os": "https://ontology.studio/ns/"
  }
}
```

**매핑 규칙**:
| 내부 모델 | JSON-LD |
|----------|---------|
| class | `owl:Class` |
| class.parentId | `rdfs:subClassOf` |
| property (string/integer/...) | `owl:DatatypeProperty` + `rdfs:domain` |
| relation_type | `owl:ObjectProperty` + `rdfs:domain` + `rdfs:range` |
| instance | `rdf:type` → class IRI |
| instance_value | literal value + XSD datatype |

**API**: 기존 `/api/export`에 `?format=jsonld` 쿼리 파라미터 추가.

### 4.3 P2-3: Turtle Export/Import

**기술 스택**: `N3.js` (~35KB, Ruben Verborgh 유지보수)

JSON-LD와 동일한 내부 모델을 N3.Writer로 Turtle 직렬화, N3.Parser로 파싱.

**API**: `/api/export?format=turtle`, `/api/import` Content-Type 분기.

### 4.4 P2-4: Text2Cypher UI 패널

**요구사항**: 자연어 입력 → Cypher 생성 → 실행 → 결과 시각화 전용 UI.

**위치**: RightPanel의 3번째 탭 (속성 / AI / Cypher)

**기술 스택**:
- Cypher 에디터: CodeMirror 6 (`@uiwjs/react-codemirror` + `@neo4j-cypher/codemirror`)
- 번들: ~100KB (Monaco 2MB의 1/20)
- SSR 회피: `dynamic(() => import(...), { ssr: false })`

**UI 3단 구조**:
```
┌─────────────────────────────────┐
│ 자연어 입력                      │
│ [                           🔍] │
├─────────────────────────────────┤
│ MATCH (e:Engineer)-[:MANAGES]-> │  ← CodeMirror (읽기전용/편집 토글)
│ (eq:Equipment) RETURN e, eq     │
│            [복사] [편집] [실행]  │
├─────────────────────────────────┤
│ [테이블] [그래프] [JSON]         │  ← 결과 뷰 탭
│ ┌──────┬───────┐               │
│ │ e    │ eq    │               │
│ ├──────┼───────┤               │
│ │ Kim  │ Asher │               │
│ └──────┴───────┘               │
└─────────────────────────────────┘
```

**듀얼 모드**:
- 자연어 모드: 입력 → LLM 변환 → Cypher 미리보기 → 실행
- 직접 입력 모드: CodeMirror에서 직접 Cypher 작성 → 실행

**쿼리 히스토리**: 최근 20개, 드롭다운으로 접근, 클릭 시 복원.

### 4.5 P2-5: 디자인 시스템 적용

**새 토큰** (`globals.css`에 추가):
```css
:root {
  /* Gradient */
  --gradient-brand-from: 263 70% 50.4%;
  --gradient-brand-to: 217 91% 60%;

  /* Surface */
  --surface-raised: 0 0% 100%;   /* 떠 있는 요소용 */

  /* Typography */
  --text-display: 1.5rem;     /* 24px */
  --text-display-lg: 2rem;    /* 32px */

  /* Node interaction */
  --node-selected-glow-spread: 3px;
  --node-selected-glow-blur: 12px;
  --node-related-opacity: 0.85;
  --node-unrelated-opacity: 0.35;

  /* Focus mode */
  --focus-dim-opacity: 0.15;
}
```

**새 모션 프리셋**:
- `edgeDraw`: 엣지 연결 시 SVG path 드로잉 (300ms)
- `focusTransition`: 필터/포커스 dim/highlight 전환 (250ms)
- `savePulse`: 자동저장 인디케이터 펄스 (400ms)
- `aiGlow`: AI 스트리밍 글로우 (1.5s infinite reverse)

**엣지 유형 분화**:
| 유형 | 스타일 | 마커 |
|------|--------|------|
| is-a (상속) | solid 2px | 채워진 삼각형 |
| has-a (속성) | dashed 1.5px | 다이아몬드 |
| relation | solid 1.5px | 화살표 |
| instance-of | dotted 1px | 열린 삼각형 |

**노드 호버/선택 리파인**:
- 호버: scale 1.05→1.03, shadow-lg→elevation-2, border-width +0.5px
- 선택: glow ring + 연관 노드 하이라이트 (opacity 0.85) + 비관련 노드 dim (opacity 0.35)

---

## 5. Phase 3 — 안정화 & 확장

### 5.1 P3-1: OWL/XML 기본 Export

직접 구현 (라이브러리 없이 XML 문자열 생성). 지원 범위:
- `owl:Class`, `rdfs:subClassOf`
- `owl:DatatypeProperty`, `owl:ObjectProperty`
- `rdf:type` (인스턴스)
- `owl:Restriction` (카디널리티, 부분)

**비지원**: Axiom(프로젝트 고유 로직), 복잡한 OWL DL 표현.
**경고**: Import 시 지원 범위 밖 요소는 명확한 경고 메시지 표시.

### 5.2 P3-2: 검증 결과 UI

현재 toast만 표시 → 상세 결과 패널:
- 규칙별 그룹핑 (cyclic_isa, required_properties 등)
- 각 위반 항목에서 해당 노드로 직접 이동
- severity별 색상 표시 (info/warning/error)

### 5.3 P3-3: 커밋 히스토리 UI

현재 API만 존재 → 목록 조회 화면:
- 시간순 커밋 목록 (메시지, 변경 건수, 자동/수동 구분)
- 각 커밋의 변경 상세 (before/after diff)
- 특정 커밋으로 복원 기능

### 5.4 P3-4: 제약 조건 관리 UI

현재 API만 존재 → 프론트엔드 관리 화면:
- 4종 제약 (cardinality, disjoint, domain_range, property_value) CRUD
- 그래프에서 제약 시각적 표시
- 검증과 연동

---

## 6. 디자인 시스템

> 전체 디자인 시스템은 `docs/v4/04-design-system.md`에 별도 문서화.

**핵심 요약**:

| 항목 | 현재 v3 | v4 확장 |
|------|--------|---------|
| Primary Color | Violet `#7c3aed` | + Accent Blue `#3b82f6`, gradient-brand |
| Font Stack | Pretendard + Outfit + JetBrains Mono | Inter 검토 (소형 텍스트 가독성) |
| Type Scale | 5단계 (11~18px) | + display (24px), display-lg (32px) |
| Spacing | 6단계 (4~32px) | + 3xl (48px), 4xl (64px) |
| Motion Presets | 6종 | + 4종 (edgeDraw, focusTransition, savePulse, aiGlow) |
| Elevation | 4단계 | + elevation-ai (glow) |
| Button | 5 variants | + `ai` variant (gradient-brand + glow) |
| Surface | 4단계 | + surface-raised (떠 있는 요소) |

---

## 7. 온톨로지 모델링 원칙

> 전체 내용은 `docs/v4/02-ontology-expert-proposal.md` 참조.

### 7.1 핵심 원칙

| 원칙 | 설명 |
|------|------|
| TBox/ABox 분리 | 스키마와 데이터 구분 (이미 적용) |
| Open World Assumption 회피 | 사용자가 명시한 것만 참, 추론기 없음 |
| 단일 상속 | 다중 상속은 UI 복잡도 급상승 → parentId 단일 참조 유지 |
| 프로퍼티 상속 = 읽기전용 | Copy-on-Write 패턴 |
| 네임스페이스는 선택적 | 내부 UUID, Export 시에만 IRI 생성 |
| 점진적 형식화 | severity 단계별 (info → warning → error) |

### 7.2 표현력 목표: OWL Lite 수준

```
OWL Full ⊃ OWL DL ⊃ OWL Lite ← v4 목표
                              ↑ v3 현재 (RDFS++ 수준)
```

v4에서 추가:
- `rdfs:subClassOf` 프로퍼티 전파
- JSON-LD / Turtle 표준 포맷 지원

---

## 8. DB 변경사항

**최소 변경 원칙**: 대부분 프론트엔드/런타임 로직으로 구현.

### 8.1 필수 변경

```sql
-- Migration: v4_auto_save_flag
ALTER TABLE commits ADD COLUMN is_auto_save boolean NOT NULL DEFAULT false;
```

### 8.2 선택적 변경 (Phase 2)

```sql
-- Migration: v4_namespace_support (JSON-LD Export용)
ALTER TABLE classes ADD COLUMN namespace text;
```

---

## 9. API 변경사항

| API | 변경 유형 | 내용 |
|-----|----------|------|
| `POST /api/commits` | 확장 | `isAutoSave` 필드 추가 |
| `GET /api/export` | 확장 | `?format=json\|jsonld\|turtle\|owl` 쿼리 파라미터 |
| `POST /api/import` | 확장 | Content-Type 기반 포맷 분기 (json, jsonld, turtle) |
| `POST /api/llm/parse` | 리팩토링 | openai → AI SDK `generateObject` 전환 (API 인터페이스 유지) |

---

## 10. 신규 의존성

### 추가

| 패키지 | 버전 | 용도 | 크기 | Phase |
|--------|------|------|------|-------|
| `react-resizable-panels` | latest | 패널 리사이즈 | ~8KB | 1 |
| `@radix-ui/react-context-menu` | latest | 우클릭 메뉴 | ~5KB | 1 |
| `jsonld` | latest | JSON-LD Export/Import | ~45KB | 2 |
| `n3` | latest | Turtle Export/Import | ~35KB | 2 |
| `@uiwjs/react-codemirror` | latest | Cypher 에디터 | ~100KB | 2 |
| `@neo4j-cypher/codemirror` | latest | Cypher syntax | 포함 | 2 |

### 제거

| 패키지 | 사유 |
|--------|------|
| `openai` | AI SDK로 통합, 이중 의존 해소 |

### 업그레이드

| 패키지 | 현재 | 목표 | 사유 |
|--------|------|------|------|
| `tailwindcss` | 3.4 | 4.x | Oxide 엔진 성능 개선 |

---

## 11. 리스크 관리

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| OWL/XML 매핑 복잡도 | High | High | 부분 지원만, 매핑 범위 명시, Phase 3 배치 |
| AI SDK 6.x 마이그레이션 | Medium | Medium | AIAssistantTab 리팩토링, 서버는 이미 호환 |
| Tailwind v4 마이그레이션 | Medium | Medium | 점진적 전환, config 호환 모드 활용 |
| C4 자동완성 API 비용 | Medium | Low | 분당 3회 rate limit + 로컬 fuzzy match 우선 |
| Text2Cypher Supabase 단절 | Low | - | Neo4j 전용으로 시작, 스테이징 쿼리는 Phase 3+ |
| `@neo4j-cypher/codemirror` 유지보수 | Low | Low | fallback: Shiki 읽기전용 하이라이팅 |

**절대 금지**:
- `rdflib.js` 사용 금지 (150KB + 유지보수 불안정 + 글로벌 상태 오염)

---

## 12. 우선순위 & 의존관계

```
Phase 0 (기반)
├── P0-1: openai 제거 → AI SDK
├── P0-2: AIAssistantTab → useChat
├── P0-3: ELK Web Worker
└── P0-4: Tailwind v4
     │
     ▼
Phase 1 (핵심) ── 모두 병렬 가능
├── P1-1: 패널 리사이저
├── P1-2: 자동 저장
├── P1-3: 우클릭 메뉴
├── P1-4: 필터 + 포커스 모드
├── P1-5: 프로퍼티 상속
├── P1-6: 도메인 템플릿
└── P1-7: 브랜딩
     │
     ▼
Phase 2 (고급)
├── P2-1: 자동 완성 (P0-2 필요)
├── P2-2: JSON-LD Export/Import
├── P2-3: Turtle Export/Import
├── P2-4: Text2Cypher UI (P0-2 필요)
└── P2-5: 디자인 시스템 적용
     │
     ▼
Phase 3 (안정화)
├── P3-1: OWL/XML Export
├── P3-2: 검증 결과 UI
├── P3-3: 커밋 히스토리 UI
└── P3-4: 제약 조건 관리 UI
```

---

## 부록 A: 참고 문서

| 문서 | 내용 |
|------|------|
| `docs/v4/01-current-state-analysis.md` | v3 코드베이스 & DB 전수 분석 |
| `docs/v4/02-ontology-expert-proposal.md` | 온톨로지 전문가 구현 방안 |
| `docs/v4/03-ux-design-proposal.md` | UX 설계안 (Mermaid + ASCII 와이어프레임) |
| `docs/v4/04-design-system.md` | 디자인 시스템 (컬러, 타이포, 간격, 모션, 컴포넌트 토큰) |
| `docs/v4/04-ui-bx-proposal.md` | UI/BX 개선안 (벤치마킹 포함) |
| `docs/v4/05-tech-review.md` | 기술 검증 보고서 (context7 조사 포함) |

## 부록 B: 벤치마킹 제품

| 제품 | 차용 포인트 |
|------|-----------|
| Figma | 무한 캔버스 LOD, 좌측 레이어 패널, 선택 링 |
| Linear | 미니멀 UI, Cmd+K, 키보드 중심, 빠른 트랜지션 |
| Notion | 슬래시 명령, 인라인 편집, 블록 드래그, 템플릿 |
| Neo4j Bloom | 시맨틱 검색, 노드 확장, 경로 하이라이트 |
| Obsidian | 로컬 그래프(포커스 모드), 백링크 패널, 핀 고정 |
