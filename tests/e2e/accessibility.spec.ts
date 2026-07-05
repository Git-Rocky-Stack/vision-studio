/**
 * E2E: Accessibility smoke tests using axe-core.
 *
 * Runs automated WCAG 2.1 AA checks on the two most critical pages:
 *   1. Generate panel (primary user journey)
 *   2. Settings panel (configuration flow)
 *
 * NOTE: @axe-core/playwright's AxeBuilder uses `context.newPage()` which is
 * unsupported in Electron's BrowserContext. Instead, we inject axe-core directly
 * via page.evaluate() and run the audit in the renderer process.
 */
import { test, expect } from '../e2e/fixtures/electron.fixture';
import { SidebarPage } from './pages/sidebar.page';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '../../dist-electron/main.mjs');

// Read axe-core source to inject into the page
const AXE_SOURCE_PATH = path.resolve(__dirname, '../../node_modules/axe-core/axe.min.js');

interface AxeViolation {
  id: string;
  impact: string;
  description: string;
  nodes: unknown[];
}

/**
 * Known a11y violations accepted as tech debt. EMPTY by design: the two former
 * exceptions are fixed and now actively guarded against regression -
 *   - nested-interactive: collapsible section headers keep interactive elements
 *     as sibling buttons, never nested inside a div[role="button"] (the panel
 *     that originally violated this was retired in #34 PR3).
 *   - color-contrast: the Settings "Beta Release" badge (and other text-muted/60
 *     usages) were raised to full text-muted (~5.2:1 on elevated surfaces).
 * Any new critical/serious violation on Generate or Settings now fails the suite.
 * Only add an id here with a tracking note if a violation is deliberately deferred.
 */
const KNOWN_VIOLATIONS = new Set<string>([]);

/**
 * Inject axe-core into the page and run an accessibility audit.
 * This avoids the `newPage()` call that @axe-core/playwright makes.
 */
async function runAxeAudit(page: import('@playwright/test').Page): Promise<{ violations: AxeViolation[] }> {
  const axeSource = fs.readFileSync(AXE_SOURCE_PATH, 'utf-8');

  return page.evaluate(async (source) => {
    // Inject axe-core if not already present
    if (!(window as any).axe) {
      const script = document.createElement('script');
      script.textContent = source;
      document.head.appendChild(script);
    }

    // Run the audit with WCAG 2.1 AA tags
    const results = await (window as any).axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    });

    return {
      violations: results.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      })),
    };
  }, axeSource);
}

test.describe('Accessibility Smoke Tests', () => {
  test.skip(!fs.existsSync(MAIN_ENTRY), 'Skipped: run `npm run build` first');

  test('Generate panel has no new critical accessibility violations', async ({ page }) => {
    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('generate');
    await page.waitForTimeout(1500);

    const results = await runAxeAudit(page);

    if (results.violations.length > 0) {
      console.log('Generate panel a11y violations:', JSON.stringify(results.violations, null, 2));
    }

    // Filter to critical/serious violations that are NOT in the known baseline
    const newViolations = results.violations.filter(
      (v) =>
        (v.impact === 'critical' || v.impact === 'serious') &&
        !KNOWN_VIOLATIONS.has(v.id)
    );

    expect(
      newViolations,
      `Found ${newViolations.length} NEW critical/serious a11y violations on Generate panel: ${newViolations.map((v) => v.id).join(', ')}`
    ).toHaveLength(0);
  });

  test('Settings panel has no new critical accessibility violations', async ({ page }) => {
    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('settings');
    await page.waitForTimeout(1500);

    const results = await runAxeAudit(page);

    if (results.violations.length > 0) {
      console.log('Settings panel a11y violations:', JSON.stringify(results.violations, null, 2));
    }

    // Filter to critical/serious violations that are NOT in the known baseline
    const newViolations = results.violations.filter(
      (v) =>
        (v.impact === 'critical' || v.impact === 'serious') &&
        !KNOWN_VIOLATIONS.has(v.id)
    );

    expect(
      newViolations,
      `Found ${newViolations.length} NEW critical/serious a11y violations on Settings panel: ${newViolations.map((v) => v.id).join(', ')}`
    ).toHaveLength(0);
  });

  test('keyboard navigation works in the sidebar', async ({ page }) => {
    const firstNav = page.getByTestId('nav-generate');
    await firstNav.focus();
    await expect(firstNav).toBeFocused();

    // Tab to the next nav item
    await page.keyboard.press('Tab');

    // The next focusable element should have focus
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('prompt input is properly labeled and focusable', async ({ page }) => {
    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('generate');

    const promptInput = page.getByTestId('prompt-input');
    await expect(promptInput).toBeVisible();

    await promptInput.focus();
    await expect(promptInput).toBeFocused();

    // Should have accessible attributes (placeholder, aria-label, or associated label)
    const hasPlaceholder = await promptInput.getAttribute('placeholder');
    const hasAriaLabel = await promptInput.getAttribute('aria-label');
    const inputId = await promptInput.getAttribute('id');
    const hasLabelFor = inputId
      ? await page.locator(`label[for="${inputId}"]`).isVisible().catch(() => false)
      : false;

    expect(hasPlaceholder || hasAriaLabel || hasLabelFor).toBeTruthy();
  });
});
