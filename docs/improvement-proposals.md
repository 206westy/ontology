# Ontology Studio MVP - 개선 제안서

> **작성일**: 2026-03-22
> **작성자**: Visionary (MVP Dev Team)
> **대상**: PRD v0.1 MVP 기준

---

## 1. 기술스택 최적화

### 1.1 Tailwind CSS 3.4 → 4.x 마이그레이션 보류 권장

**현황**: PRD는 Tailwind CSS 4.x를 명시하지만, 현재 `package.json`에는 `tailwindcss: ^3.4.1`이 설치되어 있다.

**제안**: MVP 단계에서는 Tailwind 3.4를 유지하고, 마이그레이션을 후순위로 미룰 것을 권장한다.

**근거**:
- Tailwind 4.x는 설정 방식이 근본적으로 변경됨 (`tailwind.config.ts` → CSS 기반 `@theme` 디렉티브)
- `tailwindcss-animate`, `@tailwindcss/typography` 플러그인의 v4 호환성 확인 필요
- shadcn/ui 컴포넌트들이 Tailwind 3.x `hsl(var(--...))` 패턴을 사용 중 — v4에서는 `oklch` 기반으로 변경됨
- 현재 `tailwind.config.ts`에 커스텀 컬러, 폰트, 애니메이션이 이미 잘 구성되어 있음
- MVP 완료 후 안정화 단계에서 마이그레이션하는 것이 리스크 최소화

**액션**: PRD의 "Tailwind CSS 4.x" 명시를 "Tailwind CSS 3.4 (MVP) → 4.x (post-MVP)" 로 수정

### 1.2 Zustand: 슬라이스 패턴 + Immer + Zundo(Undo/Redo) 미들웨어

**현황**: PRD에서 Zustand 단일 `OntologyStore`를 정의하고 있으나, 온톨로지 데이터 + UI 상태 + 변경 추적이 한 스토어에 혼재.

**제안**: 슬라이스 패턴으로 스토어를 분리하고, Immer + Zundo 미들웨어를 결합할 것.

```
ontologyStore = create(
  devtools(
    temporal(          // zundo: Ctrl+Z undo/redo
      immer(           // 중첩 상태 안전 업데이트
        (...a) => ({
          ...createGraphSlice(...a),      // classes, instances, relations, edges
          ...createSelectionSlice(...a),   // selectedNodeId, hoveredNodeId
          ...createChangeSlice(...a),      // pendingChanges, commitHistory
          ...createPopoverSlice(...a),     // popoverState, popoverPosition
        })
      )
    )
  )
)
```

**근거**:
- `zundo`(temporal 미들웨어)를 사용하면 PRD의 "되돌리기" 기능을 별도 구현 없이 해결 가능
- 슬라이스별 독립 테스트 가능
- Immer가 온톨로지 트리의 깊은 중첩 업데이트를 안전하게 처리
- `zustand` v4는 이미 설치되어 있으므로 `immer`, `zundo`만 추가 설치

**주의**: 현재 `zustand: ^4`가 설치되어 있으나, PRD에서 v5 기능을 사용하지 않으므로 v4 유지가 안전. v5로 올릴 경우 `create` API 시그니처가 약간 변경되므로 확인 필요.

### 1.3 React Flow 12: 커스텀 노드 메모이제이션 필수

**현황**: React Flow 12가 설치되어 있으나(`@xyflow/react: ^12.10.1`), 아직 커스텀 노드 구현이 시작되지 않음.

**제안**: 커스텀 노드 구현 시 다음 패턴을 반드시 적용:

1. **`nodeTypes` 객체를 컴포넌트 외부 또는 `useMemo`로 정의** — 매 렌더마다 새 객체가 생성되면 React Flow가 내부적으로 wrapping을 다시 수행
2. **커스텀 노드 컴포넌트에 `React.memo` 적용** — 노드 데이터가 변경되지 않은 노드의 리렌더링 방지
3. **`edgeTypes`도 동일하게 메모이제이션**

```typescript
// 컴포넌트 외부에서 정의 (매 렌더마다 재생성 방지)
const nodeTypes = {
  classNode: ClassNode,       // React.memo로 래핑된 컴포넌트
  instanceNode: InstanceNode, // React.memo로 래핑된 컴포넌트
};
```

**근거**: React Flow 공식 문서에서 "가장 흔한 성능 문제"로 명시. nodeTypes를 컴포넌트 내부에서 인라인 정의하면 매 렌더마다 모든 노드가 재마운트됨.

### 1.4 ELKjs: 'layered' 알고리즘 + 방향 설정

**현황**: `elkjs: ^0.11.1` 설치됨. 레이아웃 알고리즘 선택이 아직 결정되지 않음.

**제안**: 온톨로지 is-a 계층에는 **layered (Sugiyama)** 알고리즘이 최적.

```typescript
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',              // 상위→하위 수직 배치
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '50',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
};
```

**알고리즘 비교**:
| 알고리즘 | 적합도 | 이유 |
|---------|--------|------|
| **layered** | 최적 | is-a 계층을 명확히 시각화, 엣지 교차 최소화 |
| force | 보통 | 관계가 많을 때 유용하나 계층 구분 불명확 |
| radial | 낮음 | 단일 루트 중심 배치에만 적합, 다중 루트 온톨로지에 부적합 |

**추가 제안**: 사용자가 수동으로 노드를 이동한 후에는 자동 레이아웃을 비활성화하고, Toolbar에 "정렬" 버튼을 두어 명시적으로 재배치할 수 있게 할 것.

### 1.5 Drizzle ORM: Recursive CTE로 계층 트리 쿼리

**현황**: classes 테이블의 `parent_id` 자기참조 FK로 계층 구조를 표현 (Adjacency List 패턴).

**제안**: Explorer 트리 로딩 시 Drizzle의 SQL 템플릿으로 Recursive CTE를 사용:

```typescript
const hierarchyQuery = sql`
  WITH RECURSIVE class_tree AS (
    SELECT id, parent_id, name, color, 0 as depth
    FROM classes WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.color, ct.depth + 1
    FROM classes c
    INNER JOIN class_tree ct ON c.parent_id = ct.id
  )
  SELECT * FROM class_tree ORDER BY depth, name
`;
```

**근거**:
- N+1 쿼리 방지 — 각 레벨마다 별도 쿼리 대신 단일 쿼리로 전체 트리 로딩
- `depth` 컬럼으로 프론트엔드에서 들여쓰기 계산 가능
- Supabase PostgreSQL이 CTE를 완벽 지원

### 1.6 ESLint → Biome/Ultracite 마이그레이션

**현황**: 현재 `eslint` + `eslint-config-next`가 설치되어 있으나, PRD는 Biome + Ultracite를 명시.

**제안**: MVP 초기에 `npx ultracite`로 전환할 것.

**근거**:
- Biome는 린팅+포매팅 단일 도구로 127개+ npm 패키지 대체
- 10,000 파일 린팅 ~0.8초 (ESLint ~45초)
- Ultracite가 Next.js + React + TypeScript 규칙을 zero-config으로 제공
- Claude Code 등 AI 에이전트용 룰 파일도 자동 생성

### 1.7 sonner 토스트로 교체

**현황**: 현재 `@radix-ui/react-toast` + 커스텀 `use-toast.ts` 훅을 사용 중.

**제안**: PRD에서 명시한 `sonner`로 교체.

**근거**:
- `sonner`는 선언적 API (`toast.success()`, `toast.error()`)로 사용이 간편
- 커스텀 훅 + Provider 불필요 — `<Toaster />` 한 줄로 완료
- 스타일링이 shadcn/ui 테마와 자동 통합됨
- 커밋 성공, 에러, Neo4j 푸시 결과 등 다양한 토스트 유형 지원

---

## 2. UX 개선

### 2.1 키보드 단축키 시스템

**제안**: 온톨로지 편집의 생산성을 위해 다음 단축키를 구현:

| 단축키 | 동작 | 구현 우선순위 |
|--------|------|-------------|
| `Ctrl+Z` / `Cmd+Z` | 되돌리기 (zundo undo) | P0 — 편집의 기본 |
| `Ctrl+Shift+Z` | 다시 실행 (zundo redo) | P0 |
| `Delete` / `Backspace` | 선택된 노드/엣지 삭제 | P0 |
| `Escape` | 팝오버 닫기 / 선택 해제 | P0 (이미 PRD에 명시) |
| `Ctrl+F` / `Cmd+F` | Explorer 검색 포커스 | P1 |
| `Space` | 선택된 노드 상세 패널 토글 | P2 |
| `/` | AI 보조 입력창 포커스 | P2 |

**구현 방식**: `react-use`의 `useKeyPressEvent` 또는 전용 `useHotkeys` 커스텀 훅

### 2.2 빈 캔버스 상태 (Empty State) 안내

**현황**: PRD에 빈 캔버스 상태 디자인이 명시되지 않음. 첫 진입 시 사용자가 무엇을 해야 하는지 모를 수 있음.

**제안**: 빈 캔버스일 때 중앙에 안내 메시지 표시:

```
┌─────────────────────────────────────┐
│                                     │
│     📦 온톨로지가 비어 있습니다      │
│                                     │
│  캔버스를 더블클릭하여 첫 노드를     │
│  만들어 보세요.                      │
│                                     │
│  또는 텍스트/CSV를 붙여넣기하면      │
│  AI가 자동으로 구조화합니다.         │
│                                     │
│       [시작하기]  [예시 불러오기]     │
│                                     │
└─────────────────────────────────────┘
```

- "예시 불러오기"는 반도체 장비 온톨로지 샘플 데이터를 로딩
- 노드가 1개라도 생성되면 이 안내는 사라짐

### 2.3 접근성 (a11y) 기본 지원

**제안**: MVP 수준에서도 기본 접근성을 확보:

1. **ARIA 라벨**: React Flow 노드에 `aria-label` 속성 추가 (`"{클래스명}, {인스턴스수}개 인스턴스"`)
2. **포커스 관리**: 팝오버 열릴 때 첫 번째 입력 필드에 자동 포커스, 닫힐 때 트리거 요소로 복귀
3. **색상 대비**: 노드 색상 위의 텍스트가 WCAG AA 기준(4.5:1) 충족하는지 확인
4. **Explorer 트리**: `role="tree"`, `role="treeitem"`, `aria-expanded` 적용

**근거**: shadcn/ui가 Radix UI 기반이므로 기본 접근성이 좋으나, 커스텀 노드와 트리 컴포넌트는 직접 처리해야 함.

### 2.4 마이크로인터랙션

**제안**: 이미 설치된 `framer-motion`을 활용한 미세 인터랙션:

| 인터랙션 | 효과 | 우선순위 |
|---------|------|---------|
| 노드 추가 시 | scale(0→1) + opacity(0→1) bounce | P1 |
| 노드 삭제 시 | scale(1→0.8) + opacity(1→0) | P1 |
| 팝오버 등장 | scale(0.95→1) + opacity(0→1), 200ms | P0 (PRD 명시) |
| 패널 전환 | x slide + crossfade | P0 (이미 ExplorerPanel에 적용됨) |
| 엣지 연결 중 | 점선 애니메이션 (stroke-dashoffset 회전) | P2 |
| Commit Bar 변경 존재 | amber 점 pulse 애니메이션 | P1 |

### 2.5 드래그 앤 드롭 파일 임포트

**현황**: PRD에서 팝오버 내 "[파일]" 버튼으로 파일 첨부를 언급하지만, 캔버스에 직접 드래그 앤 드롭은 언급 없음.

**제안**: 캔버스에 CSV/TXT 파일을 직접 드래그 앤 드롭하면 새 노드 생성 팝오버가 열리고 파일 내용이 자동 입력되도록 할 것.

**근거**: 도메인 전문가는 엑셀/CSV에 데이터를 가지고 있을 가능성이 높음. 파일을 드래그하는 것이 버튼 클릭보다 직관적.

---

## 3. 성능 최적화

### 3.1 대규모 그래프 렌더링 (노드 100개+)

**현황**: React Flow는 DOM 기반 렌더링이므로 노드 수가 많아지면 성능 저하 발생 가능.

**제안**:

1. **React Flow의 `onlyRenderVisibleElements` 활성화** (기본값 true, 확인 필요):
   - 뷰포트 밖 노드는 렌더링하지 않음
   - 줌 아웃 시 노드를 간소화된 형태로 표시 (텍스트 숨기고 색상 dot만)

2. **노드 간소화 줌 레벨 (Level of Detail)**:
   ```
   줌 100%+: 전체 노드 (이름 + 인스턴스 수 + 프로퍼티 뱃지)
   줌 50~100%: 이름만 표시
   줌 50% 미만: 색상 dot만 표시
   ```
   React Flow의 `useStore`로 줌 레벨을 감지하여 조건부 렌더링

3. **React.memo 적용 포인트**:
   - `ClassNode`, `InstanceNode` 커스텀 노드 컴포넌트
   - `ExplorerPanel`의 개별 트리 아이템
   - `RightPanel`의 각 섹션 컴포넌트

### 3.2 React Query 캐싱 전략

**현황**: `providers.tsx`에서 기본 staleTime을 60초로 설정.

**제안**: 데이터 특성에 따라 차별화된 캐싱:

| 데이터 | staleTime | gcTime | 이유 |
|--------|-----------|--------|------|
| classes (트리) | 5분 | 30분 | 자주 변경되지 않음, 변경 시 mutation으로 invalidate |
| instances | 2분 | 10분 | 상대적으로 빈번한 추가/수정 |
| relation_types | 10분 | 1시간 | 거의 변경 없음 (팔레트) |
| edges | 2분 | 10분 | 관계 연결/삭제 빈번 |
| commits | 30초 | 5분 | 최신 상태 반영 필요 |

**Optimistic Update**: 노드 추가/수정 시 서버 응답 전에 UI 먼저 업데이트, 실패 시 롤백. `useMutation`의 `onMutate`/`onError`/`onSettled` 활용.

### 3.3 Explorer 트리 가상 스크롤

**현황**: PRD에 언급 없으나, 클래스+인스턴스가 수백 개가 되면 Explorer 트리 렌더링이 느려질 수 있음.

**제안**: 노드 수가 100개를 초과하면 가상 스크롤을 적용.

**구현 옵션**:
- `@tanstack/react-virtual` — TanStack 생태계와 일관성, 경량
- 트리 구조에서는 "flatten → virtualize → indent" 패턴 적용

**임계값**: 초기에는 일반 렌더링, 노드 100개+ 시 가상 스크롤 활성화. MVP에서는 수십 개 수준이므로 P2 우선순위.

### 3.4 ELKjs Web Worker 활용

**현황**: ELKjs는 이미 비동기 실행을 지원하지만, 메인 스레드에서 실행하면 대규모 그래프에서 UI 블로킹 가능.

**제안**: ELKjs를 Web Worker에서 실행하여 레이아웃 계산 중에도 UI가 응답성을 유지하도록 할 것.

```typescript
// elkjs의 내장 Web Worker 모드 활용
import ELK from 'elkjs/lib/elk.bundled.js'; // Web Worker 포함 번들
const elk = new ELK();
```

**근거**: `elkjs`는 이미 Web Worker 번들을 제공. 별도 Worker 설정 없이 `elk.bundled.js`를 import하면 자동으로 Worker에서 실행됨.

---

## 4. 디자인 개선

### 4.1 다크모드 완전 지원

**현황**: `tailwind.config.ts`에 `darkMode: ['class']`가 설정되어 있고, `next-themes` ThemeProvider가 있으나, 실제 다크모드 CSS 변수/디자인이 구현되지 않음.

**제안**: PRD 디자인 토큰에 다크모드 컬러 세트를 추가:

| 토큰 | Light | Dark |
|------|-------|------|
| Background | `#fafafa` | `#09090b` (zinc-950) |
| Card | `#ffffff` | `#18181b` (zinc-900) |
| Border | `#e4e4e7` | `#27272a` (zinc-800) |
| Text Primary | `#18181b` | `#fafafa` |
| Text Secondary | `#52525b` | `#a1a1aa` |
| Accent | `#7c3aed` | `#8b5cf6` (약간 밝게) |
| Canvas Background | `#fafafa` | `#0a0a0b` |
| Grid Dots | `#d4d4d8` | `#3f3f46` |

**노드 색상**: 다크모드에서 노드의 fill opacity를 0.12 → 0.20으로 상향하여 가시성 확보.

**구현**: CSS 변수 기반으로 `globals.css`의 `:root`와 `.dark` 클래스에 정의하면, Tailwind + shadcn/ui가 자동 적용.

### 4.2 모션 디자인 원칙

**제안**: framer-motion 사용 시 일관된 모션 원칙을 정의:

```typescript
// constants/motion.ts
export const MOTION = {
  // 기본 전환
  spring: { type: 'spring', damping: 24, stiffness: 260 },
  // 팝오버/모달
  popover: {
    initial: { opacity: 0, scale: 0.95, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: -4 },
    transition: { duration: 0.15 },
  },
  // 노드 등장
  nodeEnter: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    transition: { type: 'spring', damping: 15, stiffness: 300 },
  },
  // 패널 슬라이드
  panelSlide: (direction: 'left' | 'right') => ({
    initial: { x: direction === 'left' ? -260 : 320, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: direction === 'left' ? -260 : 320, opacity: 0 },
    transition: { type: 'spring', damping: 24, stiffness: 260 },
  }),
} as const;
```

**원칙**:
- **duration 200ms 이하**: 사용자가 "즉각적"으로 느끼는 범위
- **spring 우선**: ease 대신 spring을 기본으로 사용 (자연스러운 감속)
- **일관성**: 같은 유형의 UI 요소는 같은 모션 사용

### 4.3 로딩 상태 스켈레톤

**제안**: 데이터 로딩 시 스켈레톤 UI를 표시:

| 영역 | 스켈레톤 형태 |
|------|-------------|
| Explorer 트리 | 회색 막대 4~5줄 (들여쓰기 포함) |
| Graph Canvas | 중앙 Spinner + "그래프 로딩 중..." 텍스트 |
| Right Panel | 각 섹션별 회색 막대 (Description 3줄, Properties 4줄) |
| Commit Bar | 회색 막대 1줄 |

**구현**: shadcn/ui의 `Skeleton` 컴포넌트(`npx shadcn@latest add skeleton`) 활용.

### 4.4 노드 디자인 미세 조정

**제안**: PRD의 원형 노드 디자인에 depth감을 추가:

1. **그림자 계층화**: 선택된 노드에 accent 색상 glow (`box-shadow: 0 0 0 3px rgba(124,58,237,0.2)`)
2. **호버 시 확대**: `transform: scale(1.05)` + 그림자 강화 (transition 150ms)
3. **인스턴스 수 뱃지**: 노드 우측 상단에 작은 원형 뱃지로 표시 (카운트가 0이면 숨김)
4. **빈 클래스 시각적 차별화**: 점선 테두리 + 내부에 "+" 아이콘 (인스턴스 추가 유도)

---

## 5. 기획 개선

### 5.1 P0에서 누락된 중요 기능: 노드 삭제

**현황**: PRD의 P0~P3 우선순위에 **노드/엣지 삭제** 기능이 명시되지 않음. 생성과 수정만 있고 삭제가 없다.

**제안**: P0에 "노드/엣지 삭제" 기능 추가.

**근거**:
- LLM이 자동 구조화한 결과에서 불필요한 항목을 삭제하는 것은 기본 편집 기능
- 프리뷰에서 [삭제]는 있지만, 확정 후 캔버스에서의 삭제가 없음
- Delete 키 또는 우클릭 컨텍스트 메뉴 → "삭제" → 확인 다이얼로그

**DB 영향**: `ON DELETE CASCADE`가 이미 설계되어 있으므로, 클래스 삭제 시 하위 프로퍼티/인스턴스/값이 자동 정리됨. 단, 사용자에게 "하위 N개 항목도 함께 삭제됩니다" 경고 필요.

### 5.2 에러 케이스 처리 전략

**현황**: PRD에 에러 처리 전략이 명시되지 않음.

**제안**: 다음 에러 케이스별 처리 방안 정의:

| 에러 케이스 | 처리 | UI |
|------------|------|-----|
| Supabase 연결 실패 | 재시도 3회 → 오프라인 모드 안내 | 상단 배너 "DB 연결 실패 — 변경사항이 저장되지 않습니다" |
| LLM API 실패 | 재시도 1회 → 수동 입력 폼 전환 | 팝오버 내 "AI 구조화 실패 — 직접 입력하시겠습니까?" |
| Neo4j 푸시 실패 | 롤백 + 에러 상세 표시 | 토스트 에러 + 상세 로그 |
| 중복 이름 (UNIQUE 위반) | DB 에러 캐치 → 사용자에게 이름 변경 요청 | 인라인 에러 메시지 ("같은 이름의 클래스가 이미 존재합니다") |
| 네트워크 일시 단절 | React Query의 `networkMode: 'offlineFirst'` | 오프라인 표시 + 재연결 시 자동 동기화 |

**구현**: React Query의 `onError` 콜백 + 전역 에러 바운더리 + sonner 토스트 조합.

### 5.3 UX 흐름 개선: "확정 전 되돌리기" 명확화

**현황**: PRD에서 커밋 바의 "되돌리기"가 "마지막 변경 1건 undo"로만 정의.

**제안**: 되돌리기 범위를 명확화:

1. **캔버스 레벨 Undo (Ctrl+Z)**: zundo temporal store의 undo — 마지막 상태 변경을 되돌림 (로컬)
2. **커밋 바 "되돌리기"**: 마지막 DB 저장 변경을 되돌림 (서버 측) — `commit_details`의 `before_snapshot`을 사용하여 복원
3. **Neo4j 푸시 후 "롤백"**: P3로 분류됨 — 당장은 불필요

**근거**: 사용자가 "되돌리기"의 범위를 혼동할 수 있음. 로컬 undo와 서버 undo를 명확히 구분해야 함.

### 5.4 URL 상태 동기화 (nuqs)

**현황**: PRD에서 `nuqs`를 명시했으나 구현 계획에는 반영되지 않음.

**제안**: 선택된 노드 ID를 URL 쿼리 파라미터로 동기화:

```
/studio?node=uuid-1234-5678
```

**근거**:
- 특정 노드를 선택한 상태의 URL을 북마크/공유 가능
- 브라우저 뒤로가기로 이전에 선택한 노드로 복귀 가능
- `nuqs`는 Next.js App Router에 최적화된 URL 상태 관리 라이브러리

### 5.5 자동 저장 + 수동 커밋 분리

**현황**: PRD에서 변경사항이 "커밋 바에 누적"되지만, 자동 저장과 수동 커밋의 관계가 불명확.

**제안**: 2단계 저장 모델:

1. **자동 저장 (debounced, 2초)**: 편집 내용을 Supabase에 자동 저장. 사용자가 저장 버튼을 누를 필요 없음.
2. **수동 커밋**: 커밋 바의 "커밋" 버튼으로 변경 이력 스냅샷 생성 (commit + commit_details). 이것이 롤백 포인트.
3. **Neo4j 푸시**: 커밋된 변경분만 프로덕션에 반영.

```
편집 → [자동저장] → Supabase (최신 상태)
               → [수동 커밋] → commits 테이블 (스냅샷)
                              → [Neo4j 푸시] → 프로덕션 그래프
```

**근거**: Git과 동일한 멘탈 모델 — "working directory" → "staging" → "push".

### 5.6 대량 데이터 임포트 시 진행률 표시

**현황**: PRD에서 CSV 붙여넣기/파일 첨부를 통한 대량 임포트를 지원하지만, 처리 중 피드백이 없음.

**제안**: LLM 구조화 처리 중 진행률 표시:

```
┌─ 구조화 중... ──────────────────┐
│                                  │
│  ████████░░░░░░░░  45%          │
│                                  │
│  ✓ 텍스트 분석 완료              │
│  ✓ 클래스 3개 추출               │
│  ◻ 프로퍼티 추출 중...           │
│  ◻ 관계 추론 대기                │
│                                  │
│          [취소]                  │
└──────────────────────────────────┘
```

**근거**: LLM API 호출은 수 초 소요될 수 있으며, 진행 상태 없이 로딩 스피너만 보여주면 사용자가 불안감을 느낌.

---

## 요약: 우선순위별 액션 아이템

### 즉시 적용 (MVP 개발 중)
1. Tailwind 3.4 유지 결정 (PRD 수정)
2. React Flow 커스텀 노드 메모이제이션 패턴 적용
3. Zustand 슬라이스 + Immer 구조 설계
4. ELKjs layered 알고리즘 설정
5. 노드 삭제 기능 P0 추가
6. 에러 케이스 처리 전략 반영

### 단기 (MVP 마무리 시)
7. zundo Undo/Redo 미들웨어 통합
8. 빈 캔버스 Empty State
9. 다크모드 CSS 변수 정의
10. 로딩 스켈레톤 UI
11. sonner 토스트 교체

### 중기 (MVP 이후)
12. Biome/Ultracite 마이그레이션
13. 키보드 단축키 시스템
14. 가상 스크롤 (Explorer 트리)
15. URL 상태 동기화 (nuqs)
16. Tailwind 4.x 마이그레이션
