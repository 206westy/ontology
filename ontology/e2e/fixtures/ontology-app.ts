import { test as base, expect, type Page, type Locator } from '@playwright/test';

/**
 * Page Object Model for Ontology Studio
 * Encapsulates all page interactions for stable, maintainable E2E tests.
 */
export class OntologyApp {
  readonly page: Page;

  // Layout panels
  readonly explorerPanel: Locator;
  readonly rightPanel: Locator;
  readonly canvas: Locator;
  readonly commitBar: Locator;
  readonly toolbar: Locator;

  // Explorer elements
  readonly searchInput: Locator;
  readonly addClassButton: Locator;

  // CommitBar elements
  readonly changeCountText: Locator;
  readonly undoButton: Locator;
  readonly changeLogButton: Locator;
  readonly commitButton: Locator;
  readonly neo4jPushButton: Locator;

  // Popover elements
  readonly newNodeHeading: Locator;
  readonly textarea: Locator;
  readonly generateButton: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;
  readonly editButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.explorerPanel = page.locator('aside').first();
    this.rightPanel = page.locator('aside').last();
    this.canvas = page.locator('.react-flow');
    this.commitBar = page.locator('footer, [class*="commit"]').first();
    this.toolbar = page.locator('header, [class*="toolbar"]').first();

    // Explorer
    this.searchInput = page.locator('input[placeholder*="검색"]');
    this.addClassButton = page.locator('button:has-text("새 클래스 추가")');

    // CommitBar
    this.changeCountText = page.locator('text=변경사항').first();
    this.undoButton = page.locator('button:has-text("되돌리기")');
    this.changeLogButton = page.locator('button:has-text("변경 내역")');
    this.commitButton = page.locator('[data-testid="commit-btn"]');
    this.neo4jPushButton = page.locator('[data-testid="neo4j-push-btn"]');

    // Popover
    this.newNodeHeading = page.getByRole('heading', { name: '새 노드' });
    this.textarea = page.locator('role=dialog >> textarea').first();
    this.generateButton = page.locator('button:has-text("생성")');
    this.confirmButton = page.locator('button:has-text("확정")');
    this.cancelButton = page.locator('button:has-text("취소")');
    this.editButton = page.locator('button:has-text("수정")');
  }

  // ── Navigation ──────────────────────────────────────────

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    // Wait for splash screen to complete (if present)
    await this.page.waitForFunction(
      () => !document.querySelector('[class*="fixed"][class*="z-"]')?.textContent?.includes('Loading workspace'),
      { timeout: 15000 },
    ).catch(() => { /* splash may not be present or already done */ });
  }

  /**
   * Navigate and wait until React Flow nodes are rendered on canvas.
   * Use after createClassViaApi() to ensure nodes are visible before interacting.
   */
  async gotoAndWaitForNodes(expectedCount = 1) {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    // Wait for splash screen to disappear (if present)
    await this.page.waitForFunction(
      () => !document.querySelector('[class*="fixed"][class*="z-"]')?.textContent?.includes('Loading workspace'),
      { timeout: 15000 },
    ).catch(() => { /* splash may not be present */ });
    // Wait for React Flow nodes to render
    await this.page.waitForSelector('.react-flow__node', { timeout: 30000 });
    await this.page.waitForFunction(
      (count) => document.querySelectorAll('.react-flow__node').length >= count,
      expectedCount,
      { timeout: 30000 },
    );
  }

  // ── API Cleanup ─────────────────────────────────────────

  async cleanupAll() {
    const classesRes = await this.page.request.get('/api/classes');
    const classes = await classesRes.json();
    for (const cls of classes) {
      await this.page.request.delete(`/api/classes/${cls.id}`);
    }
    const rtRes = await this.page.request.get('/api/relation-types');
    const rts = await rtRes.json();
    for (const rt of rts) {
      await this.page.request.delete(`/api/relation-types/${rt.id}`);
    }
  }

  // ── API Seed Helpers ────────────────────────────────────

  async createClassViaApi(name: string, color = '#7c3aed', description = '') {
    const res = await this.page.request.post('/api/classes', {
      data: { name, color, description },
    });
    return res.json();
  }

  async createInstanceViaApi(classId: string, name: string) {
    const res = await this.page.request.post('/api/instances', {
      data: { classId, name },
    });
    return res.json();
  }

  async createRelationTypeViaApi(name: string) {
    const res = await this.page.request.post('/api/relation-types', {
      data: { name },
    });
    return res.json();
  }

  async createEdgeViaApi(
    relationTypeId: string,
    sourceId: string,
    targetId: string,
    sourceKind = 'class',
    targetKind = 'class',
  ) {
    const res = await this.page.request.post('/api/edges', {
      data: { relationTypeId, sourceId, targetId, sourceKind, targetKind },
    });
    return res.json();
  }

  // ── Canvas Interactions ─────────────────────────────────

  async doubleClickCanvas(x = 400, y = 300) {
    const canvas = this.page.locator('.react-flow__pane, [data-testid="empty-state"]').first();
    await canvas.waitFor({ state: 'visible', timeout: 10000 });
    await canvas.dblclick({ position: { x, y }, force: true });
  }

  async openNewNodePopover(x = 400, y = 300) {
    await this.doubleClickCanvas(x, y);
    await expect(this.newNodeHeading).toBeVisible({ timeout: 5000 });
  }

  async createClassViaPopover(text: string) {
    await this.textarea.fill(text);
    await this.generateButton.click();
    await expect(this.confirmButton).toBeVisible({ timeout: 15000 });
    await this.confirmButton.click();
    await expect(this.page.locator('role=dialog')).not.toBeVisible({ timeout: 5000 });
    // Wait for React Flow to render the node
    await this.page.waitForTimeout(1500);
  }

  getCanvasNodes() {
    return this.page.locator('.react-flow__node');
  }

  getCanvasEdges() {
    return this.page.locator('.react-flow__edge');
  }

  async selectNodeOnCanvas(index = 0) {
    const node = this.getCanvasNodes().nth(index);
    await node.waitFor({ state: 'visible', timeout: 15000 });
    await node.click();
    await this.page.waitForTimeout(500);
  }

  // ── Explorer Interactions ───────────────────────────────

  async searchExplorer(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(300);
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(300);
  }

  async clickExplorerItem(name: string) {
    await this.explorerPanel.locator(`text=${name}`).first().click();
    await this.page.waitForTimeout(500);
  }

  async expandTreeItem(name: string) {
    const chevron = this.explorerPanel
      .locator(`text=${name}`)
      .first()
      .locator('..')
      .locator('button')
      .first();
    if (await chevron.isVisible().catch(() => false)) {
      await chevron.click();
      await this.page.waitForTimeout(300);
    }
  }

  explorerHasItem(name: string) {
    return this.explorerPanel.locator(`text=${name}`).first();
  }

  // ── Right Panel Interactions ────────────────────────────

  async clickRightPanelTab(tabName: string) {
    await this.page.locator(`button:has-text("${tabName}")`).first().click();
    await this.page.waitForTimeout(300);
  }

  async addPropertyInline(name: string, dataType?: string) {
    await this.page.locator('text=프로퍼티 추가').first().click();
    const input = this.page.locator('input[placeholder="이름"]');
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill(name);
    if (dataType) {
      const select = this.page.locator('select');
      if (await select.isVisible()) {
        await select.selectOption(dataType);
      }
    }
    await input.press('Enter');
    await this.page.waitForTimeout(500);
  }

  async clickDeleteButton() {
    const deleteBtn = this.page.locator('button[title="삭제 (Delete)"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
  }

  // ── CommitBar Interactions ──────────────────────────────

  async openChangeLog() {
    await this.changeLogButton.click();
    await this.page.waitForTimeout(500);
  }

  async clickCommit() {
    await this.commitButton.click();
  }

  async clickNeo4jPush() {
    await this.neo4jPushButton.click();
  }

  async clickUndo() {
    await this.undoButton.click();
    await this.page.waitForTimeout(500);
  }

  // ── Theme ───────────────────────────────────────────────

  async toggleDarkMode() {
    // Look for theme toggle button (sun/moon icon)
    const themeToggle = this.page.locator('button:has([class*="sun"]), button:has([class*="moon"]), button[aria-label*="theme"], button[aria-label*="테마"]').first();
    if (await themeToggle.isVisible().catch(() => false)) {
      await themeToggle.click();
      await this.page.waitForTimeout(500);
    }
  }

  async isDarkMode() {
    return this.page.locator('html.dark, [data-theme="dark"]').count().then((c) => c > 0);
  }
}

// ── Custom Fixture ────────────────────────────────────────

type OntologyFixtures = {
  app: OntologyApp;
};

export const test = base.extend<OntologyFixtures>({
  app: async ({ page }, use) => {
    // Skip onboarding overlay in all tests
    await page.addInitScript(() => {
      localStorage.setItem('onboarding_completed', 'true');
    });
    const app = new OntologyApp(page);
    await app.cleanupAll();
    await use(app);
  },
});

export { expect } from '@playwright/test';
