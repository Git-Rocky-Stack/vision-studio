/**
 * @vitest-environment jsdom
 *
 * Test files ending in `.test.ts` are routed to the node project by
 * vitest.config.ts. The accessor under test reads `window`, so it needs a DOM.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getElectronBridge } from './electronBridge';

/**
 * `src/types/electron.d.ts:509` declares `window.electron` as a required
 * property, which is true in the shipping app - the preload always runs - and
 * false in every other host the renderer is loaded into: the `vite preview`
 * bundle the performance suite measures, and the dev server used for headless
 * design review. Code that runs on a mount path cannot rely on the declaration,
 * because it executes before anything has had a chance to notice the bridge is
 * missing, and an unguarded `window.electron.settings.get()` there takes the
 * whole panel down through its ErrorBoundary.
 *
 * This accessor is the single seam that states the fact the type cannot.
 */
describe('getElectronBridge', () => {
  const original = Reflect.getOwnPropertyDescriptor(window, 'electron');

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'electron', original);
    } else {
      Reflect.deleteProperty(window, 'electron');
    }
  });

  it('returns the preload bridge when the renderer runs inside Electron', () => {
    const bridge = { settings: { get: () => Promise.resolve({}) } };
    (window as unknown as { electron: unknown }).electron = bridge;

    expect(getElectronBridge()).toBe(bridge);
  });

  it('returns null when the property was never defined', () => {
    Reflect.deleteProperty(window, 'electron');

    expect(getElectronBridge()).toBeNull();
  });

  it('returns null rather than undefined when the property is explicitly undefined', () => {
    (window as unknown as { electron: unknown }).electron = undefined;

    // Callers branch on `=== null` and on truthiness; normalising here keeps
    // both readings identical for a property that exists but holds nothing.
    expect(getElectronBridge()).toBeNull();
  });
});
