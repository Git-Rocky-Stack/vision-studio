import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Visual regression tolerance: allow up to 2% of pixels to differ. Windows
    // GPU text anti-aliasing jitters a pixel or two between renders, which
    // tripped the suite at a tighter bound; 2% absorbs that without masking a
    // real visual change. Individual assertions may override this inline.
    // NOTE: `threshold` (per-pixel colour sensitivity) is intentionally left at
    // Playwright's 0.2 default - tightening it was the source of the AA flake.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  retries: 1,
  workers: 1, // Electron tests must run serially
  // Never rewrite baselines on CI - a visual diff (or a missing baseline) must
  // fail the run, not be silently regenerated into a green pass. Locally,
  // create any missing baselines on first run. ('none' is the valid Playwright
  // value; the legacy 'never' was a no-op typo in the old config block.)
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  outputDir: 'test-results',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // Visual snapshots live beside the spec under tests/e2e/visual/snapshots,
  // keyed by name + project + platform. No Playwright projects are defined, so
  // the project segment is empty and baselines are e.g.
  // generate-panel-default--win32.png on the Windows runner. This template
  // fully governs snapshot location, so no separate snapshotDir is needed.
  snapshotPathTemplate: '{testDir}/visual/snapshots/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
});
