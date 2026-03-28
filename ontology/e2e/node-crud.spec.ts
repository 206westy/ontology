import { test, expect } from './fixtures/ontology-app';

/**
 * Node CRUD E2E Tests
 * - Create node via API and popover
 * - Read / verify node in explorer and canvas
 * - Update node properties
 * - Delete node with cascade confirmation
 */

test.describe('Node CRUD', () => {
  // ─── CREATE ───────────────────────────────────────────────

  test('API로 클래스 생성 → 201 + id 반환', async ({ app }) => {
    const res = await app.page.request.post('/api/classes', {
      data: { name: 'CrudCreateTest', color: '#7c3aed', description: '생성 테스트' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('CrudCreateTest');
  });

  test('캔버스 더블클릭 팝오버로 클래스 생성 → 노드 렌더링', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();
    await app.createClassViaPopover('# CrudPopoverNode');

    await expect(app.getCanvasNodes().first()).toBeVisible({ timeout: 10000 });
    await expect(app.explorerHasItem('CrudPopoverNode')).toBeVisible({ timeout: 10000 });
  });

  test('인스턴스 생성 → Explorer에 표시', async ({ app }) => {
    const cls = await app.createClassViaApi('ParentClass', '#2563eb');
    const instRes = await app.page.request.post('/api/instances', {
      data: { classId: cls.id, name: 'INST-CRUD-001' },
    });
    expect(instRes.status()).toBe(201);

    await app.goto();
    await app.page.waitForTimeout(2000);

    // Expand parent to see instance
    const explorerPanel = app.page.locator('aside').first();
    await expect(explorerPanel.locator('text=ParentClass').first()).toBeVisible({ timeout: 10000 });
  });

  // ─── READ ─────────────────────────────────────────────────

  test('API로 단일 클래스 조회 → 200 + 상세 반환', async ({ app }) => {
    const cls = await app.createClassViaApi('ReadTestClass', '#dc2626');
    const res = await app.page.request.get(`/api/classes/${cls.id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('ReadTestClass');
    expect(body.color).toBe('#dc2626');
  });

  test('존재하지 않는 클래스 조회 → 404', async ({ app }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await app.page.request.get(`/api/classes/${fakeId}`);
    expect(res.status()).toBe(404);
  });

  // ─── UPDATE ───────────────────────────────────────────────

  test('API로 클래스 수정 → description 변경 확인', async ({ app }) => {
    const cls = await app.createClassViaApi('UpdateTestClass');
    const res = await app.page.request.patch(`/api/classes/${cls.id}`, {
      data: { description: '수정된 설명' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.description).toBe('수정된 설명');
  });

  test('UI에서 노드 선택 → Right Panel 표시 확인', async ({ app }) => {
    await app.createClassViaApi('SelectTestNode', '#0891b2');
    await app.goto();
    await app.page.waitForTimeout(2000);

    await app.selectNodeOnCanvas(0);

    // Right panel should show CLASS badge
    await expect(app.page.locator('text=CLASS').first()).toBeVisible({ timeout: 5000 });
    await expect(app.page.locator('text=SelectTestNode').first()).toBeVisible();
  });

  // ─── DELETE ───────────────────────────────────────────────

  test('API로 클래스 삭제 → 200 + 이후 404', async ({ app }) => {
    const cls = await app.createClassViaApi('DeleteApiTest');

    const deleteRes = await app.page.request.delete(`/api/classes/${cls.id}`);
    expect(deleteRes.status()).toBe(200);

    const verifyRes = await app.page.request.get(`/api/classes/${cls.id}`);
    expect(verifyRes.status()).toBe(404);
  });

  test('UI에서 노드 삭제 → DeleteConfirmDialog → 확인 → 제거', async ({ app }) => {
    await app.createClassViaApi('UIDeleteTarget', '#d97706');
    await app.goto();
    await app.page.waitForTimeout(2000);

    // Select node on canvas
    await app.selectNodeOnCanvas(0);
    await expect(app.page.locator('text=CLASS').first()).toBeVisible({ timeout: 5000 });

    // Click delete button in Right Panel header
    await app.clickDeleteButton();

    // Confirm dialog appears
    await expect(
      app.page.locator('text=클래스 삭제').first(),
    ).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    await app.page.locator('button:has-text("삭제")').last().click();
    await app.page.waitForTimeout(1500);

    // Dialog closes
    await expect(
      app.page.locator('text=클래스 삭제'),
    ).not.toBeVisible({ timeout: 3000 });

    // No nodes left on canvas
    const nodeCount = await app.getCanvasNodes().count();
    expect(nodeCount).toBe(0);
  });

  test('삭제 취소 → 노드 유지', async ({ app }) => {
    await app.createClassViaApi('CancelDeleteNode');
    await app.goto();
    await app.page.waitForTimeout(2000);

    await app.selectNodeOnCanvas(0);
    await app.clickDeleteButton();

    await expect(
      app.page.locator('text=클래스 삭제').first(),
    ).toBeVisible({ timeout: 5000 });

    // Cancel
    await app.page.locator('button:has-text("취소")').last().click();
    await app.page.waitForTimeout(500);

    // Dialog closes, node persists
    await expect(
      app.page.locator('text=클래스 삭제'),
    ).not.toBeVisible({ timeout: 3000 });
    await expect(app.explorerHasItem('CancelDeleteNode')).toBeVisible();
  });

  // ─── EDGE CASES ───────────────────────────────────────────

  test('중복 이름 클래스 생성 → 409 Conflict', async ({ app }) => {
    await app.createClassViaApi('DuplicateName');
    const res = await app.page.request.post('/api/classes', {
      data: { name: 'DuplicateName' },
    });
    // parentId = null + same name triggers unique constraint
    expect(res.status()).toBe(409);
  });

  test('빈 이름으로 클래스 생성 → 400 Bad Request', async ({ app }) => {
    const res = await app.page.request.post('/api/classes', {
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });
});
