import { test, expect } from '@playwright/test';

/**
 * 인증 E2E.
 * - 미인증 경로(게이팅/렌더/클라이언트 검증)는 결정적으로 검증한다.
 * - 실제 로그인/로그아웃 여정은 시드된 확인 완료 사용자(E2E_TEST_EMAIL/PASSWORD)가
 *   있을 때만 실행한다.
 */

test.describe('인증 게이팅', () => {
  test('미인증 사용자가 / 접근 시 /login 으로 리다이렉트된다', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/login 이 이메일·비밀번호 필드를 렌더한다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('이메일')).toBeVisible();
    await expect(page.getByLabel('비밀번호')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
  });

  test('/signup 이 회원가입 폼을 렌더한다', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByLabel('이름')).toBeVisible();
    await expect(page.getByLabel('이메일')).toBeVisible();
    await expect(page.getByRole('button', { name: '회원가입' })).toBeVisible();
  });

  test('빈 로그인 제출 시 클라이언트 검증 에러를 표시한다', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('이메일을 입력하세요')).toBeVisible();
  });

  test('비밀번호 표시 토글이 동작한다', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByLabel('비밀번호');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '비밀번호 표시' }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('비밀번호 찾기 페이지로 이동할 수 있다', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: '비밀번호를 잊으셨나요?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('button', { name: '재설정 링크 받기' })).toBeVisible();
  });
});

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe('인증 여정 (시드 사용자 필요)', () => {
  test.skip(!email || !password, 'E2E_TEST_EMAIL/PASSWORD 미설정 — 건너뜀');

  test('로그인 → 스튜디오 진입 → 로그아웃', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('이메일').fill(email!);
    await page.getByLabel('비밀번호').fill(password!);
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=Ontology Studio').first()).toBeVisible({
      timeout: 15000,
    });

    // 인증 상태에서 /login 접근 시 앱으로 되돌린다
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);

    // 로그아웃
    await page.getByRole('button', { name: '사용자 메뉴' }).click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
