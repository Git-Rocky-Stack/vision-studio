/**
 * Layout facts that only a real browser engine can measure.
 *
 * jsdom has no layout, so none of these can be a component test: whether a
 * label wraps, whether a control is big enough to hit, whether a dock can be
 * reached at the minimum window. Each test pins one finding from the
 * 2026-10-07 design audit to a number read from the built app.
 *
 * The window is 1600x1000 by default and may not go below 1200x800
 * (electron/services/mainWindow.ts), so those are the two sizes used here.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/electron.fixture';

const DEFAULT_WINDOW = { width: 1600, height: 1000 };
const MINIMUM_WINDOW = { width: 1200, height: 800 };

async function openTab(page: Page, tab: string) {
  await page.getByTestId(`nav-${tab}`).click();
  await page
    .locator('[aria-label="Loading panel"]')
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** Open a project the way a user does, so project-scoped panels have content. */
async function createProject(page: Page) {
  await page.getByRole('button', { name: 'Select project' }).click();
  await page.getByRole('button', { name: /^New Project$/ }).click();
  await page.waitForTimeout(800);
}

/**
 * Pointer targets that fail WCAG 2.5.8 Target Size (Minimum).
 *
 * A target passes when it is at least 24x24 CSS px, measured by hit-testing so
 * that a hit area widened beyond the drawn control counts. An undersized
 * target still passes under the spacing exception: a 24px circle centred on it
 * must not reach another target. That too is hit-tested, because a clipped
 * element's box says nothing about where it can actually be clicked.
 */
function undersizedTargets(): string[] {
  const SELECTOR =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="switch"], [role="tab"], [role="slider"], [role="checkbox"], [role="option"], [role="menuitem"], [role="separator"][tabindex]';
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.pointerEvents !== 'none' &&
      Number(cs.opacity) > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth
    );
  };
  const targets = [...document.querySelectorAll(SELECTOR)].filter(
    (el) => visible(el) && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
  );
  const targetAt = (x: number, y: number): Element | null => {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    const label = hit.closest('label');
    if (label instanceof HTMLLabelElement && label.control) return label.control;
    return hit.closest(SELECTOR);
  };
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32)}"`;

  const failures: string[] = [];
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Covered by something else at its own centre (an overlay): not hittable now.
    const atCentre = targetAt(cx, cy);
    if (atCentre !== el && !el.contains(atCentre)) continue;

    const reach = (dx: number, dy: number) => {
      let distance = 0;
      for (let step = 1; step <= 12; step += 1) {
        const hit = targetAt(cx + dx * step, cy + dy * step);
        if (hit !== el && !(hit && el.contains(hit))) break;
        distance = step;
      }
      return distance;
    };
    const width = reach(-1, 0) + reach(1, 0);
    const height = reach(0, -1) + reach(0, 1);
    if (width >= 23 && height >= 23) continue;

    let neighbour: Element | null = null;
    for (let angle = 0; angle < 360 && !neighbour; angle += 30) {
      for (const radius of [6, 11.5]) {
        const hit = targetAt(
          cx + Math.cos((angle * Math.PI) / 180) * radius,
          cy + Math.sin((angle * Math.PI) / 180) * radius,
        );
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          neighbour = hit;
          break;
        }
      }
    }
    if (neighbour) failures.push(`${name(el)} ${width}x${height} beside ${name(neighbour)}`);
  }
  return failures;
}

/** Drawn height of any control whose pointer target is under 24px in either axis. */
function drawnUnder24(selector: string): string[] {
  return [...document.querySelectorAll(selector)]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    });
}

/**
 * `label: lines` for each button under `scope` whose text matches `pattern`,
 * where lines is how many rows of text the label occupies.
 */
function labelLines({ scope, pattern }: { scope: string; pattern: string }): string[] {
  const matcher = new RegExp(pattern, 'i');
  return [...document.querySelectorAll(`${scope} button`)]
    .filter((button) => matcher.test(button.textContent || ''))
    .map((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      const rows = new Set<number>();
      for (const rect of range.getClientRects()) {
        // Icons are short boxes on the same row; only text-height boxes count.
        if (rect.width > 0 && rect.height > 6) rows.add(Math.round((rect.top + rect.height / 2) / 8));
      }
      return `${(button.textContent || '').trim().replace(/\s+/g, ' ')}: ${rows.size}`;
    });
}

test.describe('Design contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DEFAULT_WINDOW);
  });

  // Control experiment: the detector below has to be able to see a defect, or
  // an empty result from it proves nothing.
  test('the target-size probe reports two small buttons packed together', async ({ page }) => {
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:400px;top:400px;z-index:99999;display:flex;gap:2px';
      host.innerHTML =
        '<button aria-label="probe-a" style="width:12px;height:12px;padding:0"></button>' +
        '<button aria-label="probe-b" style="width:12px;height:12px;padding:0"></button>';
      document.body.appendChild(host);
    });

    const failures = await page.evaluate(undersizedTargets);

    expect(failures.filter((entry) => entry.includes('probe-'))).toHaveLength(2);
  });

  test('FINDING-014: no pointer target is too small to hit beside another', async ({ page }) => {
    await createProject(page);

    const failures: Record<string, string[]> = {};
    for (const tab of ['generate', 'canvas', 'story', 'workflows']) {
      await openTab(page, tab);
      failures[tab] = await page.evaluate(undersizedTargets);
    }
    await openTab(page, 'settings');
    for (const section of ['General', 'Notifications', 'About']) {
      await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
      await page.waitForTimeout(400);
      failures[`settings/${section}`] = await page.evaluate(undersizedTargets);
    }

    expect(failures).toEqual({
      generate: [],
      canvas: [],
      story: [],
      workflows: [],
      'settings/General': [],
      'settings/Notifications': [],
      'settings/About': [],
    });
  });

  // The spacing exception makes a 22px button legal when nothing is near it,
  // but these are the controls the audit named, and each one costs nothing to
  // bring up to size.
  test('FINDING-014: icon buttons, switches and sliders are drawn or padded to 24px', async ({ page }) => {
    await createProject(page);
    await openTab(page, 'generate');
    const timeline = await page.evaluate(
      drawnUnder24,
      '[aria-label="Zoom in"], [aria-label="Zoom out"], [aria-label="Mute track"], [aria-label="Hide track"], [aria-label="Lock track"], [aria-label="Timeline zoom level"], [role="slider"]',
    );

    await openTab(page, 'canvas');
    const canvas = await page.evaluate(drawnUnder24, '[role="slider"], [aria-label="New layer"]');

    await openTab(page, 'settings');
    await page.getByRole('button', { name: /^General/ }).first().click();
    await page.waitForTimeout(400);
    // A switch is drawn 36x20; its hit area is what has to reach 24px.
    const switchHit = await page.evaluate(() => {
      const el = document.querySelector('[role="switch"]');
      if (!el) return 'no switch';
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const above = document.elementFromPoint(cx, r.top - 1.5);
      const below = document.elementFromPoint(cx, r.bottom + 1.5);
      return `above:${above === el} below:${below === el}`;
    });

    expect({ timeline, canvas, switchHit }).toEqual({
      timeline: [],
      canvas: [],
      switchHit: 'above:true below:true',
    });
  });

  test('FINDING-021: the header wordmark is tall enough to read', async ({ page }) => {
    // The letters fill rows 97 to 213 of the 300px-tall source image.
    const letterHeight = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="app-header"] img');
      return img ? (img.getBoundingClientRect().height * 116) / 300 : 0;
    });

    expect(letterHeight).toBeGreaterThanOrEqual(18);
  });

  test('FINDING-023: dock button labels stay on one line', async ({ page }) => {
    await createProject(page);
    await openTab(page, 'generate');

    const boards = await page.evaluate(labelLines, {
      scope: '[data-testid="right-dock"]',
      pattern: 'storyboard|add scene|new board',
    });

    await page.getByRole('tab', { name: 'Batch' }).click();
    await page.waitForTimeout(700);
    const batch = await page.evaluate(labelLines, {
      scope: '[data-testid="left-dock"]',
      pattern: 'start batch',
    });

    // The three Boards actions also share one row at the default dock width.
    const boardRows = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('[data-testid="right-dock"] button')]
        .filter((button) => /storyboard|add scene|new board/i.test(button.textContent || ''))
        .map((button) => Math.round(button.getBoundingClientRect().top));
      return new Set(tops).size;
    });

    expect(boards).toHaveLength(3);
    expect(boards.filter((entry) => !entry.endsWith(': 1'))).toEqual([]);
    expect(boardRows).toBe(1);
    expect(batch).toEqual(['Start Batch (0): 1']);
  });

  test('FINDING-024: the mode card lines up with the section cards under it', async ({ page }) => {
    await openTab(page, 'generate');

    const edges = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="generate-panel"]');
      const modeCard = panel?.querySelector('.raised-panel');
      const sectionCard = panel?.querySelector('[data-testid="generate-section-prompt"]');
      if (!modeCard || !sectionCard) return null;
      const a = modeCard.getBoundingClientRect();
      const b = sectionCard.getBoundingClientRect();
      return { left: Math.abs(a.left - b.left), right: Math.abs(a.right - b.right) };
    });

    expect(edges).not.toBeNull();
    expect(edges?.left).toBeLessThanOrEqual(1);
    expect(edges?.right).toBeLessThanOrEqual(1);
  });

  test('FINDING-031: the review dock can be opened at the minimum window', async ({ page }) => {
    await page.setViewportSize(MINIMUM_WINDOW);
    await openTab(page, 'generate');

    const dock = page.getByTestId('right-dock');
    await expect(dock).toBeHidden();

    const toggle = page.getByRole('button', { name: 'Show review dock' });
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(dock).toBeVisible();
    const box = await dock.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(280);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(MINIMUM_WINDOW.width);
    await expect(dock.getByRole('heading', { name: 'Gallery' })).toBeVisible();

    await page.getByRole('button', { name: 'Hide review dock' }).click();
    await expect(dock).toBeHidden();
  });

  test('FINDING-036: a pipeline step shows its whole name', async ({ page }) => {
    await createProject(page);
    await openTab(page, 'workflows');
    await page.getByRole('tab', { name: 'Pipelines' }).click();
    await page.waitForTimeout(800);

    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('[role="button"][aria-label*=" step "] .truncate')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${(el.textContent || '').trim()} ${el.clientWidth}/${el.scrollWidth}`),
    );
    const steps = await page.locator('[role="button"][aria-label*=" step "]').count();

    expect(steps).toBeGreaterThan(0);
    expect(clipped).toEqual([]);
  });

  test('FINDING-008 and 012: the Workflows tab docks its own library and the graph gets room', async ({ page }) => {
    await createProject(page);
    await openTab(page, 'workflows');

    // The left dock used to show the Storyboard panel on this tab.
    const leftDock = page.getByTestId('left-dock');
    await expect(leftDock.getByRole('heading', { name: 'Workflow Library' })).toBeVisible();
    await expect(leftDock.getByText(/Board References/)).toHaveCount(0);

    const editorWidth = () =>
      page.evaluate(() => {
        const editor = document.querySelector('[aria-label="Workflow graph editor"]');
        return editor ? Math.round(editor.getBoundingClientRect().width) : 0;
      });

    // With the library docked the workbench has one copy of it, not two.
    await expect(page.getByRole('heading', { name: 'Workflow Library' })).toHaveCount(1);
    expect(await editorWidth()).toBeGreaterThanOrEqual(400);

    // The Generate tab keeps the library inline, and still gives the graph room.
    await openTab(page, 'generate');
    await page.getByTestId('center-tab-workflow').click();
    await page.waitForTimeout(500);
    expect(await editorWidth()).toBeGreaterThanOrEqual(400);
  });
});
