# PRDv4 QA 개선 계획서

> 작성일: 2026-03-28
> 기반: qa-test-report.md 분석 결과
> 관점: 비판적 옹호자 — 사용자 영향 중심, 구현 비용 대비 효과 평가

## 현황 요약

| 지표 | 값 |
|------|-----|
| 전체 테스트 | 69개 |
| 통과 | 41개 (59%) |
| 실패 | 28개 |
| PRD 기능 일치도 | 91% (18.85/20) |
| 실제 제품 결함 | **2건** (미구현 1 + 버그 1) |
| 테스트 코드 결함 | **26건** (92.8%) |

핵심 판단: **제품 품질은 91%로 양호하나, 테스트 인프라가 제품 상태를 정확히 반영하지 못하고 있다.** 실패 28건 중 26건이 테스트 코드 자체의 문제이므로, 테스트 인프라 수정이 최우선이다.

---

## 1. 즉시 수정 필요 (P0) — 테스트 인프라

> 이 항목들은 제품 코드 변경 없이 테스트 코드만 수정하면 해결된다.
> 예상 효과: 26건 실패 → 0건 (테스트 통과율 59% → 96%+)

### 1.1 E2E Fixture 핵심 수정: 캔버스 노드 렌더링 대기 (15건 해결)

**문제**: `createClassViaApi()` → `goto()` 후 `.react-flow__node`가 렌더링되기 전에 `selectNodeOnCanvas()`를 호출하여 타임아웃 발생. 전체 실패의 53%를 차지하는 최대 단일 원인.

**근본 원인 분석**:
- `useLoadOntology` 훅은 6개 React Query(`classes`, `instances`, `properties`, `edges`, `relationTypes`, `axioms`)가 모두 성공해야 `loadOntology()`를 호출한다 (`useLoadOntology.ts:30-36`).
- `loadOntology()` 이후 GraphCanvas의 `buildFlowNodes()` → ELK 레이아웃 계산 → React Flow 렌더링까지 추가 시간이 필요하다.
- `page.waitForLoadState('networkidle')`은 HTTP 요청 완료만 보장하며, React 렌더링 파이프라인 완료를 보장하지 않는다.

**수정 방향**: `ontology/e2e/fixtures/ontology-app.ts`

```typescript
// 1) goto() 메서드에 React Flow 렌더링 대기 추가
async goto() {
  await this.page.goto('/');
  await this.page.waitForLoadState('networkidle');
}

// 2) API 생성 후 캔버스 동기화를 보장하는 새 헬퍼
async gotoAndWaitForNodes(expectedCount = 1) {
  await this.page.goto('/');
  await this.page.waitForLoadState('networkidle');
  await this.page.waitForSelector('.react-flow__node', { timeout: 15000 });
  // ELK 레이아웃 계산 완료 대기 — 노드가 position(0,0)에서 벗어날 때까지
  await this.page.waitForFunction(
    (count) => document.querySelectorAll('.react-flow__node').length >= count,
    expectedCount,
    { timeout: 15000 }
  );
}

// 3) selectNodeOnCanvas에 자체 대기 로직 추가
async selectNodeOnCanvas(index = 0) {
  const node = this.getCanvasNodes().nth(index);
  await node.waitFor({ state: 'visible', timeout: 15000 });
  await node.click();
  await this.page.waitForTimeout(500);
}
```

**사용자 영향도**: N/A (테스트 전용)
**구현 난이도**: S (1시간 이내)
**해결 건수**: 15건 (테스트 #1,2,4,5,13,14,15,16,17,18,19,20,21,22,26)

### 1.2 셀렉터 불일치 수정 (5건 해결)

각 항목별 현재 셀렉터와 올바른 셀렉터:

| # | 테스트 | 현재 셀렉터 | 올바른 셀렉터 | 근거 |
|---|--------|------------|-------------|------|
| 7,8 | 리사이저 핸들 | `[role="separator"]` | `[data-separator]` | `page.tsx:24-29` — `react-resizable-panels`의 `Separator` 컴포넌트는 `data-separator='hover'\|'active'` 속성 사용 |
| 9 | 패널 그룹 방향 | `[data-panel-group-direction="horizontal"]` | `Group` 컴포넌트의 실제 DOM 속성 확인 필요 — `orientation="horizontal"` prop이 어떤 data attr로 매핑되는지 DevTools에서 확인 | `page.tsx:112-116` |
| 10 | Auto 토글 | `text=Auto` | `role=button >> text=Auto` 또는 `Badge` 내부 텍스트 | `AutoSaveIndicator.tsx:72-83` — `<Badge>Auto</Badge>`가 `<button>` 내부에 있으므로, 단순 `text=Auto`가 여러 요소에 매칭될 수 있음 |
| 6 | Tailwind 클래스 | `.react-flow` (canvas locator) | `[data-testid]` 추가 또는 `.react-flow__renderer` 사용 | headless 브라우저에서 React Flow 마운트 지연 시 `.react-flow` 클래스가 아직 적용되지 않을 수 있음 |

**수정 파일**: `ontology/e2e/v4-phase0.spec.ts`, `ontology/e2e/v4-phase1.spec.ts`
**구현 난이도**: S (1시간 이내)
**해결 건수**: 5건 (#6,7,8,9,10)

### 1.3 API 스키마 필드명 수정 (2건 해결)

**문제**: 커밋 API 테스트가 `{action, tableName, recordId}` 필드를 전달하나, 실제 Zod 스키마(`schemas.ts:175-183`)는 `{operation, targetTable, targetId}`를 요구.

```typescript
// 현재 테스트 코드 (잘못됨)
details: [{ action: 'ADD', tableName: 'classes', recordId: '...' }]

// 올바른 코드
details: [{ operation: 'ADD', targetTable: 'classes', targetId: '...' }]
```

추가로 `operation` enum 값도 확인 필요: 스키마는 `z.enum(['ADD', 'MOD', 'DEL'])`을 기대 (`schemas.ts:170`). 테스트의 `action: 'INSERT'`/`'UPDATE'`/`'DELETE'` 등이 있다면 함께 수정.

**수정 파일**: `ontology/e2e/v4-phase3.spec.ts`
**구현 난이도**: S (30분 이내)
**해결 건수**: 2건 (#27,28)

### 1.4 캔버스 더블클릭 셀렉터 수정 (2건 해결)

**문제**: `doubleClickCanvas()` 메서드가 `.bg-background, .react-flow` 셀렉터를 사용하나, 빈 상태(EmptyState 렌더링)에서는 React Flow가 마운트되지 않아 매칭 실패.

**수정 방향**: `ontology/e2e/fixtures/ontology-app.ts:127`

```typescript
// 현재
async doubleClickCanvas(x = 400, y = 300) {
  await this.page.locator('.bg-background, .react-flow').first().dblclick({...});
}

// 수정 — EmptyState에서는 캔버스가 없으므로, EmptyState 자체를 타겟으로 분기
async doubleClickCanvas(x = 400, y = 300) {
  const canvas = this.page.locator('.react-flow__pane, [data-testid="empty-state"]').first();
  await canvas.waitFor({ state: 'visible', timeout: 10000 });
  await canvas.dblclick({ position: { x, y }, force: true });
}
```

**구현 난이도**: S (30분 이내)
**해결 건수**: 2건 (#11,12) + 간접적으로 #24 해결 가능

### 1.5 EmptyState / Toolbar 셀렉터 수정 (2건 해결)

**문제**:
- #23: `EmptyState`에서 `[data-testid="empty-state"] >> button.first()` 클릭 후 "불러오기" AlertDialog가 나타나지 않음 — EmptyState의 버튼 구조와 테스트 기대가 불일치
- #24: `text=Ontology Studio`를 찾으나 Toolbar에는 `PSK PEE Ontology`만 있음 (`Toolbar.tsx:84`)

**수정 방향**:
- #23: EmptyState는 AlertDialog 기반 확인 대화를 사용 (`EmptyState.tsx:25-30` — `AlertDialog` import 확인됨). 테스트가 올바른 버튼을 클릭하는지 확인 필요 — 템플릿 카드의 "사용하기" 버튼 → AlertDialog의 "불러오기" 버튼 순서
- #24: `cleanupAll()` 후 빈 상태에서는 Toolbar 대신 EmptyState가 렌더링됨. 테스트를 클래스가 있는 상태에서 실행하도록 수정하거나, EmptyState에서의 브랜드 텍스트를 검증하도록 변경

**구현 난이도**: S (1시간 이내)
**해결 건수**: 2건 (#23,24)

### 1.6 dev 서버 안정성 (6건)

**문제**: 이전 테스트의 긴 실행(특히 AI API 호출)으로 dev 서버가 ECONNREFUSED 상태로 전환.

**수정 방향**:
1. `playwright.config.ts`에 `webServer.reuseExistingServer: true` + 테스트 전 서버 헬스체크 추가
2. AI API 호출이 포함된 테스트에 적절한 timeout 설정 (`test.slow()`)
3. 테스트 간 `page.waitForLoadState('load')` 대신 서버 응답 확인 retry 로직

**비판적 평가**: 이 6건은 재실행 시 자연 해소될 가능성이 높다. CSS 변수(`--surface-raised`, `--focus-dim-opacity`, `--node-selected-glow-*`)는 `globals.css:147-165`에 정상 정의되어 있음이 확인됨. 그러나 CI 환경에서 재현될 수 있으므로 인프라 개선은 필요.

**구현 난이도**: M (반나절) — config 수정 + retry 로직
**해결 건수**: 6건 (재실행 시 해소 예상이나 근본 수정 권장)

---

## 2. 버그 수정 (P1) — 제품 코드 수정

### 2.1 SplashScreen 연결 (미구현 1건)

**현황 확인**:
- `SplashScreen.tsx` 컴포넌트는 완전히 구현되어 있다 — AnimatePresence 기반 fade-out, 프로그레스 바, 브랜드 로고/텍스트 포함 (`SplashScreen.tsx:1-125`)
- `page.tsx`에서 import도 사용도 없다 — 연결만 하면 즉시 동작

**수정 방향**: `ontology/src/app/page.tsx`

```typescript
import SplashScreen from '@/features/ontology/components/SplashScreen';

export default function Home() {
  const { isLoading, isError } = useLoadOntology();
  const [splashDone, setSplashDone] = useState(false);

  // SplashScreen은 isLoading과 독립적으로 최소 1.8초 표시
  // isLoading이 먼저 끝나면 splash 완료 대기, splash가 먼저 끝나면 로딩 대기
  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  if (isLoading) {
    return (/* 기존 로딩 UI */);
  }
  // ...
}
```

**비판적 평가**:
- SplashScreen의 `minDisplayMs`가 1800ms로 설정되어 있다. 사용자 관점에서 1.8초는 적절한가? 빠른 네트워크에서는 불필요한 지연처럼 느껴질 수 있다. 그러나 ELK 레이아웃 계산 시간(대규모 온톨로지에서 1-3초)을 고려하면 사용자에게 "로딩 중"이라는 피드백을 주는 것이 나은 경험이다.
- 단, `isLoading`이 false이고 splash도 끝났는데 ELK 레이아웃이 아직 진행 중인 경우가 있을 수 있다. 이 경우 빈 캔버스가 잠깐 보일 수 있음 — splash의 `onComplete` 시점을 `isLoading` 완료와 동기화하는 것이 더 안전하다.

**사용자 영향도**: Medium — 첫 인상에 영향
**구현 난이도**: S (30분 이내)
**PRD 일치도 변화**: P1-7 브랜딩 80% → 100% (전체: 91% → 92%)

### 2.2 chat API UIMessage 형식 (버그 1건)

**현황 확인**:
- `route.ts:44`에서 `convertToModelMessages(messages)`를 호출한다
- AI SDK 6.x의 `UIMessage` 타입은 `id`, `role`, `content`, `parts` 등을 필수로 요구한다
- 클라이언트(`AIAssistantTab.tsx`)에서 `useChat` 훅을 사용하면 자동으로 UIMessage 형식이 전달되므로 실제 프론트엔드 사용 시에는 문제없다
- 문제는 E2E 테스트에서 단순 `{role, content}` 형식을 보낼 때 발생

**비판적 판단**: 이것은 버그인가, 테스트 오류인가?

API가 UIMessage 형식만 받도록 설계되었다면 이는 **의도된 동작**이다. `useChat` 훅이 자동으로 올바른 형식을 생성하므로 프론트엔드에서는 문제 없다. 그러나 API의 robustness 관점에서:

1. **방안 A (테스트 수정)**: 테스트에서 UIMessage 형식을 정확히 전달
   ```typescript
   messages: [{
     id: 'test-1',
     role: 'user',
     content: 'test message',
     parts: [{ type: 'text', text: 'test message' }],
   }]
   ```
2. **방안 B (API 방어 코드 추가)**: route.ts에서 단순 형식을 UIMessage로 변환하는 fallback 추가
   ```typescript
   const normalized = messages.map((m: any) => ({
     id: m.id ?? crypto.randomUUID(),
     role: m.role,
     content: m.content ?? '',
     parts: m.parts ?? [{ type: 'text', text: m.content ?? '' }],
     ...m,
   }));
   const modelMessages = await convertToModelMessages(normalized);
   ```

**권장**: 방안 A + B 병행. 테스트를 정확히 수정하되, API도 방어적으로 만든다. 외부에서 이 API를 호출할 가능성(예: 향후 모바일 클라이언트, 서드파티 연동)을 고려하면 방어 코드가 합리적이다.

**사용자 영향도**: Low — 프론트엔드 useChat 경유 시 문제 없음
**구현 난이도**: S (1시간 이내)
**PRD 일치도 변화**: P0-2 90% → 100% (전체: 91% → 91.5%)

---

## 3. 신규 개선 제안 (P2) — 테스트에서 발견된 개선 기회

### 3.1 `useLoadOntology`의 "초기 로드 전용" 제약 해소

**발견된 문제**: `useLoadOntology.ts:60` — `initialLoadDone.current` 플래그로 인해, API로 데이터를 추가한 후 `goto()`로 페이지를 재방문해도 Zustand 스토어가 갱신되지 않을 수 있다. 이는 테스트뿐 아니라 **사용자가 브라우저 탭을 새로고침할 때에도 영향**을 미칠 수 있다.

```typescript
// 현재: 초기 로드 1회만 실행
if (initialLoadDone.current) return;
```

**사용자가 겪을 문제**: 다른 탭/브라우저에서 Supabase 데이터를 변경한 후 이 탭을 새로고침하면 변경사항이 반영되지 않는다. React Query가 refetch하더라도 `initialLoadDone` 플래그가 Zustand 업데이트를 차단한다.

**수정 방향**: `initialLoadDone` 대신, React Query의 `dataUpdatedAt` 타임스탬프 비교로 "실제로 새 데이터인지" 판별하는 방식으로 전환. 또는 `window.addEventListener('focus', ...)` 시 `initialLoadDone`을 리셋.

**사용자 영향도**: High — 다중 탭/새로고침 시 데이터 불일치
**구현 난이도**: M (반나절)
**기존 컴포넌트 재활용**: `useLoadOntology.ts`만 수정, 추가 컴포넌트 불필요

### 3.2 E2E 테스트에서의 "UI를 통한 노드 생성" 헬퍼 강화

**발견된 문제**: 현재 테스트 전략이 "API로 데이터 시드 → 페이지 이동 → UI 검증"인데, 이 접근은 React Flow의 비동기 렌더링과 근본적으로 충돌한다.

**"없으면 사용자가 겪을 문제"는 아니지만**: 테스트 인프라의 구조적 취약점이다. `createClassViaPopover()` 메서드(`fixtures:138-146`)가 이미 존재하므로, API 시드 대신 UI를 통한 생성을 기본 전략으로 채택하면 더 안정적이다.

**비판적 평가**: UI를 통한 생성은 LLM API 호출을 수반하므로 테스트가 느려지고 비결정적이 된다. API 시드 + 적절한 대기 로직(P0 1.1)이 더 실용적. 이 항목은 P0 1.1로 충분히 해결되므로 별도 작업 불필요.

**결론**: P0 1.1의 fixture 대기 로직 개선으로 충분. 별도 작업 불요.

### 3.3 GraphCanvas에 `data-testid` 속성 추가

**발견된 문제**: 여러 테스트가 `.react-flow`, `.bg-background` 같은 구현 의존적 CSS 클래스를 셀렉터로 사용한다. 이는 Tailwind 클래스명 변경이나 React Flow 버전 업그레이드 시 대량 실패를 유발한다.

**사용자가 겪을 문제**: 직접적으로는 없지만, 테스트 유지보수성이 저하되면 회귀 버그를 놓칠 가능성이 높아진다.

**수정 방향**: 핵심 레이아웃 요소에 `data-testid` 추가

```
GraphCanvas → data-testid="graph-canvas"
ExplorerPanel → data-testid="explorer-panel"
RightPanel → data-testid="right-panel"
CommitBar → data-testid="commit-bar"
Toolbar → data-testid="toolbar"
EmptyState → data-testid="empty-state" (이미 있을 수 있음)
```

**사용자 영향도**: N/A (테스트 전용)
**구현 난이도**: S (1시간 이내)
**기존 컴포넌트 재활용**: 기존 컴포넌트에 속성만 추가

---

## 4. 향후 고려 (P3) — 장기적 개선 방향

### 4.1 프로퍼티 상속 시각화 (P1-5) 완전 구현 확인

**현황**: P1-5 테스트가 3건 모두 실패했으나 원인은 Explorer 동기화 문제(C 분류). 실제로 프로퍼티 상속 로직이 구현되어 있는지 소스 검증이 필요하다. `RightPanel.tsx`에서 inherited property 표시, "오버라이드" 버튼, 읽기전용 상태 로직이 있는지 확인 후 미구현 시 추가 개발이 필요.

**PRD 일치도 영향**: P1-5가 60%로 전체 중 가장 낮은 일치도. 완전 구현 시 전체 일치도 93%+ 달성 가능.

### 4.2 Text2Cypher UI 패널 (P2-4) 검증

**현황**: API는 완전히 동작하나 UI 패널 테스트가 서버 불안정으로 검증 불가. `Text2CypherTab.tsx`가 존재하므로 구현은 되어 있을 가능성이 높다. 서버 안정화 후 재검증 필요.

### 4.3 E2E 테스트 병렬화 전략

현재 테스트가 순차 실행되며, 긴 AI API 호출이 후속 테스트의 서버 안정성에 영향을 미치고 있다. Playwright의 `fullyParallel: true` + 테스트 간 독립적인 데이터 격리(`cleanupAll()` 개선)가 필요하다.

### 4.4 실시간 동기화 (Supabase Realtime)

`useLoadOntology`의 "초기 로드 전용" 문제(3.1)의 근본적 해결책. Supabase Realtime을 통해 다른 탭/사용자의 변경사항을 자동으로 Zustand 스토어에 반영하면, 새로고침 없이도 데이터 일관성을 유지할 수 있다. 단, 이는 MVP 범위를 넘는 기능이므로 v5에서 고려.

---

## 5. 요약

| 우선순위 | 항목 수 | 수정 대상 | 예상 총 난이도 | 테스트 통과율 변화 | PRD 일치도 변화 |
|----------|---------|----------|-------------|-----------------|---------------|
| **P0 (테스트 인프라)** | 6개 항목, 26건 해결 | 테스트 코드 | M (반나절~1일) | 59% → 96%+ | 변화 없음 |
| **P1 (버그 수정)** | 2개 항목, 2건 해결 | 제품 코드 | S (1~2시간) | 96% → 100% | 91% → 92.5% |
| **P2 (개선 제안)** | 2개 항목 (3.1, 3.3) | 제품+테스트 | M (반나절) | 안정성 향상 | — |
| **P3 (향후 고려)** | 4개 항목 | — | L~XL | — | 92.5% → 95%+ |

### 실행 순서 권장

```
[1일차 오전] P0 1.1 fixture 대기 로직 → P0 1.2 셀렉터 수정 → P0 1.3 API 필드명
[1일차 오후] P0 1.4~1.6 나머지 테스트 수정 → 전체 재실행으로 효과 확인
[2일차 오전] P1 2.1 SplashScreen 연결 → P1 2.2 chat API 방어 코드
[2일차 오후] P2 3.1 useLoadOntology 개선 → P2 3.3 data-testid 추가
```

### 비판적 최종 평가

이 프로젝트의 실제 제품 품질은 **양호하다**. 20개 PRD 기능 중 18.85개가 구현되었고, 100% 통과한 기능이 8개(P0-1, P1-1, P1-3, P2-2, P2-3, P3-1, P3-2, P3-4)로 핵심 기능의 안정성이 높다.

테스트 실패 28건의 92.8%가 테스트 코드 자체의 문제라는 점은 **테스트 작성 시 "실제 앱의 비동기 렌더링 파이프라인"에 대한 이해가 부족했음**을 의미한다. 이는 일반적인 실수이며, fixture의 대기 로직 한 곳만 개선하면 15건이 한번에 해결된다는 점에서 수정 비용 대비 효과가 매우 높다.

진정한 리스크는 `useLoadOntology`의 초기 로드 전용 제약(3.1)이다. 이것은 테스트에서 발견되었지만 실제 사용자 시나리오(탭 새로고침, 다중 디바이스)에서도 문제를 일으킬 수 있는 잠재적 결함이다. P2로 분류했으나, 실사용 빈도에 따라 P1으로 격상할 수 있다.
