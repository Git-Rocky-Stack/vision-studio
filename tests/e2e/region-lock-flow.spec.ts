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

// Inline 800x600 SVG as a data URL - suitable for `currentImage` without network/fs I/O.
const TEST_IMAGE =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22600%22%3E%3Crect%20width%3D%22800%22%20height%3D%22600%22%20fill%3D%22%23161616%22%2F%3E%3C%2Fsvg%3E';

async function seedProject(
  page: import('@playwright/test').Page
): Promise<{ projectId: string; sceneId: string }> {
  // Seed through the store's own actions (createProject/addScene) instead of a
  // hand-rolled state literal: addScene routes through buildScene, so the seeded
  // scene always matches the real Scene shape. A drifted literal here once
  // omitted canvasControlLayers, crashing the center view (undefined.find)
  // before the mask drawer could ever mount.
  return page.evaluate((img) => {
    const w = window as unknown as {
      __VISION_STUDIO_STORE__: {
        getState: () => {
          createProject: (
            name: string,
            dimensions?: { width: number; height: number }
          ) => { id: string };
          addScene: (projectId: string) => { id: string };
          setActiveProject: (id: string | null) => void;
          setActiveScene: (id: string | null) => void;
          setCurrentImage: (imagePath: string | null, assetPath?: string | null) => void;
          setActiveTab: (tab: 'canvas') => void;
        };
      };
    };
    const actions = w.__VISION_STUDIO_STORE__.getState();
    const project = actions.createProject('E2E Project', { width: 800, height: 600 });
    const scene = actions.addScene(project.id);
    actions.setActiveProject(project.id); // also clears activeSceneId
    actions.setActiveScene(scene.id);
    actions.setCurrentImage(img);
    actions.setActiveTab('canvas');
    return { projectId: project.id, sceneId: scene.id };
  }, TEST_IMAGE);
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
    const { sceneId } = await seedProject(page);

    await page.click('#tab-region');
    await page.waitForSelector('[data-testid="create-region-lock"]');
    await page.click('[data-testid="create-region-lock"]');

    const state = await page.evaluate((sceneId) => {
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
      const scene = s.projects[0]?.scenes.find((sc) => sc.id === sceneId);
      return {
        activeRegionId: s.activeRegionId,
        activeMaskTool: s.activeMaskTool,
        regionCount: scene?.regionLocks.length ?? 0,
        firstName: scene?.regionLocks[0]?.name ?? null,
      };
    }, sceneId);

    expect(state.regionCount).toBe(1);
    expect(state.activeRegionId).not.toBeNull();
    expect(state.activeMaskTool).toBe('rectangle');
    expect(state.firstName).toBe('Region 1');
  });

  test('drawing a rectangle on the mask drawer updates the region bounds', async ({ page }) => {
    const { sceneId } = await seedProject(page);

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
    const bounds = await page.evaluate((sceneId) => {
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
      const scene = s.projects[0]?.scenes.find((sc) => sc.id === sceneId);
      const lock = scene?.regionLocks.find((l) => l.id === s.activeRegionId);
      return lock?.mask.bounds ?? null;
    }, sceneId);

    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(10);
    expect(bounds!.height).toBeGreaterThan(10);
  });
});
