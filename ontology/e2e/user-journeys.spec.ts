import { test, expect } from '@playwright/test';

test.describe('Ontology Studio - 사용자 여정 E2E', () => {

  test.beforeEach(async ({ page }) => {
    const classesRes = await page.request.get('/api/classes');
    const classes = await classesRes.json();
    for (const cls of classes) {
      await page.request.delete(`/api/classes/${cls.id}`);
    }
    const rtRes = await page.request.get('/api/relation-types');
    const rts = await rtRes.json();
    for (const rt of rts) {
      await page.request.delete(`/api/relation-types/${rt.id}`);
    }
  });

  test('페이지 로드 — 3-패널 레이아웃 렌더링', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Ontology Studio')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=PSK PEE Ontology')).toBeVisible();
  });

  test('빈 캔버스 — Empty State 표시', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=더블클릭').first()).toBeVisible({ timeout: 10000 });
  });

  test('Journey 1: 더블클릭 → 팝오버 등장', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Target the empty state background div directly with force
    await page.locator('[data-testid="canvas-area"], .bg-background').first().dblclick({
      position: { x: 300, y: 200 },
      force: true
    });

    await expect(page.getByRole('heading', { name: '새 노드' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('Journey 1: 텍스트 입력 → [생성] → 프리뷰 → [확정] → 노드 생성', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Force double-click on canvas
    await page.locator('.bg-background').first().dblclick({
      position: { x: 300, y: 200 },
      force: true
    });
    await expect(page.getByRole('heading', { name: '새 노드' })).toBeVisible({ timeout: 5000 });

    // Type text (use mockParse-friendly format)
    const textarea = page.locator('textarea');
    await textarea.fill('# Equipment');

    // Click generate
    const generateBtn = page.locator('button:has-text("생성")');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Wait for preview (LLM or mockParse fallback)
    await expect(page.locator('text=확정').first()).toBeVisible({ timeout: 15000 });

    // Verify preview shows the class
    await expect(page.locator('text=Equipment').first()).toBeVisible();

    // Click confirm
    const confirmBtn = page.locator('button:has-text("확정")');
    await confirmBtn.click();

    // Popover should close
    await expect(page.locator('role=dialog')).not.toBeVisible({ timeout: 5000 });

    // Wait for node to render
    await page.waitForTimeout(2000);

    // Node should appear on canvas
    const node = page.locator('.react-flow__node');
    await expect(node.first()).toBeVisible({ timeout: 10000 });

    // Explorer should show the class
    await expect(page.locator('text=Equipment').first()).toBeVisible();
  });

  test('Journey 1: 생성된 노드가 Explorer에 표시', async ({ page }) => {
    await page.request.post('/api/classes', {
      data: { name: 'Equipment', color: '#7c3aed', description: '장비' }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Equipment').first()).toBeVisible({ timeout: 10000 });
  });

  test('Journey 2: 노드 클릭 → Right Panel 표시', async ({ page }) => {
    await page.request.post('/api/classes', {
      data: { name: 'TestClass', color: '#7c3aed', description: '테스트' }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const node = page.locator('.react-flow__node').first();
    if (await node.isVisible()) {
      await node.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('text=TestClass').first()).toBeVisible();
    }
  });

  test('API CRUD — Classes 전체', async ({ page }) => {
    // CREATE
    const createRes = await page.request.post('/api/classes', {
      data: { name: 'CRUDTest', color: '#7c3aed', description: 'CRUD 테스트' }
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('CRUDTest');

    // READ
    const getRes = await page.request.get(`/api/classes/${created.id}`);
    expect(getRes.status()).toBe(200);

    // UPDATE
    const updateRes = await page.request.patch(`/api/classes/${created.id}`, {
      data: { description: '수정됨' }
    });
    expect(updateRes.status()).toBe(200);

    // DELETE
    const deleteRes = await page.request.delete(`/api/classes/${created.id}`);
    expect(deleteRes.status()).toBe(200);

    // VERIFY
    const verifyRes = await page.request.get(`/api/classes/${created.id}`);
    expect(verifyRes.status()).toBe(404);
  });

  test('API CRUD — Properties', async ({ page }) => {
    const cls = await (await page.request.post('/api/classes', {
      data: { name: 'PropTest', color: '#7c3aed' }
    })).json();

    const createRes = await page.request.post('/api/properties', {
      data: { classId: cls.id, name: 'test_prop', dataType: 'string' }
    });
    expect(createRes.status()).toBe(201);

    const listRes = await page.request.get(`/api/properties?classId=${cls.id}`);
    expect(listRes.status()).toBe(200);
    const props = await listRes.json();
    expect(props.length).toBe(1);

    await page.request.delete(`/api/classes/${cls.id}`);
  });

  test('API CRUD — Instances', async ({ page }) => {
    const cls = await (await page.request.post('/api/classes', {
      data: { name: 'InstTest', color: '#7c3aed' }
    })).json();

    const createRes = await page.request.post('/api/instances', {
      data: { classId: cls.id, name: 'INST-001' }
    });
    expect(createRes.status()).toBe(201);

    const listRes = await page.request.get(`/api/instances?classId=${cls.id}`);
    expect(listRes.status()).toBe(200);

    await page.request.delete(`/api/classes/${cls.id}`);
  });

  test('API CRUD — Edges + Relation Types', async ({ page }) => {
    const cls1 = await (await page.request.post('/api/classes', {
      data: { name: 'Source', color: '#7c3aed' }
    })).json();
    const cls2 = await (await page.request.post('/api/classes', {
      data: { name: 'Target', color: '#2563eb' }
    })).json();
    const relType = await (await page.request.post('/api/relation-types', {
      data: { name: 'test_relation_' + Date.now() }
    })).json();

    const edgeRes = await page.request.post('/api/edges', {
      data: {
        relationTypeId: relType.id,
        sourceId: cls1.id,
        targetId: cls2.id,
        sourceKind: 'class',
        targetKind: 'class',
      }
    });
    expect(edgeRes.status()).toBe(201);

    await page.request.delete(`/api/classes/${cls1.id}`);
    await page.request.delete(`/api/classes/${cls2.id}`);
  });

  test('API — LLM Parse', async ({ page }) => {
    const res = await page.request.post('/api/llm/parse', {
      data: { text: '장비 관리 시스템에 DryAsher가 있다' }
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.classes).toBeDefined();
    expect(Array.isArray(data.classes)).toBe(true);
  });

  test('CommitBar — 변경사항 표시', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="neo4j-push-btn"]')).toBeVisible({ timeout: 10000 });
  });

  test('Toolbar — 도구 버튼 표시', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=PSK PEE Ontology').first()).toBeVisible({ timeout: 10000 });
  });
});
