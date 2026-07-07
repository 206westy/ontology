# PRD-Perf: 클라이언트 성능 종합 개선 (Client Performance Remediation)

> 상태: 진행전 · 작성 2026-07-07
> 근거: 3관점 병렬 코드베이스 감사(performance-optimizer / react-reviewer / database-reviewer) 결과 종합.
> 관련 문서: `진행중/perf-roundtrip-notes.md`(DB 왕복 측정·분석 — 이 PRD가 상위 통합), `완료/embedding-policy.md`(임베딩 정책), `완료/neo4j-schema.md`.
> 원칙: **비즈니스 로직·기능 동작은 불변.** 모든 항목은 "같은 결과를 더 적은 데이터·더 적은 재계산·더 작은 번들로" 달성한다.

---

## 1. 배경 / 문제

"클라이언트가 전체적으로 느리고 불편하다"는 체감의 근원은 **세 축이 곱해지는 구조**다.

- **축 A — 데이터 과적재**: 그래프를 열 때마다 온톨로지 전체를 1536차원 임베딩 벡터까지 포함해 무제한(LIMIT 없이) 클라이언트로 전송한다. 클라이언트는 벡터를 렌더에 전혀 쓰지 않는데도 파싱·GC한다.
- **축 B — 상호작용 캐스케이드**: 편집·드래그·클릭·타이핑 하나가 언두 스냅샷 + 그래프 재빌드 + 헬스/연결성 전체 순회 + 전 트리 리렌더를 **같은 프레임에** 유발한다.
- **축 C — 번들 과적재**: 그 모든 걸 그리는 Cytoscape·레이아웃 4종·motion이 코드 스플리팅 없이 초기 번들에 실리고, `'use client'` 전면화로 RSC 이점이 0이다.

### 무혐의 (감사로 확인 — 헛다리 방지)
- `n3`/`jsonld`(RDF), `ai`/`@ai-sdk`, `neo4j-driver`는 전부 서버(`app/api/**`)에만 존재 → 클라이언트 번들에 없음.
- `@tiptap/*`는 `package.json`에 있으나 `src/` 사용처 0건 → 죽은 의존성(번들엔 없으나 설치 용량만 차지).
- Neo4j push는 `UNION ALL` 단일 왕복, reconcile은 `Promise.all`+컬럼 최소화, 드라이버 싱글턴+세션 finally-close, dedup/RAG는 HNSW+`pg_trgm` 인덱스에 `LIMIT k` → 이미 최적. **건드리지 않는다.**

### 임베딩에 대한 재확인 (사용자 지적 반영)
- **계산(compute)은 이미 증분식이다.** `POST /api/embeddings/process` 워커가 `WHERE embedding IS NULL`인 노드만 배치로 채우고, 쓰기 경로는 name/description이 바뀔 때만 `embedding: null`로 무효화해 재큐잉한다. **온톨로지 전체를 매번 재임베딩하지 않는다.**
- 따라서 임베딩 관련 개선은 두 가지로 좁혀진다: **(a) 벡터를 클라이언트로 절대 보내지 않기(축 A)**, **(b) 내용이 실제로 안 바뀌면 재임베딩도 하지 않기(불필요 무효화 차단·비용 절감)**. 임베딩은 서버 전용 벡터 검색 자산이며 UI 데이터가 아니다.

---

## 2. 목표 / 비목표

### 목표 (측정 가능)
- G1. 그래프 초기 로드 응답 페이로드에서 임베딩 벡터 100% 제거 → 목록 응답 크기 대폭 감소.
- G2. 노드 드래그/편집 1회가 유발하는 전체-그래프-규모 동기 연산을 프레임에서 분리(입력 응답성 확보).
- G3. 탐색기 트리 클릭 1회의 리렌더 범위를 "전 행"에서 "관련 행"으로 축소.
- G4. `/` 라우트 first-load JS에서 그래프 엔진(cytoscape+레이아웃 4종)·motion을 지연 로드로 분리.
- G5. 윈도우 포커스 복귀 시 전체 온톨로지 재요청 제거.
- G6. 내용 미변경 시 재임베딩(OpenAI 호출) 0회 — 콘텐트 해시 가드.

### 비목표
- 기능 추가/변경, UI 카피 변경, 그래프 시각 언어 변경 없음.
- 임베딩 모델·차원·정책 변경 없음(`embedding-policy.md` 유지).
- 상태관리 라이브러리 교체 없음.
- `'use client'` 전면 정책 변경은 **M4(옵션·승인 게이트)**로 분리 — 기본 범위 밖.

---

## 3. 보고서 항목 ↔ 마일스톤 매핑 (전 항목 커버)

| 보고서# | 심각도 | 항목 | 마일스톤 |
|---|---|---|---|
| #1 | CRITICAL | 임베딩 벡터가 목록 응답에 실림 | **M0** |
| #6 | HIGH/MED | 포커스마다 온톨로지 전량 재요청 | **M0** |
| #7 | MEDIUM | 커밋 히스토리 무제한 + 스냅샷 동반 | **M0** |
| #4 | HIGH | 탐색기 트리 클릭 = 전 행 리렌더 | **M1** |
| #3 | HIGH | 드래그/편집 캐스케이드(zundo+재빌드+배지) | **M1** |
| #8 | MEDIUM | 검색 디바운스 없음 | **M1** |
| #9 | MEDIUM | syncCytoscape 전 요소 교체 / GraphCanvas 매 렌더 Map | **M1** |
| #10 | MEDIUM | height:auto 레이아웃 애니메이션 | **M1** |
| #2 | CRITICAL/HIGH | 코드 스플리팅 전무(그래프 엔진 초기 번들) | **M2** |
| #12 | MEDIUM | motion 첫 화면 정적 import | **M2** |
| #13 | MEDIUM | next.config 성능설정 전무 + 죽은 의존성 | **M2** |
| #5 | HIGH | 그래프 전체 인스턴스·엣지 무제한 로드 | **M3** |
| (임베딩) | — | 콘텐트 해시 재임베딩 가드 + 서버 전용 명문화 | **M3** |
| #11 | HIGH(구조) | `'use client'` 전면화 → RSC 이점 0 | **M4(옵션)** |

---

## 4. 미러링할 기존 패턴 (재발명 금지)

| 범주 | 출처 | 패턴 |
|---|---|---|
| 컬럼 최소화 조회 | `ontology/src/lib/neo4j/reconcile.ts:102-118` | `columns: { id: true }` 등 필요한 컬럼만 select — M0의 모범사례 |
| 페이지네이션 인프라 | `ontology/src/lib/pagination.ts` (`parsePagination`, `MAX_PAGE_LIMIT`) | 이미 존재. 호출부에서 `limit` 전달만 하면 됨 |
| zundo 히스토리 우회 | `ontology/src/features/ontology/store/index.ts:46-54` (`clearChangesWithoutHistory`의 `temporal.pause()/resume()`) | 위치 전용 쓰기에 재사용 |
| zustand 얕은 구독 | `ontology/src/features/ontology/components/RightPanel.tsx` (`useShallow` 사용) | TreeItem 구독 좁히기의 참고 |
| 디바운스 훅 | `react-use`의 `useDebounce` (이미 의존성에 존재) | 검색 입력 디바운스 |
| 벡터 인덱스 | `supabase/migrations/20260623012033_e_p2_embedding_indexes.sql` (HNSW cosine + pg_trgm GIN) | 임베딩=서버 전용 검색 자산 근거 |

---

## 5. 마일스톤

### M0 — 데이터 슬림화 (위험 0, 즉효) 🟢
클라이언트로 나가는 데이터에서 안 쓰는 것을 제거. 응답 계약(필드 형태)은 유지하되 무의미 데이터만 뺀다.

**Task M0-1 — 목록/상세 응답에서 embedding 컬럼 제외 (#1)**
- 대상: `ontology/src/app/api/classes/route.ts:24`, `ontology/src/app/api/instances/route.ts:16`, 각 `[id]/route.ts` 조회부, `ontology/src/app/api/export/route.ts:39-53`.
- 방법: Drizzle `findMany`/`select`에 `columns: { embedding: false }`(중첩 `with: { children: { columns: { embedding: false } } }` 포함). embedding은 dedup/RAG/push 서버 경로에서만 소비되므로 UI 동작 불변.
- 미러: `reconcile.ts:102-118`.
- 검증: 목록 API 응답에 `embedding` 키 부재(단위 테스트 + 실제 응답 크기 before/after 비교).

**Task M0-2 — 무거운 로드 쿼리 포커스 재요청 차단 (#6)**
- 대상: `ontology/src/app/providers.tsx:13-23`(QueryClient defaults) 및/또는 `useLoadOntology`의 쿼리 옵션, `CommitBar.tsx:60`.
- 방법: 온톨로지 로드 계열 쿼리에 `refetchOnWindowFocus: false`. 갱신은 `useApiSync`의 명시적 invalidate가 담당하므로 정합 손실 없음.
- 검증: 창 포커스 전환 시 네트워크 탭에 재요청 없음.

**Task M0-3 — 커밋 히스토리 페이지네이션 + 스냅샷 지연 (#7)**
- 대상: `ontology/src/app/api/commits/route.ts:29-35`, `ontology/src/features/ontology/hooks/useCommits.ts`.
- 방법: GET에 `limit/offset`(기본 최근 50) + 커서(`WHERE created_at < $cursor`). 목록 조회는 `columns`로 `beforeSnapshot/afterSnapshot` 제외, 상세 펼침 시에만 조회. 정렬(desc) 유지.
- 검증: 커밋 수 증가와 무관하게 히스토리 응답 크기 상수 유지.

---

### M1 — 상호작용 캐스케이드 차단 (체감 렉의 핵심) 🟡
편집·드래그·클릭·타이핑이 전체-그래프-규모 연산·리렌더를 유발하지 않게 국소화.

**Task M1-1 — 탐색기 TreeItem 구독 좁히기 + memo (#4)**
- 대상: `ontology/src/features/ontology/components/ExplorerPanel.tsx:99-104`.
- 방법: `selectedNodeId`/`expandedNodes` Set 전체 구독 → 불리언 파생 구독(`s.selectedNodeId === item.id`, `s.expandedNodes.has(item.id)`). `TreeItem`을 `React.memo`로 감쌈. 렌더 결과 동일.
- 미러: `RightPanel.tsx`의 `useShallow`.
- 검증: React DevTools Profiler로 클릭 시 리렌더 행 수 급감.

**Task M1-2 — 드래그 위치 쓰기를 히스토리·재빌드에서 분리 (#3)**
- 대상: `useCytoscape.ts:242`(`dragfree`→`updateClass(positionX/Y)`), `store/entity-slice.ts:102-117`, `store/index.ts:27-37`(partialize), `useCytoscape.ts:307-346`(데이터 싱크 effect).
- 방법: 위치 전용 쓰기를 `temporal.pause()/resume()`로 감싸 언두 히스토리에서 제외(위치 undo는 의미 없음). 위치 변경이 그래프 재빌드 effect deps를 흔들지 않도록 좌표는 cytoscape에 직접 반영(요소 재생성 회피). undo 의미론 불변.
- 미러: `store/index.ts:46-54`.
- 검증: 노드 드래그 시 zundo 스냅샷 미증가 + `buildElements` 재호출 없음(로그/프로파일).

**Task M1-3 — 헬스/연결성 배지 지연 계산 (#3 종속)**
- 대상: `HealthScoreBadge.tsx:24-27`(`computeHealth`), `LifecycleIndicator.tsx:90-99`(`analyzeConnectivity`).
- 방법: `useDeferredValue` 또는 짧은 디바운스로 편집 중 지연 계산. 값 동일, 갱신만 지연.
- 검증: 편집 프레임에서 전체 순회가 입력을 막지 않음.

**Task M1-4 — 검색 디바운스 (#8)**
- 대상: `ExplorerPanel.tsx:247,292`.
- 방법: `react-use`의 `useDebounce`로 `filterTree` 입력만 지연. 입력창은 즉시 반응(controlled). 결과 동일.
- 검증: 큰 트리 타이핑 시 프레임 드랍 감소.

**Task M1-5 — syncCytoscape keep-diff + GraphCanvas 메모 (#9)**
- 대상: `to-cytoscape-elements.ts:233-238`(전 요소 data 교체), `GraphCanvas.tsx:86-94`(매 렌더 `new Map`).
- 방법: `diffElementIds`의 `keep` 요소는 실제 변경 필드만 얕은 비교 후 갱신. `GraphCanvas`의 `workspaceEmpty`/`classPartition` 계산을 `useMemo`로. 순수함수 출력 동일.
- 검증: 노드 1개 추가 시 변경 없는 요소 스타일 무효화 없음.

**Task M1-6 — 트리 펼침 애니메이션 컴포지터화 (#10)**
- 대상: `ExplorerPanel.tsx:186-190`(`animate={{ height: 'auto' }}`).
- 방법: `transform: scaleY`/`opacity`/`clip-path` 또는 CSS grid-rows로 대체. 프로젝트 규칙(`rules/web/performance.md`) 준수. 시각 결과 유지.
- 검증: 펼침/접힘 시 reflow 미발생(Performance 트레이스).

---

### M2 — 번들 슬림화 (초기 로딩) 🟡
first-load JS에서 무거운 것을 지연 로드로 분리.

**Task M2-1 — GraphCanvas + 레이아웃 동적 import (#2)**
- 대상: `page.tsx:8`, `GraphCanvas.tsx:21`, `useCytoscape.ts:4`, `fcose-layout.ts:7-11`.
- 방법: `GraphCanvas`를 `next/dynamic(() => import(...), { ssr: false, loading: Skeleton })`. 레이아웃 확장(cola/dagre/fcose/edgehandles) 등록을 `registerCytoscapeExtensions()` 내부에서 `await import(...)`로 전환(이미 함수로 감싸져 있어 시그니처 불변, 내부만 async화).
- 검증: `@next/bundle-analyzer`로 `/` first-load JS에서 cytoscape 청크 분리 확인.

**Task M2-2 — motion 첫 화면 분리 (#12)**
- 대상: `SplashScreen.tsx:4`(+ 팝오버 9곳: EmptyState/ExplorerPanel/NewNodePopover/OnboardingGuide/HierarchyPopover/RelationPopover/AutocompleteSuggestions/CypherPreview/NeoConfirmSheet).
- 방법: SplashScreen 진입 애니메이션을 CSS transition으로 대체(첫 페인트를 motion 파싱과 분리). 나머지는 `LazyMotion`+`m` 컴포넌트로 코어만 로드. 시각 결과 유지.
- 검증: first-paint blocking 컴포넌트에서 motion 의존 제거 확인.

**Task M2-3 — next.config 최적화 + 죽은 의존성 제거 (#13)**
- 대상: `ontology/next.config.ts`, `package.json`(`@tiptap/*`).
- 방법: `experimental.optimizePackageImports: ['lucide-react','es-toolkit','date-fns', ...@radix-ui/*]` 추가, `@next/bundle-analyzer` 도입(회귀 감지). `src/` 미사용 확인된 `@tiptap/*` 3종 제거(빌드 그린 확인 후).
- 검증: 빌드 성공 + 애널라이저 리포트 생성 + `npm ls @tiptap/react` 부재.

---

### M3 — 임베딩 라이프사이클 정합 + 인스턴스 지연 로드 🟡
임베딩을 "서버 전용 벡터 자산"으로 명문화하고, 불필요 재계산과 대량 초기 로드를 제거.

**Task M3-1 — 콘텐트 해시 재임베딩 가드 (임베딩 (b))**
- 대상: `classes/[id]/route.ts:57`(및 instances 대응부)의 `invalidateEmbedding` 로직, `embeddings/process/route.ts`.
- 방법: 임베딩 텍스트(`buildEmbeddingText` = name+description)의 해시를 저장(예: `embedding_source_hash` 컬럼 추가, 마이그레이션 1종). 쓰기 시 해시 불변이면 `embedding: null` 무효화를 **건너뜀** → 텍스트가 실제로 안 바뀌면 OpenAI 호출 0회. 워커는 기존대로 `IS NULL`만 처리.
- 미러: `embedding-policy.md`의 단일 정책(모델·차원 불변).
- 검증: name/description 외 필드(예: 위치)만 바꾼 저장에서 재임베딩 미발생. 텍스트 변경 시에만 재큐잉.

**Task M3-2 — 임베딩 서버 전용 명문화 (임베딩 (a) 보강)**
- 방법: `embedding.ts` 및 라우트에 서버 전용 주석/경계 확인, 클라이언트 타입에서 `embedding` 필드 제거(선택). M0-1과 함께 "벡터는 API 계약에 안 나간다"를 코드·타입으로 못박음.
- 검증: 클라이언트 번들·타입에 `embedding: number[]` 노출 없음.

**Task M3-3 — 인스턴스 지연 로드 (#5, M0 이후 선택)**
- 대상: `ontology/src/features/ontology/hooks/useLoadOntology.ts:30-47`.
- 방법: 초기 렌더는 클래스/스키마 계층으로, 인스턴스는 선택 클래스/뷰포트 기준 지연 로드(`instancesApi.list(classId)` 이미 존재). all-or-nothing 게이트 완화. M0-1 적용으로 페이로드가 이미 급감하므로 **효과 재측정 후 필요 시에만** 착수.
- 검증: 대량 인스턴스 온톨로지에서 초기 렌더 시점이 인스턴스 수와 디커플.

---

### M4 — RSC 부분 도입 (옵션 · 승인 게이트) 🔴
**주의: CLAUDE.md "모든 컴포넌트 `'use client'`" 규칙과 충돌.** 진행하려면 규칙 예외 승인 필요.

**Task M4-1 — 무상태 표시 컴포넌트 서버화 (#11)**
- 대상: 상태·이벤트 없는 순수 프레젠테이션 컴포넌트(예: `GraphLegend`, 정적 배지/아이콘 표시, `SplashScreen` 마크업 등).
- 방법: 해당 컴포넌트에서 `'use client'` 제거만으로 서버 컴포넌트화(마크업·로직 불변).
- 게이트: 정량 근거(305파일 중 118개 client) 첨부해 사용자 승인 후 착수. 미승인 시 M4 전체 보류.

---

## 6. 검증 (프로젝트 명령)

```bash
# 앱 루트: ontology/ontology/ontology
npm run lint
npm run test        # vitest — 기존 스위트 회귀 0 확인 (655+ 테스트)
npm run build       # 프로덕션 빌드 그린
# 번들 분석 (M2 이후)
ANALYZE=true npm run build   # @next/bundle-analyzer 리포트
```

성능 실측(수용 판정용): Chrome DevTools Performance 트레이스 + Lighthouse로 M0/M1/M2 전후 비교(초기 로드 응답 크기, 드래그/클릭 INP, first-load JS).

---

## 7. 리스크

| 리스크 | 가능성 | 완화 |
|---|---|---|
| embedding 컬럼 제외가 dedup/RAG/push 서버 경로를 깨뜨림 | 낮음 | 해당 경로는 별도 조회(embedding 명시 select) — 목록 라우트만 변경. 테스트로 push/reconcile 회귀 확인 |
| zundo 위치 분리가 undo 동작을 바꿈 | 중 | 위치 undo는 원래 의미 없음. 기존 `pause/resume` 패턴 재사용 + undo/redo E2E로 검증 |
| dynamic import로 그래프 첫 표시 지연/깜빡임 | 중 | Skeleton `loading` 제공 + `ssr:false`로 하이드레이션 불일치 방지 |
| next.config `optimizePackageImports`가 특정 배럴에서 빌드 이슈 | 낮음 | 패키지별 점진 추가 + 빌드 그린 확인 후 커밋 |
| 콘텐트 해시 마이그레이션이 기존 행과 불일치 | 낮음 | 신규 컬럼 nullable, 최초엔 해시 없음→기존 무효화 로직 유지, 이후 저장부터 해시 채움 |
| M4가 프로젝트 규칙 위반 | 확실 | 기본 범위에서 분리·승인 게이트. 미승인 시 스킵 |

---

## 8. 착수 순서 (효과 대비 안전성)

1. **M0 전체** (위험 0, 최대 즉효): M0-1 → M0-2 → M0-3.
2. **M1-1 + M1-2** (체감 렉 근원): 트리 구독 좁히기 → 드래그 캐스케이드 분리.
3. **M2-1 + M2-2** (초기 로딩): 그래프 dynamic import → motion 분리.
4. **M1 나머지**(M1-3~6) + **M2-3**.
5. **M3** (임베딩 가드 + 재측정 후 인스턴스 지연 로드).
6. **M4** (승인 시에만).

각 마일스톤 종료마다 `npm run lint && npm run test && npm run build` 그린 + 실측 전후 비교. M0 완료 후 실측 결과에 따라 M3-3(#5) 착수 여부 재판단.

---

## 9. 수용 기준 (Acceptance)

- [ ] M0: 목록/상세/export 응답에 `embedding` 부재. 포커스 재요청 없음. 커밋 히스토리 응답 크기 상수화.
- [ ] M1: 트리 클릭 리렌더 국소화, 드래그 시 zundo 스냅샷·그래프 재빌드 미발생, 배지 지연 계산, 검색 디바운스, height 애니메이션 컴포지터화.
- [ ] M2: `/` first-load JS에서 cytoscape·motion 분리, next.config 최적화 적용, 죽은 `@tiptap/*` 제거.
- [ ] M3: 텍스트 미변경 저장에서 재임베딩 0회, 임베딩 서버 전용 경계 확립.
- [ ] 전 구간: 기존 테스트 회귀 0, 빌드 그린, 기능 동작·UI 카피 불변.
- [ ] 실측: 초기 로드 응답 크기·드래그/클릭 INP·first-load JS 개선 수치 기록.

---

## 10. 참조 파일 (절대경로 기준 상대)

- 데이터: `ontology/src/app/api/classes/route.ts`, `.../instances/route.ts`, `.../commits/route.ts`, `.../export/route.ts`, `ontology/src/features/ontology/hooks/useLoadOntology.ts`, `ontology/src/app/providers.tsx`, `ontology/src/lib/pagination.ts`, `ontology/src/lib/neo4j/reconcile.ts`
- 상호작용: `ontology/src/features/ontology/components/ExplorerPanel.tsx`, `.../HealthScoreBadge.tsx`, `.../LifecycleIndicator.tsx`, `.../GraphCanvas.tsx`, `.../CommitBar.tsx`, `ontology/src/features/ontology/hooks/useCytoscape.ts`, `ontology/src/features/ontology/store/index.ts`, `.../store/entity-slice.ts`, `ontology/src/features/ontology/lib/to-cytoscape-elements.ts`, `.../lib/fcose-layout.ts`
- 번들: `ontology/src/app/page.tsx`, `.../components/SplashScreen.tsx`, `ontology/next.config.ts`, `ontology/package.json`
- 임베딩: `ontology/src/features/ontology/lib/embedding.ts`, `ontology/src/app/api/embeddings/process/route.ts`, `ontology/src/app/api/classes/[id]/route.ts`, `ontology/src/lib/drizzle/schema.ts`
