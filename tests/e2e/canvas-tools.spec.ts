/**
 * E2E: Canvas retouch and vector tools in the real Electron renderer.
 *
 * Clone Stamp and Heal change real pixels, so this drives them with real
 * pointer input over a generated PNG and reads the image layer back; Shape and
 * Pen are checked through the layers they add. The image is generated in the
 * page (a data URL), so its pixels are readable without any file or network.
 */
import { test, expect } from './fixtures/electron.fixture';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '../../dist-electron/main.mjs');

const IMAGE_W = 400;
const IMAGE_H = 300;
const SPOT = { x: 120, y: 150, r: 10 };

type StoreState = Record<string, unknown> & {
  editLayers: { type: string; data: Record<string, unknown> }[];
  editRetouchStrokes: { tool: string; offset: unknown }[];
  editPenDraft: number[] | null;
};

function storeState(page: Page): Promise<StoreState> {
  return page.evaluate(() => {
    const w = window as unknown as { __VISION_STUDIO_STORE__: { getState: () => StoreState } };
    const state = w.__VISION_STUDIO_STORE__.getState();
    return JSON.parse(
      JSON.stringify({
        editLayers: state.editLayers,
        editRetouchStrokes: state.editRetouchStrokes,
        editPenDraft: state.editPenDraft,
      }),
    );
  });
}

/** A warm gradient with a dark spot at SPOT, loaded as the edit image. */
async function seedImage(page: Page): Promise<void> {
  await page.evaluate(
    ({ width, height, spot }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#806040');
      gradient.addColorStop(1, '#c0a080');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
      ctx.fill();
      const w = window as unknown as {
        __VISION_STUDIO_STORE__: {
          getState: () => {
            setCurrentImage: (image: string, asset?: string | null) => void;
            setActiveTab: (tab: 'canvas') => void;
          };
        };
      };
      const actions = w.__VISION_STUDIO_STORE__.getState();
      actions.setActiveTab('canvas');
      actions.setCurrentImage(canvas.toDataURL('image/png'));
    },
    { width: IMAGE_W, height: IMAGE_H, spot: SPOT },
  );
  await page.getByRole('application', { name: 'Image editor canvas' }).waitFor();
  // Let the image load and the stage fit it.
  await page.waitForTimeout(500);
}

/** Screen point of an image pixel: EditCanvas fits the image at 85% and centres it. */
async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.getByRole('application', { name: 'Image editor canvas' }).boundingBox())!;
  const scale = Math.min(box.width / IMAGE_W, box.height / IMAGE_H, 1) * 0.85;
  return {
    x: box.x + (box.width - IMAGE_W * scale) / 2 + x * scale,
    y: box.y + (box.height - IMAGE_H * scale) / 2 + y * scale,
  };
}

/** The base image layer's pixel under an image point (layer 2: after the checkerboard). */
async function imagePixel(page: Page, x: number, y: number): Promise<number[]> {
  const screen = await toScreen(page, x, y);
  return page.evaluate(({ sx, sy }) => {
    const canvases = Array.from(
      document.querySelectorAll('[aria-label="Image editor canvas"] canvas'),
    ) as HTMLCanvasElement[];
    const layer = canvases[1];
    const rect = layer.getBoundingClientRect();
    const ratio = layer.width / rect.width;
    const data = layer
      .getContext('2d')!
      .getImageData(Math.round((sx - rect.left) * ratio), Math.round((sy - rect.top) * ratio), 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }, { sx: screen.x, sy: screen.y });
}

async function drag(page: Page, from: [number, number], to: [number, number], modifiers: { shift?: boolean } = {}) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (modifiers.shift) await page.keyboard.down('Shift');
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (modifiers.shift) await page.keyboard.up('Shift');
}

async function click(page: Page, x: number, y: number, modifiers: ('Alt' | 'Shift')[] = []) {
  const point = await toScreen(page, x, y);
  // page.mouse.click has no modifiers option: hold the keys around it.
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(point.x, point.y);
  for (const key of modifiers) await page.keyboard.up(key);
}

test.describe('Canvas - retouch and vector tools', () => {
  test.skip(!fs.existsSync(MAIN_ENTRY), 'Skipped: run `npm run build` first');

  test.beforeEach(async ({ page }) => {
    await seedImage(page);
  });

  test('Heal removes the spot from the real pixels', async ({ page }) => {
    const before = await imagePixel(page, SPOT.x, SPOT.y);
    expect(before[0]).toBeLessThan(40);

    await page.keyboard.press('j');
    await expect(page.getByRole('region', { name: 'Tool options' })).toContainText('Heal');
    // Brush 30px: wider than the spot.
    for (let i = 0; i < 4; i++) await page.keyboard.press(']');
    await click(page, SPOT.x, SPOT.y);
    await page.waitForTimeout(300);

    const state = await storeState(page);
    expect(state.editRetouchStrokes).toHaveLength(1);
    expect(state.editRetouchStrokes[0]).toMatchObject({ tool: 'heal', offset: null });
    const after = await imagePixel(page, SPOT.x, SPOT.y);
    // Back on the gradient (about #9a7a5a at x=120), not black.
    expect(after[0]).toBeGreaterThan(120);
    expect(after[0]).toBeLessThan(180);

    // Undo restores the spot.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect((await imagePixel(page, SPOT.x, SPOT.y))[0]).toBeLessThan(40);
  });

  test('Clone Stamp needs a source, then copies it', async ({ page }) => {
    await page.keyboard.press('s');
    await click(page, 300, 150);
    await expect(page.getByRole('alert')).toHaveText('Alt+click the image to set a clone source first.');
    expect((await storeState(page)).editRetouchStrokes).toHaveLength(0);

    // Source on the spot, paint at x=300: the spot is copied there.
    await click(page, SPOT.x, SPOT.y, ['Alt']);
    await expect(page.getByTestId('clone-source-status')).toHaveText(`${SPOT.x}, ${SPOT.y}`);
    await click(page, 300, 150);
    await page.waitForTimeout(300);
    expect((await storeState(page)).editRetouchStrokes[0]).toMatchObject({
      tool: 'clone',
      offset: { x: SPOT.x - 300, y: 0 },
    });
    expect((await imagePixel(page, 300, 150))[0]).toBeLessThan(60);
  });

  test('Shape draws a rectangle layer and Shift makes a circle', async ({ page }) => {
    await page.keyboard.press('u');
    await drag(page, [40, 40], [140, 100]);
    let shapes = (await storeState(page)).editLayers.filter((l) => l.type === 'shape');
    expect(shapes).toHaveLength(1);
    expect(shapes[0].data).toMatchObject({ kind: 'rectangle' });
    expect(Number(shapes[0].data.width)).toBeGreaterThan(90);

    await page.getByRole('radio', { name: 'Ellipse' }).click();
    await drag(page, [200, 40], [260, 70], { shift: true });
    shapes = (await storeState(page)).editLayers.filter((l) => l.type === 'shape');
    expect(shapes[1].data.kind).toBe('ellipse');
    expect(Math.abs(Number(shapes[1].data.width) - Number(shapes[1].data.height))).toBeLessThan(1);
    await expect(page.getByText('Ellipse', { exact: true }).first()).toBeVisible();
  });

  test('Pen closes a path on its first point and finishes one with Enter', async ({ page }) => {
    await page.keyboard.press('p');
    for (const [x, y] of [[60, 200], [160, 200], [160, 260]] as const) await click(page, x, y);
    expect((await storeState(page)).editPenDraft).toHaveLength(6);
    await click(page, 60, 200);
    let paths = (await storeState(page)).editLayers.filter((l) => l.data.kind === 'path');
    expect(paths[0].data.closed).toBe(true);

    await click(page, 250, 200);
    await click(page, 350, 260);
    await page.keyboard.press('Enter');
    paths = (await storeState(page)).editLayers.filter((l) => l.data.kind === 'path');
    expect(paths).toHaveLength(2);
    expect(paths[1].data.closed).toBe(false);

    await page.screenshot({ path: 'test-results/canvas-tools.png' });
  });
});
