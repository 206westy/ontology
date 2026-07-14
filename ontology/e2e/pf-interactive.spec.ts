import { test, expect, type Page } from '@playwright/test';

// PRD-PF 인터랙션 검증: F 토글 · G 대시보드/위젯 생성 · 액션보드. 렌더뿐 아니라 클릭 흐름 확인.
const email = process.env.E2E_TEST_EMAIL!;
const password = process.env.E2E_TEST_PASSWORD!;

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onboarding_completed', 'true');
    } catch {
      /* noop */
    }
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60000 });
}

test.describe('PF 인터랙션 검증', () => {
  test.skip(!email || !password, 'E2E_TEST_EMAIL/PASSWORD 미설정 — 건너뜀');
  test.setTimeout(240000);

  test('F 토글 · G 대시보드/위젯 · 액션보드', async ({ page }) => {
    const errs: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(m.text().slice(0, 200));
    });
    page.on('dialog', (d) => d.accept('E2E 대시보드')); // prompt('대시보드 이름')

    await login(page);

    // ── F: SPC 모듈 토글 → 저작 폼 등장 ──
    await page.goto('/spc', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByText('SPC / FDC 공정 스펙관리')).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: /SPC \(제품 측정값\)/ }).click();
    await expect.soft(page.getByText(/새 SPC/)).toBeVisible({ timeout: 20000 });

    // ── G: 대시보드 생성 → 위젯(KPI) 추가 → 렌더 ──
    await page.goto('/dashboards', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: /새 대시보드/ }).click();
    await page.waitForTimeout(2000);
    const addBtn = page.getByRole('button', { name: /위젯 추가/ });
    await expect.soft(addBtn).toBeVisible({ timeout: 15000 });
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      const dlg = page.getByRole('dialog');
      await expect(dlg).toBeVisible({ timeout: 10000 });
      await dlg.locator('select').first().selectOption('kpi_card');
      await dlg.getByRole('button', { name: '추가', exact: true }).click();
      await page.waitForTimeout(2000);
      // KPI 위젯 렌더(이상/주의/전체 라벨)
      await expect.soft(page.getByText('이상(fail)')).toBeVisible({ timeout: 15000 });
    }

    // ── G: 액션보드 렌더 ──
    await page.goto('/action-board', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByRole('heading', { name: '액션보드' })).toBeVisible({ timeout: 45000 });

    // 콘솔 에러(치명) 0
    const fatal = errs.filter(
      (e) => !/favicon|Download the React DevTools|hydrat/i.test(e),
    );
    console.log('CONSOLE ERRORS:', JSON.stringify([...new Set(fatal)]));
    expect.soft(fatal, 'no fatal console errors').toEqual([]);
  });
});
