# Phase 2 구현 계획서

> **작성일**: 2026-03-22
> **기반 문서**: PRD-v2.md (Phase 2: F2-1 ~ F2-12)
> **현재 상태**: Phase 1 (MVP) 구현 완료, Phase 2 착수

---

## 0. 의존성 순서 (구현 순서)

```
[그룹 A: 인프라/기반] ──────────────────────────────────
 ① F2-8  sonner 토스트 교체 (다른 기능의 에러/성공 피드백 기반)
 ② F2-9  에러 처리 전략 통합 (모든 API 호출에 영향)
 ③ DB 마이그레이션 (commits 테이블 before/after snapshot 강화)

[그룹 B: Neo4j 핵심] ──────────────────────────────────
 ④ F2-1  Neo4j 연결 + Cypher 자동 생성 (← ①②③ 의존)
 ⑤ F2-2  Neo4j 푸시 확인 UI (← ④ 의존)
 ⑥ F2-3  Neo4j 롤백 (← ④ 의존)

[그룹 C: UX 개선 - 독립] ──────────────────────────────
 ⑦ F2-4  빈 캔버스 Empty State 확장 (독립)
 ⑧ F2-5  검색 → 캔버스 포커스 (독립)
 ⑨ F2-6  MiniMap (이미 구현됨 — 확인만 필요)
 ⑩ F2-7  로딩 스켈레톤 (독립)
 ⑪ F2-10 다크모드 완전 지원 (독립)
 ⑫ F2-11 대량 임포트 진행률 (독립)
 ⑬ F2-12 Level of Detail (독립)

그룹 C는 그룹 A 완료 후 병렬 진행 가능.
그룹 B는 반드시 순차 진행 (④ → ⑤⑥ 병렬).
```

---

## 1. F2-8: sonner 토스트 교체 (기반)

### 설명
기존 `@radix-ui/react-toast` + `use-toast.ts` 훅을 `sonner`의 선언적 API로 교체. 이후 모든 기능의 성공/에러/로딩 피드백이 sonner 기반으로 동작.

### 신규 의존성
```bash
npm install sonner
```

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/app/providers.tsx` | `<Toaster />` (sonner) 추가 |
| `ontology/src/app/layout.tsx` | radix Toaster 제거 (있다면) |
| `ontology/src/hooks/use-toast.ts` | **삭제** (sonner로 완전 대체) |
| `ontology/src/components/ui/toast.tsx` | **삭제** |
| `ontology/src/components/ui/toaster.tsx` | **삭제** |
| `ontology/src/features/ontology/components/CommitBar.tsx` | `toast()` → `toast.success()` / `toast.error()` |
| `ontology/src/features/ontology/components/RightPanel.tsx` | `toast()` → sonner import |
| 기타 `toast` import 사용처 전체 | import 경로 변경 |

### 신규 파일
없음 (sonner는 `import { toast } from 'sonner'` + `<Toaster />` 만으로 동작)

### 구현 세부
```typescript
// providers.tsx에 추가
import { Toaster } from 'sonner';

// Toaster 설정
<Toaster
  position="bottom-right"
  toastOptions={{
    className: 'text-sm',
    duration: 3000,
  }}
  richColors
/>

// 사용 예시
import { toast } from 'sonner';
toast.success('커밋 완료');
toast.error('커밋 실패', { description: '다시 시도해주세요.' });
toast.promise(pushPromise, {
  loading: 'Neo4j 푸시 중...',
  success: 'Neo4j 반영 완료',
  error: '푸시 실패',
});
```

### 기술적 리스크
- **낮음**: sonner는 drop-in replacement. API가 단순하고 shadcn/ui와 호환됨.
- radix toast 제거 시 `@radix-ui/react-toast` 패키지는 uninstall하지 않아도 됨 (다른 radix 컴포넌트가 사용 중).

---

## 2. F2-9: 에러 처리 전략 통합

### 설명
Supabase 연결 실패, LLM API 실패, Neo4j 푸시 실패 각각에 대한 통합 에러 핸들링 계층 구축. PRD의 메시지 톤 가이드 준수.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/lib/api-error.ts` | 에러 타입 분류 확장 (NetworkError, LlmError, Neo4jError 등) |
| `ontology/src/features/ontology/api.ts` | `handleResponse` 함수에 에러 분류 + sonner 연동 |
| `ontology/src/app/providers.tsx` | React Query `onError` 글로벌 핸들러 설정 |
| `ontology/src/app/page.tsx` | isError 상태 UI 개선 (대안 행동 제시) |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/lib/error-handler.ts` | 통합 에러 핸들러 (에러 분류 → 사용자 메시지 매핑 → sonner 호출) |

### 에러 분류 체계
```typescript
type ErrorCategory = 'network' | 'supabase' | 'llm' | 'neo4j' | 'validation' | 'unknown';

// 카테고리별 사용자 메시지 (PRD 7.6 준수)
const ERROR_MESSAGES: Record<ErrorCategory, { title: string; description: string }> = {
  network: { title: '연결이 불안정합니다', description: '변경사항은 로컬에 보관됩니다.' },
  supabase: { title: '데이터 저장에 실패했습니다', description: '잠시 후 다시 시도해주세요.' },
  llm: { title: 'AI 구조화에 실패했습니다', description: '직접 입력하시겠습니까?' },
  neo4j: { title: '프로덕션 반영에 실패했습니다', description: '변경사항은 스테이징에 안전하게 보존되어 있습니다.' },
  validation: { title: '입력값을 확인해주세요', description: '' },
  unknown: { title: '예기치 않은 오류가 발생했습니다', description: '다시 시도해주세요.' },
};
```

### 기술적 리스크
- **중간**: 기존 `handleResponse` 함수가 단순 throw → 모든 호출부에서 catch 패턴 검토 필요.
- React Query의 `onError` 글로벌 핸들러와 개별 mutation `onError`의 우선순위 정리 필요.

---

## 3. DB 마이그레이션: commits 테이블 강화

### 설명
Neo4j 푸시를 위해 `commit_details` 테이블의 `before_snapshot`과 `after_snapshot` 컬럼이 실제로 데이터를 저장하도록 커밋 생성 로직 수정. 현재 스키마에는 컬럼이 존재하지만 커밋 시 스냅샷을 저장하지 않고 있음.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/app/api/commits/route.ts` | 커밋 생성 시 before/after snapshot 저장 로직 추가 |
| `ontology/src/features/ontology/components/CommitBar.tsx` | 커밋 요청 시 snapshot 데이터 포함 |
| `ontology/src/features/ontology/hooks/useOntologyStore.ts` | Change 타입에 `beforeSnapshot`/`afterSnapshot` 실제 데이터 기록 |
| `ontology/src/features/ontology/lib/types.ts` | Change 인터페이스의 snapshot 필드를 필수로 강화 |

### 신규 마이그레이션 파일
| 파일 | 내용 |
|------|------|
| `supabase/migrations/20260322100001_add_neo4j_push_tracking.sql` | `commits` 테이블에 `cypher_queries` jsonb 컬럼 추가 (생성된 Cypher 저장용) |

### 핵심 변경
```typescript
// Change 생성 시 snapshot 포함
function createChange(
  operation: ChangeOperation,
  targetTable: string,
  targetId: string,
  targetName: string,
  beforeSnapshot?: Record<string, unknown>,
  afterSnapshot?: Record<string, unknown>,
): Change { ... }
```

---

## 4. F2-1: Neo4j 연결 + Cypher 자동 생성 (핵심)

### 설명
커밋된 변경사항(commit_details)을 Cypher 구문으로 변환하고, Neo4j에 트랜잭션으로 실행하는 백엔드 API 구축. "온톨로지의 Git" Layer 3 완성.

### 신규 의존성
```bash
npm install neo4j-driver
```

### 환경 변수 (`.env.local`)
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=neo4j
```

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/api.ts` | `neo4jApi` 객체 추가 (push, rollback, status) |
| `ontology/src/features/ontology/components/CommitBar.tsx` | Neo4j 푸시 버튼 로직 연결 (현재 커밋과 푸시가 하나로 합쳐져 있음 → 분리) |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/lib/neo4j/driver.ts` | Neo4j 드라이버 싱글톤 (서버사이드 only) |
| `ontology/src/lib/neo4j/cypher-builder.ts` | commit_details → Cypher 변환 로직 |
| `ontology/src/app/api/neo4j/push/route.ts` | POST: 미푸시 커밋 조회 → Cypher 생성 → 트랜잭션 실행 → 결과 반환 |
| `ontology/src/app/api/neo4j/status/route.ts` | GET: Neo4j 연결 상태 확인 |
| `ontology/src/app/api/neo4j/rollback/route.ts` | POST: before_snapshot 기반 롤백 Cypher 실행 |

### 컴포넌트 구조
```
lib/neo4j/
├── driver.ts         # 싱글톤 드라이버
└── cypher-builder.ts # Cypher 변환 엔진

app/api/neo4j/
├── push/route.ts     # 푸시 API
├── rollback/route.ts # 롤백 API
└── status/route.ts   # 상태 확인 API
```

### Cypher 변환 로직 (cypher-builder.ts)
```typescript
// 테이블별 Cypher 매핑
interface CypherStatement {
  query: string;
  params: Record<string, unknown>;
  description: string; // UI 표시용
}

function buildCypherFromCommitDetails(details: CommitDetail[]): CypherStatement[] {
  // 순서: 클래스 → 프로퍼티 → 인스턴스 → 인스턴스값 → 관계타입 → 엣지 → 공리
  // ADD → CREATE, MOD → SET, DEL → DETACH DELETE
}

// 예시 변환:
// ADD classes → CREATE (n:Class {id: $id, name: $name, description: $desc, color: $color})
// ADD instances → CREATE (n:Instance {id: $id, name: $name}) + MATCH-CREATE :INSTANCE_OF
// ADD edges → MATCH (a {id: $sourceId}), (b {id: $targetId}) CREATE (a)-[:REL_TYPE]->(b)
// MOD classes → MATCH (n:Class {id: $id}) SET n.name = $name, n.description = $desc
// DEL classes → MATCH (n:Class {id: $id}) DETACH DELETE n
```

### 드라이버 설정 (driver.ts)
```typescript
import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
    );
  }
  return driver;
}

export async function executeInTransaction(
  statements: { query: string; params: Record<string, unknown> }[]
): Promise<{ success: boolean; executedCount: number; error?: string }> {
  const session = getDriver().session({ database: process.env.NEO4J_DATABASE ?? 'neo4j' });
  try {
    return await session.executeWrite(async (tx) => {
      let count = 0;
      for (const stmt of statements) {
        await tx.run(stmt.query, stmt.params);
        count++;
      }
      return { success: true, executedCount: count };
    });
  } catch (error) {
    return { success: false, executedCount: 0, error: String(error) };
  } finally {
    await session.close();
  }
}
```

### Push API 흐름 (push/route.ts)
```
1. commits에서 pushed_to_neo4j = false인 레코드 조회
2. 해당 commit의 commit_details 조회
3. cypher-builder로 Cypher 구문 배열 생성
4. Neo4j 트랜잭션 실행 (executeWrite — 자동 롤백)
5. 성공 시: commits.pushed_to_neo4j = true, pushed_at = now()
6. 실패 시: 에러 상세 반환 (실패 쿼리 인덱스 + 에러 메시지)
7. 응답: { success, totalQueries, executedQueries, cypherPreview[], error? }
```

### 기술적 리스크
- **높음**: Cypher 변환의 정확성 — 모든 테이블 타입(classes, instances, edges, properties, axioms 등)에 대한 변환 로직 필요.
- **중간**: Neo4j 서버가 없을 때의 graceful degradation — `status` API로 사전 확인 필요.
- **대안**: Cypher 미리보기를 생성만 하고, 실제 실행은 사용자 확인 후 별도 요청으로 분리 (F2-2 UI와 연동).

---

## 5. F2-2: Neo4j 푸시 확인 UI

### 설명
CommitBar의 [Neo4j 푸시] 버튼 클릭 시 하단 Sheet로 변경 요약 + Cypher 미리보기 + 진행률 + 결과를 표시.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/components/CommitBar.tsx` | 커밋/푸시 버튼 분리, NeoConfirmSheet 트리거 연결 |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/features/ontology/components/NeoConfirmSheet.tsx` | 메인 Sheet 컨테이너 (phase 상태 머신: confirm → progress → result) |
| `ontology/src/features/ontology/components/neo4j/PushSummary.tsx` | 변경 요약 표시 (+N class, ~N modified 등) |
| `ontology/src/features/ontology/components/neo4j/CypherPreview.tsx` | Cypher 코드 블록 (접기/펼치기, 복사 버튼, 구문 하이라이팅) |
| `ontology/src/features/ontology/components/neo4j/PushProgress.tsx` | 단계별 진행률 (✓/◎/○ + progress bar) |
| `ontology/src/features/ontology/components/neo4j/PushResult.tsx` | 성공/실패 결과 표시 |
| `ontology/src/features/ontology/hooks/useNeo4jPush.ts` | 푸시 상태 관리 훅 (preview 요청 → 실행 → 결과) |

### 컴포넌트 구조
```
CommitBar
  └── NeoConfirmSheet (Sheet, side="bottom", h-[50vh])
        ├── PushSummary        ← phase: 'confirm'
        ├── CypherPreview      ← phase: 'confirm' (Collapsible)
        ├── PushProgress       ← phase: 'progress'
        └── PushResult         ← phase: 'success' | 'error'
```

### 상태 머신
```typescript
type PushPhase = 'confirm' | 'progress' | 'success' | 'partial-fail' | 'error';

interface PushState {
  phase: PushPhase;
  cypherStatements: CypherStatement[];
  totalQueries: number;
  executedQueries: number;
  errors: { index: number; query: string; error: string }[];
  elapsedMs: number;
}
```

### CommitBar 변경
현재 CommitBar에서 커밋과 푸시가 하나의 버튼으로 합쳐져 있음. 이를 분리:
- [커밋] 버튼: Supabase에 스냅샷 생성 (기존 로직)
- [Neo4j 푸시] 버튼: NeoConfirmSheet 열기 (새 기능)

### 인터랙션 규칙
- Cypher 미리보기: 기본 접힘, mono 폰트, keyword(cyan)/string(green) 하이라이팅
- [복사]: `navigator.clipboard.writeText()` → sonner 토스트 "클립보드에 복사됨"
- 진행 중: Sheet 닫기 불가 (`onInteractOutside={e => e.preventDefault()}`)
- 진행 바: emerald-500 배경색

### 기술적 리스크
- **중간**: 진행률 실시간 업데이트 — 현재 API는 동기 응답이므로 SSE/polling 중 택 1 필요.
- **대안 (권장)**: Push API를 단계별로 나누지 않고, 클라이언트에서 단계별 Cypher를 하나씩 fetch → 프론트에서 진행 추적. 또는 전체를 한 트랜잭션으로 실행하고 결과만 반환 (심플).

---

## 6. F2-3: Neo4j 롤백

### 설명
`before_snapshot` 기반으로 Neo4j에서 마지막 푸시를 취소하는 역변환 Cypher 실행.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/api.ts` | `neo4jApi.rollback()` 추가 |
| `ontology/src/features/ontology/components/CommitBar.tsx` 또는 `NeoConfirmSheet.tsx` | 롤백 버튼 UI |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/app/api/neo4j/rollback/route.ts` | POST: 마지막 푸시 커밋의 역변환 Cypher 실행 |

### 롤백 로직
```
1. commits에서 pushed_to_neo4j = true인 최신 커밋 조회
2. commit_details의 before_snapshot으로 역변환:
   - ADD → DETACH DELETE (id 기준)
   - DEL → CREATE (before_snapshot 데이터로 복원)
   - MOD → SET (before_snapshot 값으로 복원)
3. Neo4j 트랜잭션 실행
4. 성공 시: commits.pushed_to_neo4j = false, pushed_at = null
```

### 기술적 리스크
- **높음**: before_snapshot이 불완전하면 롤백 불가. F2-1의 스냅샷 저장이 선행 조건.
- 연쇄 관계(cascade) 롤백 시 순서 문제 — 엣지 먼저 복원 후 노드 복원 등 순서 고려 필요.
- **대안**: 전체 그래프를 DETACH DELETE 후 before_snapshot으로 전체 재생성 (단순하지만 비효율).

---

## 7. F2-4: 빈 캔버스 Empty State 확장

### 설명
현재 GraphCanvas.tsx에 기본 Empty State가 있음. 이를 PRD 6.8에 따라 확장: [예시 온톨로지 불러오기] 버튼 + 템플릿 팝오버 + [직접 시작하기] 버튼 추가.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | Empty State 영역을 `EmptyState` 컴포넌트로 추출, 버튼 추가 |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/features/ontology/components/empty-state/EmptyState.tsx` | 메인 Empty State 컴포넌트 |
| `ontology/src/features/ontology/components/empty-state/TemplatePopover.tsx` | 예시 온톨로지 선택 팝오버 |
| `ontology/src/features/ontology/constants/sample-ontology.ts` | 반도체 장비 예시 데이터 (classes 6개, instances 12개, relations 8개) |

### 컴포넌트 구조
```
GraphCanvas (isEmpty 분기)
  └── EmptyState
        ├── 기존 안내 텍스트 + 입력 예시 (유지)
        ├── Button: "예시 온톨로지 불러오기" → TemplatePopover
        │     └── TemplatePopover (Popover)
        │           └── 반도체 장비 도메인 카드 → loadOntology()
        └── Button: "직접 시작하기" → openPopover(newNode, 화면 중앙)
```

### 기술적 리스크
- **낮음**: 독립적 UI 작업. 기존 `loadOntology` 스토어 액션 활용.

---

## 8. F2-5: 검색 → 캔버스 포커스 하이라이트

### 설명
Explorer 검색 결과 클릭 시 캔버스 해당 노드로 줌/패닝 + 일시적 하이라이트 ring pulse (1.5초).

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/components/ExplorerPanel.tsx` | 검색 결과 클릭 시 `focusNode` 호출 (이미 구현됨 — 하이라이트만 추가) |
| `ontology/src/features/ontology/components/ClassNode.tsx` | `isFocused` prop 추가 → ring pulse CSS |
| `ontology/src/features/ontology/components/InstanceNode.tsx` | 동일 |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | `focusNodeId`를 노드 data에 전달 |
| `ontology/src/features/ontology/hooks/useOntologyStore.ts` | `focusNodeId` 1.5초 후 자동 clear 타이머 (또는 컴포넌트 레벨에서 처리) |
| `ontology/src/features/ontology/hooks/useKeyboardShortcuts.ts` | `Ctrl+F` → Explorer 검색 입력 포커스 추가 |

### 하이라이트 CSS
```css
@keyframes focus-ring {
  0% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
  100% { box-shadow: 0 0 0 8px transparent; }
}
```
ClassNode/InstanceNode에서 `focusNodeId === id` 일 때 `animation: focus-ring 1.5s ease-out` 적용.

### 기술적 리스크
- **낮음**: 기존 `focusNode` 인프라 활용. 하이라이트 CSS 추가만으로 구현 가능.

---

## 9. F2-6: MiniMap

### 설명
이미 GraphCanvas.tsx에 `<MiniMap />` 컴포넌트가 구현되어 있음. PRD 요구사항과 비교하여 확인만 필요.

### 현재 상태: ✓ 구현 완료
```tsx
// GraphCanvas.tsx:414-423 — 이미 존재
<MiniMap
  nodeColor={(node) => { ... }}
  maskColor="hsl(0 0% 0% / 0.08)"
  className="!rounded-lg !border !border-border"
  pannable
  zoomable
/>
```

### 추가 작업
- 다크모드에서 `maskColor` 조정 필요 (`dark: hsl(0 0% 100% / 0.08)`)
- MiniMap에서 인스턴스 노드 표시 여부 검토 (노드 수가 많으면 혼잡할 수 있음)

### 기술적 리스크
- **매우 낮음**: 이미 구현됨.

---

## 10. F2-7: 로딩 스켈레톤

### 설명
초기 데이터 로딩 시 Explorer/Canvas/RightPanel 영역별 Skeleton UI 표시.

### 신규 shadcn/ui 컴포넌트
```bash
npx shadcn@latest add skeleton
```

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/app/page.tsx` | 전체 로딩 스피너 → 영역별 스켈레톤으로 교체 |
| `ontology/src/features/ontology/components/ExplorerPanel.tsx` | 로딩 상태에서 스켈레톤 렌더링 |
| `ontology/src/features/ontology/components/RightPanel.tsx` | 로딩 상태에서 스켈레톤 렌더링 |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/features/ontology/components/skeletons/ExplorerSkeleton.tsx` | Explorer 영역 스켈레톤 |
| `ontology/src/features/ontology/components/skeletons/CanvasSkeleton.tsx` | Canvas 중앙 스피너 + "그래프를 불러오고 있습니다" |
| `ontology/src/features/ontology/components/skeletons/RightPanelSkeleton.tsx` | RightPanel 영역 스켈레톤 |

### 컴포넌트 구조
```
page.tsx (isLoading)
  ├── ExplorerSkeleton  (좌측 260px)
  ├── CanvasSkeleton    (가운데)
  └── (RightPanel 숨김 — 노드 미선택)
```

### 기술적 리스크
- **매우 낮음**: 순수 UI 작업.

---

## 11. F2-10: 다크모드 완전 지원

### 설명
CSS 변수 기반 다크모드 컬러 세트 보완 + 노드 색상 다크모드 대응. 현재 기본 다크모드는 동작하지만 노드 배경색이 light 전용.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/constants/colors.ts` | `NODE_BG_COLORS` 다크모드 버전 추가 (opacity 0.20) |
| `ontology/src/features/ontology/components/ClassNode.tsx` | 테마 인식 배경색 적용 |
| `ontology/src/features/ontology/components/InstanceNode.tsx` | 동일 |
| `ontology/src/app/globals.css` | PRD 6.15 디자인 토큰 추가 (ai-suggestion-bg, progress-fill, focus-ring-color) |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | MiniMap maskColor 다크모드 대응 |

### 색상 변환 전략
```typescript
// colors.ts — 다크모드 배경 추가
export const NODE_BG_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root: 'rgba(124,58,237,0.20)',
  mid: 'rgba(37,99,235,0.20)',
  leaf: 'rgba(8,145,178,0.20)',
  instance: 'rgba(134,239,172,0.15)',
  person: 'rgba(217,119,6,0.20)',
  place: 'rgba(220,38,38,0.20)',
  event: 'rgba(219,39,119,0.20)',
};

// 다크모드 테두리
export const NODE_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root: '#8b5cf6',
  mid: '#3b82f6',
  leaf: '#06b6d4',
  instance: '#4ade80',
  person: '#f59e0b',
  place: '#ef4444',
  event: '#ec4899',
};
```

### 기술적 리스크
- **중간**: ClassNode/InstanceNode에서 현재 테마를 감지하는 방법 — `next-themes`의 `useTheme` 훅 또는 CSS 변수 기반 접근 중 택 1.
- CSS 변수 접근이 더 성능 효율적 (리렌더 없음). 단, React Flow 노드에서 CSS 변수 접근 방법 검토 필요.

---

## 12. F2-11: 대량 임포트 진행률

### 설명
NewNodePopover에서 대량 텍스트/CSV 입력 시 LLM 구조화 진행률을 단계별로 표시. Phase 전환: input → loading → preview.

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/components/NewNodePopover.tsx` | loading phase 추가 (input → loading → preview 3단계) |

### 신규 파일
| 파일 | 내용 |
|------|------|
| `ontology/src/features/ontology/components/new-node/LoadingPhase.tsx` | 진행률 바 + 단계 체크리스트 + 취소 버튼 |

### 단계 표시
```typescript
const PARSE_STEPS = [
  { key: 'tokenize', label: '텍스트 파싱 완료' },
  { key: 'extract', label: '엔티티 추출' },
  { key: 'relations', label: '관계 추론 중' },
  { key: 'match', label: '기존 온톨로지와 매칭' },
  { key: 'optimize', label: '계층 구조 최적화' },
];
```

### 인터랙션 규칙
- 소량 입력 (100자 미만): 진행률 건너뛰고 바로 preview
- [취소]: `AbortController` → LLM fetch abort → input phase 복귀
- 진행률: LLM API가 스트리밍을 지원하지 않으므로 시뮬레이션 (시간 기반 또는 indeterminate)

### 기술적 리스크
- **중간**: 실제 단계별 진행률을 정확히 표시하기 어려움 (LLM API는 단일 응답). 시뮬레이션으로 처리하되 UX를 해치지 않도록 주의.
- `AbortController`로 진행 중인 fetch를 중단하는 것은 브라우저에서 잘 동작하나, 서버 사이드 LLM 호출은 계속 진행될 수 있음 (비용 이슈는 미미).

---

## 13. F2-12: Level of Detail (줌 기반 노드 간소화)

### 설명
줌 레벨에 따라 노드 렌더링을 3단계로 분기: full (100%+), name (50~99%), dot (50% 미만).

### 영향받는 파일
| 파일 | 변경 내용 |
|------|----------|
| `ontology/src/features/ontology/components/ClassNode.tsx` | 줌 레벨 감지 → 3단계 렌더링 분기 |
| `ontology/src/features/ontology/components/InstanceNode.tsx` | 동일 |
| `ontology/src/features/ontology/components/GraphCanvas.tsx` | 엣지 라벨 줌 레벨별 표시/숨김 |

### 구현
```typescript
// ClassNode.tsx 내부
import { useStore } from '@xyflow/react';

function ClassNodeComponent({ id, data, selected }: NodeProps<ClassNodeType>) {
  const zoom = useStore((s) => s.transform[2]);
  const detail = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';

  if (detail === 'dot') {
    return (
      <div
        className="rounded-full transition-opacity duration-150"
        style={{ width: 10, height: 10, backgroundColor: NODE_COLORS[colorKey] }}
      />
    );
  }

  if (detail === 'name') {
    return (
      <div className="rounded-full flex items-center justify-center transition-opacity duration-150"
        style={{ width: size * 0.8, height: size * 0.8, border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}>
        <span className="text-[10px] font-semibold truncate max-w-[60px]">{data.label}</span>
      </div>
    );
  }

  // detail === 'full' → 기존 렌더링
  return ( ... );
}
```

### 기술적 리스크
- **낮음**: React Flow의 `useStore` 훅으로 줌 레벨 접근 가능. 단, 줌 변경마다 모든 노드가 리렌더되므로 `memo` + 줌 레벨 구간화(threshold)로 최적화 필요.
- 구간이 바뀔 때만 리렌더: `useMemo(() => zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot', [zoom >= 1, zoom >= 0.5])`

---

## 14. 전체 신규 파일 목록 (요약)

| 경로 | 기능 |
|------|------|
| `ontology/src/lib/neo4j/driver.ts` | F2-1: Neo4j 드라이버 싱글톤 |
| `ontology/src/lib/neo4j/cypher-builder.ts` | F2-1: Cypher 변환 엔진 |
| `ontology/src/lib/error-handler.ts` | F2-9: 통합 에러 핸들러 |
| `ontology/src/app/api/neo4j/push/route.ts` | F2-1: 푸시 API |
| `ontology/src/app/api/neo4j/rollback/route.ts` | F2-3: 롤백 API |
| `ontology/src/app/api/neo4j/status/route.ts` | F2-1: 상태 확인 API |
| `ontology/src/features/ontology/components/NeoConfirmSheet.tsx` | F2-2: 푸시 확인 Sheet |
| `ontology/src/features/ontology/components/neo4j/PushSummary.tsx` | F2-2: 변경 요약 |
| `ontology/src/features/ontology/components/neo4j/CypherPreview.tsx` | F2-2: Cypher 미리보기 |
| `ontology/src/features/ontology/components/neo4j/PushProgress.tsx` | F2-2: 진행률 |
| `ontology/src/features/ontology/components/neo4j/PushResult.tsx` | F2-2: 결과 표시 |
| `ontology/src/features/ontology/hooks/useNeo4jPush.ts` | F2-2: 푸시 상태 훅 |
| `ontology/src/features/ontology/components/empty-state/EmptyState.tsx` | F2-4: Empty State |
| `ontology/src/features/ontology/components/empty-state/TemplatePopover.tsx` | F2-4: 템플릿 선택 |
| `ontology/src/features/ontology/constants/sample-ontology.ts` | F2-4: 예시 데이터 |
| `ontology/src/features/ontology/components/skeletons/ExplorerSkeleton.tsx` | F2-7: Explorer 스켈레톤 |
| `ontology/src/features/ontology/components/skeletons/CanvasSkeleton.tsx` | F2-7: Canvas 스켈레톤 |
| `ontology/src/features/ontology/components/skeletons/RightPanelSkeleton.tsx` | F2-7: RightPanel 스켈레톤 |
| `ontology/src/features/ontology/components/new-node/LoadingPhase.tsx` | F2-11: 임포트 진행률 |
| `supabase/migrations/20260322100001_add_neo4j_push_tracking.sql` | DB 마이그레이션 |

---

## 15. 신규 의존성 요약

| 패키지 | 용도 | 설치 위치 |
|--------|------|----------|
| `neo4j-driver` | Neo4j Cypher 실행 (서버사이드) | dependencies |
| `sonner` | 토스트 알림 (radix-toast 대체) | dependencies |

```bash
cd ontology && npm install neo4j-driver sonner
```

---

## 16. 주요 기술적 리스크 요약

| 리스크 | 심각도 | 대안 |
|--------|--------|------|
| Cypher 변환 정확성 | 높음 | 단위 테스트 필수. PRD의 Cypher 예시 기반으로 테스트 케이스 작성 |
| before_snapshot 불완전 | 높음 | Change 생성 시점에 스냅샷 강제 기록하도록 스토어 리팩터링 |
| 진행률 실시간 표시 | 중간 | SSE 대신 단일 트랜잭션 실행 + 시뮬레이션 진행률 |
| 다크모드 노드 색상 | 중간 | CSS 변수 접근 vs useTheme 훅 — CSS 변수 권장 |
| Neo4j 서버 부재 시 | 중간 | status API로 사전 확인 + graceful fallback |
| 줌 레벨별 리렌더 성능 | 낮음 | memo + 줌 구간 threshold로 최적화 |

---

## 17. CommitBar 구조 변경 상세

현재 CommitBar 문제:
1. 커밋 버튼이 "Neo4j 푸시"로 표시되어 있으나 실제로는 Supabase 커밋만 수행
2. 커밋과 푸시가 구분되지 않음

변경 후:
```
┌──────────────────────────────────────────────────────────────────────┐
│  ● 변경사항 7건   +5 class · +2 rel   [되돌리기] [변경 내역] [커밋] [Neo4j 푸시] │
└──────────────────────────────────────────────────────────────────────┘
```

- **[커밋]**: emerald 배경, Supabase에 스냅샷 저장 (기존 handleCommit 로직)
- **[Neo4j 푸시]**: primary 배경, NeoConfirmSheet 열기 (미푸시 커밋이 있을 때만 활성)
- 커밋 없이 푸시 불가 (비활성 상태 + 툴팁: "먼저 커밋해주세요")
