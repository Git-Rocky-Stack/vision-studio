/**
 * Tooltips must sit beside the control they describe.
 *
 * floating-ui positions its floating element with a CSS transform by default,
 * and framer-motion owns `transform` on the animated tooltip, so the translate
 * was discarded and every tooltip rendered at the window origin. jsdom has no
 * layout, so the placement can only be asserted in the real app.
 */
import { test, expect } from './fixtures/electron.fixture';

test.describe('Tooltip placement', () => {
  test('a nav tooltip opens to the right of its tab, centred on it', async ({ page }) => {
    const tab = page.getByTestId('nav-canvas');
    await tab.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Canvas');

    // The tooltip scales in over 150ms; poll until its box has settled. The
    // offset middleware asks for an 8px gap, and the scale animation plus
    // sub-pixel text metrics move each edge by under a pixel.
    const measure = async () => {
      const tabBox = await tab.boundingBox();
      const tipBox = await tooltip.boundingBox();
      if (!tabBox || !tipBox) return null;
      return {
        gap: tipBox.x - (tabBox.x + tabBox.width),
        centreOffset: Math.abs(tabBox.y + tabBox.height / 2 - (tipBox.y + tipBox.height / 2)),
      };
    };

    // Settled means two reads 50ms apart agree: a single read taken as soon as
    // the gap first looks right can land mid-scale, while the box is still
    // shrinking toward its centre and the gap still reads above 8px.
    const settledRead = async () => {
      const first = await measure();
      await page.waitForTimeout(50);
      const second = await measure();
      const stable =
        first !== null &&
        second !== null &&
        Math.abs(first.gap - second.gap) < 0.01 &&
        Math.abs(first.centreOffset - second.centreOffset) < 0.01;
      return stable ? second : null;
    };
    await expect.poll(async () => (await settledRead()) !== null).toBe(true);
    const settled = await settledRead();
    expect(settled).not.toBeNull();
    expect(settled?.gap).toBeGreaterThanOrEqual(7);
    expect(settled?.gap).toBeLessThanOrEqual(9);
    expect(settled?.centreOffset).toBeLessThanOrEqual(1);
  });
});
