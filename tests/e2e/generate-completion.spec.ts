/**
 * E2E: Completed image generation against a MOCKED backend.
 *
 * This is the completion path the previous happy-path test deliberately could
 * not cover (it ran with no backend, so generation always failed). Here an
 * in-process HTTP mock (tests/e2e/fixtures/mockBackend.ts) stands in for the
 * Python backend and drives a job all the way to a rendered preview, proving the
 * full chain the audit (P0 - "Backend and E2E gates") flagged as unverified:
 *
 *   job submission -> progress update -> completed status -> generated image
 *   preview renders (no CSP error) -> asset record created.
 *
 * How the backend gate is satisfied without a real process: the app is launched
 * with VISION_STUDIO_SKIP_BACKEND=1 (don't spawn Python) AND
 * VISION_STUDIO_BACKEND_EXTERNAL=1 (treat the backend as externally managed and
 * probe it over HTTP). getSystemInfo() then probes the mock's /api/system/info
 * and reports backendConnected: true, so the Generate gate opens.
 *
 * Requires a built app (`npm run build`); skips gracefully if dist-electron is
 * missing. Runs on the Windows release/E2E path (pr-gate does not run Electron).
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { GeneratePage } from './pages/generate.page';
import { SidebarPage } from './pages/sidebar.page';
import { startMockBackend, type MockBackend } from './fixtures/mockBackend';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const mainEntry = path.join(projectRoot, 'dist-electron/main.mjs');

const CSP_VIOLATION = /content security policy|refused to (load|connect)/i;

test.describe('Generate - Completed generation (mocked backend)', () => {
  test.skip(!fs.existsSync(mainEntry), 'Skipped: run `npm run build` first');

  let app: ElectronApplication;
  let page: Page;
  let mock: MockBackend;
  let userDataDir: string;
  let cspErrors: string[];

  test.beforeEach(async () => {
    cspErrors = [];
    // Start the mock BEFORE launching Electron so the app's mount-time
    // system-info probe already finds a connected backend.
    mock = await startMockBackend();

    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-studio-e2e-complete-'));
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, mainEntry],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        VISION_STUDIO_SKIP_BACKEND: '1', // do not spawn the real Python backend
        VISION_STUDIO_BACKEND_EXTERNAL: '1', // detect our mock over HTTP
      },
    });

    page = await app.firstWindow();
    page.on('console', (msg) => {
      if (CSP_VIOLATION.test(msg.text())) {
        cspErrors.push(msg.text());
      }
    });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-testid="nav-generate"]', { timeout: 15_000 });
  });

  test.afterEach(async () => {
    await app?.close();
    await mock?.close();
    if (userDataDir) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('submits a job, shows progress, completes, and renders the generated preview', async () => {
    const generate = new GeneratePage(page);
    const sidebar = new SidebarPage(page);

    await generate.navigateTo();
    await generate.setPrompt('A cinematic portrait in golden hour light');
    await expect(generate.generateButton).toBeEnabled();

    await generate.clickGenerate();

    // 1. Progress: the generating state surfaces the progress indicator.
    await expect(generate.progressBar).toBeVisible({ timeout: 15_000 });

    // 2. Completion: the success banner appears (genStatus.status === 'success').
    await expect(page.locator('[class*="status-success"]').first()).toBeVisible({ timeout: 30_000 });

    // The mock actually received the submission and at least one status poll.
    expect(mock.requests).toContain('POST /api/generate/image');
    expect(mock.requests).toContain(`GET /api/jobs/${mock.jobId}`);

    // 3. Asset record created: the Assets panel is no longer empty.
    await sidebar.navigateTo('assets');
    await expect(page.getByText('No assets yet')).toHaveCount(0);

    const previews = page.getByTestId(/^asset-preview-/);
    await expect(previews.first()).toBeVisible();
    expect(await previews.count()).toBeGreaterThan(0);

    // 4. The generated image actually painted. The preview <img> is lazy-loaded
    //    inside a virtualized grid, so scroll it into view to trigger the fetch,
    //    then assert it decoded to real pixels (naturalWidth > 0) - which proves
    //    CSP allowed the http://localhost:8000/outputs load and the mock served
    //    the bytes. ImageWithFallback only clears the `invisible` class on its
    //    onLoad, so visibility is a second, independent confirmation.
    const img = previews.first().locator('img');
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(img).toBeVisible();
    expect(mock.requests).toContain(`GET ${mock.outputPath}`);

    // 5. No CSP violations were logged for the generated media.
    expect(cspErrors).toEqual([]);
  });
});
