import { test, expect } from './fixtures/ontology-app';

/**
 * 노드 기준 AI 확장 (A: 확장 진입점) E2E
 *
 * 검증 대상: 선택 노드 → 패널 "확장" 버튼 → 노드 선택+신호 → AI탭 자동 전환 →
 * 확장 프롬프트 자동 전송 → 액션 카드 검토 → 적용까지의 전체 배선.
 *
 * /api/llm/assist 를 인터셉트해 LLM 비결정성/외부 의존을 제거하고, 확장 신호가
 * 실제로 assist 요청을 트리거하는지(요청 바디에 selectedNodeId 포함)와 결과
 * 액션이 검토→적용되는지를 결정적으로 확인한다.
 */

const CANNED_ASSIST = {
  reply: '관련 개념을 제안합니다.',
  actions: [
    {
      op: 'add_class',
      label: '클래스 추가: 정규직',
      payload: { name: '정규직', parentName: '직원' },
    },
  ],
};

test.describe('노드 기준 AI 확장 (A: 진입점)', () => {
  test('패널 "확장" → AI탭 전환 → 확장 프롬프트 자동 전송 → 액션 카드 적용', async ({ app }) => {
    // assist 인터셉트: 캔드 응답 + 요청 바디 캡처(노드 컨텍스트 전달 확인용)
    let assistBody: { message?: string; selectedNodeId?: string } | null = null;
    await app.page.route('**/api/llm/assist', async (route) => {
      try {
        assistBody = route.request().postDataJSON();
      } catch {
        assistBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CANNED_ASSIST),
      });
    });

    // 1) 기준 노드 시드
    const cls = await app.createClassViaApi('직원', '#2563eb');
    expect(cls.id).toBeTruthy();

    // 2) 로드 후 Explorer 에서 노드 선택(캔버스 좌표 비의존).
    // ExplorerPanel 항목은 <div>{name}</div> 라서 페이지 레벨 getByText 로 직접 클릭.
    await app.goto();
    const explorerItem = app.page.getByText('직원', { exact: true }).first();
    await expect(explorerItem).toBeVisible({ timeout: 15000 });
    await explorerItem.click();

    // 3) 선택 패널에 "확장" 버튼이 노출되는지(발견 가능성) + 클릭
    const expandBtn = app.page.locator('button[title="이 노드를 기준으로 AI 확장"]');
    await expect(expandBtn).toBeVisible({ timeout: 8000 });
    await expandBtn.click();

    // 4) 확장 프롬프트가 자동 전송되어 사용자 메시지로 표시(= AI탭 전환 + submitMessage)
    await expect(
      app.page.getByText('기준으로 온톨로지를 확장', { exact: false }),
    ).toBeVisible({ timeout: 8000 });

    // 5) 인터셉트된 응답의 액션 카드가 검토 가능 상태로 렌더
    await expect(
      app.page.getByText('클래스 추가: 정규직', { exact: false }),
    ).toBeVisible({ timeout: 8000 });

    // 6) "적용" → 액션 카드가 "적용됨" 상태로 전환(스토어에 하위 클래스 생성됨)
    await app.page.locator('button:has-text("적용")').first().click();
    await expect(
      app.page.getByText('적용됨', { exact: false }),
    ).toBeVisible({ timeout: 8000 });

    // 7) assist 요청이 선택 노드 컨텍스트를 담아 전송됐는지 확인
    expect(assistBody).not.toBeNull();
    expect(assistBody!.selectedNodeId).toBe(cls.id);
    expect(assistBody!.message).toContain('기준으로 온톨로지를 확장');
  });
});
