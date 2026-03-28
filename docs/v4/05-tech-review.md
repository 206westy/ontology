# 테크리더 — v4 기술 검증 및 라이브러리 추천 보고서

> **작성일**: 2026-03-27
> **작성자**: 테크리더 (v4 기획단)
> **역할**: 비판적 옹호자 — 모든 v4 기능의 기술적 타당성, 리스크, 대안을 검증
> **조사 도구**: context7 MCP (최신 라이브러리 문서 확인)

---

## 1. 기술 스택 현황 평가

### 1.1 v3 이후 의존성 현황

v3에서 다수의 메이저 업그레이드가 이미 완료되었음. 현재 `package.json` 기준:

| 패키지 | 현재 버전 | 상태 | 비고 |
|--------|-----------|------|------|
| `next` | 15.1.0 | **패치 뒤처짐** | 15.x 최신 패치 적용 권장. Next.js 16 전환은 v4 중후반 검토 |
| `react` / `react-dom` | ^19.0.0 | OK | React 19 안정 |
| `@xyflow/react` | ^12.10.1 | OK | React Flow v12, 최신 |
| `zustand` | ^5.0.12 | OK | v5 마이그레이션 완료 |
| `zundo` | ^2.3.0 | OK | zustand v5 호환 |
| `motion` | ^12.38.0 | OK | framer-motion -> motion 전환 완료 |
| `ai` (Vercel AI SDK) | ^6.0.138 | OK | AI SDK 6.x 최신 |
| `@ai-sdk/openai` | ^3.0.48 | OK | 최신 |
| `zod` | ^4.3.6 | OK | v4 마이그레이션 완료 |
| `@hookform/resolvers` | ^5.2.2 | OK | zod 4 호환 |
| `@supabase/ssr` | ^0.9.0 | OK | 업그레이드 완료 |
| `drizzle-orm` | ^0.45.1 | OK | 최신 |
| `elkjs` | ^0.11.1 | OK | 최신. Web Worker 분리 미적용 |
| `neo4j-driver` | ^6.0.1 | OK | 최신 |
| `tailwindcss` | ^3.4.1 | **1 메이저 뒤** | v4 마이그레이션 대상 |
| `@tiptap/react` | ^3.20.5 | OK | 최신 |
| `openai` | ^6.32.0 | **이중 의존** | AI SDK와 별도로 직접 openai 패키지 사용 중 (`parse/route.ts`) |
| `cmdk` | ^1.1.1 | OK | Command Palette용 |

### 1.2 아키텍처 성숙도 평가

**강점 (v3에서 개선된 부분)**:
- Zustand v5 + zundo 기반 undo/redo 동작 중
- Vercel AI SDK 도입으로 `streamText` 사용 (chat route)
- tiptap 에디터 도입 완료
- CommandPalette (`cmdk`) 구현 완료
- motion v12 마이그레이션 완료
- zod v4 전환 완료

**기술 부채 (v4에서 해결 필요)**:
1. **이중 LLM 클라이언트**: `parse/route.ts`에서 `openai` 패키지 직접 사용, `chat/route.ts`에서 AI SDK 사용 -- 통합 필요
2. **ELK 레이아웃 메인스레드 실행**: `elk-layout.ts`에서 `elk.bundled.js` 동기 import -- 대규모 그래프에서 UI 블로킹
3. **Tailwind v3**: v4 Oxide 엔진으로 빌드 성능 2-5x 개선 가능
4. **React Flow 최적화 미흡**: 커스텀 노드에 `React.memo` 미적용 확인 필요
5. **AIAssistantTab 직접 fetch 스트리밍**: AI SDK `useChat` 훅 미사용, 수동 ReadableStream 처리 중

---

## 2. v4 기능별 기술 검증

### A9. ELK Web Worker

**현재 상태**: `elk-layout.ts`에서 `elkjs/lib/elk.bundled.js`를 메인스레드에 import하여 동기 실행.

```typescript
// 현재 코드 (elk-layout.ts:1-4)
import ELK from 'elkjs/lib/elk.bundled.js';
const elk = new ELK();
```

**context7 조사 결과**: elkjs는 네이티브 Web Worker 지원을 제공. `workerUrl` 옵션만 전달하면 레이아웃 계산이 Worker 스레드에서 실행됨.

```javascript
// context7 확인: elkjs Web Worker 패턴
const ELK = require('elkjs');
const elk = new ELK({
  workerUrl: './node_modules/elkjs/lib/elk-worker.min.js'
});
```

**추천 구현 방법**:

| 옵션 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **elkjs 내장 workerUrl** | 제로 추가 의존성, 간단 | Next.js에서 worker URL 번들링 주의 필요 | **1순위** |
| Comlink + 커스텀 Worker | 타입 안전한 RPC, 유연 | 추가 의존성 (comlink ~1.5KB), 오버엔지니어링 | 불필요 |
| `web-worker:` vite prefix | Vite 네이티브 | Next.js/Turbopack에서 미지원 | 사용 불가 |

**구현 복잡도**: **Low**
**리스크**: Next.js/Turbopack에서 Worker 파일 번들링 경로 설정. `next.config.js`에서 `webpack` 커스터마이징 또는 `public/` 폴더에 worker 파일 배치로 해결 가능.

**구체적 구현 계획**:
1. `elkjs/lib/elk-worker.min.js`를 `public/` 폴더에 복사
2. `elk-layout.ts`에서 `new ELK({ workerUrl: '/elk-worker.min.js' })` 로 변경
3. 컴포넌트 언마운트 시 `elk.terminateWorker()` 호출
4. fallback: Worker 로드 실패 시 bundled 버전으로 graceful degradation

---

### B4. 프로퍼티 상속 시각화

**현재 상태**: v3 PRD에서 Nice-to-have로 기획되었으나 미구현. 클래스 계층(parentId)은 존재하나, 프로퍼티 상속 로직 없음.

**context7 조사 결과 (React Flow)**: React Flow v12는 `updateNodeData` 훅과 커스텀 노드 데이터 전파를 지원. `useReactFlow().getNodes()`로 트리 탐색 가능.

**추천 구현 방법**:

프론트엔드 순수 계산 (DB 변경 불필요):

```typescript
// 상속 프로퍼티 계산 (Zustand selector)
function getInheritedProperties(classId: string, classes: OntologyClass[], properties: Property[]): Property[] {
  const inherited: Property[] = [];
  let current = classes.find(c => c.id === classId);
  while (current?.parentId) {
    const parent = classes.find(c => c.id === current!.parentId);
    if (!parent) break;
    inherited.push(...properties.filter(p => p.classId === parent.id));
    current = parent;
  }
  return inherited;
}
```

**UI**: RightPanel에서 클래스 선택 시 "상속된 프로퍼티" 아코디언 섹션 (접힌 상태, 읽기 전용, 출처 클래스명 표시).

**구현 복잡도**: **Low**
**리스크**: 깊은 계층에서 순환 참조 방지 필요 (visited Set). 성능은 `useMemo`로 충분.

---

### C4. 온톨로지 자동 완성

**현재 상태**: `AIAssistantTab.tsx`에서 수동 fetch + ReadableStream 파싱으로 채팅 구현. AI SDK `useChat` 훅 미사용.

**context7 조사 결과 (Vercel AI SDK 6.x)**:

AI SDK 6.x에서 `useChat` API가 크게 변경됨:
```typescript
// AI SDK 6.x 최신 패턴 (context7 확인)
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});

// 메시지 전송
sendMessage({ parts: [{ type: 'text', text: input }] });

// 메시지 렌더링 - parts 기반
messages.map(m => m.parts.map(part => {
  if (part.type === 'text') return part.text;
}));
```

**중요 변경사항 (v5 -> v6)**:
- `handleSubmit` -> `sendMessage`
- `message.content` -> `message.parts[].text`
- Transport 레이어 도입 (`DefaultChatTransport`, `TextStreamChatTransport`)

**자동완성 추천 구현**:

| 접근 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **AI SDK `useChat` + 서버 `streamText`** | 타입 안전, 자동 상태 관리, 스트리밍 내장 | 현재 수동 구현 리팩토링 필요 | **1순위** |
| 로컬 fuzzy match + LLM 폴백 | 빠른 응답, API 비용 절감 | 두 시스템 유지 필요 | 보조 전략 |
| `useObject` + `streamObject` (구조화 제안) | Zod 스키마 기반 타입 안전 스트리밍 | 채팅 UI와 별도 구현 | 제안 항목용 |

**자동완성 트리거 전략** (테크리더 경고 유지):
- 자동: 로컬 fuzzy match (클래스명, 프로퍼티명 기존 데이터)
- 수동: Ctrl+Space 또는 버튼 클릭 -> LLM 호출 (debounce 500ms)
- API 비용 제어: 분당 최대 3회 LLM 호출 rate limit

**구현 복잡도**: **Medium**
**리스크**: AI SDK 6.x 마이그레이션 범위. 현재 `AIAssistantTab`의 수동 스트리밍을 `useChat`으로 전환해야 함. 기존 `/api/llm/chat` route는 이미 `streamText`를 사용하므로 서버는 호환.

---

### C5. 도메인 템플릿

**현재 상태**: v3 PRD에서 Nice-to-have, EmptyState에 언급만 됨.

**추천 구현 방법**:

| 접근 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **정적 JSON 파일** | 제로 의존성, 번들 가능, 오프라인 동작 | 업데이트 시 배포 필요 | **1순위** |
| Supabase 테이블 | 동적 관리, 사용자 커뮤니티 템플릿 가능 | 추가 API, 빈 DB 시 문제 | v5+ |
| LLM 동적 생성 | 도메인명만으로 생성 가능 | 일관성 없음, 비용, 지연 | 보조 옵션 |

**구현 계획**:
```
ontology/src/features/ontology/constants/templates/
  ├── semiconductor.json
  ├── it-infrastructure.json
  ├── organization.json
  ├── healthcare.json
  └── supply-chain.json
```

각 JSON 파일은 `{ classes, properties, instances, relations, relationTypes }` 구조로 현재 Zustand 스토어와 직접 호환.

**구현 복잡도**: **Low**
**리스크**: 거의 없음. JSON 스키마 유효성만 zod로 검증.

---

### D6. 자동 저장

**현재 상태**: `useApiSync.ts`에서 Zustand 변경 감지 -> 즉시 API 호출. 커밋은 수동.

**추천 구현 방법**:

현재 아키텍처는 이미 "변경 즉시 서버 동기화" 패턴. 자동 저장은 "자동 커밋"을 의미.

| 전략 | 구현 | 리스크 |
|------|------|--------|
| **디바운스 자동 커밋** | 마지막 변경 후 30초 경과 시 자동 커밋 | 커밋 이력이 과도하게 늘어남 |
| **주기적 스냅샷** | 5분마다 pendingChanges > 0이면 커밋 | 사용자 의도와 무관한 커밋 |
| **유휴 감지** | `requestIdleCallback` + 변경 감지 | 브라우저 지원 확인 필요 |

**추천**: es-toolkit의 `debounce`(이미 의존성에 포함) 사용. 30초 디바운스 + 유저 설정 토글.

```typescript
import { debounce } from 'es-toolkit';

const autoCommit = debounce(() => {
  const state = useOntologyStore.getState();
  if (state.pendingChanges.length > 0) {
    state.commitChanges('자동 저장');
  }
}, 30_000);
```

**Optimistic Update 전략**: 이미 구현됨 (Zustand 즉시 업데이트 + API 비동기 동기화). 추가 작업 불필요.

**구현 복잡도**: **Low**
**리스크**: Low. `beforeunload` 이벤트에서 미저장 변경 경고 추가 필요.

---

### D7-D8. 필터 + 포커스 모드 / 우클릭 컨텍스트 메뉴

**현재 상태**: 기본 React Flow 기능만 사용. 필터/포커스 없음. 우클릭 미구현.

**context7 조사 결과 (React Flow v12)**:

React Flow v12는 노드 필터링을 위한 네이티브 API를 제공하지 않음. 대신 데이터 수준에서 필터링하여 `nodes` / `edges` 배열을 조건부로 전달하는 패턴을 사용.

우클릭 메뉴는 `onNodeContextMenu`, `onPaneContextMenu` 이벤트 핸들러로 구현:
```jsx
// context7 확인: React Flow 우클릭 이벤트
<ReactFlow
  onNodeContextMenu={(event, node) => {
    event.preventDefault();
    // 커스텀 컨텍스트 메뉴 표시
  }}
  onPaneContextMenu={(event) => {
    event.preventDefault();
    // 빈 공간 우클릭 메뉴
  }}
/>
```

**필터 구현 추천**:

```typescript
// Zustand에 필터 상태 추가
interface FilterState {
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: Set<string>;
  focusNodeId: string | null;
  focusDepth: number; // N-hop
}

// GraphCanvas에서 필터 적용
const filteredNodes = useMemo(() => {
  let nodes = buildFlowNodes(classes, instances, ...);
  if (!filter.showInstances) nodes = nodes.filter(n => n.type !== 'instanceNode');
  if (filter.focusNodeId) nodes = getNeighborhood(filter.focusNodeId, filter.focusDepth, nodes, edges);
  return nodes;
}, [classes, instances, filter]);
```

**우클릭 메뉴 추천**: `@radix-ui/react-context-menu`(이미 Radix 생태계 사용 중)로 구현.

| 항목 | 추가 의존성 | 비고 |
|------|------------|------|
| `@radix-ui/react-context-menu` | ~5KB | shadcn/ui에 이미 포함 가능 (`npx shadcn@latest add context-menu`) |

**구현 복잡도**: **Medium** (필터) / **Low** (우클릭)
**리스크**: 포커스 모드에서 N-hop BFS 계산 비용. 100+ 노드에서도 `useMemo`로 충분하나, 1000+ 노드 시 Web Worker 고려.

---

### E9. 패널 리사이저

**현재 상태**: 패널 너비 고정 (ExplorerPanel, RightPanel 모두 하드코딩).

**context7 조사 결과 (react-resizable-panels)**:

```tsx
// context7 확인: react-resizable-panels 최신 API
import { Group, Panel, Separator } from "react-resizable-panels";

<Group orientation="horizontal">
  <Panel defaultSize="20%" minSize="15%">
    <ExplorerPanel />
  </Panel>
  <Separator />
  <Panel defaultSize="55%">
    <GraphCanvas />
  </Panel>
  <Separator />
  <Panel defaultSize="25%" minSize="15%">
    <RightPanel />
  </Panel>
</Group>
```

**라이브러리 비교**:

| 라이브러리 | 번들 크기 | 별점/DL | API 품질 | 추천 |
|-----------|----------|---------|---------|------|
| **react-resizable-panels** | ~8KB gzip | 5.4k/600k+ weekly | Group/Panel/Separator 3 컴포넌트, 키보드 지원, SSR 호환 | **1순위** |
| allotment | ~12KB gzip | 1.2k/50k+ weekly | VSCode 스타일, 무거움 | 오버킬 |
| 커스텀 구현 (CSS resize) | 0KB | - | CSS `resize` property만으로 불충분 (양방향 제어 불가) | 비추천 |

**추천**: `react-resizable-panels` (npm: `react-resizable-panels`). Brian Vaughn (전 React 코어팀)이 유지보수. 접근성 우수, SSR 지원, 레이아웃 영속화(`onLayoutChanged` 콜백으로 `localStorage`에 저장 가능).

**구현 복잡도**: **Low**
**리스크**: 거의 없음. Drop-in 교체 가능.

---

### F3-F4. JSON-LD / OWL 익스포트-임포트

**현재 상태**: v3 PRD에서 JSON-LD/OWL 기본 지원 계획이나 미구현.

**context7 조사 결과**:

#### jsonld.js
```javascript
// context7 확인: jsonld.js 핵심 API
const jsonld = require('jsonld');

// 내보내기: compact (가독성 좋은 JSON-LD 생성)
const compacted = await jsonld.compact(doc, context);

// 가져오기: expand (IRI 확장)
const expanded = await jsonld.expand(doc);

// RDF 변환
const nquads = await jsonld.toRDF(doc, {format: 'application/n-quads'});
```

#### OWL/RDF 라이브러리 비교

| 라이브러리 | 번들 크기 | 기능 범위 | 유지보수 | 추천 |
|-----------|----------|----------|---------|------|
| **jsonld.js** | ~45KB gzip | JSON-LD 처리 전문 (compact, expand, frame, toRDF) | 활발 (Digital Bazaar) | **JSON-LD용 1순위** |
| **N3.js** | ~35KB gzip | Turtle/N-Triples/N-Quads 파싱/직렬화 + RDF 스토어 | 활발 (Ruben Verborgh) | **Turtle용 1순위** |
| rdflib.js | ~150KB gzip | 포괄적 RDF (파싱, 스토어, SPARQL) | 유지보수 불안정, 번들 큼 | **비추천** |
| 직접 구현 | 0KB | 단순 직렬화만 가능 | 유지보수 부담 | OWL/XML 기본 출력만 |

**추천 전략**:

1. **JSON-LD**: `jsonld.js` 사용. 온톨로지 데이터 -> `@context` 정의 -> `jsonld.compact()` 로 내보내기. `jsonld.expand()` -> 파싱으로 가져오기.
2. **Turtle**: `N3.js` (패키지: `n3`) 사용. N3.Writer로 직렬화, N3.Parser로 파싱.
3. **OWL/XML**: 직접 구현 (단순 XML 문자열 생성). OWL 전체 스펙 매핑은 현실적으로 불가능하므로 기본 수준만.

**매핑 범위 (솔직한 평가)**:

| 온톨로지 요소 | JSON-LD | Turtle | OWL/XML | 비고 |
|-------------|---------|--------|---------|------|
| Classes (rdfs:Class) | OK | OK | OK | 직접 매핑 |
| Subclass (rdfs:subClassOf) | OK | OK | OK | parentId -> subClassOf |
| Properties (owl:DatatypeProperty) | OK | OK | OK | 직접 매핑 |
| Instances (rdf:type) | OK | OK | OK | classId -> rdf:type |
| Relations (owl:ObjectProperty) | OK | OK | OK | 직접 매핑 |
| Cardinality constraints | 부분 | 부분 | OK | OWL restriction 사용 |
| Disjoint | 부분 | 부분 | OK | owl:disjointWith |
| Axioms (커스텀) | **불가** | **불가** | **부분** | 프로젝트 고유 로직 |
| Instance values | OK | OK | OK | 리터럴 값 |

**구현 복잡도**: **Medium** (JSON-LD) / **Medium** (Turtle) / **High** (OWL/XML)
**리스크**:
- OWL 임포트 시 지원 범위 밖 요소에 대한 명확한 경고 필요
- 라운드트립(내보내기->가져오기) 완전성 검증 필요
- **rdflib.js를 절대 사용하지 말 것**: 150KB 번들 + 유지보수 불안정 + 글로벌 상태 오염

---

### Text2Cypher UI (코드 에디터)

**현재 상태**: `text2cypher/route.ts`에서 서버 측 Cypher 생성/실행 구현 완료. 프론트엔드 UI에서 Cypher 프리뷰는 단순 `<pre>` 태그 사용.

**에디터 비교**:

| 에디터 | 번들 크기 | Cypher 지원 | React 통합 | 추천 |
|--------|----------|------------|-----------|------|
| **CodeMirror 6** | ~100KB gzip (core + lang) | 커뮤니티 패키지 `@neo4j-cypher/codemirror` | `@uiwjs/react-codemirror` 래퍼 | **1순위** |
| Monaco Editor | ~2MB gzip | 커뮤니티 Cypher 플러그인 있음 | `@monaco-editor/react` | 번들 과대 |
| Shiki (하이라이팅만) | ~15KB gzip | Cypher grammar 있음 | React 호환 | 읽기 전용용 |
| 커스텀 `<textarea>` + Prism.js | ~20KB | Cypher grammar 직접 작성 | 간단 | 편집 기능 부족 |

**context7 조사 결과 (CodeMirror 6)**:

```javascript
// context7 확인: CodeMirror 6 기본 설정
import { EditorView, basicSetup } from "codemirror";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

// Cypher 전용 언어 패키지
import { cypher } from "@neo4j-cypher/codemirror";

let view = new EditorView({
  extensions: [basicSetup, cypher(), syntaxHighlighting(defaultHighlightStyle)],
  parent: document.body
});
```

**추천**: CodeMirror 6 + `@neo4j-cypher/codemirror`.

- 번들 크기: ~100KB로 Monaco(2MB)의 1/20
- `@neo4j-cypher/codemirror`: Neo4j 공식 패키지, Cypher syntax highlighting + 자동완성
- React 래퍼: `@uiwjs/react-codemirror` (npm weekly downloads 400k+)
- **읽기 전용 + 편집 모드** 전환 가능
- 다크모드: CodeMirror 6 테마 시스템으로 즉시 대응

**대안 고려**: Cypher 프리뷰가 읽기 전용만 필요하면 `Shiki`(~15KB)로도 충분. 그러나 사용자가 쿼리를 직접 수정/실행하는 시나리오까지 고려하면 CodeMirror가 합리적.

**구현 복잡도**: **Medium**
**리스크**:
- `@neo4j-cypher/codemirror` 패키지의 유지보수 상태 확인 필요
- CodeMirror 6 + Next.js SSR 충돌: `dynamic(() => import(...), { ssr: false })` 패턴 필요

---

### E11. 브랜딩 (로고 + 시그니처 컬러)

**현재 상태**: v3 PRD에서 "연결된 3노드 삼각형 + violet-blue gradient" 정의.

**추천 구현**:

| 항목 | 구현 방법 | 비고 |
|------|----------|------|
| SVG 로고 | 직접 제작 (Figma/SVG 수동) 또는 `lucide-react` 커스텀 아이콘 | 라이브러리 불필요 |
| CSS Gradient | `background: linear-gradient(135deg, #7c3aed, #2563eb)` | Tailwind: `bg-gradient-to-br from-violet-600 to-blue-600` |
| 파비콘 | SVG 파비콘 (`<link rel="icon" type="image/svg+xml">`) | 모든 모던 브라우저 지원 |

**구현 복잡도**: **Low**
**리스크**: 없음.

---

## 3. 신규 의존성 추가 제안

### 3.1 v4 필수 추가

| 패키지 | 버전 | 크기 (gzip) | 용도 | 사유 |
|--------|------|------------|------|------|
| `react-resizable-panels` | ^3.x | ~8KB | 패널 리사이저 (E9) | 접근성, SSR, 키보드 지원. Brian Vaughn 유지보수 |
| `@radix-ui/react-context-menu` | ^2.x | ~5KB | 우클릭 메뉴 (D8) | 이미 Radix 생태계 사용 중 |

### 3.2 v4 조건부 추가 (해당 기능 구현 시)

| 패키지 | 버전 | 크기 (gzip) | 용도 | 사유 |
|--------|------|------------|------|------|
| `jsonld` | ^8.x | ~45KB | JSON-LD 익스포트/임포트 (F3) | 공식 W3C 구현, Digital Bazaar 유지보수 |
| `n3` | ^1.x | ~35KB | Turtle 익스포트/임포트 (F4) | 경량 RDF, Ruben Verborgh 유지보수 |
| `@uiwjs/react-codemirror` | ^4.x | ~100KB | Cypher 에디터 (Text2Cypher) | CodeMirror 6 React 래퍼 |
| `@neo4j-cypher/codemirror` | latest | ~20KB | Cypher 문법 지원 | Neo4j 공식 |

### 3.3 제거 대상

| 패키지 | 사유 |
|--------|------|
| `openai` (직접 패키지) | AI SDK `@ai-sdk/openai`로 완전 대체 가능. `parse/route.ts` 리팩토링 후 제거 |

### 3.4 업그레이드 대상

| 패키지 | 현재 -> 목표 | 사유 |
|--------|-------------|------|
| `tailwindcss` | 3.4 -> 4.x | Oxide 엔진, CSS-first config, 빌드 성능 2-5x |
| `tailwind-merge` | 2.x -> 3.x (Tailwind v4 호환) | Tailwind v4 클래스 호환 |
| `next` | 15.1.0 -> 15.x latest | 보안/성능 패치 |

---

## 4. 성능 최적화 전략

### 4.1 즉시 효과 (Low Effort, High Impact)

| 최적화 | 방법 | 예상 효과 |
|--------|------|----------|
| ELK Web Worker | `workerUrl` 옵션 전달 | 레이아웃 계산 시 UI 블로킹 제거 |
| React.memo 커스텀 노드 | `ClassNode`, `InstanceNode`에 `React.memo` 확인/적용 | 노드 변경 시 전체 리렌더 방지 |
| openai 패키지 제거 | AI SDK로 통합 | ~30KB 번들 절감 |
| Dynamic import | RightPanel, NeoConfirmSheet, CommandPalette | 초기 로드 JS 감소 |

### 4.2 중기 효과 (Medium Effort)

| 최적화 | 방법 | 예상 효과 |
|--------|------|----------|
| Tailwind v4 | Oxide 엔진 빌드 | CSS 빌드 속도 2-5x |
| AI 탭 `useChat` 전환 | 수동 fetch -> AI SDK 훅 | 코드 50% 축소 + 자동 상태 관리 |
| 노드 가상화 | React Flow `onlyRenderVisibleElements` 검증 | 1000+ 노드 시 렌더링 비용 감소 |

### 4.3 대규모 그래프 (500+ 노드) 대응

| 전략 | 설명 |
|------|------|
| Level-of-Detail (LOD) | 줌 아웃 시 노드를 단순 원으로 축소, 줌 인 시 상세 렌더링 |
| 클러스터링 | 클래스별 자동 그룹화, 접기/펼치기 |
| 프로그레시브 렌더링 | 초기에 상위 클래스만 표시, 스크롤/탐색 시 하위 로딩 |

---

## 5. 기술 부채 경고

### 5.1 Critical (v4에서 반드시 해결)

| 부채 | 위치 | 영향 | 해결 방안 |
|------|------|------|----------|
| **이중 LLM 클라이언트** | `parse/route.ts`에서 `openai` 직접 사용 | 의존성 이중화, 설정 분산 | AI SDK `generateObject`로 전환 |
| **AIAssistantTab 수동 스트리밍** | `AIAssistantTab.tsx` | 200줄 → 30줄로 축소 가능 | AI SDK `useChat` 훅으로 전환 |
| **ELK 메인스레드** | `elk-layout.ts` | 대규모 그래프 UI 프리징 | Web Worker 분리 |

### 5.2 Important (v4 중 해결 권장)

| 부채 | 위치 | 영향 | 해결 방안 |
|------|------|------|----------|
| Tailwind v3 | 전체 | 빌드 성능 | v4 마이그레이션 |
| 단일 거대 스토어 | `useOntologyStore` | zundo 스냅샷 비용 | 슬라이스 분리 (entities/ui/history) |
| 커밋 버튼 DOM 쿼리 | `CommandPalette.tsx:89-102` | `document.querySelector` 안티패턴 | Zustand action으로 전환 |

### 5.3 낮은 긴급도 (v4 후반 또는 v5)

| 부채 | 설명 |
|------|------|
| Next.js 16 마이그레이션 | 메이저 업그레이드. v4 안정화 후 검토 |
| Supabase RLS 활성화 | 멀티유저 전환 시 필수 |
| Server Actions 전환 | API Route -> Server Actions 점진적 전환 |

---

## 6. 우선순위 추천 (기술적 난이도 + 의존관계 기반)

### Phase 0: 기반 정비 (v4 개발 전)

| 작업 | 난이도 | 의존관계 | 근거 |
|------|--------|---------|------|
| `openai` 패키지 제거 (AI SDK 통합) | 쉬움 | 없음 | 기술 부채 해소, 번들 절감 |
| AIAssistantTab -> `useChat` 전환 | 중간 | openai 제거 후 | AI SDK 6.x 최신 API 적용 |
| ELK Web Worker 분리 | 쉬움 | 없음 | 성능 즉시 개선 |
| Tailwind v4 마이그레이션 | 중간 | 없음 | 빌드 성능 개선, 이후 UI 작업 효율 |

### Phase 1: 핵심 기능 (기술적 의존관계 순)

| 작업 | 난이도 | 의존관계 | 근거 |
|------|--------|---------|------|
| 패널 리사이저 (E9) | 쉬움 | 없음 | Drop-in, 즉시 UX 개선 |
| 필터 + 포커스 모드 (D7) | 중간 | 없음 | Zustand 상태 추가 + GraphCanvas 필터링 |
| 우클릭 컨텍스트 메뉴 (D8) | 쉬움 | 없음 | Radix context-menu |
| 자동 저장 (D6) | 쉬움 | 없음 | es-toolkit debounce |
| 프로퍼티 상속 시각화 (B4) | 쉬움 | 없음 | 프론트엔드 순수 계산 |
| 도메인 템플릿 (C5) | 쉬움 | 없음 | 정적 JSON |

### Phase 2: 고급 기능

| 작업 | 난이도 | 의존관계 | 근거 |
|------|--------|---------|------|
| 온톨로지 자동 완성 (C4) | 중간 | AI SDK 통합 완료 후 | `useChat` + 로컬 fuzzy match |
| JSON-LD 지원 (F3) | 중간 | 없음 | jsonld.js 도입 |
| Turtle 지원 (F4) | 중간 | 없음 | N3.js 도입 |
| Text2Cypher UI (CodeMirror) | 중간 | 없음 | CodeMirror 6 + neo4j-cypher |
| 브랜딩 (E11) | 쉬움 | 없음 | SVG + CSS |

### Phase 3: OWL + 안정화

| 작업 | 난이도 | 의존관계 | 근거 |
|------|--------|---------|------|
| OWL/XML 기본 지원 | 높음 | JSON-LD, Turtle 완료 후 | 매핑 범위 제한적, 부분 지원 명시 |
| Zustand 스토어 슬라이스 분리 | 높음 | 없음 | 기술 부채, 리팩토링 범위 큼 |
| 대규모 그래프 LOD/클러스터링 | 높음 | 필터 모드 완료 후 | 500+ 노드 대응 |

---

## 7. 기능별 리스크 매트릭스

| 기능 | 구현 복잡도 | 성능 리스크 | 의존성 리스크 | 유지보수 리스크 | 총합 |
|------|-----------|-----------|-------------|---------------|------|
| A9. ELK Web Worker | L | L | L | L | **안전** |
| B4. 프로퍼티 상속 | L | L | L | L | **안전** |
| C4. 자동 완성 | M | M (API 비용) | L | M | **주의** |
| C5. 도메인 템플릿 | L | L | L | L | **안전** |
| D6. 자동 저장 | L | L | L | L | **안전** |
| D7. 필터/포커스 | M | L | L | L | **안전** |
| D8. 우클릭 메뉴 | L | L | L | L | **안전** |
| E9. 패널 리사이저 | L | L | L | L | **안전** |
| E11. 브랜딩 | L | L | L | L | **안전** |
| F3. JSON-LD | M | L | M (jsonld.js 45KB) | L | **보통** |
| F4. Turtle | M | L | M (N3.js 35KB) | L | **보통** |
| F4. OWL/XML | H | L | L (직접 구현) | H (매핑 복잡) | **경고** |
| Text2Cypher UI | M | L | M (CM6 100KB) | L | **보통** |

**L**: Low, **M**: Medium, **H**: High

---

## 부록 A: context7 조사 요약

| 라이브러리 | context7 ID | 핵심 발견 |
|-----------|-------------|----------|
| elkjs | `/kieler/elkjs` | `workerUrl` 옵션으로 Web Worker 즉시 분리 가능. `elk.terminateWorker()` cleanup API 제공. layered/stress/force/radial/disco 알고리즘 지원 |
| React Flow | `/xyflow/xyflow` | v12 최신. `onNodeContextMenu`/`onPaneContextMenu` 우클릭 지원. `NodeToolbar` 컴포넌트로 선택 노드 액션. `NodeResizer`로 노드 크기 조절. 데이터 수준 필터링 패턴 |
| Vercel AI SDK | `/vercel/ai` | v6.x: `useChat`에 Transport 레이어 도입 (`DefaultChatTransport`). `sendMessage` API (v5의 `handleSubmit` 대체). `message.parts[]` 구조 (v5의 `message.content` 대체). 4369개 코드 스니펫 |
| react-resizable-panels | `/bvaughn/react-resizable-panels` | `Group`/`Panel`/`Separator` 3컴포넌트 API. `orientation` (horizontal/vertical). `defaultSize`/`minSize`/`maxSize`. `onLayoutChanged` 콜백. 키보드 접근성 |
| CodeMirror 6 | `/websites/codemirror_net` | `basicSetup` + 언어 확장 패턴. `syntaxHighlighting` + `HighlightStyle`. 커스텀 언어 정의 가능. EditorView 확장 시스템 |
| jsonld.js | `/digitalbazaar/jsonld.js` | `compact`/`expand`/`frame`/`toRDF` 4대 API. N-Quads 포맷 출력. `safe` 모드로 비손실 보장. 85.8 벤치마크 점수 |

## 부록 B: AI SDK 6.x 마이그레이션 가이드 (현재 코드 기준)

### 1. AIAssistantTab.tsx (수동 fetch -> useChat)

**현재**: 200줄, 직접 `fetch` + `ReadableStream` 파싱
**목표**: ~40줄, AI SDK `useChat` 훅

```typescript
// Before (현재 AIAssistantTab.tsx)
const res = await fetch('/api/llm/chat', { ... });
const reader = res.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  setMessages(prev => prev.map(...));
}

// After (AI SDK 6.x)
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, isLoading } = useChat({
  transport: new DefaultChatTransport({ api: '/api/llm/chat' }),
});
// messages 자동 관리, 스트리밍 자동 처리
```

### 2. parse/route.ts (openai 직접 -> AI SDK)

**현재**: `openai` 패키지 직접 사용, `gpt-5.4-mini` 모델
**목표**: AI SDK `generateObject` + zod 스키마

```typescript
// Before (현재)
import OpenAI from 'openai';
const client = new OpenAI({ apiKey });
const completion = await client.chat.completions.create({
  model: 'gpt-5.4-mini',
  messages: [...],
  response_format: { type: 'json_object' },
});

// After (AI SDK)
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateObject({
  model: openai('gpt-5.4-mini'),
  schema: ParsedOntology,  // zod 스키마 직접 전달
  prompt: userPrompt,
  system: systemPrompt,
});
// result.object: 타입 안전한 파싱 결과
```

**주의**: `gpt-5.4-mini`는 실제 사용 중인 모델명이므로 변경하지 않을 것.

---

## 부록 C: 기능 간 기술적 의존관계 그래프

```
Phase 0 (기반)
  ├── openai 패키지 제거 + AI SDK 통합
  │   └── AIAssistantTab useChat 전환
  │       └── C4. 자동 완성 (Phase 1)
  ├── ELK Web Worker (A9)
  └── Tailwind v4
      └── 모든 UI 작업

Phase 1 (핵심)
  ├── E9. 패널 리사이저 ──(독립)
  ├── D6. 자동 저장 ──(독립)
  ├── D7. 필터/포커스 ──(독립)
  ├── D8. 우클릭 메뉴 ──(독립)
  ├── B4. 프로퍼티 상속 ──(독립)
  └── C5. 도메인 템플릿 ──(독립)

Phase 2 (고급)
  ├── F3. JSON-LD ──(독립)
  │   └── F4. OWL/XML (Phase 3)
  ├── F4. Turtle ──(독립)
  ├── Text2Cypher UI ──(독립)
  └── E11. 브랜딩 ──(독립)
```

Phase 1 기능들은 모두 독립적이므로 **병렬 개발 가능**. Phase 0이 병목.
