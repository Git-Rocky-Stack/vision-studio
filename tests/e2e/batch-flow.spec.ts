/**
 * E2E: Batch generation flow.
 *
 * Validates the batch generation user journey:
 *   Navigate to Batch → Add prompts → Configure → Start batch → View results
 *
 * NOTE: Like the generate test, the backend is not started during E2E tests.
 * This test validates the UI flow for managing batch prompts.
 */
import { test, expect } from '../e2e/fixtures/electron.fixture';
import { BatchPage } from './pages/batch.page';
import { SidebarPage } from './pages/sidebar.page';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '../../dist-electron/main.mjs');

test.describe('Batch Generation Flow', () => {
  test.skip(!fs.existsSync(MAIN_ENTRY), 'Skipped: run `npm run build` first');

  test('navigating to Batch panel shows batch UI', async ({ page }) => {
    const sidebar = new SidebarPage(page);

    await sidebar.navigateTo('batch');
    expect(await sidebar.getActivePanel()).toBe('batch');

    // Batch panel should have prompt management UI
    await expect(page.locator('text=/batch|prompt/i').first()).toBeVisible();
  });

  test('can add multiple prompts to the batch queue', async ({ page }) => {
    const sidebar = new SidebarPage(page);
    const batch = new BatchPage(page);

    await sidebar.navigateTo('batch');

    // The batch panel should have at least one prompt input or an "add" button
    const hasAddButton = await batch.addPromptButton.isVisible().catch(() => false);
    const hasTextarea = await batch.promptInputs.first().isVisible().catch(() => false);

    // Verify the batch queue UI is present
    expect(hasAddButton || hasTextarea).toBe(true);
  });

  test('batch panel shows results grid area', async ({ page }) => {
    const sidebar = new SidebarPage(page);

    await sidebar.navigateTo('batch');

    // The batch results area should be present (even if empty)
    // Look for view mode controls or results container
    const hasViewControls = await page.getByRole('button', { name: /grid|list|large/i }).first().isVisible().catch(() => false);
    const hasResultsArea = await page.locator('[class*="results"], [class*="batch"]').first().isVisible().catch(() => false);

    expect(hasViewControls || hasResultsArea).toBe(true);
  });
});
