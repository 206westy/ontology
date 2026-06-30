# Ontology Studio v2 — Vision Proposals

> **Author**: Vision Agent
> **Date**: 2026-03-22
> **Status**: 리뷰 대기
> **Base**: PRD-v2.md + 현재 코드베이스 분석 + context7 최신 문서 리서치

---

## 1. 기술스택 제안

### 1.1 Zustand 슬라이스 패턴 리팩터링 + immer 미들웨어 도입

**현황**: `useOntologyStore.ts`가 단일 파일 517줄, 모든 상태와 액션이 하나의 `create()` 호출에 밀집. PRD-v2에서 슬라이스 분리를 명시하고 있으나 아직 적용 전.

**제안**:
```
hooks/store/
  ├── createGraphSlice.ts       // classes, instances, properties, edges, axioms, instanceValues
  ├── createSelectionSlice.ts   // selectedNodeId, selectedNodeType, focusNodeId
  ├── createChangeSlice.ts      // pendingChanges, addChange, clearChanges
  ├── createPopoverSlice.ts     // popoverState, openPopover, closePopover
  ├── createToolbarSlice.ts     // toolMode, zoomAction, expandedNodes
  └── index.ts                  // create(devtools(temporal(immer((...a) => ({...slices})))))
```

- **immer 미들웨어 추가**: 현재 spread 기반 불변 업데이트가 `deleteSelectedNode` 같은 cascade 로직에서 6중 spread로 복잡. immer를 감싸면 `state.classes = state.classes.filter(...)` 식으로 직관적.
- **Zustand v4 유지**: v5 마이그레이션은 zundo 호환성 리스크가 있어 현 시점에서는 v4 슬라이스 패턴 정착이 우선.

**채택 시 예상 효과**:
- 파일당 100줄 이하로 관리 가능, 신규 기능(Neo4j push state 등) 추가 시 슬라이스만 추가
- immer로 cascade 삭제/bulk update 로직 가독성 50%+ 개선
- 셀렉터 세분화로 불필요한 리렌더 감소

**리스크**:
- immer + temporal(zundo) + devtools 미들웨어 체이닝 순서 주의 필요 (`devtools(temporal(immer(...)))`)
- 마이그레이션 중 기존 테스트 13개 업데이트 필요

---

### 1.2 sonner 토스트 교체 (PRD F2-8 확인)

**현황**: `@radix-ui/react-toast` + 자체 `use-toast.ts` (reducer 패턴, 80줄+). TOAST_LIMIT=1, 관리가 번거로움.

**제안**: `sonner`로 전면 교체.

**sonner의 핵심 장점** (context7 문서 확인):
- **선언적 API**: `toast('커밋 완료')`, `toast.error('실패')`, `toast.promise(fn, {...})`
- **Promise 토스트**: Neo4j 푸시에 이상적 — loading/success/error 상태 자동 전환
- **Action 버튼**: Undo 같은 인라인 액션을 `toast('삭제됨', { action: { label: '되돌리기', onClick } })` 형태로 깔끔하게 처리
- **shadcn/ui 공식 지원**: `npx shadcn@latest add sonner`로 테마 통합 즉시 가능

**교체 범위**:
1. `@radix-ui/react-toast` 의존성 제거
2. `src/hooks/use-toast.ts` + `src/components/ui/toast.tsx` + `src/components/ui/toaster.tsx` 삭제
3. `providers.tsx`에 `<Toaster />` (sonner) 추가
4. 기존 `toast({title, description})` 호출부를 `toast.success()` / `toast.error()` 등으로 일괄 변환

**채택 시 예상 효과**:
- 토스트 관련 보일러플레이트 80줄 삭제
- Neo4j 푸시 UX 개선: `toast.promise(pushToNeo4j(), { loading: '푸시 중...', success: '반영 완료', error: '실패' })`
- 스택형 토스트로 다중 알림 지원

**리스크**:
- 기존 toast 호출부 8~10곳 수정 필요 (기계적 변환, 난이도 낮음)
- 커스텀 스타일링 필요 시 sonner의 `className`/`style` prop 사용

---

### 1.3 Neo4j Driver 아키텍처

**현황**: Neo4j 연결이 아직 미구현 (Phase 2 긴급). PRD에서 Server-side only, Route Handler 기반을 명시.

**제안**: `neo4j-driver` 공식 JS 드라이버 사용, 아래 패턴 적용.

**아키텍처**:
```
lib/neo4j/
  ├── driver.ts          // 싱글턴 드라이버 인스턴스 (서버 전용, server-only 가드)
  ├── cypher-builder.ts  // Change[] → Cypher 쿼리 변환 순수 함수
  └── push-service.ts    // 트랜잭션 실행 + 단계별 진행률 콜백
```

**핵심 패턴** (context7 공식 문서 기반):
1. **드라이버 싱글턴**: `driver.ts`에서 `neo4j.driver()` 한 번만 생성, 커넥션 풀 자동 관리
2. **Managed Transaction 사용**: `session.executeWrite(async tx => {...})` — 자동 재시도, 자동 커밋/롤백
3. **세션 수명**: 요청당 생성/닫기 (`session.close()` 필수)
4. **Explicit Transaction은 롤백 전용**: `before_snapshot` 기반 상태 복원 시에만 `beginTransaction()` + 수동 `commit()`/`rollback()` 사용

**Cypher 생성 전략**:
```typescript
// Change 배열을 7단계로 분류하여 순서대로 실행
const PUSH_STEPS = [
  'classes',      // CREATE (:Class {...})
  'properties',   // SET property nodes
  'relationTypes',// CREATE (:RelationType {...})
  'instances',    // CREATE (:Instance {...})
  'edges',        // MATCH + CREATE relationships
  'axioms',       // CREATE (:Axiom {...})
  'indexes',      // CREATE INDEX IF NOT EXISTS
] as const;
```

**채택 시 예상 효과**:
- 공식 드라이버의 자동 재시도로 transient error 복원력 확보
- 단계별 실행으로 PRD의 진행률 UI(`3/7 쿼리 실행 중`)와 자연스럽게 매핑
- before_snapshot을 Supabase에 저장하여 롤백 시 역 Cypher 생성 가능

**리스크**:
- `neo4j-driver`가 서버 전용이므로 클라이언트 번들에 포함되지 않도록 `server-only` 가드 필수
- Neo4j integer(Int64) 처리 주의: `neo4j.int()` 래핑 필요
- 네트워크 에러 시 부분 성공 상태 관리 복잡 (PRD의 "실패 건만 재시도" 요구)

---

### 1.4 React Flow 12 성능 최적화

**현황**: `GraphCanvas.tsx`에 기본적인 구조는 갖추고 있으나, 최적화가 부족한 부분이 있음.

**개선 포인트** (context7 공식 문서 + React Flow 12 best practices):

| 항목 | 현재 | 제안 | 영향 |
|------|------|------|------|
| nodeTypes 정의 위치 | 컴포넌트 외부 (O) | 유지 — 이미 올바르게 구현됨 | - |
| ClassNode/InstanceNode memo | 미적용 | `React.memo()` 래핑 | 노드 수 증가 시 리렌더 감소 |
| defaultEdgeOptions | 인라인 객체 | `useMemo`로 래핑 | 매 렌더 새 객체 생성 방지 |
| fitViewOptions | 인라인 `{ padding: 0.3 }` | 상수로 추출 | 미세 최적화 |
| onConnect/onDoubleClick | `useCallback` (O) | 유지 | - |
| Level of Detail | 미구현 | `useStore(s => s.transform[2])` 기반 3단계 렌더링 | 100+ 노드에서 체감 성능 향상 |

**ClassNode memo 적용 예시**:
```tsx
const ClassNode = memo(({ data }: NodeProps) => {
  const zoom = useStore((s) => s.transform[2]);
  const detail = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';
  // ... LOD 분기 렌더링
});
```

**채택 시 예상 효과**:
- 50+ 노드에서 드래그/줌 시 프레임 드롭 방지
- LOD(Level of Detail)로 100+ 노드에서도 부드러운 줌 경험

**리스크**:
- memo 적용 시 data 객체의 참조 안정성 확인 필요 (buildFlowNodes에서 매번 새 객체 생성 중 — 이 부분도 최적화 대상)

---

### 1.5 Playwright E2E 테스트 전략

**현황**: `@playwright/test` v1.58.2가 devDependencies에 있으나 테스트 파일 없음. Vitest 단위 테스트 13개 존재.

**제안**: 핵심 사용자 여정(Journey) 기반 E2E 테스트 작성.

**테스트 구조**:
```
e2e/
  ├── fixtures/
  │   └── sample-ontology.json   // 예시 온톨로지 데이터
  ├── canvas.spec.ts             // Journey 1: 더블클릭 → 입력 → 프리뷰 → 확정
  ├── relation.spec.ts           // Journey 3: 노드간 드래그 → 관계 연결
  ├── hierarchy.spec.ts          // Journey 4: 계층 이동
  ├── commit-push.spec.ts        // Journey 5: 커밋 → Neo4j 푸시 (mock)
  └── explorer-search.spec.ts   // Journey 2: 검색 → 포커스
```

**핵심 패턴**:
- **Page Object Model 대신 Fixture 패턴**: Playwright의 `test.extend`로 `ontologyPage` fixture 정의 — 반복되는 셋업(로그인, 빈 캔버스 접근)을 한 곳에서 관리
- **React Flow 전용 셀렉터**: `.react-flow__node`, `.react-flow__edge` 클래스 기반 + `data-testid` 추가
- **Visual regression**: `toHaveScreenshot()` — 노드 렌더링, 다크모드 전환 확인
- **API mocking**: `page.route()` 으로 Supabase/LLM API 인터셉트 — 외부 의존성 제거

**채택 시 예상 효과**:
- Phase 2 기능 추가 시 기존 Journey 회귀 방지
- CI/CD에서 크로스 브라우저(Chromium, Firefox, WebKit) 검증
- 시각적 회귀 테스트로 디자인 변경 안전망

**리스크**:
- React Flow의 canvas(SVG/HTML 혼합) 특성상 좌표 기반 인터랙션 테스트가 다소 brittle
- E2E 테스트 실행 시간 — parallel 실행 + 필요 시 `--shard` 사용

---

## 2. 설계 방향 제안

### 2.1 에러 처리 통합 레이어 (F2-9 고도화)

**현황**: 각 API 호출에서 개별 try/catch + `toast()`. 일관성 없음.

**제안**: `features/ontology/lib/error-handler.ts` 에러 분류 + 자동 복구 레이어.

```typescript
type ErrorCategory = 'network' | 'supabase' | 'neo4j' | 'llm' | 'validation';

interface AppError {
  category: ErrorCategory;
  code: string;
  userMessage: string;      // 한국어, PRD 7.6 톤 준수
  actionLabel?: string;     // "다시 시도" | "직접 입력"
  onAction?: () => void;    // 액션 버튼 클릭 핸들러
  retryable: boolean;
}

function handleError(error: unknown): AppError {
  // Supabase 에러 → "연결이 불안정합니다..."
  // Neo4j 에러 → "프로덕션 반영에 실패했습니다..."
  // LLM 에러 → "AI 구조화에 실패했습니다. 직접 입력하시겠습니까?"
  // 기타 → "알 수 없는 오류가 발생했습니다. 다시 시도해주세요."
}
```

sonner와 연동:
```typescript
function showError(appError: AppError) {
  toast.error(appError.userMessage, {
    action: appError.actionLabel
      ? { label: appError.actionLabel, onClick: () => appError.onAction?.() }
      : undefined,
    duration: appError.retryable ? 8000 : 5000,
  });
}
```

**채택 시 예상 효과**:
- PRD 7.6 메시지 톤 일괄 적용 보장
- 에러 핸들링 코드 중복 제거 (현재 8+ 곳에서 개별 처리)
- 향후 에러 로깅/모니터링 연동점 확보

**리스크**: 없음 (점진적 적용 가능)

---

### 2.2 Supabase 커밋 스키마 확장 — before_snapshot 필드

**현황**: commits API가 `message` + `details` 만 저장. 롤백에 필요한 이전 상태 없음.

**제안**: `commits` 테이블에 `before_snapshot` (JSONB), `cypher_queries` (TEXT[]), `neo4j_push_status` 필드 추가.

```sql
ALTER TABLE commits ADD COLUMN before_snapshot JSONB;
ALTER TABLE commits ADD COLUMN cypher_queries TEXT[];
ALTER TABLE commits ADD COLUMN neo4j_push_status TEXT DEFAULT 'pending';
-- 'pending' | 'pushing' | 'success' | 'partial_failure' | 'failed'
ALTER TABLE commits ADD COLUMN neo4j_pushed_at TIMESTAMPTZ;
ALTER TABLE commits ADD COLUMN neo4j_error_details JSONB;
```

**이유**: "온톨로지의 Git" 모델에서 커밋 = 스냅샷 포인트. before_snapshot이 없으면 롤백이 불가능.

**채택 시 예상 효과**:
- Neo4j 롤백(F2-3)의 기반 데이터 확보
- 커밋 히스토리에서 diff 비교 가능
- 푸시 실패 시 재시도에 필요한 Cypher 보존

**리스크**:
- JSONB 크기 — 온톨로지가 매우 클 경우 스냅샷 크기 주의. 필요 시 delta 저장으로 전환

---

### 2.3 Neo4j 푸시/롤백 상태 머신

**현황**: CommitBar에서 커밋+푸시가 한 버튼 (`Neo4j 푸시`)에 합쳐져 있음. PRD-v2에서는 `[커밋]`과 `[Neo4j 푸시]`를 분리 요구.

**제안**: XState-like 상태 머신 (Zustand 슬라이스로 구현).

```
idle → confirming → pushing → success/partial_failure/failed
                               ↳ retrying (실패건만)
```

```typescript
// createNeo4jPushSlice.ts
interface Neo4jPushSlice {
  pushPhase: 'idle' | 'confirming' | 'pushing' | 'success' | 'partial_failure' | 'failed';
  pushProgress: { current: number; total: number; currentStep: string };
  pushErrors: Array<{ step: string; error: string }>;
  cypherPreview: string[];

  startPush: (commitId: string) => void;
  confirmPush: () => Promise<void>;
  cancelPush: () => void;
  retryFailed: () => Promise<void>;
  resetPush: () => void;
}
```

**채택 시 예상 효과**:
- NeoConfirmSheet의 4단계 UI (확인 → 진행 → 성공/실패)와 1:1 매핑
- 상태 전이가 명확하여 불가능한 상태 조합 방지
- 부분 실패 시 "실패 건만 재시도" 플로우 구현 용이

**리스크**: 없음 (Zustand 슬라이스로 충분, XState 추가 불필요)

---

## 3. 기획 방향 제안

### 3.1 커밋/푸시 분리 플로우 명확화

**현황**: CommitBar의 `Neo4j 푸시` 버튼이 실제로는 Supabase 커밋만 수행. 라벨과 동작 불일치.

**제안**: PRD-v2 6.5의 4버튼 체계를 정확히 구현.

```
[되돌리기] [변경 내역] [커밋] [Neo4j 푸시]
                        ↑          ↑
                  Supabase 저장   NeoConfirmSheet 열기
```

- `[커밋]`: pendingChanges → Supabase commits 테이블 저장 + before_snapshot 보존 + clearChanges
- `[Neo4j 푸시]`: 가장 최근 미푸시 커밋을 기반으로 NeoConfirmSheet 열기
- 커밋 없이 푸시 불가 → 버튼 disabled + 툴팁 "먼저 변경사항을 커밋해주세요"
- 미커밋 변경이 있으면서 푸시 시도 시 → "커밋되지 않은 변경사항이 있습니다" 경고

**채택 시 예상 효과**:
- "온톨로지의 Git" 메타포 완성: 편집 → 커밋(staging) → 푸시(production)
- 사용자가 실수로 미완성 변경을 프로덕션에 반영하는 것 방지

**리스크**: 2단계 과정이 비개발자에게 복잡할 수 있음. 온보딩 시 Git 비유 설명 필요.

---

### 3.2 Empty State 개선 — 샘플 온톨로지 즉시 체험

**현황**: Empty State에 입력 예시 텍스트 카드는 있으나, "예시 온톨로지 불러오기" 기능은 미구현.

**제안**: PRD 6.8의 `TemplatePopover`를 단순화하여 MVP 범위로.

- Phase 2에서는 **반도체 장비 도메인 1종만** 하드코딩 (JSON 상수)
- 클릭 시 `loadOntology()` → 노드 등장 애니메이션 (framer-motion `element` 토큰)
- 템플릿 데이터: 클래스 6개 + 인스턴스 12개 + 관계 8개 (PRD 명시)
- "추후" 표시된 도메인들은 Phase 3에서 서버 기반으로 확장

**채택 시 예상 효과**:
- 신규 사용자의 첫 인상 대폭 개선 — 빈 캔버스 대신 실제 그래프를 즉시 체험
- "더블클릭" 안내만으로는 행동 유도가 약함 → 원클릭 체험이 전환율 향상

**리스크**: 하드코딩된 샘플이 도메인(반도체)에 편향. 범용적인 예시가 더 적합할 수 있으나, 현 타겟 페르소나(반도체 공정 엔지니어)에게는 오히려 공감대 형성.

---

### 3.3 대량 임포트 시 AbortController 기반 취소 (F2-11)

**현황**: NewNodePopover에서 LLM parse 요청 후 취소 불가.

**제안**: `AbortController`를 LLM parse API 호출에 연결.

```typescript
const controller = new AbortController();
const response = await fetch('/api/llm/parse', {
  method: 'POST',
  body: JSON.stringify({ text, existingClasses }),
  signal: controller.signal,
});
// [취소] 버튼 → controller.abort()
```

**채택 시 예상 효과**: 사용자가 잘못된 입력으로 LLM 요청을 보냈을 때 즉시 취소 가능. UX 안전성 향상.

**리스크**: 서버 측에서 이미 LLM API 호출이 시작된 경우 비용은 발생. 클라이언트 취소는 응답 수신만 중단.

---

## 4. 디자인 방향 제안

### 4.1 포커스 링 애니메이션 표준화

**현황**: PRD 6.14에서 `@keyframes focus-ring`을 정의했으나, 노드 호버/선택 시각 피드백이 CSS 인라인으로 분산.

**제안**: CSS 변수 기반 포커스 링을 `globals.css`에 정의하고 ClassNode/InstanceNode에 일관 적용.

```css
@keyframes focus-ring-pulse {
  0% { box-shadow: 0 0 0 0 hsl(var(--focus-ring-color)) }
  70% { box-shadow: 0 0 0 8px transparent }
  100% { box-shadow: 0 0 0 8px transparent }
}

.node-focus-ring {
  animation: focus-ring-pulse 1.5s ease-out;
}
```

- Explorer 검색 결과 클릭 → 해당 노드에 `node-focus-ring` 클래스 1.5초 부여
- 선택 상태와 포커스 상태를 시각적으로 구분 (선택 = 상시 accent ring, 포커스 = 일시 pulse)

**채택 시 예상 효과**: 검색 → 포커스 시 사용자가 어떤 노드가 대상인지 직관적으로 인지. 현재 `fitView` 줌만으로는 50+ 노드에서 대상 식별 어려움.

**리스크**: 없음

---

### 4.2 다크모드 노드 색상 — CSS 변수 전환

**현황**: `NODE_COLORS` 상수가 하드코딩된 hex 값. 다크모드 대응 없음.

**제안**: CSS 변수 기반으로 전환하여 테마 자동 대응.

```css
:root {
  --node-root: 263 70% 58%;          /* #7c3aed */
  --node-root-bg: 263 70% 58% / 0.12;
  --node-mid: 221 83% 53%;           /* #2563eb */
  --node-mid-bg: 221 83% 53% / 0.12;
  /* ... */
}
.dark {
  --node-root: 263 70% 64%;          /* #8b5cf6 — 약간 밝게 */
  --node-root-bg: 263 70% 58% / 0.20;
  --node-mid: 217 91% 60%;           /* #3b82f6 */
  --node-mid-bg: 221 83% 53% / 0.20;
  /* ... */
}
```

ClassNode에서:
```tsx
// 하드코딩 hex 대신
style={{ borderColor: `hsl(var(--node-${colorKey}))`, background: `hsl(var(--node-${colorKey}-bg))` }}
```

**채택 시 예상 효과**:
- 다크모드 전환 시 노드 색상 자동 대응 (현재는 라이트 색상이 다크에서도 그대로 사용)
- PRD 7.2의 노드 색상 체계(Light/Dark 별도 정의)를 코드 레벨에서 일관 적용
- 향후 커스텀 테마 확장 용이

**리스크**: MiniMap의 `nodeColor` 콜백에서 CSS 변수를 직접 읽을 수 없음 → computed style 또는 JS 상수 병행 필요

---

### 4.3 노드 삭제 모션 추가

**현황**: 노드 삭제 시 즉시 사라짐. PRD 7.5 모션 매핑에서 "노드 삭제: micro + scale(1→0.8), fade"로 Phase 2 명시.

**제안**: framer-motion `AnimatePresence` + `exit` prop 활용.

```tsx
<AnimatePresence>
  {visible && (
    <motion.div
      initial={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* node content */}
    </motion.div>
  )}
</AnimatePresence>
```

단, React Flow 노드 내부에서 AnimatePresence를 사용하려면 노드 제거를 지연시키는 래퍼가 필요.

**채택 시 예상 효과**: 삭제 시 시각적 피드백으로 "무엇이 사라졌는지" 인지. Undo 가능성 암시.

**리스크**: React Flow의 노드 수명 관리와 framer-motion exit animation 타이밍 충돌 가능. 구현 복잡도 중간.

---

### 4.4 접근성 개선 권장사항

**현황**: 접근성 관련 구현이 없음. 키보드 네비게이션이 Ctrl+Z/Y, Delete, Esc 에 한정.

**Phase 2에서 최소한 적용 권장**:
1. **ARIA 라벨**: Explorer 트리에 `role="tree"`, `role="treeitem"`, `aria-expanded` 적용
2. **포커스 관리**: 팝오버 열릴 때 첫 인풋으로 자동 포커스 (일부 이미 적용)
3. **색상 대비**: 빈 클래스 opacity 0.35가 WCAG AA 기준(4.5:1) 미달할 수 있음 → 0.5로 상향 검토
4. **스크린 리더**: 노드 선택 시 `aria-live="polite"` 영역에 "Equipment 클래스 선택됨" 알림

**채택 시 예상 효과**: 스크린 리더 사용자 기본 지원 + 키보드 전용 사용자 경험 개선

**리스크**: 접근성 완전 지원은 범위가 넓어 Phase 2에서는 최소한만 적용하고, Phase 3에서 확대

---

## 5. 우선순위 요약

| 순위 | 제안 | 난이도 | 영향도 | Phase 2 필수 |
|------|------|--------|--------|-------------|
| 1 | Neo4j Driver 아키텍처 (1.3) | 높음 | 높음 | O (F2-1) |
| 2 | 커밋/푸시 분리 + 상태 머신 (2.3, 3.1) | 중간 | 높음 | O (F2-2) |
| 3 | Supabase 스키마 확장 (2.2) | 낮음 | 높음 | O (F2-3 전제) |
| 4 | sonner 토스트 교체 (1.2) | 낮음 | 중간 | O (F2-8) |
| 5 | 에러 처리 통합 (2.1) | 낮음 | 중간 | O (F2-9) |
| 6 | Zustand 슬라이스 리팩터링 (1.1) | 중간 | 중간 | 권장 |
| 7 | React Flow 최적화 (1.4) | 낮음 | 중간 | 권장 |
| 8 | 다크모드 노드 CSS 변수 (4.2) | 낮음 | 중간 | O (F2-10) |
| 9 | E2E 테스트 (1.5) | 중간 | 중간 | 권장 |
| 10 | 포커스 링 표준화 (4.1) | 낮음 | 낮음 | 권장 |
| 11 | 노드 삭제 모션 (4.3) | 중간 | 낮음 | Phase 2 |
| 12 | 접근성 (4.4) | 중간 | 중간 | 최소만 |

---

## 6. PRD-v2와의 정합성 확인

모든 제안이 PRD-v2의 기존 방향과 **정합**합니다. PRD를 벗어나는 기술 교체는 없으며, PRD에서 명시한 기술(sonner, immer, 슬라이스 패턴, neo4j-driver)을 구체적인 구현 패턴으로 제안한 것입니다.

PRD-v2에서 **미언급이지만 추가로 제안하는 항목**:
- 에러 처리 통합 레이어 (2.1) — PRD F2-9의 구체적 설계 방향
- 접근성 (4.4) — 기본적인 a11y 지원
- E2E 테스트 Fixture 패턴 (1.5) — Playwright 활용 구체안

이상의 제안은 기획자(planner)의 구현 계획 수립 시 참고 자료로 활용됩니다.
