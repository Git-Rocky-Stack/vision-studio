import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1, // Electron tests must run serially
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
  // Visual regression testing configuration
  snapshotPathTemplate: '{testDir}/visual/snapshots/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  visualRegression: {
    threshold: 0.01, // 1% pixel difference allowed
    updateSnapshots: process.env.CI ? 'never' : 'missing',
    snapshotsDir: 'tests/e2e/visual/snapshots',
  },
});
