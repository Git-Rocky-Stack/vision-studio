/**
 * Page Object for the Batch panel.
 *
 * Encapsulates selectors and actions for the batch generation workflow.
 */
import type { Page } from '@playwright/test';

export class BatchPage {
  constructor(private page: Page) {}

  // ── Navigation ────────────────────────────────────────────────

  /** Click the Batch nav item in the sidebar */
  async navigateTo() {
    await this.page.getByTestId('nav-generate').click();
    await this.page.getByRole('tab', { name: 'Batch' }).click();
  }

  // ── Selectors ─────────────────────────────────────────────────

  /** All prompt input textareas in the batch queue */
  get promptInputs() {
    return this.page.locator('textarea');
  }

  /** The "Add Prompt" button */
  get addPromptButton() {
    return this.page.getByRole('button', { name: /add prompt/i });
  }

  /** The main "Generate All" / "Start Batch" button */
  get startBatchButton() {
    return this.page.getByRole('button', { name: /generate|start batch/i });
  }

  /** Result cards rendered in the results grid */
  get resultCards() {
    return this.page.locator('[data-testid^="result-card-"]');
  }

  // ── Actions ───────────────────────────────────────────────────

  /** Add a prompt to the batch queue */
  async addPrompt(text: string) {
    // Click the add button, then fill the most recently added textarea
    await this.addPromptButton.click();
    const inputs = this.promptInputs;
    const lastInput = inputs.last();
    await lastInput.fill(text);
  }

  /** Start the batch generation */
  async clickStartBatch() {
    await this.startBatchButton.click();
  }
}
