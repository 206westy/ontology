import { test, expect } from '@playwright/test';

/**
 * Health Check E2E Tests
 * - App boots and main page loads
 * - Core layout elements render
 * - API endpoints respond
 */

test.describe('Health Check', () => {
  test('앱 기동 - 메인 페이지 HTTP 200 응답', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
  });

  test('메인 페이지 - 3패널 레이아웃 렌더링', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Toolbar title
    await expect(
      page.locator('text=Ontology Studio').first(),
    ).toBeVisible({ timeout: 15000 });

    // Explorer panel (left aside)
    await expect(page.locator('aside').first()).toBeVisible();

    // CommitBar footer area — "반영" button or "변경사항" label
    await expect(
      page.locator('text=변경사항').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('메인 페이지 - 빈 상태에서 가이드 텍스트 표시', async ({ page }) => {
    // Clean up all classes first
    const classesRes = await page.request.get('/api/classes');
    const classes = await classesRes.json();
    for (const cls of classes) {
      await page.request.delete(`/api/classes/${cls.id}`);
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(
      page.locator('text=더블클릭').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('API health - GET /api/classes 응답', async ({ page }) => {
    const response = await page.request.get('/api/classes');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API health - GET /api/relation-types 응답', async ({ page }) => {
    const response = await page.request.get('/api/relation-types');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API health - GET /api/constraints 응답', async ({ page }) => {
    const response = await page.request.get('/api/constraints');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API health - GET /api/export 응답', async ({ page }) => {
    const response = await page.request.get('/api/export');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.version).toBe('1.0');
    expect(body.ontology).toBeDefined();
    expect(body.stats).toBeDefined();
  });

  test('API health - POST /api/validate 빈 바디', async ({ page }) => {
    const response = await page.request.post('/api/validate', {
      data: {},
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.runId).toBeDefined();
    expect(body.summary).toBeDefined();
  });
});
