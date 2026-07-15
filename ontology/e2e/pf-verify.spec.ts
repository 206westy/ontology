import { test, expect, type APIRequestContext } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// PRD-PF A~I 라이브 종합 검증: admin 로그인 → UI 표면 로드 + API 스윕(5xx·상태) + 지연 측정.
// soft 어서션으로 한 번에 전체 이슈를 수집한다. 실행:
//   $env:E2E_TEST_EMAIL='admin@ontology.local'; $env:E2E_TEST_PASSWORD='...'; npx playwright test e2e/pf-verify.spec.ts
const email = process.env.E2E_TEST_EMAIL!;
const password = process.env.E2E_TEST_PASSWORD!;
const ONTO = '22222222-2222-2222-2222-222222222222';
const H = { 'x-ontology-id': ONTO };

interface Check {
  m: 'GET' | 'POST';
  u: string;
  body?: unknown;
  ok?: number[];
}

async function call(api: APIRequestContext, c: Check): Promise<{ status: number; ms: number }> {
  const t0 = Date.now();
  const res =
    c.m === 'GET'
      ? await api.get(c.u, { headers: H, timeout: 60000 })
      : await api.post(c.u, { headers: H, data: (c.body ?? {}) as object, timeout: 90000 });
  return { status: res.status(), ms: Date.now() - t0 };
}

test.describe('PF A~I 라이브 검증', () => {
  test.skip(!email || !password, 'E2E_TEST_EMAIL/PASSWORD 미설정 — 건너뜀');
  test.setTimeout(360000);

  test('full sweep', async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('response', (r) => {
      if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboarding_completed', 'true');
      } catch {
        /* noop */
      }
    });

    // ── 로그인 ──
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    // 진입점 봉합: 로그인 랜딩 = /platform 선택화면.
    await expect(page).toHaveURL(/\/platform$/, { timeout: 60000 });
    await expect(page.getByText('무엇으로 시작할까요?')).toBeVisible({ timeout: 60000 });

    // ── UI 표면 로드(콘솔 에러/5xx 수집) ──
    // 단독 라우트(/spc·/dashboards·/action-board)는 /platform 리다이렉트 → 시퀀스 스테이지로만 접근.
    const surfaces: { path: string; needle: RegExp }[] = [
      { path: '/platform', needle: /스튜디오|문제|플랫폼/ },
      { path: '/problems', needle: /문제/ },
    ];
    const surfaceTimings: Record<string, number> = {};
    for (const s of surfaces) {
      const t0 = Date.now();
      await page.goto(s.path, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await expect
        .soft(page.locator('body'), `surface ${s.path}`)
        .toContainText(s.needle, { timeout: 30000 });
      surfaceTimings[s.path] = Date.now() - t0;
    }

    // ── API 스윕(authed). warmup 1회 → 측정 1회(dev 컴파일 분리) ──
    const api = page.request;
    const checks: Check[] = [
      // A/core
      { m: 'GET', u: '/api/classes' },
      { m: 'GET', u: '/api/properties' },
      { m: 'GET', u: '/api/instances' },
      { m: 'GET', u: '/api/partitions' },
      { m: 'GET', u: '/api/relation-types' },
      // B
      { m: 'GET', u: '/api/functions' },
      // C
      { m: 'GET', u: '/api/problems' },
      // D
      { m: 'GET', u: '/api/datasets' },
      // E/H(legacy)
      { m: 'GET', u: '/api/patterns' },
      // F
      { m: 'GET', u: '/api/spec-limits' },
      { m: 'GET', u: '/api/spc-rulesets' },
      { m: 'GET', u: '/api/workspace-settings' },
      { m: 'POST', u: '/api/spc/evaluate', body: { chartType: 'i_mr', values: [10, 10, 10, 10, 10, 50], spec: { usl: 20, lsl: 0 } } },
      { m: 'POST', u: '/api/fdc/classify', body: { method: 'threshold', values: [1, 2, 3, 10], params: { upper: 5 } } },
      { m: 'POST', u: '/api/llm/spc-suggest', body: { sampleValues: [0.02, 0.03, 0.05] } },
      // G
      { m: 'GET', u: '/api/action-items' },
      { m: 'GET', u: '/api/dashboards' },
      { m: 'GET', u: '/api/spc-runs' },
      // H
      { m: 'GET', u: '/api/summary' },
      { m: 'POST', u: '/api/summary/rebuild', body: { force: true } },
      { m: 'POST', u: '/api/rag/global', body: { question: '전체 구획의 공통 패턴은?' } },
      { m: 'POST', u: '/api/agent/propose', body: {} },
      // I
      { m: 'GET', u: '/api/triggers' },
      { m: 'GET', u: '/api/automation-runs' },
      { m: 'GET', u: '/api/state-defs' },
    ];

    // warmup(라우트 컴파일)
    for (const c of checks) {
      try {
        await call(api, c);
      } catch {
        /* ignore warmup errors */
      }
    }

    // 측정 + 상태 검증
    const results: { u: string; m: string; status: number; ms: number }[] = [];
    for (const c of checks) {
      const r = await call(api, c);
      results.push({ u: c.u, m: c.m, status: r.status, ms: r.ms });
      const ok = c.ok ?? [200, 201];
      expect.soft(ok, `${c.m} ${c.u} status=${r.status}`).toContain(r.status);
    }

    // ── 리포트(파일로 기록 — 콘솔 캡처 잘림 방지) ──
    const report = {
      surfaceTimings,
      results,
      slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 10),
      nonOk: results.filter((r) => r.status >= 300),
      serverErrors: [...new Set(serverErrors)],
      consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    };
    writeFileSync(path.resolve(process.cwd(), 'e2e', 'pf-report.json'), JSON.stringify(report, null, 2));
    console.log('=== REPORT WRITTEN e2e/pf-report.json ===');
    console.log('NON-OK:', JSON.stringify(report.nonOk));
    console.log('5xx:', JSON.stringify(report.serverErrors));

    expect.soft(serverErrors, 'no 5xx server errors').toEqual([]);
  });
});
