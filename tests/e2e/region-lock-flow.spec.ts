/**
 * E2E: Region Lock workflow.
 *
 * Validates the critical region-lock user journey:
 *   Navigate to Edit → open Region tab → create region lock → draw mask → verify store.
 *
 * Uses a seeded project/scene via the exposed store, then drives the rest of the
 * flow through real UI clicks and pointer events against the RegionMaskDrawer.
 */
import { test, expect } from './fixtures/electron.fixture';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '../../dist-electron/main.mjs');

// 1x1 transparent PNG as a data URL — suitable for `currentImage` without network/fs I/O.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function seedProject(page: import('@playwright/test').Page) {
  // Create a minimal project + scene and set it active, plus load a current image
  // so the artboard has known dimensions.
  await page.evaluate((img) => {
    const w = window as unknown as {
      __VISION_STUDIO_STORE__: {
        getState: () => Record<string, unknown>;
        setState: (partial: Record<string, unknown>) => void;
      };
    };
    const store = w.__VISION_STUDIO_STORE__;
    const now = new Date().toISOString();
    const project = {
      id: 'p-e2e-1',
      name: 'E2E Project',
      created: now,
      modified: now,
      dimensions: { width: 800, height: 600 },
      fps: 24,
      characters: [],
      scenes: [
        {
          id: 's-e2e-1',
          projectId: 'p-e2e-1',
          index: 0,
          name: 'Scene 1',
          prompt: '',
          generationConfig: {},
          transition: { type: 'cut', duration: 0 },
          regionLocks: [],
          metadata: { created: now, modified: now, duration: 0, fps: 24, notes: '' },
          status: 'draft',
          characterRefs: [],
          frames: [],
        },
      ],
      metadata: {},
    };
    store.setState({
      projects: [project],
      activeProjectId: 'p-e2e-1',
      activeSceneId: 's-e2e-1',
      currentImage: img,
      activePanel: 'edit',
    });
  }, TINY_PNG);
}

test.describe('Region Lock - workflow', () => {
  test.skip(!fs.existsSync(MAIN_ENTRY), 'Skipped: run `npm run build` first');

  test('exposes the store on window for test seeding', async ({ page }) => {
    const exposed = await page.evaluate(
      () =>
        typeof (window as unknown as { __VISION_STUDIO_STORE__?: unknown })
          .__VISION_STUDIO_STORE__ !== 'undefined'
    );
    expect(exposed).toBe(true);
  });

  test('entering the Region tab enables regionMode', async ({ page }) => {
    await seedProject(page);

    // Wait for the edit panel UI to settle after seeding.
    await page.waitForSelector('#tab-region', { timeout: 10_000 });
    await page.click('#tab-region');

    const regionMode = await page.evaluate(() => {
      const w = window as unknown as {
        __VISION_STUDIO_STORE__: { getState: () => { regionMode: boolean } };
      };
      return w.__VISION_STUDIO_STORE__.getState().regionMode;
    });
    expect(regionMode).toBe(true);
  });

  test('Create Region Lock button creates and selects a region', async ({ page }) => {
    await seedProject(page);

    await page.click('#tab-region');
    await page.waitForSelector('[data-testid="create-region-lock"]');
    await page.click('[data-testid="create-region-lock"]');

    const state = await page.evaluate(() => {
      const w = window as unknown as {
        __VISION_STUDIO_STORE__: {
          getState: () => {
            activeRegionId: string | null;
            activeMaskTool: string;
            projects: { scenes: { id: string; regionLocks: { id: string; name: string }[] }[] }[];
          };
        };
      };
      const s = w.__VISION_STUDIO_STORE__.getState();
      const scene = s.projects[0]?.scenes.find((sc) => sc.id === 's-e2e-1');
      return {
        activeRegionId: s.activeRegionId,
        activeMaskTool: s.activeMaskTool,
        regionCount: scene?.regionLocks.length ?? 0,
        firstName: scene?.regionLocks[0]?.name ?? null,
      };
    });

    expect(state.regionCount).toBe(1);
    expect(state.activeRegionId).not.toBeNull();
    expect(state.activeMaskTool).toBe('rectangle');
    expect(state.firstName).toBe('Region 1');
  });

  test('drawing a rectangle on the mask drawer updates the region bounds', async ({ page }) => {
    await seedProject(page);

    await page.click('#tab-region');
    await page.waitForSelector('[data-testid="create-region-lock"]');
    await page.click('[data-testid="create-region-lock"]');

    // The RegionMaskDrawer only renders when regionMode + activeRegion + tool !== 'select'.
    // After creation, tool is 'rectangle', so the drawer should mount.
    await page.waitForSelector('[data-testid="region-mask-drawer"]', { timeout: 5_000 });
    const drawer = page.locator('[data-testid="region-mask-drawer"]');
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Drag from ~25% → ~75% of the drawer surface.
    const x1 = box.x + box.width * 0.25;
    const y1 = box.y + box.height * 0.25;
    const x2 = box.x + box.width * 0.75;
    const y2 = box.y + box.height * 0.75;

    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x1 + (x2 - x1) * 0.5, y1 + (y2 - y1) * 0.5, { steps: 5 });
    await page.mouse.move(x2, y2, { steps: 5 });
    await page.mouse.up();

    // After release, updateRegionLock should have been called and the bounds persisted.
    const bounds = await page.evaluate(() => {
      const w = window as unknown as {
        __VISION_STUDIO_STORE__: {
          getState: () => {
            activeRegionId: string | null;
            projects: {
              scenes: {
                id: string;
                regionLocks: { id: string; mask: { bounds: { width: number; height: number } } }[];
              }[];
            }[];
          };
        };
      };
      const s = w.__VISION_STUDIO_STORE__.getState();
      const scene = s.projects[0]?.scenes.find((sc) => sc.id === 's-e2e-1');
      const lock = scene?.regionLocks.find((l) => l.id === s.activeRegionId);
      return lock?.mask.bounds ?? null;
    });

    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(10);
    expect(bounds!.height).toBeGreaterThan(10);
  });
});
