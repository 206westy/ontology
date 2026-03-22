# 바이브 코딩 테스트 방법 연구 보고서

## 목차
1. [바이브 코딩과 바이브 테스팅의 개념](#1-바이브-코딩과-바이브-테스팅의-개념)
2. [AI 에이전트 테스트 수행 방식](#2-ai-에이전트-테스트-수행-방식)
3. [Playwright vs Cypress: AI 호환성](#3-playwright-vs-cypress-ai-호환성)
4. [Next.js 프로젝트 테스트 전략](#4-nextjs-프로젝트-테스트-전략)
5. [API 테스트 자동화 (실제 브라우저 없이)](#5-api-테스트-자동화-실제-브라우저-없이)
6. [Ontology Studio 적용 방안](#6-ontology-studio-적용-방안)

---

## 1. 바이브 코딩과 바이브 테스팅의 개념

### 바이브 코딩(Vibe Coding)
- AI에게 자연어로 요구사항을 지시하면 AI가 코드를 작성하는 개발 방식
- Cursor, Windsurf, Claude Code 등의 도구로 수행
- 개발자는 아키텍트/리뷰어 역할, AI는 구현 담당

### 바이브 테스팅(Vibe Testing)
- 바이브 코딩으로 작성된 소프트웨어를 테스트하는 자연어 기반 AI 테스트 방식
- 테스트를 평문으로 작성하면 AI가 자동으로 실행
- 제품 매니저, UX 디자이너도 테스트 시나리오를 직접 표현 가능

### 핵심 아키텍처: 3가지 에이전트
```
┌─────────────┐
│   Planner   │ → 코드를 읽고 존재하는 흐름 이해, 테스트 계획 생성
├─────────────┤
│ Automator   │ → 라이브 앱에 대해 테스트 실행
├─────────────┤
│ Maintainer  │ → 코드 변경 시 테스트 자동 갱신 (자가 치유)
└─────────────┘
```

### 바이브 테스팅의 이점
- **자가 치유 테스트**: 코드가 변경되어도 테스트가 자동으로 적응
- **유지보수성**: 복잡한 테스트 스크립트 대신 평문으로 의도 표현
- **접근성**: 비개발자도 테스트 작성 가능
- **지속성**: AI가 작성한 코드 변화에 자동 대응

---

## 2. AI 에이전트 테스트 수행 방식

### Claude Code의 E2E 테스트 자동화

#### 작동 방식
1. **자연어 테스트 작성**: 테스트 케이스를 평문으로 기술
   ```
   예: "사용자가 로그인 후 대시보드를 열고 그래프를 편집할 수 있어야 한다"
   ```

2. **Claude Code 실행**: Playwright MCP를 통해 브라우저에서 자동 실행
   ```
   - 요소 선택 결정 (자동)
   - 타이밍 처리 (자동)
   - 검증 로직 (자동)
   ```

3. **자동 대응**
   - 실패한 동작 자동 재시도
   - 로딩 상태 자동 대기
   - 네트워크 지연 처리

#### 실제 사례: OpenObserve
- **8개의 AI 에이전트** 도입하여 E2E 테스트 자동화
- **분석 시간**: 6-10배 단축
- **불안정한 테스트(Flaky Tests)**: 85% 감소
- **테스트 커버리지**: 700+ 테스트

#### Claude Code Test Runner
- 자동화된 E2E 테스트와 수동 테스트의 중간 지점
- 인간과 같은 직관력으로 하루에 수십~수백 번 테스트 수행
- 자연어로 작성된 테스트를 실행 중에 결정 및 조정

### MCP(Model Context Protocol) 기반 자동화
```
AI Agent
  ↓
MCP Server (Playwright)
  ↓
┌─────────────────────────────┐
│ - 브라우저 인스턴스 실행    │
│ - 테스트 실행               │
│ - 브라우저 trace 검사       │
│ - 앱을 브라우저 컨텍스트에 오픈 │
│ - 동작 검증                 │
│ - Playwright 테스트 스위트 생성 │
└─────────────────────────────┘
```

---

## 3. Playwright vs Cypress: AI 호환성

### Playwright가 AI에게 우월한 이유

| 항목 | Playwright | Cypress |
|------|-----------|---------|
| **async/await** | ✅ AI가 자연스럽게 이해 | ❌ 명령 큐 vs async 이해 필요 |
| **자동 대기** | ✅ 모든 동작 자동 대기 | ❌ 타이밍 이해 필요 |
| **AI 친화성** | ✅ 높음 | ⚠️ 중간 |
| **학습곡선** | 낮음 | 중간 |

### AI 에이전트의 테스트 생성 프로세스

1. **Planner Agent**: 앱 탐색 → 테스트 계획 작성
2. **Automator Agent**: 계획된 테스트를 실행
3. **Maintainer Agent**: 코드 변경에 따라 테스트 자동 갱신

### 자가 치유 테스트(Self-Healing Tests)
```javascript
// Playwright + AI Agent가 생성한 테스트
test('그래프 노드 추가', async ({ page }) => {
  await page.goto('/editor');
  // AI가 자동으로 요소 선택기 적응
  await page.click('[data-testid="add-node"]');
  await expect(page.locator('.node')).toBeVisible();
});
```
- 요소 선택기 변경 → AI가 자동 적응
- DOM 구조 변경 → 테스트 자동 조정
- UI 텍스트 변경 → 자동 감지 및 수정

---

## 4. Next.js 프로젝트 테스트 전략

### 2026 표준 테스트 스택

```
┌──────────────────────────────────┐
│     E2E 테스트 (Playwright)      │ ← 전체 사용자 흐름
├──────────────────────────────────┤
│  통합 테스트 (Vitest + MSW)      │ ← 실제 동작 검증
├──────────────────────────────────┤
│ 단위 테스트 (Vitest + RTL)       │ ← 컴포넌트 격리
└──────────────────────────────────┘
```

### 바이브 코딩에서의 역피라미드 테스트 전략

**기존 피라미드** (많은 단위 테스트):
```
    △
   /│\
  / │ \  많은 단위 테스트
 /  │  \
/───┼───\ 적은 E2E 테스트
```

**바이브 코딩 역피라미드** (많은 통합/E2E 테스트):
```
/───────\
\  E2E  / 많은 E2E 테스트
 \  │  /
  \ │ / 통합 테스트
   \│/
    ▽   적은 단위 테스트
```

**왜 역피라미드인가?**
- AI가 생성한 단위 테스트는 **환상적인 계약(hallucinated contract)**에 대해 검증될 수 있음
- 실제 시스템 동작 검증이 더 중요
- 통합 테스트는 **AI의 코드가 실제로 작동하는지** 확인

### Test-First 개발의 중요성

**AI와 함께 할 때: Test-First가 필수**
```
1. 테스트 작성 (명확한 요구사항 정의)
   ↓
2. AI에게 테스트 제시 (구체적 사양 제공)
   ↓
3. AI가 구현 (테스트를 통과하는 코드 생성)
   ↓
4. 즉시 피드백 (테스트 통과/실패 명확)
```

**테스트를 사양(Specification)으로 취급**
- AI에게 구체적인 계약 제공
- 환상(hallucination) 감소
- 구현 품질 향상

### Vitest 설정 (Next.js 15)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 테스트 실행
```bash
npm run test              # Watch 모드 (기본)
npm run test -- --run    # 단일 실행
npm run test -- src/components  # 특정 디렉토리만
```

### Next.js 15 공식 테스트 지원
```bash
# Vitest 예제와 함께 새 프로젝트 생성
npx create-next-app@latest --example with-vitest
```

---

## 5. API 테스트 자동화 (실제 브라우저 없이)

### Vitest를 사용한 Next.js API 라우트 테스트

#### 전략적 접근법

```
┌──────────────┐
│  라우트 핸들러 │
├──────────────┤
│ 목킹(Mock)   │ ← 서비스, 인증, DB 완전 격리
├──────────────┤
│ 스파이(Spy)  │ ← 함수 호출 감시 (원본 동작 보존)
├──────────────┤
│ 요청 목킹    │ ← JSON 응답, 오류 시나리오
└──────────────┘
```

#### 예제: Graph API 테스트

```typescript
// src/app/api/graph/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

describe('Graph API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/graph', () => {
    it('그래프 노드를 생성해야 함', async () => {
      // 1. 의존성 목킹
      vi.mock('@/lib/neo4j', () => ({
        createNode: vi.fn().mockResolvedValue({ id: 'node-1' })
      }))

      // 2. 요청 객체 생성
      const request = new Request('http://localhost:3000/api/graph', {
        method: 'POST',
        body: JSON.stringify({
          type: 'Concept',
          label: 'AI'
        })
      })

      // 3. 라우트 핸들러 호출
      const response = await POST(request)

      // 4. 응답 검증
      const data = await response.json()
      expect(response.status).toBe(201)
      expect(data.id).toBe('node-1')
    })

    it('잘못된 요청은 400을 반환해야 함', async () => {
      const request = new Request('http://localhost:3000/api/graph', {
        method: 'POST',
        body: JSON.stringify({}) // 필수 필드 누락
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })
})
```

### curl로 실제 API 테스트

```bash
# 개발 서버 실행
npm run dev

# 그래프 노드 생성 테스트
curl -X POST http://localhost:3000/api/graph \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Concept",
    "label": "Ontology"
  }'

# 응답 확인
# {"id": "node-123", "type": "Concept", "label": "Ontology"}
```

### Vitest Mocking vs Spying

| 패턴 | 목적 | 사용처 |
|------|------|--------|
| **vi.mock()** | 모듈 전체 교체 | 외부 서비스, DB |
| **vi.spyOn()** | 함수 호출 감시 | 유틸리티, 콘솔, 로깅 |
| **요청 객체 목킹** | 요청 격리 | 라우트 핸들러 테스트 |

---

## 6. Ontology Studio 적용 방안

### 제안된 테스트 전략

#### 레이어별 테스트 범위

```
Frontend (Next.js + React Flow)
  ├─ E2E: Playwright로 사용자 흐름 테스트
  │  ├─ 텍스트 입력 → 자동 분류 (LLM)
  │  ├─ 그래프 편집 (노드/엣지 추가)
  │  └─ 저장 → Supabase 커밋
  │
  ├─ 통합: Vitest + MSW (Mock Service Worker)
  │  ├─ 그래프 상태 관리 (Zustand)
  │  ├─ React Flow 상호작용
  │  └─ API 호출 검증
  │
  └─ 단위: Vitest + React Testing Library
     ├─ 컴포넌트 렌더링
     ├─ 사용자 상호작용 (클릭, 입력)
     └─ 조건부 렌더링

Staging (Supabase)
  ├─ API 테스트: Vitest (curl 검증)
  │  ├─ 커밋 로그 작성
  │  ├─ 변경 이력 조회
  │  └─ 롤백 동작
  │
  └─ 데이터베이스: Vitest + 실제 DB
     └─ 마이그레이션 검증

Production (Neo4j)
  └─ 통합 테스트: Cypher 쿼리 검증
     └─ 최종 그래프 구조 검증
```

### 구현 단계

#### 1단계: 단위 + 통합 테스트 기반 구성
```bash
# 프로젝트 구조
ontology/
├── src/
│   ├── components/
│   │   └── GraphEditor.test.tsx
│   ├── features/
│   │   └── ontology/
│   │       ├── components/
│   │       │   └── ClassPanel.test.tsx
│   │       └── api.test.ts
│   └── lib/
│       └── graph.test.ts
├── e2e/
│   └── ontology.spec.ts
├── vitest.config.ts
└── playwright.config.ts
```

#### 2단계: E2E 테스트 추가
```typescript
// e2e/ontology.spec.ts (Playwright)
import { test, expect } from '@playwright/test'

test('사용자 흐름: 텍스트 → 온톨로지 생성', async ({ page }) => {
  // 1. 페이지 접속
  await page.goto('http://localhost:3000')

  // 2. 자연어 텍스트 입력
  await page.fill('[data-testid="text-input"]',
    '프로젝트는 여러 팀으로 구성되고, 팀은 팀원을 포함한다')

  // 3. 자동 분류 (LLM)
  await page.click('[data-testid="auto-classify"]')
  await page.waitForSelector('[data-testid="class-panel"]')

  // 4. 결과 검증
  expect(await page.textContent('[data-testid="class-name"]'))
    .toContain('Project')
})
```

#### 3단계: API 테스트 자동화
```typescript
// src/features/ontology/api.test.ts (Vitest)
import { describe, it, expect } from 'vitest'
import { createGraph, getGraph } from './api'

describe('Ontology API', () => {
  it('그래프를 생성하고 조회해야 함', async () => {
    const created = await createGraph({
      name: 'My Ontology',
      description: 'Test ontology'
    })

    expect(created.id).toBeDefined()

    const fetched = await getGraph(created.id)
    expect(fetched.name).toBe('My Ontology')
  })
})
```

### Test-First 작성 흐름 (AI와 함께)

```
1️⃣ 요구사항 정의
   "사용자가 그래프 노드를 추가하면,
    상태가 업데이트되고 UI에 반영되어야 한다"

2️⃣ 테스트 작성 (Test-First)
   ```typescript
   test('노드 추가 시 그래프가 업데이트됨', async () => {
     const store = useGraphStore()
     store.addNode({ type: 'Concept', label: 'AI' })
     expect(store.nodes).toHaveLength(1)
   })
   ```

3️⃣ Claude Code에 제시
   "이 테스트를 통과하는 useGraphStore를 구현해줘"

4️⃣ AI가 구현
   → 테스트 자동 통과
   → 즉시 피드백
   → 환상 최소화
```

### Cursor/Claude Code 프롬프트 예제

```
바이브 코딩 모드에서 E2E 테스트를 작성해줘.

요구사항:
- 사용자가 "AI는 인공지능이다"를 입력하면
- LLM이 자동으로 "AI" → 클래스, "인공지능" → 설명으로 분류
- 결과가 그래프에 반영되는지 검증

테스트 도구: Playwright
테스트 제목: "사용자 입력 → 자동 분류 → 그래프 반영"
```

### CI/CD 통합

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: 단위 + 통합 테스트
        run: npm run test -- --run

      - name: E2E 테스트
        run: npm run test:e2e

      - name: 린트
        run: npm run lint
```

---

## 결론

### 바이브 코딩 테스트의 핵심

1. **자연어 기반**: 테스트를 평문으로 작성 → AI가 실행
2. **자가 치유**: 코드 변경 시 테스트 자동 적응
3. **역피라미드**: 통합/E2E 테스트 → 단위 테스트 순서
4. **Test-First**: AI 코드 생성 전에 테스트로 명확한 사양 제공
5. **Playwright > Cypress**: AI 호환성이 높음

### Ontology Studio 구현 로드맵

```
Phase 1 (Week 1-2): 테스트 기반 구성
  ├─ Vitest 설정 + 단위 테스트 (컴포넌트)
  └─ 통합 테스트 (API, 상태 관리)

Phase 2 (Week 3-4): E2E 테스트
  ├─ Playwright 설정
  └─ 주요 사용자 흐름 테스트

Phase 3 (Week 5+): CI/CD 자동화
  ├─ GitHub Actions
  └─ 자동 배포 파이프라인
```

### 추천 도구 조합
- **단위 + 통합**: Vitest + React Testing Library + MSW
- **E2E**: Playwright (Cypress 아님)
- **API**: Vitest + curl
- **AI 에이전트**: Claude Code / Cursor의 자연어 테스트 생성
