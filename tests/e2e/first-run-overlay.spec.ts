/**
 * #34 installer PR3: the first-run provisioning overlay requires a VALID
 * backend ProvisionStatus snapshot. E2E runs with VISION_STUDIO_SKIP_BACKEND=1,
 * so the overlay must never appear - this guards every other spec (and the
 * visual baselines) against a false first-run takeover.
 */
import { test, expect } from './fixtures/electron.fixture';

test.describe('First-run provisioning overlay', () => {
  test('stays hidden when no backend snapshot exists', async ({ page }) => {
    await expect(page.getByTestId('main-content')).toBeVisible();
    await expect(page.getByTestId('first-run-provisioning')).toHaveCount(0);
  });
});
