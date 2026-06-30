import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * README/문서용 스크린샷 캡처. 실행:
 *   E2E_TEST_EMAIL=admin@ontology.local E2E_TEST_PASSWORD=... \
 *     npx playwright test e2e/screenshots.spec.ts
 * 이미지는 저장소 루트 docs/assets/ 에 저장된다(README 에서 참조).
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
// cwd = ontology/ (앱 디렉토리) → ../docs = 저장소 루트 docs
const OUT = path.resolve(process.cwd(), '..', 'docs', 'assets');

test.describe('docs screenshots', () => {
  test.skip(!email || !password, 'E2E_TEST_EMAIL/PASSWORD 미설정 — 건너뜀');
  test.setTimeout(180000);

  test('capture', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1512, height: 945 });

    // 첫 방문 온보딩 코치마크(전체화면 오버레이)를 억제 — 클릭 가로채기 방지.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboarding_completed', 'true');
      } catch {
        /* noop */
      }
    });

    // 로그인 (첫 turbopack 컴파일이 느려 domcontentloaded + 넉넉한 타임아웃)
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const emailInput = page.locator('input[name="email"]');
    const pwInput = page.locator('input[name="password"]');
    await expect(emailInput).toBeVisible({ timeout: 60000 });
    // React 하이드레이션 완료 후 입력해야 RHF가 값을 캡처한다.
    await page.waitForTimeout(2500);
    await emailInput.fill(email!);
    await pwInput.fill(password!);
    await expect(emailInput).toHaveValue(email!);
    await expect(pwInput).toHaveValue(password!);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 60000 });

    // 앱 로드 대기(툴바 + 캔버스 레이아웃 안정화; 첫 컴파일 고려해 넉넉히)
    await expect(page.getByRole('button', { name: '가져오기' })).toBeVisible({ timeout: 90000 });
    // 스플래시/오버레이(z-9999)가 사라질 때까지 대기.
    await page
      .locator('.fixed.inset-0.z-\\[9999\\]')
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(4000);

    // 1) 히어로 — 전체 앱(채워진 그래프)
    await page.screenshot({ path: path.join(OUT, 'hero.png') });

    // 2) 우측 속성 패널 — 탐색기 첫 항목 선택
    try {
      await page.locator('[data-testid="explorer-panel"] .cursor-pointer').first().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'property-panel.png') });
    } catch (e) {
      console.log('panel shot skipped:', (e as Error).message);
    }

    // 3) 지식 입력 팝오버 — 텍스트 탭
    await page.getByRole('button', { name: '가져오기' }).click();
    const popover = page.locator('[data-testid="new-node-popover"]');
    await expect(popover).toBeVisible();
    await popover.getByRole('tab', { name: '텍스트 입력' }).click();
    await popover.locator('textarea').first().fill(
      '식각 공정에는 식각기 설비가 쓰인다. 식각기 1호(EQ-001)는 삼성전자가 공급했고 정격출력은 5.5kW다. ' +
        'particle 수치가 spec을 초과하면 chuck을 점검한다.',
    );
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'knowledge-input.png') });

    // 4) CSV 탭 — 컨트롤드 textarea 라 fill 만으론 onChange 가 안 잡혀(버튼 disabled),
    //    실제 키 입력(pressSequentially)으로 React 상태를 채운다.
    await popover.getByRole('tab', { name: 'CSV' }).click();
    const csvTa = popover.locator('textarea').first();
    const csv =
      '설비ID,설비명,공급사,부서,상태,정격출력(kW),도입일\n' +
      'EQ-001,식각기 1호,삼성전자,식각팀,가동,5.5,2021-03-01\n' +
      'EQ-002,증착기 2호,램리서치,증착팀,정지,12.0,2020-07-15\n' +
      'EQ-003,식각기 3호,삼성전자,식각팀,가동,5.5,2022-01-20\n' +
      'EQ-004,세정기 1호,세메스,세정팀,점검,3.2,2021-11-05';
    await csvTa.click();
    await csvTa.pressSequentially(csv, { delay: 1 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'csv-input.png') });

    // 5) (best-effort) CSV 분석 → 구조화 결과 프리뷰
    try {
      await popover.getByRole('button', { name: /분석/ }).click();
      await expect(page.getByText('구조화 결과')).toBeVisible({ timeout: 120000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'ai-preview.png') });
    } catch (e) {
      console.log('preview shot skipped:', (e as Error).message);
    }

    console.log('screenshots saved to', OUT);
  });
});
