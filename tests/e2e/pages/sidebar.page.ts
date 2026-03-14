/**
 * Page Object for the Sidebar navigation.
 *
 * Encapsulates selectors and actions for navigating between panels.
 */
import type { Page } from '@playwright/test';

export class SidebarPage {
  constructor(private page: Page) {}

  // ── Navigation helpers ────────────────────────────────────────

  async navigateTo(panel: 'generate' | 'batch' | 'templates' | 'edit' | 'assets' | 'settings') {
    await this.page.getByTestId(`nav-${panel}`).click();
  }

  /** Get the currently active nav item */
  async getActivePanel(): Promise<string | null> {
    const activeButton = this.page.locator('[data-testid^="nav-"][aria-current="page"]');
    const testId = await activeButton.getAttribute('data-testid');
    return testId?.replace('nav-', '') ?? null;
  }

  /** Toggle the sidebar collapse */
  async toggleCollapse() {
    await this.page.getByRole('button', { name: /collapse|expand/i }).click();
  }
}
