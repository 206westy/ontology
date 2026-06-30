# Ontology Studio v4 — Implementation Breakdown

> **작성일**: 2026-03-28
> **작성자**: 기획자 (v4 개발팀)
> **기반 문서**: PRD-v4.md, 01~05 분석 문서
> **목적**: Phase 0~3 전체 항목의 파일별 변경 범위, 의존관계, 복잡도, 테스트 포인트 정리

---

## 목차

1. [Phase 0 — 기반 정비](#phase-0--기반-정비)
2. [Phase 1 — 핵심 기능](#phase-1--핵심-기능)
3. [Phase 2 — 고급 기능](#phase-2--고급-기능)
4. [Phase 3 — 안정화 & 확장](#phase-3--안정화--확장)
5. [전체 의존관계 그래프](#전체-의존관계-그래프)
6. [Phase별 병렬성 요약](#phase별-병렬성-요약)

---

## Phase 0 — 기반 정비

> 기술 부채를 해소하여 v4 기능 개발의 안정적 토대를 마련한다.
> Phase 0의 4개 항목은 모두 **독립적**이므로 병렬 진행 가능.

---

### P0-1: openai 패키지 제거 → AI SDK `generateObject` 통합

**현재 상태**: `parse/route.ts`에서 `openai` 패키지를 직접 import하여 `client.chat.completions.create()` 호출. `chat/route.ts`는 이미 AI SDK `streamText` 사용 중. 이중 LLM 클라이언트 유지 상태.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/app/api/llm/parse/route.ts` | 수정 | `OpenAI` import 제거 → `@ai-sdk/openai`의 `openai()` 모델 팩토리 + AI SDK `generateObject()` 사용. Zod 스키마(`ParsedOntology`)를 `schema` 파라미터로 직접 전달하여 구조화된 응답 보장. `response_format: { type: 'json_object' }` 수동 파싱 로직 제거. |
| `ontology/package.json` | 수정 | `"openai": "^6.32.0"` 의존성 제거 |

#### 변경 내용 요약 (코드 수준)

```typescript
// Before (현재)
import OpenAI from 'openai';
const client = new OpenAI({ apiKey });
const completion = await client.chat.completions.create({
  model: 'gpt-5.4-mini',
  messages: [...],
  response_format: { type: 'json_object' },
});
const content = completion.choices[0]?.message?.content;
const jsonResult = JSON.parse(content);
const validated = ParsedOntology.safeParse(jsonResult);

// After (v4)
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
const { object } = await generateObject({
  model: openai('gpt-5.4-mini'),
  schema: ParsedOntology,  // Zod 스키마 직접 전달
  system: systemPrompt,
  prompt: userPrompt,
});
// object는 이미 타입 안전한 ParsedOntologyOutput
return NextResponse.json(object);
```

- `gpt-5.4-mini` 모델명 유지 (실제 모델, 변경 금지)
- `generateObject`가 Zod 스키마로 자동 검증하므로 수동 `safeParse` 불필요
- 에러 핸들링은 AI SDK의 표준 에러 타입 사용

#### 의존성

- 없음 (독립 작업)
- 단, `openai` 패키지 제거는 P0-2 완료 후 최종 확인 (다른 곳에서 사용하지 않는지)

#### 예상 복잡도: **Low**

#### 테스트 포인트

- [ ] 기존 텍스트 입력 → 동일한 `ParsedOntologyOutput` 구조 반환 확인
- [ ] Zod 스키마 불일치 시 AI SDK가 적절한 에러 반환 확인
- [ ] `gpt-5.4-mini` 모델 호출 정상 동작 확인
- [ ] `openai` 패키지 제거 후 빌드 성공 확인 (`npm run build`)
- [ ] NewNodePopover Text 탭에서 E2E 파싱 동작 확인

---

### P0-2: AIAssistantTab → AI SDK 6.x `useChat` 훅 전환

**현재 상태**: `AIAssistantTab.tsx`에서 수동 `fetch` + `ReadableStream` 파싱으로 약 200줄의 스트리밍 로직 직접 구현. 메시지 상태, 스트리밍 축적, 에러 핸들링, 취소 로직 등이 모두 수동.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/components/AIAssistantTab.tsx` | 수정 | 수동 fetch+stream 코드(~150줄) 제거 → AI SDK 6.x `useChat` 훅으로 전환 (~40줄). `DefaultChatTransport` 사용. 메시지 렌더링을 `message.parts[]` 기반으로 전환. |

#### 변경 내용 요약 (코드 수준)

**제거 대상**:
- `ChatMessage` 인터페이스 (AI SDK `UIMessage` 타입으로 대체)
- `generateId()` 헬퍼 (AI SDK 내부 ID 생성)
- `useState`로 관리하던 `messages`, `isLoading` (훅이 관리)
- `AbortController` 수동 관리 (훅이 `stop()` 제공)
- `fetch('/api/llm/chat')` + `ReadableStream` reader 루프 전체
- 수동 스트리밍 축적 로직 (`accumulated += decoder.decode(...)`)

**추가 대상**:
```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, isLoading, stop, setMessages } = useChat({
  transport: new DefaultChatTransport({ api: '/api/llm/chat' }),
  body: {
    context: {
      selectedNodeIds: context.selectedNodeIds,
      selectedNodeType: context.selectedNodeType,
      ontologySummary: context.ontologySummary,
    },
  },
});

// 메시지 전송: sendMessage({ text: input })
// 초기화: setMessages([])
// 취소: stop()
// 렌더링: message.parts.map(part => part.type === 'text' ? part.text : null)
```

- 서버 `chat/route.ts`는 이미 AI SDK `streamText` 사용 중이므로 변경 불필요
- AI SDK 6.x 변경사항: `handleSubmit` → `sendMessage`, `message.content` → `message.parts[].text`

#### 의존성

- 없음 (독립 작업)
- Phase 2의 P2-1(자동완성), P2-4(Text2Cypher UI)가 이 훅 패턴을 재사용

#### 예상 복잡도: **Medium**

AI SDK 6.x의 `useChat` API가 v5와 크게 다름. `DefaultChatTransport`, `sendMessage`, `parts[]` 기반 렌더링 등 마이그레이션 포인트가 여러 곳. 그러나 서버 측은 변경 없음.

#### 테스트 포인트

- [ ] 채팅 메시지 전송 및 스트리밍 응답 정상 표시
- [ ] 스트리밍 중 취소(stop) 동작 확인
- [ ] 대화 초기화(setMessages([])) 동작 확인
- [ ] 선택 노드 컨텍스트가 서버에 정상 전달 확인
- [ ] 에러 발생 시 사용자 친화적 메시지 표시
- [ ] 접근성: 키보드로 입력/전송/취소 가능

---

### P0-3: ELK Web Worker 분리

**현재 상태**: `elk-layout.ts`에서 `elkjs/lib/elk.bundled.js`를 메인스레드 import. 노드 100+ 시 UI 블로킹 가능.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/lib/elk-layout.ts` | 수정 | `import ELK from 'elkjs/lib/elk.bundled.js'` → `new ELK({ workerUrl: '/elk-worker.min.js' })`. Worker 로드 실패 시 bundled fallback. cleanup 함수 export. |
| `ontology/public/elk-worker.min.js` | 신규 | `node_modules/elkjs/lib/elk-worker.min.js` 복사 배치 |

#### 변경 내용 요약 (코드 수준)

```typescript
// Before
import ELK from 'elkjs/lib/elk.bundled.js';
const elk = new ELK();

// After
import ELK from 'elkjs';

let elk: InstanceType<typeof ELK>;
try {
  elk = new ELK({ workerUrl: '/elk-worker.min.js' });
} catch {
  // fallback: bundled 버전
  const ELKBundled = (await import('elkjs/lib/elk.bundled.js')).default;
  elk = new ELKBundled();
}

export function terminateElkWorker() {
  elk.terminateWorker?.();
}
```

- `public/elk-worker.min.js`: 빌드 스크립트 또는 수동으로 `node_modules/elkjs/lib/elk-worker.min.js` 복사
- GraphCanvas 컴포넌트 언마운트 시 `terminateElkWorker()` 호출 추가

#### 의존성

- 없음 (독립 작업)

#### 예상 복잡도: **Low**

#### 테스트 포인트

- [ ] 레이아웃 정리 버튼 클릭 시 UI가 블로킹되지 않는지 확인 (100+ 노드)
- [ ] Worker 로드 실패 시 fallback으로 정상 레이아웃 수행
- [ ] 페이지 이동/언마운트 시 Worker 정리 확인 (메모리 누수 방지)
- [ ] 기존 레이아웃 결과와 동일한 배치 확인

---

### P0-4: Tailwind CSS v4 마이그레이션

**현재 상태**: Tailwind v3.4 사용. `tailwind.config.ts`에 커스텀 테마(colors, spacing, fontSize, boxShadow, borderRadius), `globals.css`에 CSS 변수 다수 정의.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `tailwindcss` ^3.4.1 → ^4.x, `tailwind-merge` ^2.5.2 → ^3.x (v4 호환), `tailwindcss-animate` 호환 확인, `@tailwindcss/typography` v4 호환 버전, `postcss` 설정 변경, `autoprefixer` 제거 (v4 내장) |
| `ontology/tailwind.config.ts` | 수정/삭제 | v4 CSS-first config로 마이그레이션. `tailwind.config.ts`의 theme.extend 내용을 CSS `@theme` 블록으로 이전. 또는 v4 호환 모드(`@config`)로 기존 설정 유지 후 점진 전환. |
| `ontology/src/app/globals.css` | 수정 | `@tailwind base/components/utilities` 디렉티브 → `@import "tailwindcss"` 변환. CSS 변수 체계는 유지. `@theme` 블록으로 커스텀 토큰 이전. |
| `ontology/postcss.config.mjs` (또는 .js) | 수정 | PostCSS 설정에서 `tailwindcss` + `autoprefixer` → `@tailwindcss/postcss` 단일 플러그인 |
| 전체 `*.tsx` 파일 | 잠재적 수정 | v4에서 변경된 유틸리티 클래스 확인. 대부분 호환되나, `shadow-*`, `ring-*` 등 일부 변경 가능. |

#### 변경 내용 요약 (코드 수준)

**전략: 점진적 전환 (v4 호환 모드 우선)**

1단계 — 호환 모드:
```css
/* globals.css */
@import "tailwindcss";
@config "../tailwind.config.ts";  /* 기존 config 그대로 사용 */
```

2단계 — CSS-first 전환 (선택적):
```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: hsl(263 70% 50.4%);
  --color-accent: hsl(217 91% 60%);
  --font-sans: 'Pretendard Variable', var(--font-outfit), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
  /* ... 기존 theme.extend 내용 이전 */
}
```

**주의사항**:
- `darkMode: ['class']`는 v4에서 기본 동작이므로 별도 설정 불필요
- `tailwindcss-animate` 플러그인 v4 호환성 확인 필요 (대부분 호환)
- `hsl(var(--...))` 패턴은 v4에서도 유지 가능하나, v4 기본은 `oklch`
- 기존 CSS 변수 체계가 잘 구축되어 있으므로 큰 변경 없이 마이그레이션 가능

#### 의존성

- 없음 (독립 작업)
- Phase 2 P2-5(디자인 시스템 적용)가 v4 기반 위에서 토큰 확장

#### 예상 복잡도: **Medium**

CSS 변수 기반 설정이 이미 잘 구축되어 있어 호환 모드로 빠르게 전환 가능. 그러나 전체 컴포넌트의 클래스명 호환성 검증이 필요하며, 플러그인 호환성 확인에 시간 소요.

#### 테스트 포인트

- [ ] `npm run build` 성공 (빌드 에러 없음)
- [ ] Light/Dark 테마 전환 정상 동작
- [ ] 모든 shadcn/ui 컴포넌트 렌더링 정상 (Button, Dialog, Sheet, Tabs 등)
- [ ] 커스텀 CSS 변수(node colors, elevation, surface) 정상 적용
- [ ] 애니메이션(`tailwindcss-animate`) 정상 동작
- [ ] 빌드 성능 개선 확인 (v3 대비 측정)

---

## Phase 1 — 핵심 기능

> 모든 기능이 독립적이므로 **7개 항목 전체 병렬 개발 가능**.
> Phase 0 완료 후 시작 (Tailwind v4 기반 필요).

---

### P1-1: 패널 리사이저 (`react-resizable-panels`)

**현재 상태**: `page.tsx`에서 ExplorerPanel / GraphCanvas / RightPanel이 flex 레이아웃으로 고정 너비 배치. ExplorerPanel은 260px 고정(`panelVariants`에 하드코딩), RightPanel은 320px 고정.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `react-resizable-panels` 의존성 추가 |
| `ontology/src/app/page.tsx` | 수정 | 3-panel flex 레이아웃 → `Group` / `Panel` / `Separator` 구조로 교체 |
| `ontology/src/features/ontology/components/ExplorerPanel.tsx` | 수정 | 고정 너비 스타일 제거. `panelVariants`의 `x: -260` 하드코딩 수정. 패널 내부 콘텐츠만 담당. |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 수정 | 고정 너비 스타일 제거. `panelVariants`의 `x: 320` 하드코딩 수정. 패널 내부 콘텐츠만 담당. |
| `ontology/src/app/globals.css` | 수정 | 리사이저 핸들 스타일 추가 (1px border, 4px hit area, hover/drag 상태) |

#### 변경 내용 요약 (코드 수준)

```tsx
// page.tsx — 변경 후
import { Group, Panel, Separator } from "react-resizable-panels";

<Group orientation="horizontal" style={{ height: '100vh' }}>
  <Panel
    defaultSize={20}
    minSize={15}
    maxSize={30}
    collapsible
    id="explorer"
  >
    <ExplorerPanel />
  </Panel>
  <Separator className="panel-resize-handle" />
  <Panel defaultSize={55} minSize={30} id="canvas">
    <div className="flex flex-col h-full">
      <Toolbar />
      <GraphCanvas />
      <CommitBar />
    </div>
  </Panel>
  <Separator className="panel-resize-handle" />
  <Panel
    defaultSize={25}
    minSize={15}
    maxSize={35}
    collapsible
    id="right-panel"
  >
    <RightPanel onDeleteRequest={requestDelete} />
  </Panel>
</Group>
```

- `react-resizable-panels`의 API: `Group` (컨테이너), `Panel` (패널), `Separator` (핸들)
- `collapsible` prop으로 더블클릭 접기/펼치기 지원
- `onLayout` 콜백으로 `localStorage` 영속화 가능
- ExplorerPanel/RightPanel의 `motion` 진입/퇴장 애니메이션은 collapse/expand 전환으로 대체

#### 의존성

- Phase 0 완료 (특히 P0-4 Tailwind v4, 스타일 기반)

#### 예상 복잡도: **Low**

`react-resizable-panels`은 drop-in 교체 가능. 기존 motion 애니메이션과의 통합만 주의.

#### 테스트 포인트

- [ ] 드래그로 패널 너비 조절 동작
- [ ] 더블클릭으로 패널 접기/펼치기
- [ ] 접힌 상태에서 다시 펼칠 때 이전 너비 복원
- [ ] 최소/최대 너비 제한 동작
- [ ] 레이아웃 `localStorage` 영속화 및 새로고침 후 복원
- [ ] 키보드(화살표 키)로 리사이즈 가능 (접근성)
- [ ] Canvas 영역 최소 400px 보장

---

### P1-2: 자동 저장 (30초 디바운스 자동 커밋)

**현재 상태**: `useApiSync`가 변경 즉시 Supabase에 동기화 (optimistic UI). 커밋은 수동(`CommitBar` "저장" 버튼). `commits` 테이블에 `is_auto_save` 컬럼 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `supabase/migrations/20260328000001_v4_auto_save_flag.sql` | 신규 | `commits` 테이블에 `is_auto_save boolean NOT NULL DEFAULT false` 컬럼 추가 |
| `ontology/src/lib/drizzle/schema.ts` | 수정 | `commits` 테이블에 `isAutoSave` 컬럼 추가 |
| `ontology/src/features/ontology/hooks/useAutoSave.ts` | 신규 | 자동 저장 훅. `es-toolkit`의 `debounce`(30초) 사용. `pendingChanges` 구독. `localStorage`로 auto/manual 설정 persist. |
| `ontology/src/features/ontology/components/CommitBar.tsx` | 수정 | 상태 머신 5종(idle/unsaved/saving/saved/error) 추가. `[Auto]` 토글 배지. Auto ON 시 "저장" 버튼 숨김 + 상태 텍스트 표시. |
| `ontology/src/features/ontology/api.ts` | 수정 | `commitsApi.create()`에 `isAutoSave` 파라미터 추가 |
| `ontology/src/app/api/commits/route.ts` | 수정 | POST body에 `isAutoSave` 필드 처리 |
| `ontology/src/app/page.tsx` | 수정 | `useAutoSave()` 훅 호출 추가 |

#### 변경 내용 요약 (코드 수준)

```typescript
// useAutoSave.ts (신규)
import { debounce } from 'es-toolkit';
import { useEffect } from 'react';
import { useOntologyStore } from './useOntologyStore';

export function useAutoSave() {
  const isAutoSave = useLocalStorage('ontology-auto-save', false);

  useEffect(() => {
    if (!isAutoSave) return;

    const autoCommit = debounce(() => {
      const { pendingChanges } = useOntologyStore.getState();
      if (pendingChanges.length > 0) {
        commitsApi.create({
          message: '자동 저장',
          isAutoSave: true,
          details: [...],
        });
      }
    }, 30_000);

    const unsub = useOntologyStore.subscribe(
      (s) => s.pendingChanges,
      (changes) => { if (changes.length > 0) autoCommit(); },
    );
    return () => { unsub(); autoCommit.cancel(); };
  }, [isAutoSave]);
}
```

- `beforeunload` 이벤트에서 미저장 변경 경고 추가
- CommitBar 상태 머신: `idle → unsaved → saving → saved → idle` (성공), `saving → error → paused` (실패)

#### 의존성

- Phase 0 완료
- DB 마이그레이션 (`is_auto_save` 컬럼)이 선행

#### 예상 복잡도: **Low**

기존 아키텍처가 이미 "변경 즉시 서버 동기화" 패턴. 자동 저장 = 자동 커밋 래퍼.

#### 테스트 포인트

- [ ] Auto 토글 ON → 변경 후 30초 경과 시 자동 커밋 생성 확인
- [ ] Auto 토글 OFF → 기존 수동 저장 방식 유지 확인
- [ ] CommitBar 상태 전환(idle → unsaved → saving → saved) 시각적 확인
- [ ] 자동 저장 실패 시 error 상태 표시 및 재시도
- [ ] `beforeunload` 미저장 경고 동작
- [ ] `commits` 테이블에 `is_auto_save = true` 기록 확인
- [ ] localStorage에 auto/manual 설정 persist 확인

---

### P1-3: 우클릭 컨텍스트 메뉴 (`@radix-ui/react-context-menu`)

**현재 상태**: 우클릭 미구현. React Flow의 `onNodeContextMenu`, `onPaneContextMenu` 이벤트 미사용.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `@radix-ui/react-context-menu` 의존성 추가 (또는 `npx shadcn@latest add context-menu`) |
| `ontology/src/components/ui/context-menu.tsx` | 신규 | shadcn/ui context-menu 래퍼 컴포넌트 |
| `ontology/src/features/ontology/components/GraphContextMenu.tsx` | 신규 | 캔버스/클래스/인스턴스/엣지 4종 컨텍스트 메뉴. React Flow 이벤트와 Radix ContextMenu 연결. |
| `ontology/src/features/ontology/components/ExplorerContextMenu.tsx` | 신규 | Explorer 트리 항목 우클릭 메뉴 |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | 수정 | `onNodeContextMenu`, `onPaneContextMenu`, `onEdgeContextMenu` 이벤트 핸들러 추가 |
| `ontology/src/features/ontology/components/ExplorerPanel.tsx` | 수정 | 트리 항목에 `ExplorerContextMenu` 래핑 |

#### 변경 내용 요약 (코드 수준)

```tsx
// GraphCanvas.tsx — 이벤트 핸들러 추가
<ReactFlow
  onNodeContextMenu={(event, node) => {
    event.preventDefault();
    setContextMenu({ type: node.type, nodeId: node.id, x: event.clientX, y: event.clientY });
  }}
  onPaneContextMenu={(event) => {
    event.preventDefault();
    setContextMenu({ type: 'canvas', x: event.clientX, y: event.clientY });
  }}
  onEdgeContextMenu={(event, edge) => {
    event.preventDefault();
    setContextMenu({ type: 'edge', edgeId: edge.id, x: event.clientX, y: event.clientY });
  }}
/>
```

**컨텍스트별 메뉴 항목**:

| 컨텍스트 | 항목 |
|---------|------|
| 캔버스 빈 공간 | 새 클래스 생성, 새 인스턴스 생성, 레이아웃 정리, 전체 보기, 붙여넣기 |
| 클래스 노드 | 이름 변경, 색상 변경 >, 관계 추가, 하위 클래스 추가, 인스턴스 추가, 포커스 모드, Explorer에서 보기, 삭제 |
| 인스턴스 노드 | 이름 변경, 관계 추가, 부모 클래스 이동 >, 포커스 모드, Explorer에서 보기, 삭제 |
| 엣지 | 관계 유형 변경, 방향 반전, 삭제 |
| Explorer 트리 | 이름 변경, 캔버스에서 찾기, 하위 항목 추가, 삭제 |

**주의**: 우클릭 시 먼저 `selectNode` 호출하여 선택 상태 동기화.

#### 의존성

- Phase 0 완료
- P1-4(포커스 모드)의 "포커스 모드" 메뉴 항목은 P1-4 완료 후 연결

#### 예상 복잡도: **Low**

Radix ContextMenu는 완성도 높은 API. React Flow 이벤트 연결만 구현하면 됨.

#### 테스트 포인트

- [ ] 캔버스 빈 공간 우클릭 → 메뉴 표시, "새 클래스 생성" 동작
- [ ] 클래스 노드 우클릭 → 메뉴 표시, 각 항목 동작
- [ ] 인스턴스 노드 우클릭 → 메뉴 표시
- [ ] 엣지 우클릭 → 메뉴 표시, "삭제" 동작
- [ ] Explorer 트리 항목 우클릭 → 메뉴 표시
- [ ] 우클릭 시 해당 노드 선택 상태 동기화
- [ ] 키보드(Shift+F10)로 컨텍스트 메뉴 열기 (접근성)
- [ ] 메뉴 바깥 클릭/Esc로 닫기

---

### P1-4: 고급 필터 + 포커스 모드

**현재 상태**: 기본 React Flow 기능만 사용. ExplorerPanel 이름 검색만 존재. 필터/포커스 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/hooks/useOntologyStore.ts` | 수정 | `FilterState` 인터페이스 추가 (showClasses, showInstances, colorFilter, focusNodeId, focusDepth). 필터 액션 추가 (setFilter, toggleColorFilter, setFocusMode, clearFocusMode). |
| `ontology/src/features/ontology/lib/graph-filter.ts` | 신규 | `getNeighborhood(nodeId, depth, nodes, edges)` BFS 함수. 필터 적용 유틸. |
| `ontology/src/features/ontology/components/FilterPanel.tsx` | 신규 | Toolbar 우측 Filter 아이콘 → 드롭다운. 노드 타입 체크박스, 10색 칩 토글, 관계 필터. |
| `ontology/src/features/ontology/components/FocusModeBar.tsx` | 신규 | 포커스 모드 진입 시 하단 오버레이. N-hop 슬라이더 (1~3), "해제" 버튼. |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | 수정 | `useMemo`로 필터 적용된 `filteredNodes`, `filteredEdges` 계산. 포커스 모드 시 노드 opacity 분기 (focus: 1.0, dim: 0.15). |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | Filter 아이콘 버튼 추가 |
| `ontology/src/features/ontology/components/ClassNode.tsx` | 수정 | 포커스 모드 시 opacity/scale 전환 스타일 추가 |
| `ontology/src/features/ontology/components/InstanceNode.tsx` | 수정 | 포커스 모드 시 opacity/scale 전환 스타일 추가 |
| `ontology/src/lib/motion-presets.ts` | 수정 | `focusTransition` 프리셋 추가 (250ms ease-in-out) |

#### 변경 내용 요약 (코드 수준)

```typescript
// graph-filter.ts — N-hop BFS
function getNeighborhood(
  nodeId: string,
  depth: number,
  allNodes: Node[],
  allEdges: Edge[],
): Set<string> {
  const visited = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let i = 0; i < depth; i++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of allEdges) {
        const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visited;
}
```

- 포커스 모드 진입: 노드 우클릭 > "포커스 모드" 또는 RightPanel 버튼
- 포커스 모드 해제: Esc 키 또는 FocusModeBar "해제" 버튼
- 비관련 노드: `opacity: 0.15`, 관련 노드: `opacity: 1.0` (CSS transition 250ms)

#### 의존성

- Phase 0 완료
- P1-3(우클릭 메뉴)의 "포커스 모드" 항목과 연결 (선택적, 각자 독립 개발 후 연결)

#### 예상 복잡도: **Medium**

BFS 알고리즘 자체는 단순하나, GraphCanvas의 노드 필터링 + opacity 전환 + 상태 관리가 복합적.

#### 테스트 포인트

- [ ] 타입 필터: "인스턴스 숨기기" 토글 → 인스턴스 노드 제거 확인
- [ ] 색상 필터: 특정 색상만 선택 → 해당 색상 노드만 표시
- [ ] 포커스 모드: 노드 선택 → 1-hop 이웃만 강조, 나머지 dim
- [ ] N-hop 슬라이더: 1→2→3 전환 시 표시 범위 확대 확인
- [ ] Esc 키로 포커스 모드 해제
- [ ] 필터 + 포커스 모드 동시 사용 시 교집합 적용
- [ ] 전환 애니메이션 250ms 확인

---

### P1-5: 프로퍼티 상속 시각화 (Copy-on-Write)

**현재 상태**: `properties` 테이블은 `classId` 직접 바인딩만 지원. 하위 클래스가 상위 클래스의 프로퍼티를 볼 수 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/lib/property-inheritance.ts` | 신규 | `getInheritedProperties(classId, allClasses, allProperties)` 함수. ancestor chain 탐색, 순환 참조 방지 (visited Set), `InheritedProperty` 타입 정의. |
| `ontology/src/features/ontology/lib/types.ts` | 수정 | `InheritedProperty` 인터페이스 추가 (`inheritedFrom`, `isOverridden`, `depth` 필드) |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 수정 | 클래스 선택 시 "상속된 프로퍼티" 섹션 추가. 읽기전용 표시 + "오버라이드" 버튼. |

#### 변경 내용 요약 (코드 수준)

```typescript
// property-inheritance.ts
interface InheritedProperty extends OntologyProperty {
  inheritedFrom: string | null;  // 원본 classId
  isOverridden: boolean;
  depth: number;                 // 0=자기것, 1=부모, 2=조부모
}

function getInheritedProperties(
  classId: string,
  allClasses: OntologyClass[],
  allProperties: OntologyProperty[],
): InheritedProperty[] {
  const ownProps = allProperties.filter(p => p.classId === classId);
  const inherited: InheritedProperty[] = [];
  const visited = new Set<string>([classId]);
  let current = allClasses.find(c => c.id === classId);
  let depth = 0;

  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    depth++;
    const parent = allClasses.find(c => c.id === current!.parentId);
    if (!parent) break;
    const parentProps = allProperties.filter(p => p.classId === parent.id);
    for (const p of parentProps) {
      inherited.push({
        ...p,
        inheritedFrom: parent.id,
        isOverridden: ownProps.some(op => op.name === p.name),
        depth,
      });
    }
    current = parent;
  }
  return inherited;
}
```

**RightPanel 시각화**:
```
PROPERTIES (3 + 2 inherited)
────────────────────────────
● serialNumber [string] *        ← 자기 것 (편집 가능)
● processTemp  [float]           ← 자기 것
── inherited from Equipment ────
↗ name         [string] *        ← 읽기전용
↗ manufacturer [string]  [오버라이드]  ← 클릭 시 Copy-on-Write
```

- "오버라이드" 클릭 → `addProperty(classId, { name, dataType, ... })` 호출로 자기 클래스에 복사
- DB 변경 없음 (런타임 계산)
- `useMemo`로 캐싱

#### 의존성

- Phase 0 완료

#### 예상 복잡도: **Low**

순수 프론트엔드 계산. DB 변경 없음.

#### 테스트 포인트

- [ ] 부모 클래스의 프로퍼티가 하위 클래스 RightPanel에 "상속" 표시
- [ ] 상속 프로퍼티가 읽기전용(편집 불가) 확인
- [ ] "오버라이드" 클릭 → 자기 클래스에 프로퍼티 복사 + 편집 가능
- [ ] 깊은 계층(3단계+)에서 정상 동작
- [ ] 순환 참조 발생 시 무한루프 방지 (visited Set)
- [ ] 인스턴스 값 입력: 상속 프로퍼티의 `propertyId`로 값 저장 가능

---

### P1-6: 도메인 템플릿 5종

**현재 상태**: `EmptyState`에서 `SAMPLE_ONTOLOGY`(반도체 FAB 1종)만 제공.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/constants/templates/semiconductor.json` | 신규 | 반도체 FAB 템플릿 (15 classes, 6 relations, 25 properties, 5 instances) |
| `ontology/src/features/ontology/constants/templates/it-infrastructure.json` | 신규 | IT 인프라/CMDB 템플릿 |
| `ontology/src/features/ontology/constants/templates/organization.json` | 신규 | 조직/인사 템플릿 |
| `ontology/src/features/ontology/constants/templates/healthcare.json` | 신규 | 의료 템플릿 |
| `ontology/src/features/ontology/constants/templates/supply-chain.json` | 신규 | 공급망 템플릿 |
| `ontology/src/features/ontology/constants/templates/index.ts` | 신규 | 템플릿 목록 export (이름, 설명, 아이콘, 규모 메타데이터) |
| `ontology/src/features/ontology/components/EmptyState.tsx` | 수정 | 기존 SAMPLE_ONTOLOGY 직접 로드 → 5종 템플릿 카드 UI. 각 카드에 아이콘+이름+설명+규모. 클릭 시 미리보기 팝오버 → "사용" 버튼 → Import API 호출. |
| `ontology/src/features/ontology/lib/schemas.ts` | 수정 (선택) | 템플릿 JSON 유효성 검증용 Zod 스키마 추가 |

#### 변경 내용 요약 (코드 수준)

```typescript
// templates/index.ts
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  stats: { classes: number; relations: number; properties: number; instances: number };
}

export const TEMPLATES: TemplateMetadata[] = [
  { id: 'semiconductor', name: '반도체 FAB', description: '웨이퍼 공정, 장비, 결함 관리', icon: Cpu, stats: { classes: 15, relations: 6, properties: 25, instances: 5 } },
  { id: 'it-infrastructure', name: 'IT 인프라', description: '서버, 네트워크, 소프트웨어 자산', icon: Server, stats: { ... } },
  // ...
];

export async function loadTemplate(id: string): Promise<OntologyExport> {
  const data = await import(`./${id}.json`);
  return TemplateSchema.parse(data);
}
```

- 기존 Import API (`/api/import`) 재사용. `replace` 전략으로 로드.
- EmptyState에서 카드 형태 렌더링 (반응형 그리드)

#### 의존성

- Phase 0 완료
- 기존 Import API 동작 전제

#### 예상 복잡도: **Low**

JSON 파일 작성 + EmptyState UI 변경. 기존 Import 인프라 재사용.

#### 테스트 포인트

- [ ] 5종 템플릿 카드 정상 렌더링
- [ ] 각 템플릿 "사용" → 온톨로지 로드 성공
- [ ] 로드 후 GraphCanvas에 노드/엣지 정상 표시
- [ ] 템플릿 JSON이 Zod 스키마 통과
- [ ] 기존 데이터가 있을 때 replace 전략 동작 확인 (경고 표시)

---

### P1-7: 브랜딩 (로고 + 시그니처 컬러)

**현재 상태**: ExplorerPanel 로고가 `Box` 아이콘 + `bg-primary`. Toolbar 타이틀이 일반 텍스트. Favicon이 Next.js 기본. 로딩 화면이 `Loader2` 스피너.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/components/OntologyLogo.tsx` | 신규 | SVG 3노드 삼각형 로고 컴포넌트. 3 사이즈(16/28/32px). Violet→Blue 그라데이션. |
| `ontology/src/features/ontology/components/ExplorerPanel.tsx` | 수정 | `Box` 아이콘 → `OntologyLogo` + `gradient-brand` 배경 |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | 타이틀 텍스트에 그라데이션 적용 (`text-transparent bg-clip-text gradient-brand`) |
| `ontology/src/app/page.tsx` | 수정 | 로딩 화면: `Loader2` → 로고 + 프로그레스 바 + 브랜드 텍스트 + spring 애니메이션 |
| `ontology/src/features/ontology/components/EmptyState.tsx` | 수정 | Sparkles 아이콘에 `gradient-brand` 적용 |
| `ontology/src/app/globals.css` | 수정 | `.gradient-brand`, `.gradient-brand-subtle` 유틸리티 클래스 추가 |
| `ontology/src/app/favicon.svg` (또는 `icon.svg`) | 신규 | SVG 3노드 마크 파비콘 |
| `ontology/src/app/layout.tsx` | 수정 | favicon 메타데이터 업데이트 |

#### 변경 내용 요약 (코드 수준)

```tsx
// OntologyLogo.tsx — SVG 3노드 삼각형
export function OntologyLogo({ size = 28 }: { size?: 16 | 28 | 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* 3 연결선 */}
      <line x1="16" y1="6" x2="6" y2="26" stroke="url(#brand-grad)" strokeWidth="2" />
      <line x1="16" y1="6" x2="26" y2="26" stroke="url(#brand-grad)" strokeWidth="2" />
      <line x1="6" y1="26" x2="26" y2="26" stroke="url(#brand-grad)" strokeWidth="2" />
      {/* 3 노드 */}
      <circle cx="16" cy="6" r="4" fill="url(#brand-grad)" />
      <circle cx="6" cy="26" r="4.5" fill="url(#brand-grad)" />
      <circle cx="26" cy="26" r="4" fill="url(#brand-grad)" />
    </svg>
  );
}
```

#### 의존성

- Phase 0 완료 (P0-4 Tailwind v4 기반의 CSS 유틸리티)

#### 예상 복잡도: **Low**

순수 UI 작업. 로직 변경 없음.

#### 테스트 포인트

- [ ] 로고가 ExplorerPanel, Toolbar, 스플래시에 정상 렌더링
- [ ] Light/Dark 모드에서 그라데이션 적절히 표시
- [ ] Favicon이 브라우저 탭에 정상 표시
- [ ] 스플래시 화면: 로고 + 프로그레스 바 + spring 애니메이션 동작
- [ ] 그라데이션 텍스트가 다양한 배경에서 가독성 확인

---

## Phase 2 — 고급 기능

> Phase 1 완료 후 시작. 일부 항목 간 의존관계 존재.

---

### P2-1: 온톨로지 자동 완성 (LLM 기반 추천)

**현재 상태**: AI 보조가 채팅 형태로만 존재. 구조화된 추천 액션 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/lib/schema-context-builder.ts` | 신규 | `buildSchemaContext(store)` 함수. 클래스 계층 트리, 프로퍼티 맵, 관계 타입, 제약 조건, 통계를 LLM 컨텍스트 문자열로 빌드. |
| `ontology/src/app/api/llm/suggest/route.ts` | 신규 | POST API. 3가지 시나리오(클래스/프로퍼티/관계 추천). AI SDK `generateObject` + Zod 스키마로 구조화된 추천 반환. 분당 3회 rate limit. |
| `ontology/src/features/ontology/hooks/useAutoComplete.ts` | 신규 | 자동완성 훅. 로컬 fuzzy match(비용 없음) + Ctrl+Space LLM 호출(debounce 500ms). |
| `ontology/src/features/ontology/components/SuggestionDropdown.tsx` | 신규 | 추천 항목 드롭다운 UI. 클래스/프로퍼티/관계별 아이콘 + 이름 + 설명. 클릭/Enter로 적용. |
| `ontology/src/features/ontology/components/NewNodePopover.tsx` | 수정 | Quick 탭에서 이름 입력 시 `SuggestionDropdown` 표시 |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 수정 | 프로퍼티 추가("+") 시 `SuggestionDropdown` 표시 |
| `ontology/src/features/ontology/components/RelationPopover.tsx` | 수정 | 관계명 입력 시 `SuggestionDropdown` 표시 |

#### 변경 내용 요약 (코드 수준)

```typescript
// schema-context-builder.ts
interface SchemaContext {
  classHierarchy: string;   // 들여쓰기 트리 형태
  propertyMap: string;      // 클래스별 프로퍼티 목록
  relationTypes: string;    // 관계 + domain/range
  constraints: string;      // 제약 조건 요약
  statistics: string;       // 클래스당 인스턴스 수
}

// suggest/route.ts — 3가지 시나리오
type SuggestRequest =
  | { scenario: 'class'; parentClassName?: string; siblingNames: string[] }
  | { scenario: 'property'; className: string; existingProps: string[] }
  | { scenario: 'relation'; sourceClass: string; targetClass: string };
```

**트리거 전략**:
- 자동: 입력 시 로컬 fuzzy match (기존 클래스명/프로퍼티명 데이터 기반)
- 수동: Ctrl+Space → LLM 호출 (debounce 500ms, 분당 최대 3회)

#### 의존성

- **P0-2** (AIAssistantTab → useChat 전환) — AI SDK 6.x 패턴 공유
- Phase 1 완료

#### 예상 복잡도: **Medium**

SchemaContext 빌더 + LLM API + 프론트엔드 드롭다운 UI + rate limiting.

#### 테스트 포인트

- [ ] 클래스 생성 시 이름 입력 → fuzzy match 추천 표시
- [ ] Ctrl+Space → LLM 기반 추천 표시 (3개 항목)
- [ ] 프로퍼티 추가 시 추천 드롭다운 표시
- [ ] 관계 생성 시 추천 드롭다운 표시
- [ ] 추천 클릭 → 해당 값 자동 입력
- [ ] 분당 3회 rate limit 초과 시 로컬 fuzzy match만 동작
- [ ] SchemaContext에 전체 온톨로지 컨텍스트 포함 확인

---

### P2-2: JSON-LD Export/Import

**현재 상태**: JSON 형식만 지원 (`/api/export`, `/api/import`).

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `jsonld` 의존성 추가 |
| `ontology/src/lib/rdf/jsonld-mapper.ts` | 신규 | 내부 모델 → JSON-LD 변환 (`toJsonLd`) + JSON-LD → 내부 모델 파싱 (`fromJsonLd`). `@context` 정의 (rdfs, owl, xsd, os namespace). 매핑 규칙: class→`owl:Class`, parentId→`rdfs:subClassOf`, property→`owl:DatatypeProperty`, relation→`owl:ObjectProperty`, instance→`rdf:type`. |
| `ontology/src/lib/rdf/context.ts` | 신규 | JSON-LD `@context` 상수 정의 |
| `ontology/src/app/api/export/route.ts` | 수정 | `?format=jsonld` 쿼리 파라미터 분기 추가. `jsonld.compact()` 사용. |
| `ontology/src/app/api/import/route.ts` | 수정 | Content-Type 또는 파일 확장자로 JSON-LD 감지. `jsonld.expand()` → 내부 모델 파싱. |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | 내보내기 드롭다운에 "JSON-LD" 옵션 추가 |

#### 변경 내용 요약 (코드 수준)

```typescript
// jsonld-mapper.ts
import jsonld from 'jsonld';

const CONTEXT = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  os: 'https://ontology.studio/ns/',
};

export async function toJsonLd(ontology: OntologyExport): Promise<object> {
  const doc = {
    '@context': CONTEXT,
    '@graph': [
      ...ontology.classes.map(c => ({
        '@id': `os:class/${c.id}`,
        '@type': 'owl:Class',
        'rdfs:label': c.name,
        'rdfs:comment': c.description,
        ...(c.parentId ? { 'rdfs:subClassOf': { '@id': `os:class/${c.parentId}` } } : {}),
      })),
      // ... properties, instances, relations 매핑
    ],
  };
  return jsonld.compact(doc, CONTEXT);
}
```

#### 의존성

- Phase 1 완료

#### 예상 복잡도: **Medium**

`@context` 설계 + 매핑 규칙 구현 + 라운드트립 검증이 핵심 복잡도.

#### 테스트 포인트

- [ ] Export → JSON-LD 파일 생성, 유효한 `@context` 포함
- [ ] 클래스, 프로퍼티, 인스턴스, 관계가 올바른 OWL 타입으로 매핑
- [ ] Import → JSON-LD 파일 파싱 → 내부 모델 복원
- [ ] 라운드트립: Export → Import → 동일한 온톨로지 확인
- [ ] 지원 범위 밖 요소 Import 시 경고 메시지 표시
- [ ] `jsonld.compact()` / `jsonld.expand()` 호출 정상 동작

---

### P2-3: Turtle Export/Import

**현재 상태**: JSON 형식만 지원.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `n3` 의존성 추가 |
| `ontology/src/lib/rdf/turtle-mapper.ts` | 신규 | 내부 모델 → Turtle 직렬화 (`toTurtle`, N3.Writer) + Turtle → 내부 모델 파싱 (`fromTurtle`, N3.Parser). P2-2의 `@context`와 동일 매핑 규칙 재사용. |
| `ontology/src/app/api/export/route.ts` | 수정 | `?format=turtle` 분기 추가. Content-Type: `text/turtle` |
| `ontology/src/app/api/import/route.ts` | 수정 | `.ttl` 파일 또는 Content-Type `text/turtle` 감지 → N3.Parser로 파싱 |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | 내보내기 드롭다운에 "Turtle" 옵션 추가 |

#### 변경 내용 요약 (코드 수준)

```typescript
// turtle-mapper.ts
import { Writer, Parser, DataFactory } from 'n3';
const { namedNode, literal, quad } = DataFactory;

export function toTurtle(ontology: OntologyExport): string {
  const writer = new Writer({
    prefixes: {
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      owl: 'http://www.w3.org/2002/07/owl#',
      os: 'https://ontology.studio/ns/',
    },
  });
  // 클래스 → owl:Class triples
  for (const c of ontology.classes) {
    writer.addQuad(namedNode(`os:class/${c.id}`), namedNode('rdf:type'), namedNode('owl:Class'));
    writer.addQuad(namedNode(`os:class/${c.id}`), namedNode('rdfs:label'), literal(c.name));
    // ...
  }
  return writer.end();
}
```

#### 의존성

- **P2-2** (JSON-LD) — 동일한 `@context`/매핑 규칙 재사용, `rdf/context.ts` 공유

#### 예상 복잡도: **Medium**

P2-2와 구조 동일. N3.js API만 다름.

#### 테스트 포인트

- [ ] Export → `.ttl` 파일 생성, 유효한 Turtle 문법
- [ ] 프리픽스 선언 정상 포함
- [ ] Import → Turtle 파싱 → 내부 모델 복원
- [ ] 라운드트립: Export → Import → 동일 온톨로지
- [ ] 외부 도구(Protege 등)에서 생성된 Turtle 파일 Import 가능

---

### P2-4: Text2Cypher UI 패널

**현재 상태**: `/api/llm/text2cypher` API 완성 (gpt-4o + tool calling). 프론트엔드 UI 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/package.json` | 수정 | `@uiwjs/react-codemirror`, `@neo4j-cypher/codemirror` 의존성 추가 |
| `ontology/src/features/ontology/components/Text2CypherTab.tsx` | 신규 | RightPanel 3번째 탭. 자연어 입력 → LLM 변환 → Cypher 미리보기 (CodeMirror 읽기전용/편집 토글) → 실행 → 결과 표시. 듀얼 모드(자연어/직접입력). 쿼리 히스토리(최근 20개). |
| `ontology/src/features/ontology/components/CypherEditor.tsx` | 신규 | CodeMirror 6 래퍼. `dynamic(() => import(...), { ssr: false })`. Cypher syntax highlighting. 읽기전용/편집 모드 전환. 다크모드 테마. |
| `ontology/src/features/ontology/components/QueryResultView.tsx` | 신규 | 결과 뷰 3종 탭: 테이블 / 그래프 / JSON |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 수정 | 탭 3개로 확장: 속성 / AI / Cypher |
| `ontology/src/features/ontology/api.ts` | 수정 | `text2cypherApi` 함수 추가 (프론트엔드 → `/api/llm/text2cypher` 호출) |

#### 변경 내용 요약 (코드 수준)

```tsx
// Text2CypherTab.tsx — UI 3단 구조
<div className="flex flex-col h-full">
  {/* 자연어 입력 */}
  <div className="p-3 border-b">
    <Input placeholder="자연어로 질문하세요..." onSubmit={handleNaturalLanguage} />
  </div>
  {/* Cypher 에디터 (CodeMirror) */}
  <div className="flex-1 min-h-[120px]">
    <CypherEditor value={cypher} readOnly={!editMode} onChange={setCypher} />
    <div className="flex gap-1 p-1">
      <Button size="sm" onClick={handleCopy}>복사</Button>
      <Button size="sm" onClick={toggleEdit}>{editMode ? '잠금' : '편집'}</Button>
      <Button size="sm" onClick={handleExecute}>실행</Button>
    </div>
  </div>
  {/* 결과 */}
  <QueryResultView result={result} />
</div>

// CypherEditor.tsx — SSR 회피
const CypherEditorInner = dynamic(
  () => import('./CypherEditorInner'),
  { ssr: false },
);
```

#### 의존성

- **P0-2** (AI SDK 패턴 공유)
- Phase 1 완료

#### 예상 복잡도: **Medium**

CodeMirror 통합 + SSR 회피 + 듀얼 모드 + 결과 뷰 3종이 복합적.

#### 테스트 포인트

- [ ] 자연어 입력 → Cypher 생성 및 CodeMirror에 표시
- [ ] 직접 입력 모드: CodeMirror에서 Cypher 직접 작성
- [ ] Cypher 실행 → 결과 테이블/JSON 표시
- [ ] Cypher syntax highlighting 정상 동작
- [ ] 읽기전용 ↔ 편집 모드 전환
- [ ] 쿼리 히스토리 저장 및 복원 (최근 20개)
- [ ] 다크모드에서 CodeMirror 테마 정상 적용
- [ ] SSR 빌드 에러 없음

---

### P2-5: 디자인 시스템 적용

**현재 상태**: v3 디자인 토큰이 상당히 성숙. `globals.css`에 컬러/타이포/스페이싱/엘리베이션/노드 컬러 토큰 정의. `tailwind.config.ts`에 커스텀 테마 확장.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/app/globals.css` | 수정 | 새 토큰 추가: `--gradient-brand-from/to`, `--surface-raised`, `--text-display/display-lg`, `--node-selected-glow-*`, `--focus-dim-opacity`, `--space-3xl/4xl` |
| `ontology/src/lib/motion-presets.ts` | 수정 | 새 프리셋 4종 추가: `edgeDraw` (300ms), `focusTransition` (250ms), `savePulse` (400ms), `aiGlow` (1.5s infinite) |
| `ontology/tailwind.config.ts` (또는 CSS @theme) | 수정 | 새 토큰 Tailwind 매핑: `surface-raised`, `display` 폰트 사이즈, `space-3xl/4xl` |
| `ontology/src/features/ontology/components/ClassNode.tsx` | 수정 | 호버 scale 1.05→1.03, shadow 리파인, 선택 glow ring, 연관 노드 하이라이트 |
| `ontology/src/features/ontology/components/InstanceNode.tsx` | 수정 | 동일한 호버/선택 리파인 |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | 수정 | 엣지 유형 분화: is-a(solid+삼각형), has-a(dashed+다이아몬드), relation(solid+화살표), instance-of(dotted+열린 삼각형) |

#### 변경 내용 요약 (코드 수준)

```css
/* globals.css 추가 토큰 */
:root {
  --gradient-brand-from: 263 70% 50.4%;
  --gradient-brand-to: 217 91% 60%;
  --surface-raised: 0 0% 100%;
  --text-display: 1.5rem;
  --text-display-lg: 2rem;
  --node-selected-glow-spread: 3px;
  --node-selected-glow-blur: 12px;
  --node-related-opacity: 0.85;
  --node-unrelated-opacity: 0.35;
  --focus-dim-opacity: 0.15;
  --space-3xl: 48px;
  --space-4xl: 64px;
}
```

**엣지 유형 분화**:
| 유형 | 스타일 | 마커 |
|------|--------|------|
| is-a (상속) | solid 2px | 채워진 삼각형 |
| has-a (속성) | dashed 1.5px | 다이아몬드 |
| relation | solid 1.5px | 화살표 |
| instance-of | dotted 1px | 열린 삼각형 |

#### 의존성

- **P0-4** (Tailwind v4 기반)
- **P1-4** (포커스 모드 dim/highlight 토큰 사용)
- **P1-7** (브랜딩 gradient 토큰 사용)

#### 예상 복잡도: **Medium**

토큰 정의는 단순하나, 노드 호버/선택 리파인 + 엣지 유형 분화 + 모션 프리셋이 시각적 검증 필요.

#### 테스트 포인트

- [ ] 새 디자인 토큰이 Light/Dark 모드에서 정상 적용
- [ ] 노드 호버 시 scale 1.03 + elevation-2 전환
- [ ] 노드 선택 시 glow ring + 연관 노드 하이라이트
- [ ] 엣지 4종 유형별 스타일 시각적 구분
- [ ] 모션 프리셋 4종 정상 동작 (edgeDraw, focusTransition, savePulse, aiGlow)
- [ ] 기존 컴포넌트의 디자인 회귀 없음

---

## Phase 3 — 안정화 & 확장

> Phase 2 완료 후 시작. 4개 항목은 독립적이므로 병렬 개발 가능.

---

### P3-1: OWL/XML 기본 Export

**현재 상태**: 표준 포맷 Export 미지원.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/lib/rdf/owl-xml-mapper.ts` | 신규 | 내부 모델 → OWL/XML 문자열 생성. 직접 구현 (라이브러리 없이 XML 템플릿). 지원: `owl:Class`, `rdfs:subClassOf`, `owl:DatatypeProperty`, `owl:ObjectProperty`, `rdf:type`, `owl:Restriction` (카디널리티, 부분). |
| `ontology/src/app/api/export/route.ts` | 수정 | `?format=owl` 분기 추가. Content-Type: `application/rdf+xml` |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | 내보내기 드롭다운에 "OWL/XML" 옵션 추가 |

#### 변경 내용 요약 (코드 수준)

```typescript
// owl-xml-mapper.ts — XML 문자열 직접 생성
export function toOwlXml(ontology: OntologyExport): string {
  const lines: string[] = [
    '<?xml version="1.0"?>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"',
    '         xmlns:owl="http://www.w3.org/2002/07/owl#"',
    '         xmlns:os="https://ontology.studio/ns/">',
    '  <owl:Ontology rdf:about="https://ontology.studio/ns/"/>',
  ];
  // ... classes, properties, instances, relations 직렬화
  lines.push('</rdf:RDF>');
  return lines.join('\n');
}
```

**비지원 요소**: Axiom(프로젝트 고유 로직), 복잡한 OWL DL 표현.

#### 의존성

- **P2-2/P2-3** (RDF 매핑 규칙, `rdf/context.ts` 공유)

#### 예상 복잡도: **High**

OWL/XML 스펙 매핑이 복잡. 부분 지원 범위 명확화 필요.

#### 테스트 포인트

- [ ] Export → 유효한 XML 문서 생성
- [ ] `owl:Class`, `rdfs:subClassOf`, `owl:DatatypeProperty` 포함
- [ ] 외부 OWL 도구(Protege)에서 로드 가능
- [ ] 비지원 요소에 대한 경고 메시지 명시

---

### P3-2: 검증 결과 UI

**현재 상태**: 검증 5개 규칙 구현됨. 결과가 `validation_results` 테이블에 저장됨. toast만 표시.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/components/ValidationPanel.tsx` | 신규 | 검증 결과 상세 패널. 규칙별 그룹핑 (cyclic_isa, required_properties, cardinality, orphan_nodes, similar_names). severity별 색상 (info/warning/error). 각 위반 항목에서 해당 노드로 직접 이동(focusNode). |
| `ontology/src/features/ontology/components/Toolbar.tsx` | 수정 | "검증" 버튼 클릭 시 ValidationPanel 토글 |
| `ontology/src/features/ontology/api.ts` | 수정 | `validationApi.getResults()` 함수 추가 (결과 조회) |

#### 의존성

- Phase 2 완료

#### 예상 복잡도: **Medium**

#### 테스트 포인트

- [ ] 검증 실행 → 결과 패널에 규칙별 그룹 표시
- [ ] severity별 색상 표시 (info=blue, warning=amber, error=red)
- [ ] 위반 항목 클릭 → 해당 노드 포커스 + 선택
- [ ] 위반 0건 시 "검증 통과" 메시지

---

### P3-3: 커밋 히스토리 UI

**현재 상태**: `commitsApi.list()` 존재하나 UI 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/components/CommitHistoryPanel.tsx` | 신규 | 시간순 커밋 목록 (메시지, 변경 건수, 자동/수동 구분, pushed 여부). 각 커밋의 변경 상세 (before/after diff). |
| `ontology/src/features/ontology/components/CommitBar.tsx` | 수정 | "변경 내역" 시트에서 CommitHistoryPanel 통합 또는 별도 접근 경로 추가 |
| `ontology/src/features/ontology/api.ts` | 수정 | `commitsApi.getDetails(commitId)` 함수 추가 |

#### 의존성

- **P1-2** (자동 저장 — `is_auto_save` 컬럼 존재 전제)

#### 예상 복잡도: **Medium**

#### 테스트 포인트

- [ ] 커밋 목록 시간순 정렬 표시
- [ ] 자동/수동 커밋 구분 뱃지 표시
- [ ] 각 커밋 클릭 → 변경 상세 (before/after diff) 표시
- [ ] Neo4j 푸시 여부 표시

---

### P3-4: 제약 조건 관리 UI

**현재 상태**: `constraints` 테이블 + API (CRUD) 완성. 프론트엔드 관리 UI 없음.

#### 변경 파일 목록

| 파일 | 구분 | 변경 내용 |
|------|------|----------|
| `ontology/src/features/ontology/components/ConstraintPanel.tsx` | 신규 | 4종 제약 (cardinality, disjoint, domain_range, property_value) CRUD UI. 폼 기반 생성/수정. 제약 목록 + 활성/비활성 토글. |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 수정 | 클래스 선택 시 제약 조건 섹션에서 `ConstraintPanel` 연결 |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | 수정 | 제약 조건이 있는 노드/엣지에 시각적 표시 (뱃지 또는 아이콘) |
| `ontology/src/features/ontology/api.ts` | 수정 | `constraintsApi` 프론트엔드 함수 연결 (이미 존재하나 미사용) |

#### 의존성

- Phase 2 완료
- **P3-2** (검증과 제약 연동)

#### 예상 복잡도: **Medium**

#### 테스트 포인트

- [ ] 4종 제약 CRUD (생성/조회/수정/삭제) 동작
- [ ] 활성/비활성 토글 동작
- [ ] 그래프에서 제약 시각적 표시
- [ ] 검증 실행 시 제약 조건 반영

---

## 전체 의존관계 그래프

```
Phase 0 (모두 병렬)
├── P0-1: openai 제거 ─────────────────────────────────────┐
├── P0-2: AIAssistantTab useChat ──────────────────────────┤
├── P0-3: ELK Web Worker ─────────────────────────────────┤
└── P0-4: Tailwind v4 ────────────────────────────────────┤
                                                           │
Phase 1 (모두 병렬, Phase 0 완료 후)                         │
├── P1-1: 패널 리사이저 ◄──────────────────────────────────┘
├── P1-2: 자동 저장 ◄─────── DB 마이그레이션 필요
├── P1-3: 우클릭 메뉴 ◄────── P1-4와 "포커스 모드" 항목 연결
├── P1-4: 필터 + 포커스 ◄──── P1-3과 연동 (선택적)
├── P1-5: 프로퍼티 상속
├── P1-6: 도메인 템플릿
└── P1-7: 브랜딩
     │
Phase 2 (Phase 1 완료 후)
├── P2-1: 자동 완성 ◄──────── P0-2 (AI SDK 패턴 공유)
├── P2-2: JSON-LD ◄────────── 독립
├── P2-3: Turtle ◄────────── P2-2 (매핑 규칙 공유)
├── P2-4: Text2Cypher UI ◄── P0-2 (AI SDK 패턴 공유)
└── P2-5: 디자인 시스템 ◄──── P0-4, P1-4, P1-7 (토큰 기반)
     │
Phase 3 (Phase 2 완료 후, 모두 병렬)
├── P3-1: OWL/XML ◄────────── P2-2, P2-3 (RDF 매핑 공유)
├── P3-2: 검증 결과 UI
├── P3-3: 커밋 히스토리 ◄──── P1-2 (is_auto_save 컬럼)
└── P3-4: 제약 조건 UI ◄──── P3-2 (검증 연동)
```

---

## Phase별 병렬성 요약

| Phase | 총 항목 | 병렬 가능 | 순차 필요 | 비고 |
|-------|---------|----------|----------|------|
| **Phase 0** | 4 | 4 | 0 | 모두 독립. 동시 진행 가능. |
| **Phase 1** | 7 | 7 | 0 | 모두 독립. 동시 진행 가능. P1-3/P1-4 연동은 개발 후 통합. |
| **Phase 2** | 5 | 3 (P2-1, P2-2, P2-4) | 2 (P2-3→P2-2, P2-5→P0-4+P1-4) | P2-3은 P2-2 매핑 규칙 공유. P2-5는 토큰 기반 의존. |
| **Phase 3** | 4 | 3 (P3-1, P3-2, P3-3) | 1 (P3-4→P3-2) | P3-4는 검증 연동이 필요하므로 P3-2 후. |

---

## DB 마이그레이션 요약

| Phase | 마이그레이션 | 테이블 | 변경 |
|-------|------------|--------|------|
| P1-2 | `v4_auto_save_flag` | `commits` | `is_auto_save boolean NOT NULL DEFAULT false` 추가 |
| P2-2 (선택) | `v4_namespace_support` | `classes` | `namespace text` 추가 (JSON-LD Export IRI 생성용) |

---

## 신규 파일 요약 (전체)

| Phase | 신규 파일 수 | 주요 파일 |
|-------|------------|----------|
| P0 | 1 | `public/elk-worker.min.js` |
| P1 | ~14 | `useAutoSave.ts`, `GraphContextMenu.tsx`, `ExplorerContextMenu.tsx`, `FilterPanel.tsx`, `FocusModeBar.tsx`, `graph-filter.ts`, `property-inheritance.ts`, `OntologyLogo.tsx`, 5종 JSON 템플릿, `templates/index.ts` |
| P2 | ~10 | `schema-context-builder.ts`, `suggest/route.ts`, `useAutoComplete.ts`, `SuggestionDropdown.tsx`, `jsonld-mapper.ts`, `turtle-mapper.ts`, `rdf/context.ts`, `Text2CypherTab.tsx`, `CypherEditor.tsx`, `QueryResultView.tsx` |
| P3 | ~4 | `owl-xml-mapper.ts`, `ValidationPanel.tsx`, `CommitHistoryPanel.tsx`, `ConstraintPanel.tsx` |

---

## 접근성 체크포인트 (전체 Phase 공통)

PRD-v4.md의 UX 요구사항 + web-design-guidelines 기준:

| 항목 | 체크포인트 | 해당 Phase |
|------|-----------|-----------|
| 키보드 네비게이션 | 모든 인터랙티브 요소에 Tab 포커스 + Enter/Space 활성화 | 전체 |
| 컨텍스트 메뉴 | Shift+F10으로 열기, 화살표 키 탐색, Esc 닫기 | P1-3 |
| 패널 리사이저 | 화살표 키로 리사이즈, Home/End로 최소/최대 | P1-1 |
| 포커스 모드 | Esc로 해제, 상태 변경 시 `aria-live` 안내 | P1-4 |
| 코드 에디터 | `aria-label` 지정, 스크린 리더 호환 | P2-4 |
| 자동 저장 | 상태 변경 시 `aria-live="polite"` 안내 (저장 중/저장됨/실패) | P1-2 |
| 색상 대비 | WCAG AA 최소 4.5:1 대비율 (모든 텍스트/배경 조합) | P2-5 |
| 필터 칩 | 토글 상태 `aria-pressed`, 그룹 `role="group"` | P1-4 |
| 템플릿 카드 | `role="listbox"`, 각 카드 `role="option"`, 키보드 선택 | P1-6 |
