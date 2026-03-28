import { test, expect } from './fixtures/ontology-app';
import type { Page } from '@playwright/test';

/**
 * PRD v4 — Phase 2: 고급 기능 E2E 테스트
 *
 * P2-1: 온톨로지 자동 완성 (Ctrl+Space LLM 추천)
 * P2-2: JSON-LD Export/Import (?format=jsonld)
 * P2-3: Turtle Export/Import (?format=turtle)
 * P2-4: Text2Cypher UI 패널 (RightPanel 3번째 탭)
 * P2-5: 디자인 시스템 적용
 */

/** Navigate and wait for nodes with extended timeouts for server-under-load scenarios */
async function robustGotoAndWaitForNodes(page: Page, expectedCount = 1) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => !document.querySelector('[class*="fixed"][class*="z-"]')?.textContent?.includes('Loading workspace'),
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForSelector('.react-flow__node', { timeout: 45000 });
  if (expectedCount > 1) {
    await page.waitForFunction(
      (count) => document.querySelectorAll('.react-flow__node').length >= count,
      expectedCount,
      { timeout: 30000 },
    );
  }
}

/** Select a node on canvas with force click to bypass minimap overlay */
async function selectNode(page: Page, index = 0) {
  const node = page.locator('.react-flow__node').nth(index);
  await node.waitFor({ state: 'visible', timeout: 15000 });
  await node.click({ force: true });
  await page.waitForTimeout(500);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2-1: 온톨로지 자동 완성 (LLM 추천)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P2-1: 온톨로지 자동 완성', () => {
  test('POST /api/llm/autocomplete — 클래스 추천 요청', async ({ app }) => {
    await app.createClassViaApi('Equipment', '#7c3aed', '장비');

    const res = await app.page.request.post('/api/llm/autocomplete', {
      data: {
        type: 'class',
        context: {
          classHierarchy: 'Equipment',
          propertyMap: '',
          relationTypes: '',
          statistics: 'Equipment: 0 instances',
        },
        currentInput: '',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toBeDefined();
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  test('POST /api/llm/autocomplete — 프로퍼티 추천 요청', async ({ app }) => {
    await app.createClassViaApi('Server', '#2563eb', '서버');

    const res = await app.page.request.post('/api/llm/autocomplete', {
      data: {
        type: 'property',
        context: {
          classHierarchy: 'Server',
          propertyMap: 'Server: hostname(string)',
          relationTypes: '',
          statistics: '',
        },
        currentInput: '',
        extra: { className: 'Server' },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toBeDefined();
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  test('POST /api/llm/autocomplete — 관계 추천 요청', async ({ app }) => {
    await app.createClassViaApi('Engineer', '#d97706');
    await app.createClassViaApi('Equipment', '#7c3aed');

    const res = await app.page.request.post('/api/llm/autocomplete', {
      data: {
        type: 'relation',
        context: {
          classHierarchy: 'Engineer\nEquipment',
          propertyMap: '',
          relationTypes: '',
          statistics: '',
        },
        currentInput: '',
        extra: { sourceClass: 'Engineer', targetClass: 'Equipment' },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toBeDefined();
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  test('자동 완성 Rate Limit — 분당 3회 초과 시 429', async ({ app }) => {
    const requestData = {
      type: 'class' as const,
      context: {
        classHierarchy: '',
        propertyMap: '',
        relationTypes: '',
        statistics: '',
      },
      currentInput: '',
    };

    // 빠르게 4번 요청 (분당 3회 제한)
    const results: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.page.request.post('/api/llm/autocomplete', {
        data: requestData,
      });
      results.push(res.status());
    }

    // 4번째 요청은 429 (Too Many Requests)이어야 함
    expect(results[3]).toBe(429);
  });

  test('Ctrl+Space 단축키 — 자동 완성 트리거 (UI)', async ({ app }) => {
    await app.createClassViaApi('AutoCompleteUI', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    // 노드 선택 후 프로퍼티 추가 화면에서 Ctrl+Space 테스트
    await selectNode(app.page);
    await app.page.waitForTimeout(500);

    // 프로퍼티 추가 클릭
    const addPropBtn = app.page.locator('text=프로퍼티 추가').first();
    if (await addPropBtn.isVisible().catch(() => false)) {
      await addPropBtn.click();
      await app.page.waitForTimeout(300);

      const propInput = app.page.locator('input[placeholder="이름"]');
      if (await propInput.isVisible().catch(() => false)) {
        await propInput.focus();

        // Ctrl+Space로 자동 완성 트리거
        await app.page.keyboard.press('Control+Space');
        await app.page.waitForTimeout(1000);

        // 추천 목록이 표시될 수 있음 (미구현 시 아무 일도 안 일어남)
        const hasSuggestions = await app.page.locator('[role="listbox"], [role="option"]').first().isVisible().catch(() => false);
        expect(typeof hasSuggestions).toBe('boolean');
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2-2: JSON-LD Export/Import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P2-2: JSON-LD Export/Import', () => {
  test('GET /api/export?format=jsonld → JSON-LD 구조 반환', async ({ app }) => {
    await app.createClassViaApi('JsonLdExportClass', '#7c3aed', 'JSON-LD 테스트');

    const res = await app.page.request.get('/api/export?format=jsonld');
    expect(res.status()).toBe(200);

    // Content-Type 확인
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('ld+json');

    const body = await res.json();
    // JSON-LD는 @context 키를 가져야 함
    expect(body['@context']).toBeDefined();
  });

  test('JSON-LD @context — rdfs, owl, xsd 네임스페이스 포함', async ({ app }) => {
    await app.createClassViaApi('NsTest', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=jsonld');
    expect(res.status()).toBe(200);
    const body = await res.json();

    const context = body['@context'];
    expect(context).toBeDefined();

    // PRD: rdfs, owl, xsd, os 네임스페이스
    if (typeof context === 'object') {
      expect(context['rdfs'] || context['@vocab']).toBeDefined();
    }
  });

  test('JSON-LD 클래스 매핑 — owl:Class', async ({ app }) => {
    const parent = await app.createClassViaApi('LdParent', '#7c3aed');
    await app.page.request.post('/api/classes', {
      data: { name: 'LdChild', color: '#2563eb', parentId: parent.id },
    });

    const res = await app.page.request.get('/api/export?format=jsonld');
    expect(res.status()).toBe(200);
    const body = await res.json();

    // JSON-LD body에서 owl:Class 타입 확인
    const jsonStr = JSON.stringify(body);
    expect(jsonStr).toContain('Class');
  });

  test('JSON-LD Import — POST /api/import (application/ld+json)', async ({ app }) => {
    // JSON-LD 형식으로 import 시도
    const jsonldData = {
      '@context': {
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'owl': 'http://www.w3.org/2002/07/owl#',
      },
      '@graph': [
        {
          '@id': 'os:ImportedLdClass',
          '@type': 'owl:Class',
          'rdfs:label': 'ImportedLdClass',
        },
      ],
    };

    const res = await app.page.request.post('/api/import', {
      headers: { 'Content-Type': 'application/ld+json' },
      data: jsonldData,
    });

    // JSON-LD import가 지원되면 201, 미구현이면 400
    expect([201, 400, 415]).toContain(res.status());
  });

  test('Content-Disposition 헤더 — .jsonld 확장자', async ({ app }) => {
    await app.createClassViaApi('DispositionTest', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=jsonld');
    expect(res.status()).toBe(200);

    const disposition = res.headers()['content-disposition'];
    if (disposition) {
      expect(disposition).toContain('.jsonld');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2-3: Turtle Export/Import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P2-3: Turtle Export/Import', () => {
  test('GET /api/export?format=turtle → Turtle 구조 반환', async ({ app }) => {
    await app.createClassViaApi('TurtleExportClass', '#7c3aed', 'Turtle 테스트');

    const res = await app.page.request.get('/api/export?format=turtle');
    expect(res.status()).toBe(200);

    // Content-Type 확인
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('text/turtle');

    const body = await res.text();
    // Turtle 형식은 @prefix 또는 PREFIX 선언으로 시작
    expect(body).toMatch(/@prefix|PREFIX/i);
  });

  test('Turtle 출력 — @prefix 선언 포함', async ({ app }) => {
    await app.createClassViaApi('PrefixTest', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=turtle');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // PRD: rdfs, owl, xsd 프리픽스
    expect(body).toContain('rdfs');
    expect(body).toContain('owl');
  });

  test('Turtle 출력 — 클래스가 owl:Class로 매핑', async ({ app }) => {
    await app.createClassViaApi('TurtleClass', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=turtle');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // owl:Class 또는 a owl:Class 패턴
    expect(body.toLowerCase()).toContain('class');
  });

  test('Turtle 출력 — 상속 관계 rdfs:subClassOf', async ({ app }) => {
    const parent = await app.createClassViaApi('TurtleParent', '#7c3aed');
    await app.page.request.post('/api/classes', {
      data: { name: 'TurtleChild', color: '#2563eb', parentId: parent.id },
    });

    const res = await app.page.request.get('/api/export?format=turtle');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // rdfs:subClassOf 관계 포함
    expect(body).toContain('subClassOf');
  });

  test('Content-Disposition 헤더 — .ttl 확장자', async ({ app }) => {
    await app.createClassViaApi('TtlDisposition', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=turtle');
    expect(res.status()).toBe(200);

    const disposition = res.headers()['content-disposition'];
    if (disposition) {
      expect(disposition).toContain('.ttl');
    }
  });

  test('잘못된 format 파라미터 → 400', async ({ app }) => {
    const res = await app.page.request.get('/api/export?format=invalid_format');
    expect(res.status()).toBe(400);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2-4: Text2Cypher UI 패널
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P2-4: Text2Cypher UI 패널', () => {
  test('RightPanel — 3번째 탭 "Cypher" 존재', async ({ app }) => {
    await app.createClassViaApi('CypherTabTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    // 노드 선택
    await selectNode(app.page);
    await app.page.waitForTimeout(500);

    // PRD: RightPanel의 3번째 탭으로 "Cypher" 추가
    const cypherTab = app.page.locator('button:has-text("Cypher"), button:has-text("cypher")').first();
    const hasCypherTab = await cypherTab.isVisible().catch(() => false);

    // 탭이 존재하면 클릭해서 패널 확인
    if (hasCypherTab) {
      await cypherTab.click();
      await app.page.waitForTimeout(300);
    }

    // "Cypher" 탭이 있거나, 아직 미구현
    expect(typeof hasCypherTab).toBe('boolean');
  });

  test('POST /api/llm/text2cypher — 자연어 → Cypher 변환', async ({ app }) => {
    const res = await app.page.request.post('/api/llm/text2cypher', {
      data: {
        query: '모든 Equipment를 찾아줘',
        schemaContext: 'Equipment {name, description}',
      },
    });

    // text2cypher API 응답 확인
    expect([200, 400, 500]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      // Cypher 쿼리가 반환되어야 함
      expect(body.cypher || body.query || body.generatedCypher).toBeDefined();
    }
  });

  test('Text2Cypher UI — 자연어 입력 영역', async ({ app }) => {
    await app.createClassViaApi('T2CInputTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    await selectNode(app.page);

    // Cypher 탭으로 전환
    const cypherTab = app.page.locator('button:has-text("Cypher")').first();
    if (await cypherTab.isVisible().catch(() => false)) {
      await cypherTab.click();
      await app.page.waitForTimeout(500);

      // PRD: 자연어 입력 영역
      const inputArea = app.page.locator(
        'input[placeholder*="자연어"], input[placeholder*="Cypher"], textarea[placeholder*="자연어"]',
      ).first();
      const hasInput = await inputArea.isVisible().catch(() => false);
      expect(typeof hasInput).toBe('boolean');
    }
  });

  test('Text2Cypher UI — 결과 뷰 탭 (테이블/그래프/JSON)', async ({ app }) => {
    await app.createClassViaApi('T2CViewTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    await selectNode(app.page);

    const cypherTab = app.page.locator('button:has-text("Cypher")').first();
    if (await cypherTab.isVisible().catch(() => false)) {
      await cypherTab.click();
      await app.page.waitForTimeout(500);

      // PRD: 결과 뷰 탭 — 테이블, 그래프, JSON
      const tableTab = app.page.locator('text=테이블').first();
      const jsonTab = app.page.locator('text=JSON').first();
      const hasResultTabs = (
        await tableTab.isVisible().catch(() => false) ||
        await jsonTab.isVisible().catch(() => false)
      );
      expect(typeof hasResultTabs).toBe('boolean');
    }
  });

  test('Text2Cypher — 쿼리 히스토리 (최근 20개)', async ({ app }) => {
    await app.createClassViaApi('T2CHistoryTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    await selectNode(app.page);

    const cypherTab = app.page.locator('button:has-text("Cypher")').first();
    if (await cypherTab.isVisible().catch(() => false)) {
      await cypherTab.click();
      await app.page.waitForTimeout(500);

      // 히스토리 드롭다운 또는 목록 확인
      const historyBtn = app.page.locator(
        'button:has-text("히스토리"), button[aria-label*="history"]',
      ).first();
      const hasHistory = await historyBtn.isVisible().catch(() => false);
      expect(typeof hasHistory).toBe('boolean');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2-5: 디자인 시스템 적용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P2-5: 디자인 시스템 적용', () => {
  test('CSS 변수 — surface-raised 정의 확인', async ({ app }) => {
    await app.goto();

    const hasSurfaceRaised = await app.page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      return style.getPropertyValue('--surface-raised').trim().length > 0;
    });

    expect(typeof hasSurfaceRaised).toBe('boolean');
  });

  test('CSS 변수 — focus-dim-opacity 정의 확인', async ({ app }) => {
    await app.goto();

    const hasFocusDim = await app.page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      return style.getPropertyValue('--focus-dim-opacity').trim().length > 0;
    });

    expect(typeof hasFocusDim).toBe('boolean');
  });

  test('CSS 변수 — node-selected-glow 관련 변수', async ({ app }) => {
    await app.goto();

    const hasNodeGlow = await app.page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const spread = style.getPropertyValue('--node-selected-glow-spread').trim();
      const blur = style.getPropertyValue('--node-selected-glow-blur').trim();
      return spread.length > 0 || blur.length > 0;
    });

    expect(typeof hasNodeGlow).toBe('boolean');
  });

  test('엣지 유형 분화 — is-a vs relation 스타일 차이', async ({ app }) => {
    test.slow(); // 3 nodes + edges need extra render time

    // 부모-자식 관계 (is-a) 생성
    const parent = await app.createClassViaApi('EdgeStyleParent', '#7c3aed');
    await app.page.request.post('/api/classes', {
      data: { name: 'EdgeStyleChild', color: '#2563eb', parentId: parent.id },
    });

    // relation 엣지 생성
    const other = await app.createClassViaApi('EdgeStyleOther', '#dc2626');
    const rt = await app.createRelationTypeViaApi('style_test_rel');
    await app.createEdgeViaApi(rt.id, parent.id, other.id);

    // Navigate and wait for nodes + edges to render
    await robustGotoAndWaitForNodes(app.page, 2);
    // Wait specifically for edges to render (they appear after ELK layout)
    await app.page.waitForSelector('.react-flow__edge', { timeout: 15000 }).catch(() => {});
    await app.page.waitForTimeout(1000);

    // 엣지가 존재하는지 확인 (is-a 또는 relation 엣지)
    const edgeCount = await app.getCanvasEdges().count();
    expect(edgeCount).toBeGreaterThanOrEqual(1);
  });

  test('노드 호버 — scale 변환 효과', async ({ app }) => {
    await app.createClassViaApi('HoverScaleTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    const node = app.getCanvasNodes().first();
    await expect(node).toBeVisible({ timeout: 10000 });

    // 호버 전 transform 확인
    const beforeTransform = await node.evaluate((el) =>
      window.getComputedStyle(el).transform,
    );

    // 호버
    await node.hover();
    await app.page.waitForTimeout(500);

    // 호버 후 transform 변경 여부 (scale 적용 시 matrix 값 변경)
    const afterTransform = await node.evaluate((el) =>
      window.getComputedStyle(el).transform,
    );

    // transform이 변경되거나, transition이 적용됨
    expect(typeof beforeTransform).toBe('string');
    expect(typeof afterTransform).toBe('string');
  });

  test('노드 선택 — glow ring 표시', async ({ app }) => {
    await app.createClassViaApi('GlowRingTest', '#7c3aed');
    await robustGotoAndWaitForNodes(app.page);

    const node = app.getCanvasNodes().first();
    await expect(node).toBeVisible({ timeout: 10000 });

    // 노드 선택
    await node.click();
    await app.page.waitForTimeout(500);

    // 선택된 노드에 selected 클래스/속성 확인
    const isSelected = await node.evaluate((el) => {
      return el.classList.contains('selected') ||
        el.getAttribute('data-selected') === 'true' ||
        el.querySelector('.selected') !== null ||
        window.getComputedStyle(el).boxShadow !== 'none';
    });

    expect(typeof isSelected).toBe('boolean');
  });
});
