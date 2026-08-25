import type { ElectronAPI } from '@/types/electron';

/**
 * The preload bridge, or null when the renderer is not running inside Electron.
 *
 * `src/types/electron.d.ts:509` declares `window.electron` as a required
 * property. That is true of the shipping app - `electron/preload.ts` runs
 * before any renderer code - and false of the two other hosts this bundle is
 * loaded into:
 *
 *   - the `vite preview` build the performance suite measures
 *     (playwright.config.ts webServer[1]), and
 *   - the dev server used for headless design review.
 *
 * Because the declaration is required, the compiler cannot flag a call that
 * assumes it. Anything on a *mount path* has to check anyway, since it runs
 * before the app could have noticed the bridge was missing: an unguarded
 * `window.electron.settings.get()` in a `useEffect` throws
 * "Cannot read properties of undefined (reading 'settings')" and takes the
 * whole panel down through its ErrorBoundary.
 *
 * Event handlers are a different case and deliberately left alone. They only
 * run after a user has clicked something in a window that Electron opened, so
 * the bridge is present by construction; wrapping those ~240 call sites would
 * add noise without removing a reachable failure.
 *
 * This function exists so the exception to the type is stated once, in a
 * greppable place, rather than re-argued at each call site.
 */
export function getElectronBridge(): ElectronAPI | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { electron?: ElectronAPI }).electron ?? null;
}
