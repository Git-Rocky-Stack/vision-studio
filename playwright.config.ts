import { defineConfig } from '@playwright/test';

/**
 * The origin the performance suite measures. Imported by
 * tests/e2e/performance/performance.spec.ts so the address is declared once.
 *
 * Deliberately NOT `vite preview`'s default :4173. That default is shared by
 * every Vite project on the machine, and `reuseExistingServer` probes the URL
 * before it runs `command` - so whatever answers first is measured, whether or
 * not it is this app. That is not hypothetical: :4173 was found serving an
 * unrelated project's `vite preview` (title "WealthWise OS"), which the
 * performance specs would have measured as if it were Vision Studio.
 *
 * The dev server below stays on :5173 by contrast. Its port is load-bearing
 * elsewhere - the backend's CORS allow-list (backend/main.py:436) and the
 * documented dev workflow (CONTRIBUTING.md:92) both name it - and the specs it
 * serves assert on behaviour, so a foreign app on that port fails them loudly
 * on a missing selector rather than yielding a plausible wrong number.
 */
export const PREVIEW_URL = 'http://127.0.0.1:4273';

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
  // Two servers, because two kinds of spec want two different things.
  //
  // [0] Vite dev server on :5173 - functional, a11y and visual specs. They
  //     assert on behaviour and pixels, both identical between dev and build,
  //     and the dev server keeps their feedback loop fast.
  // [1] `vite preview` on PREVIEW_URL serving a fresh production build - the
  //     performance specs only. Measuring the dev server measured Vite: 250
  //     resource entries against a `< 250` budget where the shipped bundle
  //     requests 17. The build is re-run here rather than assumed so the
  //     numbers always describe the current source, whether or not a build
  //     step ran earlier in the pipeline.
  //
  //     `reuseExistingServer: false` is what makes that last sentence true.
  //     While it was `!process.env.CI` the sentence was aspirational locally:
  //     any server already answering on the port was adopted as-is, so the
  //     measured bundle could be a stale build, or another project entirely.
  //     The cost is a full `npm run build` per local performance run; the
  //     alternative is a number that does not describe the current source.
  //     With --strictPort a leftover server now fails the run loudly instead
  //     of being silently measured.
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npm run preview:web',
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
  // Visual snapshots live beside the spec under tests/e2e/visual/snapshots,
  // keyed by name + project + platform. No Playwright projects are defined, so
  // the project segment is empty and baselines are e.g.
  // generate-panel-default--win32.png on the Windows runner. This template
  // fully governs snapshot location, so no separate snapshotDir is needed.
  snapshotPathTemplate: '{testDir}/visual/snapshots/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
});
