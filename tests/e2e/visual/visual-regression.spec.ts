/**
 * Visual Regression Tests for Vision Studio Electron App
 *
 * Captures and compares screenshots of key UI states to detect unintended visual changes.
 * Uses Playwright's built-in screenshot comparison with configurable threshold.
 *
 * Run: npm run test:visual
 * Update baselines: npm run test:visual:update
 */
import { test, expect } from '../fixtures/electron.fixture';
import { GeneratePage } from '../pages/generate.page';
import { SidebarPage } from '../pages/sidebar.page';
import { BatchPage } from '../pages/batch.page';

test.describe('Visual Regression', () => {
  test.describe('Generate Panel', () => {
    test('Generate panel - default state', async ({ page }) => {
      const sidebar = new SidebarPage(page);
      await sidebar.navigateTo('generate');
      await page.waitForTimeout(500); // Allow animations to settle

      await expect(page).toHaveScreenshot('generate-panel-default.png', {
        fullPage: false,
        mask: [],
      });
    });

    test('Generate panel - with prompt entered', async ({ page }) => {
      const generate = new GeneratePage(page);
      await generate.setPrompt('A cinematic portrait in golden hour light, professional photography, 85mm lens');
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot('generate-panel-with-prompt.png', {
        fullPage: false,
      });
    });

  });

  test.describe('Assets Panel', () => {
    test('Assets panel - grid view', async ({ page }) => {
      const sidebar = new SidebarPage(page);
      await sidebar.navigateTo('assets');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('assets-panel-grid-view.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Settings Panel', () => {
    test('Settings panel - all sections', async ({ page }) => {
      const sidebar = new SidebarPage(page);
      await sidebar.navigateTo('settings');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('settings-panel-all-sections.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Batch Panel', () => {
    test('Batch panel - default state', async ({ page }) => {
      const sidebar = new SidebarPage(page);
      await sidebar.navigateTo('batch');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('batch-panel-default.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Templates Panel', () => {
    test('Templates panel - default state', async ({ page }) => {
      const sidebar = new SidebarPage(page);
      await sidebar.navigateTo('templates');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('templates-panel-default.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Dark Theme Consistency', () => {
    test('Dark theme - all panels visual consistency', async ({ page }) => {
      const sidebar = new SidebarPage(page);

      // Capture each panel to verify consistent dark theme styling
      await sidebar.navigateTo('generate');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('theme-generate-panel.png', { fullPage: false });

      await sidebar.navigateTo('assets');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('theme-assets-panel.png', { fullPage: false });

      await sidebar.navigateTo('settings');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot('theme-settings-panel.png', { fullPage: false });
    });
  });
});
