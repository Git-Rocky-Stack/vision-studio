/**
 * Playwright fixture that launches the Electron app for E2E testing.
 *
 * Usage:
 *   import { test, expect } from './fixtures/electron.fixture';
 *   test('my test', async ({ app, page }) => { ... });
 *
 * Requirements:
 *   - Run `npm run build` first so dist/ and dist-electron/ exist.
 *   - The fixture launches Electron in production-like mode (no dev server).
 *   - Backend autostart is disabled to keep tests fast and isolated.
 */
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ElectronFixtures {
  app: ElectronApplication;
  page: Page;
}

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mainEntry = path.join(projectRoot, 'dist-electron/main.mjs');

    const electronApp = await electron.launch({
      args: [mainEntry],
      cwd: projectRoot,
      env: {
        ...process.env,
        // Prevent backend from starting during E2E tests
        NODE_ENV: 'test',
        VISION_STUDIO_SKIP_BACKEND: '1',
      },
    });

    await use(electronApp);
    await electronApp.close();
  },

  page: async ({ app }, use) => {
    // Wait for the first BrowserWindow to appear
    const window = await app.firstWindow();
    // Wait for the app to be interactive
    await window.waitForLoadState('domcontentloaded');
    // Wait for the sidebar nav to render (app is ready)
    await window.waitForSelector('[data-testid="nav-generate"]', { timeout: 15_000 });
    await use(window);
  },
});

export { expect } from '@playwright/test';
