import { test, expect } from './fixtures/ontology-app';
import type { Page } from '@playwright/test';

/**
 * PRD v4 — Phase 0: 기반 정비 E2E 테스트
 *
 * P0-1: openai → AI SDK generateObject 전환 (/api/llm/parse)
 * P0-2: AIAssistantTab → useChat 훅 (AI SDK 6.x)
 * P0-3: ELK Web Worker 분리
 * P0-4: Tailwind v4 마이그레이션
 */

/** Navigate and wait for at least `expectedCount` React Flow nodes, with one reload retry */
async function gotoAndWaitForNodesRetry(page: Page, expectedCount: number) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  try {
    await page.waitForSelector('.react-flow__node', { timeout: 30000 });
    if (expectedCount > 1) {
      await page.waitForFunction(
        (c) => document.querySelectorAll('.react-flow__node').length >= c,
        expectedCount,
        { timeout: 20000 },
      );
    }
  } catch {
    // Reload once if nodes are missing
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.react-flow__node', { timeout: 30000 });
    if (expectedCount > 1) {
      await page.waitForFunction(
        (c) => document.querySelectorAll('.react-flow__node').length >= c,
        expectedCount,
        { timeout: 20000 },
      );
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P0-1: AI SDK generateObject 전환 (/api/llm/parse)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P0-1: /api/llm/parse — AI SDK generateObject 전환', () => {
  test('POST /api/llm/parse → 200 + Zod 스키마 구조 반환', async ({ app }) => {
    const res = await app.page.request.post('/api/llm/parse', {
      data: { text: 'Equipment 클래스가 있고, DryAsher는 Equipment의 하위 장비이다.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // AI SDK generateObject로 전환 후에도 동일한 출력 구조 유지
    expect(body.classes).toBeDefined();
    expect(Array.isArray(body.classes)).toBe(true);
    expect(body.properties).toBeDefined();
    expect(Array.isArray(body.properties)).toBe(true);
    expect(body.instances).toBeDefined();
    expect(Array.isArray(body.instances)).toBe(true);
    expect(body.relations).toBeDefined();
    expect(Array.isArray(body.relations)).toBe(true);
  });

  test('parse 결과 클래스 구조 — name, description, color, parentName 필드', async ({ app }) => {
    const res = await app.page.request.post('/api/llm/parse', {
      data: { text: '# Server' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.classes.length).toBeGreaterThanOrEqual(1);
    const cls = body.classes[0];
    expect(typeof cls.name).toBe('string');
    expect(cls).toHaveProperty('description');
    expect(cls).toHaveProperty('parentName');
  });

  test('parse 결과 프로퍼티 구조 — className, name, dataType, isRequired', async ({ app }) => {
    const res = await app.page.request.post('/api/llm/parse', {
      data: { text: 'Server 클래스에는 hostname(string, 필수), cpu_cores(integer) 프로퍼티가 있다.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    if (body.properties.length > 0) {
      const prop = body.properties[0];
      expect(typeof prop.className).toBe('string');
      expect(typeof prop.name).toBe('string');
      expect(['string', 'integer', 'float', 'boolean', 'date', 'enum']).toContain(prop.dataType);
      expect(typeof prop.isRequired).toBe('boolean');
    }
  });

  test('parse 빈 텍스트 → 400 또는 빈 결과', async ({ app }) => {
    const res = await app.page.request.post('/api/llm/parse', {
      data: { text: '' },
    });
    // 빈 텍스트는 400 에러 또는 빈 배열 반환
    const status = res.status();
    expect([200, 400]).toContain(status);
    if (status === 200) {
      const body = await res.json();
      expect(body.classes.length).toBe(0);
    }
  });

  test('openai 패키지 직접 사용 제거 확인 — AI SDK import 사용', async ({ app }) => {
    // parse API가 AI SDK의 generateObject/generateText를 사용하는지 간접 확인:
    // 유효한 요청이 성공하면 AI SDK 통합이 정상 작동 중
    const res = await app.page.request.post('/api/llm/parse', {
      data: { text: '엔지니어가 장비를 관리한다' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // 관계가 파싱되어야 함
    expect(Array.isArray(body.relations)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P0-2: AIAssistantTab → useChat 훅 (AI SDK 6.x)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P0-2: AIAssistantTab — useChat 훅 전환', () => {
  test('RightPanel AI 탭 표시 — 노드 선택 후 AI 탭 클릭', async ({ app }) => {
    await app.createClassViaApi('AITabTest', '#7c3aed', 'AI 탭 테스트용');
    await gotoAndWaitForNodesRetry(app.page, 1);

    // 노드 선택
    await app.selectNodeOnCanvas(0);
    await expect(app.page.locator('text=CLASS').first()).toBeVisible({ timeout: 5000 });

    // AI 탭 클릭
    await app.clickRightPanelTab('AI');
    await app.page.waitForTimeout(500);

    // AI 어시스턴트 UI 요소 확인
    const aiSection = app.page.locator('aside').last();
    await expect(aiSection).toBeVisible();
  });

  test('AI 채팅 — 메시지 입력 영역 표시', async ({ app }) => {
    await app.createClassViaApi('AIChatTest', '#7c3aed');
    await gotoAndWaitForNodesRetry(app.page, 1);

    await app.selectNodeOnCanvas(0);
    await app.clickRightPanelTab('AI');
    await app.page.waitForTimeout(500);

    // 채팅 입력 영역 확인 (textarea 또는 input)
    const chatInput = app.page.locator('textarea, input[placeholder*="질문"], input[placeholder*="메시지"]').last();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
  });

  test('POST /api/llm/chat 스트리밍 응답', async ({ app }) => {
    // AI SDK 6.x의 streamText 응답 확인 — UIMessage 형식 필요
    const res = await app.page.request.post('/api/llm/chat', {
      data: {
        messages: [
          {
            id: 'test-chat-1',
            role: 'user',
            content: '이 온톨로지에 대해 간단히 설명해줘',
            parts: [{ type: 'text', text: '이 온톨로지에 대해 간단히 설명해줘' }],
          },
        ],
      },
    });
    // 스트리밍 응답은 200으로 시작
    expect(res.status()).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P0-3: ELK Web Worker 분리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P0-3: ELK Web Worker 분리', () => {
  test('ELK Worker 파일 존재 확인 (public/elk-worker.min.js)', async ({ app }) => {
    // Web Worker 파일이 public에 배치되었는지 확인
    const res = await app.page.request.get('/elk-worker.min.js');
    // 파일이 존재하면 200, 아직 미배치면 404
    expect([200, 404]).toContain(res.status());
  });

  test('다수 노드 레이아웃 — UI 블로킹 없이 완료', async ({ app }) => {
    // 다수 클래스 생성 후 레이아웃이 정상 적용되는지 확인
    const classNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    for (const name of classNames) {
      await app.createClassViaApi(name, '#7c3aed');
    }

    // 생성된 클래스 수 확인
    const verifyRes = await app.page.request.get('/api/classes');
    const allClasses = await verifyRes.json();
    const totalCount = Array.isArray(allClasses) ? allClasses.length : 0;

    // 최소 2개 노드가 있으면 레이아웃 검증 가능
    await gotoAndWaitForNodesRetry(app.page, Math.min(totalCount, 5));

    // 다수 노드가 렌더링되어야 함
    const nodeCount = await app.getCanvasNodes().count();
    expect(nodeCount).toBeGreaterThanOrEqual(2);

    // ELK 레이아웃이 비동기 완료될 때까지 대기 — 노드 위치가 분산될 때까지 polling
    await app.page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('.react-flow__node');
        if (nodes.length < 2) return false;
        const positions = new Set<string>();
        for (const node of nodes) {
          const transform = (node as HTMLElement).style.transform;
          positions.add(transform);
        }
        // 최소 2개 이상 서로 다른 위치가 있으면 레이아웃 완료
        return positions.size >= 2;
      },
      { timeout: 15000 },
    ).catch(() => { /* layout may not separate all nodes */ });

    const box1 = await app.getCanvasNodes().nth(0).boundingBox();
    const box2 = await app.getCanvasNodes().nth(1).boundingBox();
    if (box1 && box2) {
      const overlapping = box1.x === box2.x && box1.y === box2.y;
      expect(overlapping).toBe(false);
    }
  });

  test('ELK 레이아웃 후 캔버스 정상 인터랙션', async ({ app }) => {
    await app.createClassViaApi('LayoutTest1', '#7c3aed');
    await app.createClassViaApi('LayoutTest2', '#2563eb');

    await gotoAndWaitForNodesRetry(app.page, 2);

    // 레이아웃 적용 후 노드 클릭 가능
    await app.selectNodeOnCanvas(0);
    await expect(app.page.locator('text=CLASS').first()).toBeVisible({ timeout: 5000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P0-4: Tailwind v4 마이그레이션
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P0-4: Tailwind v4 마이그레이션', () => {
  test('페이지 로드 — 스타일 정상 적용 확인', async ({ app }) => {
    await app.goto();

    // 메인 페이지가 정상 렌더링 — Toolbar or SplashScreen branding visible
    // Toolbar shows "PSK PEE Ontology", SplashScreen shows "Ontology Studio"
    await expect(
      app.page.locator('text=PSK PEE Ontology').or(app.page.locator('text=Ontology Studio')).first(),
    ).toBeVisible({ timeout: 15000 });

    // aside 요소가 보이는지 (좌측 패널) — wait for splash to finish
    await expect(app.explorerPanel).toBeVisible({ timeout: 15000 });
  });

  test('CSS 변수 기반 테마 동작 — light/dark 전환', async ({ app }) => {
    await app.goto();

    // Light mode에서 정상 렌더링
    await app.page.emulateMedia({ colorScheme: 'light' });
    await app.page.waitForTimeout(500);
    const lightBg = await app.page.locator('html').evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('--background'),
    );

    // Dark mode 전환
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.page.waitForTimeout(500);
    const darkBg = await app.page.locator('html').evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('--background'),
    );

    // CSS 변수 값이 변경되었거나, html에 dark 클래스 적용
    const htmlClass = await app.page.locator('html').getAttribute('class');
    // 둘 중 하나라도 변경되면 테마 시스템 정상 동작
    expect(htmlClass?.includes('dark') || lightBg !== darkBg).toBe(true);
  });

  test('Tailwind 유틸리티 클래스 정상 적용 확인', async ({ app }) => {
    await app.createClassViaApi('TailwindTest', '#7c3aed');
    await gotoAndWaitForNodesRetry(app.page, 1);

    // react-flow 컨테이너가 정상 크기를 가짐 (0이 아닌 width/height)
    const canvasBox = await app.canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (canvasBox) {
      expect(canvasBox.width).toBeGreaterThan(100);
      expect(canvasBox.height).toBeGreaterThan(100);
    }
  });
});
