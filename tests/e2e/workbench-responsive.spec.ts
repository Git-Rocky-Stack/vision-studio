/**
 * E2E: Workbench responsive layout.
 *
 * Validates that the Generate workbench keeps a usable center surface on narrow
 * desktop/tablet widths. The test uses the built Electron app so CSS layout is
 * measured by a real browser engine.
 */
import { test, expect } from './fixtures/electron.fixture';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '../../dist-electron/main.mjs');

test.describe('Workbench responsive layout', () => {
  test.skip(!fs.existsSync(MAIN_ENTRY), 'Skipped: run `npm run build` first');

  test('keeps the Generate center work area usable at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 760 });

    const centerPanel = page.locator('[role="tabpanel"][aria-labelledby="center-tab-canvas"]');
    await expect(centerPanel).toBeVisible();

    const centerBox = await centerPanel.boundingBox();
    expect(centerBox?.width ?? 0).toBeGreaterThan(180);
  });

  test('keeps the Generate center work area visible on phone widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });

    const centerPanel = page.locator('[role="tabpanel"][aria-labelledby="center-tab-canvas"]');
    await expect(centerPanel).toBeVisible();

    const centerBox = await centerPanel.boundingBox();
    expect(centerBox?.width ?? 0).toBeGreaterThan(180);
  });
});
