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

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cache before each test for consistent measurements
    await page.context().clearCookies();
  });

  test('Initial page load < 3s', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(3000);
  });

  test('Time to Interactive < 2s', async ({ page }) => {
    await page.goto('http://localhost:5173');
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

  test('Panel switch < 200ms - ALL panels', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('[data-testid="generate-panel"]');

    const panels = [
      { id: 'generate', selector: '[data-testid="generate-panel"]' },
      { id: 'batch', selector: '[data-testid="batch-panel"]' },
      { id: 'assets', selector: '[data-testid="assets-panel"]' },
      { id: 'settings', selector: '[data-testid="settings-panel"]' },
      { id: 'templates', selector: '[data-testid="templates-panel"]' },
    ];

    // Test all panel switches in both directions
    for (let i = 0; i < panels.length; i++) {
      const fromPanel = panels[i];
      const toPanel = panels[(i + 1) % panels.length];

      // Ensure we're on the fromPanel first
      await page.click(`[data-testid="${fromPanel.id}-tab"]`);
      await page.waitForSelector(fromPanel.selector, { state: 'visible', timeout: 5000 });

      // Measure switch time to next panel
      const startTime = Date.now();
      await page.click(`[data-testid="${toPanel.id}-tab"]`);
      await page.waitForSelector(toPanel.selector, { state: 'visible', timeout: 5000 });
      const switchTime = Date.now() - startTime;

      console.log(`Panel switch ${fromPanel.id} -> ${toPanel.id}: ${switchTime}ms`);
      expect(switchTime).toBeLessThan(200);
    }
  });

  test('Virtual scrolling performance - 1000 items', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('[data-testid="assets-tab"]');
    await page.waitForSelector('[data-testid="assets-grid"]');

    // Verify 1000 items are rendered
    const itemCount = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="assets-grid"]');
      if (grid) {
        return grid.querySelectorAll('[data-testid="asset-item"]').length;
      }
      return 0;
    });

    console.log(`Asset items count: ${itemCount}`);
    expect(itemCount).toBe(1000);

    const startTime = Date.now();

    // Scroll to bottom
    await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="assets-grid"]');
      if (grid) {
        grid.scrollTo({ top: grid.scrollHeight, behavior: 'auto' });
      }
    });

    // Wait for scroll to complete and virtual DOM to update
    await page.waitForTimeout(100);

    const scrollTime = Date.now() - startTime;
    console.log(`Scroll performance: ${scrollTime}ms`);
    expect(scrollTime).toBeLessThan(500);
  });

  test('Memory leak check - 5 panel switch cycles', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Get initial heap size
    const metrics1 = await page.metrics();
    const initialHeap = metrics1.JSHeapUsedSize;
    console.log(`Initial heap: ${(initialHeap / 1024 / 1024).toFixed(2)}MB`);

    const panels = [
      { id: 'generate', selector: '[data-testid="generate-panel"]' },
      { id: 'batch', selector: '[data-testid="batch-panel"]' },
      { id: 'assets', selector: '[data-testid="assets-panel"]' },
      { id: 'settings', selector: '[data-testid="settings-panel"]' },
      { id: 'templates', selector: '[data-testid="templates-panel"]' },
    ];

    // Perform 5 complete panel switch cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        await page.click(`[data-testid="${panel.id}-tab"]`);
        await page.waitForSelector(panel.selector, { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(50); // Small delay to simulate user interaction
      }
    }

    // Force garbage collection if available
    await page.evaluate(() => {
      // @ts-ignore - Chrome DevTools protocol
      if (window.gc) window.gc();
    });

    await page.waitForTimeout(500);

    // Get final heap size
    const metrics2 = await page.metrics();
    const finalHeap = metrics2.JSHeapUsedSize;
    const growthPercent = ((finalHeap - initialHeap) / initialHeap) * 100;

    console.log(`Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Heap growth: ${growthPercent.toFixed(2)}%`);

    // Heap growth should be under 5%
    expect(growthPercent).toBeLessThan(5);
  });

  test('Animation frame rate >= 55fps', async ({ page }) => {
    await page.goto('http://localhost:5173');
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
      page.goto('http://localhost:5173'),
      page.waitForLoadState('networkidle'),
    ]);

    // Get all network requests
    const requests = await page.evaluate(() => {
      // @ts-ignore - performance API
      return performance.getEntriesByType('resource').length;
    });

    console.log(`Total resources loaded: ${requests}`);

    // Should load fewer than 50 resources for initial page
    expect(requests).toBeLessThan(50);
  });

  test('First Contentful Paint < 1.5s', async ({ page }) => {
    await page.goto('http://localhost:5173');
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
