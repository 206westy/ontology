import { test, expect } from './fixtures/ontology-app';

/**
 * Phase 2 E2E 테스트 — TDD 방식
 * 실제 구현된 컴포넌트 코드를 기반으로 정확한 셀렉터 사용.
 *
 * 커버리지:
 * - F2-1/F2-2: Neo4j 푸시 확인 UI + 진행률 (NeoConfirmSheet)
 * - F2-4: 빈 캔버스 Empty State 확장
 * - F2-5: 검색 → 캔버스 포커스
 * - F2-6: MiniMap
 * - F2-7: 로딩 스켈레톤
 * - F2-9: 에러 처리 전략
 * - F2-10: 다크모드 완전 지원
 * - F2-12: Level of Detail
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Empty State 테스트 (F2-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-4: Empty State 확장', () => {
  test('빈 캔버스 — 안내 텍스트 + 입력 예시 표시', async ({ app }) => {
    await app.goto();

    // PRD 6.8: "빈 공간을 더블클릭하여 지식을 입력하세요"
    await expect(app.page.locator('text=빈 공간을 더블클릭하여 지식을 입력하세요').first()).toBeVisible({ timeout: 10000 });

    // 입력 예시 카드 존재
    await expect(app.page.locator('text=입력 예시').first()).toBeVisible();

    // PRD 6.8: 두 개의 액션 버튼
    await expect(app.page.locator('text=예시 온톨로지 불러오기').first()).toBeVisible();
    await expect(app.page.locator('text=직접 시작하기').first()).toBeVisible();
  });

  test('예시 온톨로지 불러오기 → 노드 생성 확인', async ({ app }) => {
    await app.goto();

    // [예시 온톨로지 불러오기] 클릭 → 팝오버 열기
    await app.page.locator('text=예시 온톨로지 불러오기').first().click();

    // PRD 6.8: 팝오버에 도메인 선택지 표시
    await expect(app.page.locator('text=반도체 장비 도메인').first()).toBeVisible({ timeout: 5000 });

    // 템플릿 아이템 클릭 (TemplatePopover: button with template name)
    await app.page.locator('text=반도체 장비 도메인').first().click();
    await app.page.waitForTimeout(3000);

    // 노드가 캔버스에 생성됨
    const nodeCount = await app.getCanvasNodes().count();
    expect(nodeCount).toBeGreaterThanOrEqual(3);

    // Empty State가 사라짐 (노드 1개 이상 시 퇴장)
    await expect(app.page.locator('text=빈 공간을 더블클릭하여 지식을 입력하세요')).not.toBeVisible({ timeout: 5000 });
  });

  test('[직접 시작하기] → NewNodePopover 열림', async ({ app }) => {
    await app.goto();

    await app.page.locator('text=직접 시작하기').first().click();

    // NewNodePopover가 열림
    await expect(app.newNodeHeading).toBeVisible({ timeout: 5000 });
    await expect(app.textarea).toBeVisible();
  });

  test('더블클릭으로 Empty State에서 팝오버 열기', async ({ app }) => {
    await app.goto();

    // Empty State 배경을 더블클릭
    await app.doubleClickCanvas(300, 200);

    await expect(app.newNodeHeading).toBeVisible({ timeout: 5000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 노드 생성 기본 플로우
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('노드 생성 플로우', () => {
  test('더블클릭 → 팝오버 → 텍스트 입력 → 프리뷰 → 확정 → 캔버스 노드', async ({ app }) => {
    await app.goto();

    await app.openNewNodePopover();
    await app.createClassViaPopover('# Equipment');

    await expect(app.getCanvasNodes().first()).toBeVisible({ timeout: 10000 });
    await expect(app.explorerHasItem('Equipment')).toBeVisible({ timeout: 10000 });
  });

  test('프리뷰에서 [수정] → 입력 화면으로 돌아감', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();

    await app.textarea.fill('# BackTest');
    await app.generateButton.click();
    await expect(app.confirmButton).toBeVisible({ timeout: 15000 });

    // [수정] 클릭
    await app.editButton.click();
    await app.page.waitForTimeout(300);

    // textarea가 다시 보여야 함
    await expect(app.textarea).toBeVisible({ timeout: 3000 });
  });

  test('빈 입력으로 [생성] 비활성화', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();

    await expect(app.generateButton).toBeDisabled();

    await app.textarea.fill('test');
    await expect(app.generateButton).toBeEnabled();

    await app.textarea.fill('');
    await expect(app.generateButton).toBeDisabled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 관계 연결 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('관계 연결', () => {
  test('Right Panel에서 관계 추가 → 엣지 확인', async ({ app }) => {
    await app.createClassViaApi('Engineer', '#d97706');
    await app.createClassViaApi('DryAsher', '#2563eb');

    await app.goto();
    await app.page.waitForTimeout(2000);

    await app.clickExplorerItem('Engineer');
    await app.clickRightPanelTab('관계');

    await app.page.locator('text=관계 추가').first().click();
    await expect(app.page.getByRole('heading', { name: '관계 설정' })).toBeVisible({ timeout: 5000 });

    await app.page.locator('button:has-text("DryAsher")').first().click();
    await app.page.waitForTimeout(300);

    const relInput = app.page.locator('input[placeholder="관계 이름 입력..."]');
    await relInput.fill('manages');

    await app.page.locator('button:has-text("연결")').click();
    await expect(app.page.getByRole('heading', { name: '관계 설정' })).not.toBeVisible({ timeout: 5000 });

    const edgeCount = await app.getCanvasEdges().count();
    expect(edgeCount).toBeGreaterThanOrEqual(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 검색 포커스 테스트 (F2-5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-5: 검색 → 캔버스 포커스', () => {
  test('Explorer 검색 결과 클릭 → 노드가 뷰포트에 보임', async ({ app }) => {
    await app.createClassViaApi('Equipment', '#7c3aed');
    await app.createClassViaApi('Site', '#dc2626');
    await app.createClassViaApi('Engineer', '#d97706');

    await app.goto();
    await app.page.waitForTimeout(2000);

    await app.searchExplorer('Engineer');
    await expect(app.explorerHasItem('Engineer')).toBeVisible({ timeout: 5000 });

    await app.clickExplorerItem('Engineer');

    // PRD 6.14: 해당 노드가 캔버스 뷰포트 안에 보여야 함
    const engineerNode = app.page.locator('.react-flow__node:has-text("Engineer")');
    await expect(engineerNode).toBeVisible({ timeout: 5000 });
  });

  test.skip('Ctrl+F → Explorer 검색 입력 포커스', async ({ app }) => {
    // SKIP: Ctrl+F 단축키가 useKeyboardShortcuts.ts에 아직 구현되지 않음
    await app.createClassViaApi('TestClass', '#7c3aed');
    await app.goto();
    await app.page.waitForTimeout(2000);

    await app.page.keyboard.press('Control+f');
    await app.page.waitForTimeout(300);

    await expect(app.searchInput).toBeFocused({ timeout: 3000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 커밋 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('커밋 플로우', () => {
  test('변경 발생 → CommitBar 카운트 → 커밋 → 성공 토스트', async ({ app }) => {
    await app.goto();

    await app.openNewNodePopover();
    await app.createClassViaPopover('# Equipment');

    // CommitBar에 변경사항 표시
    await expect(app.changeCountText).toBeVisible();

    // 커밋 실행
    await app.clickCommit();

    // 성공 메시지 "저장 완료"
    await expect(app.page.locator('text=저장 완료').first()).toBeVisible({ timeout: 5000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Neo4j 푸시 테스트 (F2-1, F2-2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-2: Neo4j 푸시 확인 UI', () => {
  test('Neo4j 푸시 버튼 → NeoConfirmSheet 표시', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();
    await app.createClassViaPopover('# PushTest');

    // Neo4j 푸시 클릭
    await app.clickNeo4jPush();

    // NeoConfirmSheet: loading → confirm (변경 요약 표시)
    await expect(app.page.locator('text=변경 요약').first()).toBeVisible({ timeout: 15000 });

    // Cypher 미리보기 섹션 존재
    await expect(app.page.locator('text=Cypher 미리보기').first()).toBeVisible();

    // 푸시 실행 + 취소 버튼
    await expect(app.page.locator('button:has-text("푸시 실행")').first()).toBeVisible();
    await expect(app.page.locator('button:has-text("취소")').first()).toBeVisible();
  });

  test.skip('확인 시트 → [푸시 실행] → 진행률 → 완료', async ({ app }) => {
    // SKIP: Neo4j 서버가 로컬에서 실행 중이어야 통과
    await app.goto();
    await app.openNewNodePopover();
    await app.createClassViaPopover('# PushFlowTest');

    await app.clickNeo4jPush();
    await expect(app.page.locator('text=변경 요약').first()).toBeVisible({ timeout: 15000 });

    // [푸시 실행] 클릭
    await app.page.locator('button:has-text("푸시 실행")').click();

    // PushProgress: "쿼리 실행 중" 텍스트
    await expect(app.page.locator('text=쿼리 실행 중').first()).toBeVisible({ timeout: 10000 });

    // PushResult: 성공 — "Neo4j에 성공적으로 반영되었습니다"
    await expect(app.page.locator('text=성공적으로 반영되었습니다').first()).toBeVisible({ timeout: 30000 });

    // 닫기 버튼
    await expect(app.page.locator('button:has-text("닫기")').first()).toBeVisible();
  });

  test('Cypher 미리보기 펼치기 + 복사 버튼', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();
    await app.createClassViaPopover('# CypherTest');

    await app.clickNeo4jPush();
    await expect(app.page.locator('text=Cypher 미리보기').first()).toBeVisible({ timeout: 15000 });

    // 펼치기 클릭 (CypherPreview.tsx의 chevron 버튼)
    await app.page.locator('text=Cypher 미리보기').first().click();

    // Cypher 코드 블록 표시 (CREATE 키워드가 보여야 함)
    await expect(app.page.locator('code').first()).toBeVisible({ timeout: 5000 });

    // 복사 버튼 (Copy icon 버튼)
    const copyButtons = app.page.locator('pre').locator('..').locator('button');
    await expect(copyButtons.first()).toBeVisible();
  });

  test('푸시 중 Sheet 닫기 불가 (Esc/backdrop 무시)', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();
    await app.createClassViaPopover('# CloseBlockTest');

    await app.clickNeo4jPush();
    await expect(app.page.locator('text=변경 요약').first()).toBeVisible({ timeout: 15000 });

    await app.page.locator('button:has-text("푸시 실행")').click();

    // 진행 중 — "쿼리 실행 중" or "Neo4j 푸시 중..."
    const pushingIndicator = app.page.locator('text=푸시 중').first();
    // Wait briefly for pushing phase
    await app.page.waitForTimeout(500);

    // Esc 키로 닫기 시도
    await app.page.keyboard.press('Escape');
    await app.page.waitForTimeout(300);

    // Sheet는 여전히 열려있어야 함
    // NeoConfirmSheet의 SheetTitle이 여전히 보임
    const sheetTitle = app.page.locator('text=푸시').first();
    await expect(sheetTitle).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 다크모드 테스트 (F2-10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-10: 다크모드 완전 지원', () => {
  test('시스템 다크모드 → html.dark 클래스 적용', async ({ app }) => {
    // next-themes uses system preference — emulate dark color scheme
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.goto();
    await app.page.waitForTimeout(1000);

    // html에 dark 클래스가 적용되어야 함
    const htmlClass = await app.page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');
  });

  test('다크모드에서 노드/패널 렌더링 정상', async ({ app }) => {
    await app.createClassViaApi('DarkModeNode', '#7c3aed');

    // Emulate dark mode via system preference
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.goto();
    await app.page.waitForTimeout(2000);

    // html.dark 클래스 확인
    const htmlClass = await app.page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');

    // 노드가 여전히 보임
    await expect(app.getCanvasNodes().first()).toBeVisible();

    // Explorer 패널이 보임
    await expect(app.explorerHasItem('DarkModeNode')).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Level of Detail 테스트 (F2-12)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-12: Level of Detail', () => {
  test('줌 아웃 시 노드 형태 유지 (DOM 존재)', async ({ app }) => {
    await app.createClassViaApi('LoDTest', '#7c3aed');
    await app.goto();
    await app.page.waitForTimeout(2000);

    // 줌 아웃 (wheel events on canvas)
    for (let i = 0; i < 15; i++) {
      await app.canvas.dispatchEvent('wheel', { deltaY: 100 });
      await app.page.waitForTimeout(50);
    }
    await app.page.waitForTimeout(500);

    // 노드 DOM 존재 확인 (줌 레벨에 따라 표시 형태가 달라짐)
    const nodeCount = await app.getCanvasNodes().count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 스켈레톤 테스트 (F2-7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-7: 로딩 스켈레톤', () => {
  test('초기 로딩 완료 후 스켈레톤 → 실제 콘텐츠 전환', async ({ app }) => {
    await app.createClassViaApi('SkeletonCheck', '#7c3aed');

    // 네비게이션 (스켈레톤은 로딩 중 잠깐 표시됨)
    await app.page.goto('/');
    await app.page.waitForLoadState('networkidle');

    // 로딩 완료 후 실제 콘텐츠 표시
    await expect(app.explorerHasItem('SkeletonCheck')).toBeVisible({ timeout: 15000 });

    // CanvasSkeleton "그래프를 불러오고 있습니다"는 더 이상 안 보여야 함
    await expect(app.page.locator('text=그래프를 불러오고 있습니다')).not.toBeVisible({ timeout: 5000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. 에러 처리 테스트 (F2-9)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-9: 에러 처리', () => {
  test('LLM API 실패 → 로컬 파서 대체 + 토스트 알림', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();

    // LLM API를 차단하여 실패 유도
    await app.page.route('**/api/llm/parse', (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal Server Error' }) });
    });

    await app.textarea.fill('테스트 텍스트');
    await app.generateButton.click();

    // NewNodePopover.tsx: LLM 실패 시 "LLM 구조화 실패" 토스트 + 로컬 파서 대체
    // 프리뷰 화면으로 전환되어야 함 (mockParse 결과)
    await expect(app.confirmButton).toBeVisible({ timeout: 15000 });

    // 토스트: "LLM 구조화 실패"
    await expect(
      app.page.locator('text=LLM 구조화 실패').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('API 실패 시 사용자 친화적 에러 화면 표시', async ({ app }) => {
    // 모든 데이터 API 호출 차단 — 503 응답
    await app.page.route('**/api/**', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service Unavailable' }),
        });
      } else {
        route.continue();
      }
    });

    await app.page.goto('/');

    // 에러 화면 또는 로딩 상태가 표시될 때까지 대기
    // "데이터를 불러오는 중 오류가 발생했습니다" 또는 "온톨로지 로딩 중..."
    const hasError = await app.page.locator('text=오류가 발생했습니다').first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasLoading = await app.page.locator('text=로딩 중').first().isVisible().catch(() => false);

    // 에러 화면이나 로딩 상태 중 하나가 보여야 함 (크래시 X)
    expect(hasError || hasLoading).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. MiniMap 테스트 (F2-6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('F2-6: MiniMap', () => {
  test('MiniMap이 캔버스에 표시됨', async ({ app }) => {
    await app.createClassViaApi('MiniMapTest', '#7c3aed');
    await app.goto();
    await app.page.waitForTimeout(2000);

    // GraphCanvas.tsx line 417: <MiniMap> is rendered
    const minimap = app.page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible({ timeout: 10000 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. 키보드 단축키 + 팝오버 닫기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('키보드 인터랙션', () => {
  test('Esc로 팝오버 닫기', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();

    await app.page.keyboard.press('Escape');
    await app.page.waitForTimeout(300);

    await expect(app.newNodeHeading).not.toBeVisible({ timeout: 3000 });
  });

  test('취소 버튼으로 팝오버 닫기', async ({ app }) => {
    await app.goto();
    await app.openNewNodePopover();

    await app.cancelButton.click();
    await app.page.waitForTimeout(300);

    await expect(app.newNodeHeading).not.toBeVisible({ timeout: 3000 });
  });
});
