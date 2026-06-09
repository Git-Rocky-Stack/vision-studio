/**
 * Page Object for the Sidebar navigation.
 *
 * Encapsulates selectors and actions for navigating between panels.
 */
import type { Page } from '@playwright/test';

export class SidebarPage {
  constructor(private page: Page) {}

  // ── Navigation helpers ────────────────────────────────────────

  async navigateTo(panel: 'generate' | 'batch' | 'templates' | 'canvas' | 'assets' | 'settings') {
    if (panel === 'batch') {
      await this.page.getByTestId('nav-generate').click();
      await this.page.getByRole('tab', { name: 'Batch' }).click();
      await this.waitForPanelReady();
      return;
    }

    if (panel === 'templates') {
      await this.page.getByTestId('nav-story').click();
      await this.page.getByRole('tab', { name: 'Templates' }).click();
      await this.waitForPanelReady();
      return;
    }

    await this.page.getByTestId(`nav-${panel}`).click();
    await this.waitForPanelReady();
  }

  /**
   * Heavy non-startup surfaces (batch, studio, storyboard, templates, edit,
   * pipeline) are React.lazy-loaded, so navigating to one briefly shows a
   * Suspense fallback. Wait for it to clear so callers can assert on real panel
   * content. Resolves immediately when the panel is eager or already cached.
   */
  private async waitForPanelReady() {
    await this.page
      .locator('[aria-label="Loading panel"]')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => {});
  }

  /** Get the currently active nav item */
  async getActivePanel(): Promise<string | null> {
    const activeButton = this.page.locator('[data-testid^="nav-"][aria-selected="true"]');
    const testId = await activeButton.getAttribute('data-testid');
    const activePanel = testId?.replace('nav-', '') ?? null;

    if (activePanel === 'generate') {
      const activeGenerateMode = this.page
        .locator('#settings-segmented-control [role="tab"][aria-selected="true"]')
        .first();
      const label = (await activeGenerateMode.textContent().catch(() => null))?.trim().toLowerCase();
      return label || activePanel;
    }

    return activePanel;
  }

  /** Toggle the sidebar collapse */
  async toggleCollapse() {
    await this.page.getByRole('button', { name: /collapse|expand/i }).click();
  }
}
