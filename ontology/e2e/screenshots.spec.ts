import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * README/문서용 스크린샷 캡처. 실행:
 *   E2E_TEST_EMAIL=admin@ontology.local E2E_TEST_PASSWORD=... \
 *     npx playwright test e2e/screenshots.spec.ts
 * 이미지는 저장소 루트 docs/assets/ 에 저장된다(README 에서 참조).
 *
 * 라우팅(2026-07 기준): / = 공개 랜딩, /platform = 런처, /studio = 스튜디오,
 * /problems = 문제해결 플랫폼, /marketplace = 패턴 마켓플레이스.
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
// cwd = ontology/ (앱 디렉토리) → ../docs = 저장소 루트 docs
const OUT = path.resolve(process.cwd(), '..', 'docs', 'assets');

test.describe('docs screenshots', () => {
  test.skip(!email || !password, 'E2E_TEST_EMAIL/PASSWORD 미설정 — 건너뜀');
  test.setTimeout(300000);

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
    // Next.js dev 인디케이터 숨김(깔끔한 캡처).
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent =
        'nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}';
      document.documentElement.appendChild(style);
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
    // 로그인 후 랜딩(/) 또는 런처(/platform)로 이동한다.
    await page.waitForTimeout(4000);

    // 1) 공개 랜딩 (/) — 로그인 상태로도 접근 가능
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'landing.png') });

    // 2) 런처 (/platform) — 스튜디오 vs 문제해결 플랫폼
    await page.goto('/platform', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText('무엇으로 시작할까요?').waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'platform-chooser.png') });

    // 3) 스튜디오 (/studio) — 채워진 그래프(hero) + 툴바/패널
    await page.goto('/studio', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await expect(page.getByRole('button', { name: '가져오기' })).toBeVisible({ timeout: 90000 });
    await page
      .locator('.fixed.inset-0.z-\\[9999\\]')
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: '전체 보기' }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'hero.png') });

    // 4) 우측 속성 패널 — 클래스 트리 첫 항목 선택
    try {
      await page.locator('[data-testid="explorer-panel"] .cursor-pointer').first().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'property-panel.png') });
    } catch (e) {
      console.log('panel shot skipped:', (e as Error).message);
    }

    // 5) 지식 입력 팝오버 — 텍스트 탭
    try {
      await page.getByRole('button', { name: '가져오기' }).click();
      const popover = page.locator('[data-testid="new-node-popover"]');
      await expect(popover).toBeVisible();
      await popover.getByRole('tab', { name: '텍스트 입력' }).click();
      await popover
        .locator('textarea')
        .first()
        .pressSequentially(
          '반도체 팹의 설비보전을 관리한다. 설비(Equipment)에는 식각기, 증착기, 세정기 같은 종류가 있다. ' +
            '설비에서는 고장(Failure)이 발생할 수 있고, 엔지니어가 조치(Action)를 수행한다.',
          { delay: 1 },
        );
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, 'knowledge-input.png') });

      // 6) CSV 탭 — 컨트롤드 textarea 라 pressSequentially 로 onChange 를 발생시킨다.
      await popover.getByRole('tab', { name: 'CSV' }).click();
      const csvTa = popover.locator('textarea').first();
      const csv =
        '설비ID,설비명,공급사,부서,상태,정격출력(kW),도입일\n' +
        'EQ-001,식각기 1호,램리서치,식각팀,가동,5.5,2021-03-01\n' +
        'EQ-002,증착기 2호,어플라이드,증착팀,정지,12.0,2020-07-15\n' +
        'EQ-003,식각기 3호,램리서치,식각팀,가동,5.5,2022-01-20\n' +
        'EQ-004,세정기 1호,세메스,세정팀,점검,3.2,2021-11-05';
      await csvTa.click();
      await csvTa.pressSequentially(csv, { delay: 1 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, 'csv-input.png') });
      await page.keyboard.press('Escape').catch(() => {});
    } catch (e) {
      console.log('import popover shots skipped:', (e as Error).message);
    }

    // 7) 패턴 마켓플레이스
    try {
      await page.goto('/marketplace', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByText('PATTERN MARKETPLACE').waitFor({ timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'marketplace.png') });
    } catch (e) {
      console.log('marketplace shot skipped:', (e as Error).message);
    }

    // 8) 문제 목록 + 새 문제 정의 폼
    try {
      await page.goto('/problems', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await expect(page.getByRole('heading', { name: '문제', exact: true })).toBeVisible({
        timeout: 20000,
      });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, 'problems-list.png') });

      await page.goto('/problems/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await expect(page.getByRole('heading', { name: '새 문제 정의' })).toBeVisible({
        timeout: 20000,
      });
      await page.getByRole('textbox', { name: '문제 (한 줄)' }).fill(
        '식각 설비 고장을 조기에 감지해 다운타임을 줄이고 싶다',
      );
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, 'problem-define.png') });
    } catch (e) {
      console.log('problems shots skipped:', (e as Error).message);
    }

    console.log('screenshots saved to', OUT);
  });
});
