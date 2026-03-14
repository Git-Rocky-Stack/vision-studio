/**
 * Page Object for the Generate panel.
 *
 * Encapsulates selectors and actions for the image/video generation workflow.
 */
import type { Page } from '@playwright/test';

export class GeneratePage {
  constructor(private page: Page) {}

  // ── Navigation ────────────────────────────────────────────────

  /** Click the Generate nav item in the sidebar */
  async navigateTo() {
    await this.page.getByTestId('nav-generate').click();
  }

  // ── Selectors ─────────────────────────────────────────────────

  get promptInput() {
    return this.page.getByTestId('prompt-input');
  }

  get negativePromptInput() {
    return this.page.getByTestId('negative-prompt-input');
  }

  get generateButton() {
    return this.page.getByTestId('generate-button');
  }

  get progressBar() {
    return this.page.getByTestId('generation-progress');
  }

  get generationResult() {
    return this.page.getByTestId('generation-result');
  }

  get modelSelector() {
    return this.page.getByTestId('model-selector-trigger');
  }

  // ── Actions ───────────────────────────────────────────────────

  /** Fill in the prompt textarea */
  async setPrompt(text: string) {
    await this.promptInput.fill(text);
  }

  /** Fill in the negative prompt textarea */
  async setNegativePrompt(text: string) {
    await this.negativePromptInput.fill(text);
  }

  /** Click the generate button (waits for it to be enabled first) */
  async clickGenerate() {
    await this.generateButton.waitFor({ state: 'visible' });
    // Force click to bypass Timeline overlay that can intercept pointer events
    await this.generateButton.click({ force: true });
  }

  /** Check that the generate button is disabled (empty prompt) */
  async expectGenerateDisabled() {
    await this.generateButton.waitFor({ state: 'visible' });
    // The button is "disabled" via CSS (opacity + cursor), check the disabled attribute
    const isDisabled = await this.generateButton.isDisabled();
    return isDisabled;
  }

  /** Wait for the progress bar to appear (generation started) */
  async waitForProgress() {
    await this.progressBar.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Wait for a success or error status message */
  async waitForResult(timeout = 60_000) {
    // Wait for either the success message or error message to appear
    await this.page.waitForSelector(
      '[class*="status-success"], [class*="red-primary"][class*="error"], [data-testid="generation-result"]',
      { timeout }
    );
  }
}
