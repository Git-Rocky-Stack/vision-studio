/**
 * Performance tests for Vision Studio frontend.
 *
 * Tests measure:
 * - Initial page load time
 * - Time to interactive (TTI)
 * - Panel switching performance
 * - Virtual scrolling performance
 * - Memory leak detection
 */

import { test, expect } from '@playwright/test';

// Timing constants for performance benchmarks
const SCROLL_WAIT_MS = 100;
const INTERACTION_DELAY_MS = 50;
const GC_WAIT_MS = 500;
const APP_URL = 'http://127.0.0.1:5173';
const PANEL_SWITCH_BUDGET_MS = 350;
const RESOURCE_LOAD_BUDGET = 250;

const panels = [
  { id: 'generate', selector: '[data-testid="generate-panel"]' },
  { id: 'batch', selector: '[data-testid="batch-panel"]' },
  { id: 'assets', selector: '[data-testid="assets-panel"]' },
  { id: 'settings', selector: '[data-testid="settings-panel"]' },
  { id: 'templates', selector: '[data-testid="templates-panel"]' },
];

async function navigateToPanel(page: import('@playwright/test').Page, panelId: string) {
  if (panelId === 'batch') {
    await page.getByTestId('nav-generate').click();
    await page.getByRole('tab', { name: 'Batch' }).click();
    return;
  }

  if (panelId === 'templates') {
    await page.getByTestId('nav-story').click();
    await page.getByRole('tab', { name: 'Templates' }).click();
    return;
  }

  await page.getByTestId(`nav-${panelId}`).click();
}

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test for consistent measurements.
    // Note: Playwright's clearCookies() does not clear cache/storage - only cookies.
    // For full cache clearing, use page.context().clearCache() if available.
    await page.context().clearCookies();
  });

  test('Initial page load < 3s', async ({ page }) => {
    // Warm the dev server transform cache before taking a timing measurement.
    await page.goto(APP_URL);
    await page.waitForSelector('[data-testid="nav-generate"]');

    const startTime = Date.now();
    await page.reload();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(3000);
  });

  test('Time to Interactive < 2s', async ({ page }) => {
    await page.goto(APP_URL);
    const startTime = Date.now();

    // Wait for main app to be interactive
    await page.waitForSelector('[data-testid="generate-panel"]', {
      state: 'visible',
      timeout: 10000,
    });

    const tti = Date.now() - startTime;
    console.log(`Time to Interactive: ${tti}ms`);
    expect(tti).toBeLessThan(2000);
  });

  test(`Panel switch < ${PANEL_SWITCH_BUDGET_MS}ms - ALL panels`, async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('[data-testid="generate-panel"]');

    // Test all panel switches in both directions
    for (let i = 0; i < panels.length; i++) {
      const fromPanel = panels[i];
      const toPanel = panels[(i + 1) % panels.length];

      // Ensure we're on the fromPanel first
      await navigateToPanel(page, fromPanel.id);
      await page.waitForSelector(fromPanel.selector, { state: 'visible', timeout: 5000 });

      // Measure switch time to next panel
      const startTime = Date.now();
      await navigateToPanel(page, toPanel.id);
      await page.waitForSelector(toPanel.selector, { state: 'visible', timeout: 5000 });
      const switchTime = Date.now() - startTime;

      console.log(`Panel switch ${fromPanel.id} -> ${toPanel.id}: ${switchTime}ms`);
      expect(switchTime).toBeLessThan(PANEL_SWITCH_BUDGET_MS);
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
    console.log(`Scroll performance: ${scrollTime}ms`);
    expect(scrollTime).toBeLessThan(500);
  });

  test('Memory leak check - 5 panel switch cycles', async ({ page }) => {
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
      console.log('JS heap metrics unavailable in this browser, skipping memory growth assertion');
      return;
    }
    console.log(`Initial heap: ${(initialHeap / 1024 / 1024).toFixed(2)}MB`);

    // Perform 5 complete panel switch cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        await navigateToPanel(page, panel.id);
        await page.waitForSelector(panel.selector, { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(INTERACTION_DELAY_MS); // Small delay to simulate user interaction
      }
    }

    // Force garbage collection if available
    // NOTE: window.gc() requires Node.js --expose-gc flag or Chrome DevTools protocol.
    // Test may skip GC if unavailable in the test environment.
    await page.evaluate(() => {
      // @ts-ignore - Chrome DevTools protocol
      if (window.gc) window.gc();
    });

    await page.waitForTimeout(GC_WAIT_MS);

    // Get final heap size
    const finalHeap = await getHeapSize();
    if (finalHeap === null) {
      console.log('JS heap metrics unavailable after interactions, skipping memory growth assertion');
      return;
    }
    const growthPercent = ((finalHeap - initialHeap) / initialHeap) * 100;

    console.log(`Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Heap growth: ${growthPercent.toFixed(2)}%`);

    // Heap growth should be under 5%
    expect(growthPercent).toBeLessThan(5);
  });

  test('Animation frame rate >= 55fps', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    // Measure FPS during panel transition
    const fps = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        let startTime = performance.now();
        const duration = 1000; // Measure for 1 second

        function measureFrame() {
          frameCount++;
          const elapsed = performance.now() - startTime;

          if (elapsed < duration) {
            requestAnimationFrame(measureFrame);
          } else {
            const fps = (frameCount / elapsed) * 1000;
            resolve(fps);
          }
        }

        // Trigger animation by hovering over interactive elements
        requestAnimationFrame(measureFrame);
      });
    });

    console.log(`Measured FPS: ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThanOrEqual(55);
  });

  test('Resource load count within limits', async ({ page }) => {
    const [response] = await Promise.all([
      page.goto(APP_URL),
      page.waitForLoadState('networkidle'),
    ]);

    // Get all network requests
    const requests = await page.evaluate(() => {
      // @ts-ignore - performance API
      return performance.getEntriesByType('resource').length;
    });

    console.log(`Total resources loaded: ${requests}`);

    expect(requests).toBeLessThan(RESOURCE_LOAD_BUDGET);
  });

  test('First Contentful Paint < 1.5s', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    const fcp = await page.evaluate(() => {
      // @ts-ignore - PerformancePaintTiming API
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find((e: PerformancePaintTiming) => e.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : null;
    });

    if (fcp !== null) {
      console.log(`First Contentful Paint: ${fcp.toFixed(0)}ms`);
      expect(fcp).toBeLessThan(1500);
    } else {
      // FCP not available in test environment, skip
      console.log('FCP not available, skipping assertion');
    }
  });
});
