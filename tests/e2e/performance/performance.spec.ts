/**
 * Performance tests for the Vision Studio renderer.
 *
 * These run against a PRODUCTION build served by `vite preview`
 * (playwright.config.ts webServer[1]), never against the Vite dev server.
 * The dev server serves unbundled ESM with an HMR client attached, which made
 * these numbers measure Vite rather than the app, and measure it
 * non-deterministically: a cold dev server reported 250 resource entries
 * against a `< 250` budget and timed out the page-load test, while the same
 * server once warm reported 44. The shipped bundle reports 17 and loads in
 * ~0.7s. A budget whose result depends on how warm Vite's transform cache is
 * is not a budget.
 *
 * Two classes of test live here, and the distinction is deliberate:
 *
 *  - GATING: load, TTI, FCP, panel switching, resource count, scroll. These
 *    assert against budgets and will fail a release.
 *  - INFORMATIONAL: frame rate and heap growth. These record a measurement in
 *    the report and assert only that the measurement itself succeeded. They do
 *    NOT gate, because a headless runner does not schedule requestAnimationFrame
 *    against a real compositor (measured 40.6fps on an idle production page) and
 *    exposes no reliable GC hook, so the value describes the runner more than
 *    the app. They are not coverage of frame rate or of memory leaks; treat the
 *    recorded numbers as a trend line to read, not a pass signal.
 */

import { test, expect } from '@playwright/test';

import { PREVIEW_URL } from '../../../playwright.config';

// Timing constants for performance benchmarks
const SCROLL_WAIT_MS = 100;
const INTERACTION_DELAY_MS = 50;
const GC_WAIT_MS = 500;
// Imported rather than restated. The address used to be duplicated here, and a
// duplicated address is a measurement pointed somewhere nobody checked.
const APP_URL = PREVIEW_URL;
// Click-to-panel-visible, both endpoints taken on the page's own clock (see
// installVisibilityClock). Measured across 9 full matrices - 45 switches - on
// the shipped bundle: 12.5-90.8ms idle, 10.9-62.1ms with 7 of 8 cores
// saturated. The contended run is not the slower one, which is the property
// the old Node-side stopwatch never had: that form read 198-419ms run to run
// for the same switches and produced 448ms and 593ms outliers under load.
//
// 350 was the ceiling that made those outliers survivable. 250 is set against
// the local maximum with roughly 2.75x of headroom. The headroom is that wide
// for one reason and it is worth stating plainly: this spec also runs on the
// Windows release runner (.github/workflows/release.yml:63) and no measurement
// from that hardware exists, so the margin is covering an unmeasured machine,
// not an unmeasured app.
const PANEL_SWITCH_BUDGET_MS = 250;
// navigationStart -> generate panel has layout, read from the page. Measured
// 568-912ms across the same 9 runs, idle and contended alike.
//
// Deliberately left at 2000 rather than tightened to match. The figure this
// budget now guards is strictly larger than the one it used to: the old
// stopwatch started after `page.goto` had already resolved, so it timed only
// the tail after load, while this covers the navigation, the bundle parse and
// the React mount. Holding the number while the thing being measured grew is
// already a tightening; moving it as well, on one machine's data, would not
// be one.
const TTI_BUDGET_MS = 2000;
// navigationStart -> loadEventEnd for the shipped bundle, measured in the page:
// 40-82ms idle, 47-86ms with 7 of 8 cores saturated. 1000 leaves better than a
// 10x margin over the contended maximum while still tripping on the regression
// class this is for - an unbundled asset, a render-blocking script, a runtime
// CDN reference.
const PAGE_LOAD_BUDGET_MS = 1000;
// The shipped bundle requests 17 resources on first paint. 250 was calibrated
// against the dev server per-module requests and is meaningless here; 60
// leaves room for a few added chunks while still catching an unbundled asset
// or a runtime CDN reference sneaking back in.
const RESOURCE_LOAD_BUDGET = 60;

/**
 * Every panel reachable from a browser, `settings` included.
 *
 * It used to be excluded, and the exclusion was real rather than cosmetic:
 * SettingsPanel's mount effects called `window.electron.settings.get()` with no
 * guard, so outside Electron they threw "Cannot read properties of undefined
 * (reading 'settings')" before first paint and the panel rendered its
 * ErrorBoundary instead of `settings-panel`. Listing it here only produced a
 * 10s selector timeout that read as a performance failure, so the panel had
 * functional coverage (accessibility.spec.ts:107, visual-regression.spec.ts:61,
 * both on the Electron fixture) but no switch-time budget at all.
 *
 * The mount paths are now guarded through `getElectronBridge()`
 * (src/utils/electronBridge.ts), and a browser run against the shipped bundle
 * measures zero page errors across all five panels with `settings-panel`
 * mounting normally - so the budget below now covers it on this host, without
 * moving this file onto the Electron fixture and giving up the resource-count
 * and FCP budgets that only a http:// host can produce.
 */
const panels = [
  { id: 'generate', selector: '[data-testid="generate-panel"]' },
  { id: 'batch', selector: '[data-testid="batch-panel"]' },
  { id: 'assets', selector: '[data-testid="assets-panel"]' },
  { id: 'templates', selector: '[data-testid="templates-panel"]' },
  { id: 'settings', selector: '[data-testid="settings-panel"]' },
];

/**
 * `force: true` skips Playwright actionability checks before each click.
 *
 * That is not a shortcut around a flaky control, it is what makes this file
 * measure the app. Playwright waits for a target to be stable - to stop moving
 * between two animation frames - before it will click, and every nav control
 * carries a CSS transition (NavBar.tsx:113 `transition-all duration-150`, plus
 * the Carbon Pro motion envelopes). So the stopwatch was timing the settle of
 * an entrance animation, not the panel switch. Splitting the measurement showed
 * the click-to-panel-visible segment is 11ms while the pre-click stability wait
 * alone ran 270-288ms; across a full matrix the waits swung the worst switch
 * from 198ms to 419ms run to run. A real user clicking a button does not first
 * wait for its hover transition to finish.
 *
 * The trade is explicit: with actionability skipped, this spec no longer proves
 * the nav controls are visible, enabled and hit-testable. It is not trying to.
 * The functional, a11y and region-lock specs click these same controls normally
 * and would fail if a control became unclickable.
 */
const CLICK = { force: true } as const;

/**
 * How long an in-page observer waits before giving up and reporting nothing.
 *
 * Never reached on a passing run. It exists so that a selector that stops
 * appearing fails as "the panel never became visible" instead of hanging
 * `page.evaluate` until Playwright's 60s test timeout.
 */
const IN_PAGE_OBSERVER_TIMEOUT_MS = 20_000;

/**
 * Scratch state the measurement helpers keep on the page.
 *
 * These are types only - erased before the callback is serialised into the
 * browser - so naming them here costs nothing at runtime and keeps the
 * evaluate callbacks typechecked under tsconfig.tests.json.
 */
type ClockWindow = Window & {
  __lastClickAt?: number;
  __clickClockInstalled?: boolean;
  __panelVisibleAt?: Promise<number | null>;
  __interactiveAt?: Promise<number | null>;
};

/**
 * Arms an in-page stopwatch for "the next click, until `selector` is visible".
 *
 * Both endpoints are read from the page's own clock, which is the whole point.
 * The Node-side form this replaces - `Date.now()` either side of a Playwright
 * click and `waitForSelector` - measured the app plus two RPC round trips plus
 * whatever else the runner was doing, and it was the RPC and the scheduling
 * that moved. Splitting the old measurement showed the click-to-visible
 * segment was 11ms while the wall-clock reading for the same switch ran
 * 198-419ms run to run, and outliers of 448ms and 593ms were seen under load
 * against a 350ms budget - absorbed by `retries: 1` rather than reported.
 *
 * The click timestamp is taken by a capture-phase listener on `document`, so
 * it is recorded before React's delegated handler at the root container has
 * run. The visible timestamp comes from a MutationObserver callback, which
 * fires as a microtask after the commit that revealed the panel. Neither
 * endpoint crosses the process boundary, so neither can be inflated by it.
 *
 * `null` is reported rather than a number when the target was already visible
 * at arming time (nothing to measure) or never became visible - both are
 * assertion failures at the call site, not silently-zero measurements.
 */
function installVisibilityClock(options: {
  selector: string;
  timeoutMs: number;
  mode: 'panel-switch' | 'initial-load';
}) {
  const { selector, timeoutMs, mode } = options;
  const scope = window as ClockWindow;

  if (mode === 'panel-switch') {
    if (!scope.__clickClockInstalled) {
      document.addEventListener(
        'click',
        () => {
          (window as ClockWindow).__lastClickAt = performance.now();
        },
        true
      );
      scope.__clickClockInstalled = true;
    }
    scope.__lastClickAt = undefined;
  }

  const isVisible = () => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const promise = new Promise<number | null>((resolve) => {
    // Nothing to time if the target is already on screen. Reported as null so
    // the call site fails rather than recording a zero.
    if (mode === 'panel-switch' && isVisible()) {
      resolve(null);
      return;
    }

    // Declared before `finish` closes over them so that neither is in a
    // temporal dead zone if a check ever resolves synchronously.
    let settled = false;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (timer !== null) clearTimeout(timer);
      resolve(value);
    };
    const check = () => {
      if (!isVisible()) return false;
      finish(performance.now());
      return true;
    };

    observer = new MutationObserver(check);
    timer = setTimeout(() => finish(null), timeoutMs);

    // Mutations alone are not enough, and this is measured rather than
    // theoretical: on a cold first load the panel was inserted while an
    // ancestor still had no layout, so the rect was 0x0 in the observer
    // callback, and it then gained size without any further DOM mutation to
    // re-trigger the check. The observer sat until its timeout and the test
    // reported "never became visible" - once, then passed on retry. A frame
    // pump cannot miss that, and it also bounds the answer to a frame, which
    // is the granularity "visible to the user" actually has.
    const pump = () => {
      if (settled) return;
      if (!check()) requestAnimationFrame(pump);
    };

    observer.observe(document, { childList: true, subtree: true, attributes: true });
    requestAnimationFrame(pump);
  });

  if (mode === 'panel-switch') {
    scope.__panelVisibleAt = promise;
  } else {
    scope.__interactiveAt = promise;
  }
}

async function armPanelVisibleClock(page: import('@playwright/test').Page, selector: string) {
  await page.evaluate(installVisibilityClock, {
    selector,
    timeoutMs: IN_PAGE_OBSERVER_TIMEOUT_MS,
    mode: 'panel-switch' as const,
  });
}

/** Milliseconds from the last click to the armed panel becoming visible. */
async function readPanelSwitchMs(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(async () => {
    const scope = window as ClockWindow;
    const visibleAt = await scope.__panelVisibleAt;
    if (visibleAt == null || scope.__lastClickAt === undefined) return null;
    return visibleAt - scope.__lastClickAt;
  });
}

async function navigateToPanel(page: import('@playwright/test').Page, panelId: string) {
  if (panelId === 'batch') {
    await page.getByTestId('nav-generate').click(CLICK);
    await page.getByRole('tab', { name: 'Batch' }).click(CLICK);
    return;
  }

  if (panelId === 'templates') {
    await page.getByTestId('nav-story').click(CLICK);
    await page.getByRole('tab', { name: 'Templates' }).click(CLICK);
    return;
  }

  await page.getByTestId(`nav-${panelId}`).click(CLICK);
}

/**
 * Visit every panel once so its lazily-loaded chunk is fetched and parsed.
 *
 * Panels are code-split (BatchPanel-*.js, StoryboardPanel-*.js), so the first
 * switch to each pays a one-time chunk download: measured 707ms for the first
 * generate->batch against 137-298ms once warm. The budget is about UI
 * responsiveness, so measure the steady state and let the load budgets above
 * cover first-byte cost.
 *
 * Warming still matters now that the measurement is taken in the page: a
 * first-visit chunk fetch lands inside the click-to-visible window just as it
 * did inside the wall-clock one. What changed is the size of everything else
 * around it. The worst warm switch across 45 measured switches is 90.8ms
 * against the 250ms budget; the same matrix read 198-419ms when the stopwatch
 * lived in Node, and the spread was the harness rather than the app.
 *
 * On why this file uses a browser and a served bundle while the other seven
 * spec files use tests/e2e/fixtures/electron.fixture.ts: Electron loads the
 * renderer over file://, where `performance.getEntriesByType('resource')`
 * returns 0 entries and no `first-contentful-paint` entry is emitted at all -
 * measured, not assumed. So the load budgets can only be produced on an http://
 * host, and moving this file onto the fixture would forfeit them.
 *
 * That used to be a genuine trade, because the settings panel could not mount
 * outside Electron and so had no switch-time budget anywhere. It no longer is:
 * its mount paths are guarded (src/utils/electronBridge.ts) and it is measured
 * in the matrix above like every other panel. Splitting this file across two
 * hosts would now cost a second webServer and a serial Electron run to buy
 * nothing.
 */
async function warmPanels(page: import('@playwright/test').Page) {
  for (const panel of panels) {
    await navigateToPanel(page, panel.id);
    await page.waitForSelector(panel.selector, { state: 'visible', timeout: 15000 });
  }
}

function record(name: string, value: string) {
  test.info().annotations.push({ type: 'measurement', description: `${name}: ${value}` });
  console.log(`${name}: ${value}`);
}

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test for consistent measurements.
    // Note: Playwright clearCookies() does not clear cache/storage - only cookies.
    await page.context().clearCookies();
  });

  /**
   * Measured inside the page, via the Navigation Timing entry, rather than with
   * a Node-side stopwatch around `waitForLoadState('networkidle')`.
   *
   * The old form measured almost nothing but the harness. Broken down on the
   * shipped bundle: the page's own navigationStart -> loadEventEnd is 40-86ms,
   * `networkidle` contributes a further 410-620ms (it is a 500ms
   * no-request debounce, so that time is spent by definition), and the rest is
   * Playwright RPC and runner scheduling. That is how a 3000ms budget came to
   * report 700-769ms idle and 2499ms on a contended run - a 3.5x swing in a
   * number where the app's contribution never moved.
   *
   * Re-measured with 7 of 8 cores saturated: this in-page figure moved 40-82ms
   * -> 47-86ms while the old wall-clock form went 545-590ms -> 627-967ms. The
   * budget below is set against the contended maximum with an order of
   * magnitude of headroom, and it now fails for page-load regressions rather
   * than for a busy runner.
   */
  test(`Initial page load < ${PAGE_LOAD_BUDGET_MS}ms`, async ({ page }) => {
    // Warm the HTTP cache before taking a timing measurement.
    await page.goto(APP_URL);
    await page.waitForSelector('[data-testid="nav-generate"]');

    await page.reload({ waitUntil: 'load' });

    const loadTime = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType(
        'navigation'
      ) as PerformanceNavigationTiming[];
      // `duration` on a navigation entry is loadEventEnd - startTime.
      return entry ? entry.duration : null;
    });

    // A null here means the browser emitted no navigation entry, which would
    // make the budget vacuous. Fail rather than silently skip.
    expect(loadTime, 'no PerformanceNavigationTiming entry was emitted').not.toBeNull();
    record('Page load time', `${(loadTime ?? 0).toFixed(0)}ms`);
    expect(loadTime ?? Infinity).toBeLessThan(PAGE_LOAD_BUDGET_MS);
  });

  /**
   * Measured from the page's own time origin, via an observer installed before
   * any page script runs, rather than with a Node-side stopwatch around a
   * selector wait.
   *
   * The old form started its clock *after* `page.goto` had already resolved,
   * so it excluded everything before load and included a Playwright polling
   * round trip after it - it measured neither the navigation nor the mount
   * cleanly. `performance.now()` inside the page is relative to
   * `timeOrigin`, i.e. navigation start, so the figure below is the whole
   * distance from navigation to the generate panel having layout: the React
   * mount genuinely is inside it, which is what separates this from the page
   * load budget above.
   */
  test(`Time to Interactive < ${TTI_BUDGET_MS}ms`, async ({ page }) => {
    // Installed before any page script runs, so the clock is armed for the
    // navigation itself rather than started once `goto` has already returned.
    await page.addInitScript(installVisibilityClock, {
      selector: '[data-testid="generate-panel"]',
      timeoutMs: IN_PAGE_OBSERVER_TIMEOUT_MS,
      mode: 'initial-load' as const,
    });

    await page.goto(APP_URL);

    const tti = await page.evaluate(() => (window as ClockWindow).__interactiveAt);

    expect(tti, 'the generate panel never became visible').not.toBeNull();
    record('Time to Interactive', `${(tti ?? 0).toFixed(0)}ms`);
    expect(tti ?? Infinity).toBeLessThan(TTI_BUDGET_MS);
  });

  test(`Panel switch < ${PANEL_SWITCH_BUDGET_MS}ms - ALL panels`, async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('[data-testid="generate-panel"]');
    await warmPanels(page);

    // Test all panel switches in both directions
    for (let i = 0; i < panels.length; i++) {
      const fromPanel = panels[i];
      const toPanel = panels[(i + 1) % panels.length];

      // Ensure we are on the fromPanel first
      await navigateToPanel(page, fromPanel.id);
      await page.waitForSelector(fromPanel.selector, { state: 'visible', timeout: 5000 });

      // Arm before clicking: both endpoints are taken inside the page, so the
      // Playwright round trip that drives the click sits outside the measured
      // window rather than inside it.
      await armPanelVisibleClock(page, toPanel.selector);
      await navigateToPanel(page, toPanel.id);

      // Correctness gate, not part of the measurement. If this passes while
      // the in-page observer reported nothing, the assertion below fails
      // loudly rather than recording a zero.
      await page.waitForSelector(toPanel.selector, { state: 'visible', timeout: 5000 });

      const switchTime = await readPanelSwitchMs(page);

      expect(
        switchTime,
        `no in-page click-to-visible measurement for ${fromPanel.id} -> ${toPanel.id}`
      ).not.toBeNull();
      record(`Panel switch ${fromPanel.id} -> ${toPanel.id}`, `${(switchTime ?? 0).toFixed(1)}ms`);
      expect(switchTime ?? Infinity).toBeLessThan(PANEL_SWITCH_BUDGET_MS);
    }
  });

  test('Assets surface scroll responds quickly', async ({ page }) => {
    await page.goto(APP_URL);
    await navigateToPanel(page, 'assets');
    await page.waitForSelector('[data-testid="assets-panel"]');

    const startTime = Date.now();

    // Scroll through the current asset surface, whether it is empty or populated.
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="assets-panel"]');
      if (panel) {
        panel.scrollTo({ top: panel.scrollHeight, behavior: 'auto' });
      }
    });

    // Wait for scroll to complete and virtual DOM to update
    await page.waitForTimeout(SCROLL_WAIT_MS);

    const scrollTime = Date.now() - startTime;
    record('Scroll performance', `${scrollTime}ms`);
    expect(scrollTime).toBeLessThan(500);
  });

  // INFORMATIONAL - see the file header. Records heap growth across panel
  // cycling. It does not gate: the runner exposes no dependable GC hook
  // (window.gc needs --js-flags=--expose-gc), so a growth figure here cannot
  // distinguish a leak from a collection that simply has not run yet. The
  // assertion below only proves the probe itself worked.
  test('[informational] Heap growth across 5 panel switch cycles', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    const getHeapSize = () =>
      page.evaluate(() => {
        const memory = (
          performance as Performance & {
            memory?: { usedJSHeapSize?: number };
          }
        ).memory;
        return memory?.usedJSHeapSize ?? null;
      });

    const initialHeap = await getHeapSize();
    if (initialHeap === null) {
      record('Heap growth', 'unavailable in this browser');
      return;
    }
    record('Initial heap', `${(initialHeap / 1024 / 1024).toFixed(2)}MB`);

    // Perform 5 complete panel switch cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const panel of panels) {
        await navigateToPanel(page, panel.id);
        await page.waitForSelector(panel.selector, { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(INTERACTION_DELAY_MS); // Small delay to simulate user interaction
      }
    }

    // Force garbage collection if available. Expressed as a narrowing cast
    // rather than a @ts-expect-error, which stays the right call now that these
    // specs ARE typechecked (tsconfig.tests.json): a suppression here would be
    // reported as an unused @ts-expect-error, because `gc` is reachable through
    // the cast without one.
    await page.evaluate(() => {
      const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
      if (gc) gc();
    });

    await page.waitForTimeout(GC_WAIT_MS);

    const finalHeap = await getHeapSize();
    if (finalHeap === null) {
      record('Heap growth', 'unavailable after interactions');
      return;
    }
    const growthPercent = ((finalHeap - initialHeap) / initialHeap) * 100;

    record('Final heap', `${(finalHeap / 1024 / 1024).toFixed(2)}MB`);
    record('Heap growth', `${growthPercent.toFixed(2)}%`);

    // Sanity only: the probe returned a usable reading. No budget assertion.
    expect(finalHeap).toBeGreaterThan(0);
  });

  // INFORMATIONAL - see the file header. A headless runner does not drive
  // requestAnimationFrame from a real compositor, so this measures the runner
  // scheduling as much as the app. Measured 40.6fps on an idle production
  // page; the historical `>= 55` budget failed for that reason and was never
  // evidence of a frame-rate regression. The threshold is not tuned down - the
  // measurement is reported instead of gated.
  test('[informational] Animation frame rate', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    const fps = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        const startTime = performance.now();
        const duration = 1000; // Measure for 1 second

        function measureFrame() {
          frameCount++;
          const elapsed = performance.now() - startTime;

          if (elapsed < duration) {
            requestAnimationFrame(measureFrame);
          } else {
            resolve((frameCount / elapsed) * 1000);
          }
        }

        requestAnimationFrame(measureFrame);
      });
    });

    record('Measured FPS', fps.toFixed(1));

    // Sanity only: frames were actually scheduled. No budget assertion.
    expect(Number.isFinite(fps)).toBe(true);
    expect(fps).toBeGreaterThan(0);
  });

  test('Resource load count within limits', async ({ page }) => {
    await Promise.all([page.goto(APP_URL), page.waitForLoadState('networkidle')]);

    const requests = await page.evaluate(() => performance.getEntriesByType('resource').length);

    record('Total resources loaded', String(requests));

    expect(requests).toBeLessThan(RESOURCE_LOAD_BUDGET);
  });

  test('First Contentful Paint < 1.5s', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : null;
    });

    if (fcp !== null) {
      record('First Contentful Paint', `${fcp.toFixed(0)}ms`);
      expect(fcp).toBeLessThan(1500);
    } else {
      record('First Contentful Paint', 'unavailable in this browser');
    }
  });
});
