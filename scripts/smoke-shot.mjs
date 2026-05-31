/**
 * Dev-only smoke screenshotter. Launches the built Electron app (backend skipped),
 * navigates to a panel, and writes a PNG so design changes can be eyeballed.
 *
 *   node scripts/smoke-shot.mjs <panel> <outPath>
 *
 * panel: generate | batch | templates | canvas | assets | settings
 * Not shipped / not imported by the app. Safe to delete.
 */
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const panel = process.argv[2] || 'templates';
const out = process.argv[3] || path.join(os.tmpdir(), `vs-smoke-${panel}.png`);
const root = process.cwd();
const mainEntry = path.join(root, 'dist-electron', 'main.mjs');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-smoke-'));

const app = await electron.launch({
  args: [`--user-data-dir=${userDataDir}`, mainEntry],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', VISION_STUDIO_SKIP_BACKEND: '1' },
});

let code = 0;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="nav-generate"]', { timeout: 30_000 });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
  } catch {
    // electron window may not support resize; ignore
  }

  if (panel === 'templates') {
    await page.getByTestId('nav-story').click();
    await page.getByRole('tab', { name: 'Templates' }).click();
  } else if (panel === 'batch') {
    await page.getByTestId('nav-generate').click();
    await page.getByRole('tab', { name: 'Batch' }).click();
  } else {
    await page.getByTestId(`nav-${panel}`).click();
  }

  await page.waitForTimeout(2000);
  const selector = process.argv[4];
  if (selector) {
    await page.locator(selector).first().screenshot({ path: out });
  } else {
    await page.screenshot({ path: out });
  }
  console.log('SHOT_OK', out);
} catch (err) {
  code = 1;
  console.error('SHOT_FAIL', err?.message ?? err);
} finally {
  await app.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
process.exit(code);
