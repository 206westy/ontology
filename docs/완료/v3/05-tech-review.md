# 테크리더 — 기술스택 검토 및 추천 보고서

> **작성일**: 2026-03-22
> **작성자**: 테크리더 (v3 기획단)
> **역할**: 비판적 옹호자 — 모든 제안의 기술적 실현 가능성, 비용, 리스크를 검증

---

## 1. 현재 기술스택 감사

### 1.1 의존성 현황 (버전, 최신 여부)

| 패키지 | 현재 버전 | 최신 버전 | 상태 | 비고 |
|--------|-----------|-----------|------|------|
| `next` | 15.1.0 | 16.2.1 | **2 메이저 뒤** | Next.js 16은 React 19 완전 지원, `serverExternalPackages` 안정화 |
| `react` / `react-dom` | 19.0.0 | 19.x | 최신 | OK |
| `@xyflow/react` | 12.10.1 | 12.x | 최신 | React Flow v12, 성능 최적화 포함 |
| `zustand` | 4.5.7 | **5.0.12** | **1 메이저 뒤** | v5: default export 제거, React 18+ 필수, 타입 강화 |
| `zundo` | 2.3.0 | 2.x | 최신 | zustand v5 호환 확인 필요 |
| `framer-motion` | 11.18.2 | **12.38.0** | **1 메이저 뒤** | `motion`으로 리브랜딩, 하이브리드 엔진(GPU 가속) |
| `@tanstack/react-query` | 5.91.3 | 5.94.5 | 마이너 뒤 | 자동 업데이트 범위 내 |
| `@supabase/ssr` | 0.5.2 | **0.9.0** | **뒤처짐** | 보안/인증 패치 포함 가능 |
| `@hookform/resolvers` | 4.1.3 | **5.2.2** | **1 메이저 뒤** | v5 마이그레이션 필요 |
| `zod` | 3.25.76 | **4.3.6** | **1 메이저 뒤** | Zod 4: 성능 개선, Standard Schema 지원 |
| `tailwindcss` | 3.4.19 | **4.2.2** | **1 메이저 뒤** | v4: CSS-first config, Oxide 엔진, 빌드 속도 대폭 개선 |
| `tailwind-merge` | 2.6.1 | **3.5.0** | **1 메이저 뒤** | Tailwind v4 호환 |
| `lucide-react` | 0.469.0 | 0.577.0 | 뒤처짐 | 마이너 업데이트, 신규 아이콘 포함 |
| `eslint` | 9.39.4 | **10.1.0** | 1 메이저 뒤 | 점진적 업그레이드 가능 |
| `openai` | 6.32.0 | 6.x | 최신 | OK |
| `neo4j-driver` | 6.0.1 | 6.x | 최신 | OK |
| `drizzle-orm` | 0.45.1 | 0.45.x | 최신 | OK |
| `vitest` | 4.1.0 | 4.x | 최신 | OK |
| `@playwright/test` | 1.58.2 | 1.x | 최신 | OK |

**요약**: 6개 메이저 업그레이드 필요 (zustand, framer-motion, zod, tailwindcss, tailwind-merge, @hookform/resolvers). Next.js 16도 고려 대상이나 15.1 → 15.x 최신 패치 우선 권장.

### 1.2 미사용 / 불필요 의존성

| 패키지 | 상태 | 근거 |
|--------|------|------|
| `axios` | **미사용 — 즉시 제거** | `src/` 전체에서 import 0건. 모든 API 호출이 native `fetch` 사용 |
| `react-use` | **미사용 — 즉시 제거** | `src/` 전체에서 import 0건. 커스텀 훅 또는 React 19 내장 기능으로 대체됨 |
| `server-only` | 확인 필요 | 패키지 자체는 0.0.1 (마커 패키지), 실사용 여부 확인 필요 |
| `autoprefixer` | Tailwind v4 전환 시 제거 가능 | Tailwind v4는 PostCSS autoprefixer 내장 |

**번들 절감 예상**: axios (~13KB gzip) + react-use (~잔여 tree-shake 불가 부분) 제거로 즉시 절감 가능.

### 1.3 보안 이슈

| 취약점 | 심각도 | 경로 | 해결 방법 |
|--------|--------|------|-----------|
| `esbuild` (CVE) | moderate | `drizzle-kit` → `@esbuild-kit/core-utils` → `esbuild` | `drizzle-kit` 업데이트 (devDependency이므로 프로덕션 영향 없음) |
| RLS 미설정 | **경고** | 모든 Supabase 테이블 RLS OFF | MVP 단계이나, 멀티유저 전환 시 반드시 활성화 필요 |

---

## 2. 아키텍처 검토

### 2.1 상태 관리 패턴

**현재**: Zustand 단일 스토어 + zundo undo/redo + React Query 캐시

**평가**:
- **장점**: 낙관적 UI + 서버 동기화 패턴이 잘 구현됨. `useApiSync`로 Zustand→API 단방향 동기화.
- **문제점**:
  1. **단일 거대 스토어**: `useOntologyStore`에 모든 엔티티(classes, properties, instances, edges, axioms, commits, UI 상태)가 혼재. 스토어가 커지면 zundo의 스냅샷 크기도 비례 증가.
  2. **React Query 이중화**: `useClasses`, `useInstances` 등 React Query 훅이 존재하나, 실제 데이터 소스는 Zustand. React Query가 초기 로딩에만 쓰이고 이후 방치됨 → 캐시 불일치 가능성.
  3. **zundo 스냅샷 비용**: 50단계 undo × 전체 스토어 딥카피 = 대규모 온톨로지에서 메모리 압박.

**v3 권장**:
- Zustand v5로 마이그레이션 (`create` → 새 API, `useShallow` 활용)
- 스토어 슬라이스 분리 검토 (entities / ui / history)
- zundo `partialize` 옵션으로 UI 상태 제외하여 스냅샷 경량화
- React Query는 서버 데이터 소스로 역할 명확화 (mutation + invalidation 패턴)

### 2.2 API 구조

**현재**: Next.js API Routes, 엔티티별 CRUD (14개 라우트)

**평가**:
- **장점**: RESTful 구조가 명확하고 직관적.
- **문제점**:
  1. **일괄 작업 미지원**: LLM 파싱 결과 확정 시 토폴로지 정렬 후 순차 fetch — N+1 요청 문제.
  2. **트랜잭션 없음**: 복합 작업(클래스 생성 + 프로퍼티 + 엣지)이 개별 요청으로 처리되어 부분 실패 가능.
  3. **Server Actions 미활용**: Next.js 15에서 안정화된 Server Actions를 사용하면 API Route 없이 서버 뮤테이션 가능.

**v3 권장**:
- 일괄 생성 API 추가 (`/api/batch` 또는 Server Action)
- LLM 확정 → 단일 트랜잭션으로 DB 반영
- 점진적으로 CRUD API Route → Server Actions 전환 검토 (단, SPA 구조에서는 API Route가 더 적합할 수 있음)

### 2.3 DB 연결 패턴

**현재**:
- Supabase: Drizzle ORM 경유 (postgres.js 드라이버)
- Neo4j: API Route 프록시 (`neo4j-driver` 서버사이드)

**평가**:
- **Drizzle + postgres.js**: 타입 안전, 경량. 좋은 선택.
- **Neo4j 프록시**: 합리적. 브라우저에서 직접 Neo4j 접근은 보안 위험.
- **개선점**:
  1. Neo4j 드라이버 연결 풀 관리 확인 필요 (API Route는 서버리스이므로 cold start 시 새 연결)
  2. Supabase Edge Functions 검토 — Neo4j 푸시처럼 오래 걸리는 작업은 Edge Function으로 분리하면 API Route 타임아웃 회피 가능
  3. `@supabase/ssr` 0.5.2 → 0.9.0 업데이트 시 인증 패턴 변경 확인 필요

---

## 3. 신규 라이브러리 추천

### 3.1 리치 텍스트 에디터

v3에서 AI 탭, 자유 입력, Description 편집 등에 리치 텍스트가 필요하다면:

| 라이브러리 | 장점 | 단점 | 추천도 |
|-----------|------|------|--------|
| **tiptap** | Headless ProseMirror 래퍼. AI Toolkit 확장(`@tiptap-pro/ai-toolkit`): `tiptapRead`, `tiptapEditWorkflow`로 AI 편집 스트리밍 가능. Yjs 기반 실시간 협업 확장. shadcn/ui와 스타일 호환 우수. | Pro 기능(AI Toolkit, Collaboration)은 유료. 무료 코어만으로도 충분히 강력. | **강력 추천** |
| Novel | tiptap 기반 + Tailwind + AI 완성. 즉시 사용 가능한 Notion 스타일. | 커스터마이징 제한. 프로젝트 유지보수 불확실. | 빠른 프로토타입용 |
| Plate | tiptap 대안, 플러그인 아키텍처. | 학습 곡선 높음, 커뮤니티 작음. | 비추천 |

**context7 조사 근거**: tiptap 공식 문서에서 `AiToolkit` 확장이 Vercel AI SDK의 `useObject`와 통합되어 스트리밍 AI 편집이 가능함을 확인. `@tiptap/extension-collaboration`이 Yjs 기반으로 실시간 협업을 지원하며, React 훅(`useEditor`, `EditorContent`)으로 쉽게 통합 가능.

**권장**: tiptap 무료 코어 (`@tiptap/react`, `@tiptap/starter-kit`) 도입. AI 기능은 Vercel AI SDK로 자체 구현하여 Pro 의존성 회피.

### 3.2 실시간 협업

| 라이브러리 | 장점 | 단점 | 추천도 |
|-----------|------|------|--------|
| **Yjs** | CRDT 기반 오프라인 지원, tiptap/React Flow 모두와 통합 가능. 무료 오픈소스. | 서버(y-websocket 또는 Hocuspocus) 직접 운영 필요 | 장기적 추천 |
| Liveblocks | 호스팅 서비스, React 훅 제공, Yjs 호환 | 유료, 벤더 종속 | MVP 후 검토 |
| PartyKit | Cloudflare Workers 기반, 저렴 | 아직 초기 단계 | 관망 |

**v3 권장**: 실시간 협업은 v3 MVP 범위에 포함하지 않는 것을 권장. 단일 사용자 기준으로 안정화 후 v4에서 Yjs 도입 검토. 다만 tiptap 에디터 도입 시 Yjs 호환 아키텍처를 미리 고려해두면 전환 비용 최소화.

### 3.3 애니메이션

**현재**: `framer-motion` v11

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Motion (framer-motion v12+)** | `framer-motion`에서 리브랜딩. 하이브리드 엔진: Web Animations API로 GPU 가속 + JS 폴백(스프링). Atomic updates로 대규모 요소 애니메이션 성능 향상. React 컴포넌트 API 유지. | 마이그레이션 필요 (`framer-motion` → `motion/react`) |
| CSS Transitions / Animations | 제로 번들. 단순 전환에 충분. | 스프링, 레이아웃 애니메이션 불가 |
| Motion One | 경량 (< 3KB). | React 통합 미약 |

**context7 조사 근거**: Motion(framer-motion 후속) 공식 리포에서 "atomic update strategy"로 렌더링 최적화를 확인. backgroundColor 같은 단일 속성 변경 시 불필요한 transform 문자열 재빌드를 방지하여 대규모 애니메이션에서 프레임 레이트 유지.

**권장**: `framer-motion` v11 → `motion` (v12) 마이그레이션. import 경로만 변경하면 대부분 호환. GPU 가속으로 그래프 노드 애니메이션(pulse, 전환) 성능 개선 기대.

### 3.4 AI SDK

**현재**: `openai` 패키지로 직접 API 호출 (서버 API Route에서)

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Vercel AI SDK** | `useChat`, `useObject` 훅으로 스트리밍 UI 즉시 구현. `streamText`, `streamObject`로 구조화된 출력 스트리밍. 다중 프로바이더 지원 (OpenAI, Anthropic, Google 등). Next.js 네이티브 통합. | 추가 의존성. 프로바이더 추상화가 과할 수 있음. |
| 직접 OpenAI 호출 (현재) | 의존성 최소. 완전한 제어. | 스트리밍 UI 직접 구현 필요. 프로바이더 전환 시 코드 변경 큼. |

**context7 조사 근거**: AI SDK 공식 문서에서 `useObject` 훅이 `streamObject`와 결합하여 Zod 스키마 기반 구조화된 데이터 스트리밍을 지원함을 확인. LLM 파싱 결과(클래스/프로퍼티/관계)를 실시간 스트리밍하여 프리뷰하는 데 이상적. `useChat` 훅은 AI 탭의 대화형 인터페이스에 즉시 적용 가능.

**강력 추천**: Vercel AI SDK (`ai` 패키지) 도입.
- `/api/llm/parse` → `streamObject` + Zod 스키마로 전환 → 프론트에서 `useObject`로 실시간 프리뷰
- AI 탭 → `useChat`으로 대화형 온톨로지 수정 구현
- 모델 전환(GPT → Claude → Gemini) 코드 1줄 변경

### 3.5 테스팅

**현재**: Vitest 4 + Testing Library + Playwright (설정만)

**평가**:
- Vitest + Testing Library: 적절한 선택. 유지.
- Playwright: `package.json`에 추가되어 있으나 실제 E2E 테스트 파일 존재 여부 미확인.

**v3 권장**:
- 컴포넌트 테스트: Vitest + Testing Library 유지
- E2E: Playwright로 핵심 플로우 테스트 작성 (노드 생성 → 편집 → 커밋 → Neo4j 푸시)
- 스토어 테스트: zustand v5 마이그레이션 후 테스트 업데이트
- **MSW (Mock Service Worker)** 추가 검토: API 모킹으로 컴포넌트 테스트 안정성 향상

---

## 4. 성능 최적화 방안

### 4.1 대규모 그래프 렌더링

**현재 문제**: 노드 수 증가 시 React Flow 렌더링 비용 증가.

**최적화 전략**:
1. **React Flow의 내장 최적화 활용**: "only re-rendering nodes that have changed" (context7 확인). 커스텀 노드에서 `React.memo` 확실히 적용.
2. **노드 가상화**: React Flow는 뷰포트 밖 노드를 기본적으로 렌더링하지 않음. `onlyRenderVisibleElements` 옵션 확인.
3. **ELK 레이아웃 Web Worker화**: 현재 메인 스레드에서 ELK 계산 → 대규모 그래프에서 UI 블로킹. Web Worker로 오프로드.
4. **엣지 번들링**: 엣지가 많아지면 d3-force 기반 엣지 번들링으로 시각적 복잡도 감소.

### 4.2 React 19 / Next.js 활용

1. **`use` hook**: Promise 직접 소비로 Suspense 경계 활용 가능 (초기 로딩 개선)
2. **Server Components**: 현재 `'use client'` 전면 사용. 레이아웃/메타데이터 등 정적 부분은 Server Component로 분리하여 JS 번들 축소 가능.
3. **Turbopack**: 이미 dev에서 사용 중. 프로덕션 빌드에서도 활용 검토 (Next.js 15.1+).

### 4.3 번들 최적화

1. **미사용 패키지 제거**: axios, react-use → 즉시 -15KB+ gzip
2. **Tailwind v4**: Oxide 엔진으로 빌드 속도 2-5x 개선
3. **dynamic import**: RightPanel, Neo4j Sheet 등 조건부 렌더링 컴포넌트 lazy loading
4. **lucide-react**: tree-shake 가능하나 0.469 → 0.577 업데이트로 최적화된 ESM 빌드 확보

---

## 5. 비판적 리뷰 (팀원 제안에 대한 기술적 피드백)

> 아래는 다른 팀원들이 제안할 가능성이 높은 항목에 대한 선제적 기술 검토입니다. 각 팀원의 실제 문서가 완성되면 구체적으로 업데이트합니다.

### 5.1 "멀티 온톨로지 / 프로젝트" 기능 제안 시

- **기술적 실현 가능**: Supabase에 `projects` 테이블 추가 + 각 엔티티에 `project_id` FK 추가.
- **리스크**: 기존 데이터 마이그레이션, Zustand 스토어 구조 변경, 모든 API Route 수정 필요.
- **권장**: v3에서는 단일 프로젝트로 유지하되, 스키마에 `project_id` 컬럼만 미리 추가(nullable)하여 v4 전환 비용 최소화.

### 5.2 "실시간 협업" 기능 제안 시

- **오버엔지니어링 경고**: Yjs + WebSocket 서버 + CRDT 충돌 해결은 MVP 범위를 크게 초과.
- **단계적 접근**: v3에서는 "마지막 저장이 이김(Last Write Wins)" + Supabase Realtime으로 변경 알림만 구현. 진정한 CRDT 협업은 v4+.

### 5.3 "버전 비교 / 시각적 diff" 기능 제안 시

- **기술적 가능**: 현재 `commits` + `commit_details` 테이블에 변경사항 기록 중.
- **구현 복잡도**: 그래프 diff 시각화는 비교 알고리즘 + 렌더링 모두 복잡.
- **권장**: v3에서는 텍스트 기반 diff (현재 Sheet의 변경 내역)를 강화하고, 그래프 시각 diff는 v4.

### 5.4 "온톨로지 임포트/익스포트 (OWL, RDF)" 기능 제안 시

- **기술적 실현 가능**: `rdflib` 또는 `n3` 패키지로 OWL/RDF 파싱/직렬화.
- **주의**: OWL은 표현력이 매우 풍부하여 현재 데이터 모델(classes + properties + instances)로는 완전한 매핑이 불가. 부분 지원이 오히려 혼란을 줄 수 있음.
- **권장**: v3에서는 JSON 내보내기/가져오기를 우선 구현. OWL은 온톨로지 전문가와 매핑 범위 협의 후 v4.

### 5.5 "AI 자동 제안 / 자동완성" 기능 제안 시

- **기술적 가능**: Vercel AI SDK `useObject`로 실시간 스트리밍 제안 구현 가능.
- **주의**: 매 키 입력마다 LLM 호출은 비용 폭발. debounce(500ms+) + 최소 입력 길이 제한 필수.
- **권장**: 명시적 트리거(버튼 클릭 또는 Ctrl+Enter)로 AI 제안 호출. 자동완성은 로컬 fuzzy match로 처리.

---

## 6. v3 기술 로드맵 제안

### Phase 1: 기반 정비 (v3 시작 전)

| 작업 | 우선순위 | 예상 난이도 | 근거 |
|------|---------|------------|------|
| `axios`, `react-use` 제거 | **P0** | 쉬움 | 미사용, 즉시 번들 절감 |
| `zustand` 4 → 5 마이그레이션 | **P0** | 중간 | `create` API 변경, `useShallow` 도입. zundo 호환성 확인 필수 |
| `@supabase/ssr` 0.5.2 → 0.9.0 | **P0** | 쉬움 | 보안 패치 |
| `framer-motion` → `motion` v12 | **P1** | 쉬움 | import 경로 변경 중심. GPU 가속 성능 이점 |
| `zod` 3 → 4 | **P1** | 중간 | API 변경 있으나 코드모드 제공. Standard Schema 지원 |
| `@hookform/resolvers` 4 → 5 | **P1** | 쉬움 | zod 4 호환 |

### Phase 2: 신규 도구 도입 (v3 개발 중)

| 작업 | 우선순위 | 예상 난이도 | 근거 |
|------|---------|------------|------|
| Vercel AI SDK 도입 | **P0** | 중간 | LLM 파싱 스트리밍, AI 탭 핵심 |
| tiptap 에디터 도입 | **P1** | 중간 | Description 편집, AI 입력, 자유 텍스트 품질 향상 |
| 일괄 API / Server Action | **P1** | 중간 | LLM 확정 시 N+1 요청 해결 |
| ELK Web Worker 분리 | **P2** | 쉬움 | 대규모 그래프 UX 개선 |

### Phase 3: 안정화 (v3 후반)

| 작업 | 우선순위 | 예상 난이도 | 근거 |
|------|---------|------------|------|
| Playwright E2E 테스트 | **P1** | 중간 | 핵심 플로우 회귀 방지 |
| Tailwind v4 마이그레이션 | **P2** | 중간 | 빌드 성능. v3 안정화 후 진행 |
| Next.js 15 → 16 검토 | **P2** | 높음 | 메이저 업그레이드, v3 안정화 후 |

### 명시적으로 v3에서 하지 않을 것

- 실시간 협업 (Yjs/Liveblocks) — 복잡도 대비 단일 사용자 MVP에서 가치 없음
- OWL/RDF 가져오기 — 매핑 범위 미정의
- Tailwind v4 + Next.js 16 동시 마이그레이션 — 리스크 분산

---

## 부록: context7 조사 요약

| 라이브러리 | context7 ID | 핵심 발견 |
|-----------|-------------|----------|
| React Flow | `/xyflow/xyflow` | v12 안정. "only re-rendering nodes that have changed" 성능 전략. TypeScript + Cypress 테스트 |
| Zustand | `/pmndrs/zustand` | v5: default export 제거, `createWithEqualityFn` 또는 `useShallow` 필요, `use-sync-external-store` peer dep |
| tiptap | `/ueberdosis/tiptap-docs` | AI Toolkit(`@tiptap-pro/ai-toolkit`)으로 `tiptapRead` + `tiptapEditWorkflow` 스트리밍. Yjs 협업 확장. React `useEditor` 훅 |
| Vercel AI SDK | `/websites/ai-sdk_dev` | `useChat`(채팅), `useObject`(구조화 스트리밍). `streamText`, `streamObject` 서버 API. Next.js 네이티브 통합 |
| Motion | `/framer/motion` | 하이브리드 엔진(WAAPI GPU + JS 폴백). Atomic updates로 대규모 요소 성능 최적화. `framer-motion`에서 리브랜딩 |
| Next.js | `/vercel/next.js/v16.1.6` | v16: `serverExternalPackages` 안정화, React 19 완전 지원. v15→16 마이그레이션 가이드 제공 |
