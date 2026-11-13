import { useSyncExternalStore } from 'react';

/**
 * Film grain texture preference (Settings > Appearance).
 *
 * The grain is a full-window overlay that steps a CSS transform ten times a
 * second. It is cheap (one cached 128px tile, compositor-only motion), but it
 * is still a permanent full-window layer, so the user decides:
 *
 * - `animated` - the default look: grain drifts (paused while the window is
 *   hidden; frozen under prefers-reduced-motion by index.css).
 * - `static`   - the texture without any animation.
 * - `off`      - no overlay is mounted at all.
 *
 * The value is a per-machine display preference, so it lives in localStorage
 * (guarded: storage can be absent or throw) rather than in the synced project
 * store. A module-level store with useSyncExternalStore keeps the overlay and
 * the Settings control in step without a provider.
 */
export type FilmGrainMode = 'animated' | 'static' | 'off';

export const FILM_GRAIN_MODES: readonly FilmGrainMode[] = ['animated', 'static', 'off'];
export const DEFAULT_FILM_GRAIN_MODE: FilmGrainMode = 'animated';
export const FILM_GRAIN_STORAGE_KEY = 'vision-studio:film-grain';

function isFilmGrainMode(value: unknown): value is FilmGrainMode {
  return typeof value === 'string' && (FILM_GRAIN_MODES as readonly string[]).includes(value);
}

function readStoredMode(): FilmGrainMode {
  try {
    const stored = globalThis.localStorage?.getItem(FILM_GRAIN_STORAGE_KEY);
    return isFilmGrainMode(stored) ? stored : DEFAULT_FILM_GRAIN_MODE;
  } catch {
    return DEFAULT_FILM_GRAIN_MODE;
  }
}

let currentMode: FilmGrainMode | null = null;
const listeners = new Set<() => void>();

export function getFilmGrainMode(): FilmGrainMode {
  if (currentMode === null) currentMode = readStoredMode();
  return currentMode;
}

/**
 * Applies the preference immediately and persists it. Returns false when the
 * value could not be persisted (it still applies for this session).
 */
export function setFilmGrainMode(mode: FilmGrainMode): boolean {
  currentMode = mode;
  let persisted = true;
  try {
    globalThis.localStorage?.setItem(FILM_GRAIN_STORAGE_KEY, mode);
  } catch {
    persisted = false;
  }
  listeners.forEach((listener) => listener());
  return persisted;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFilmGrainMode(): FilmGrainMode {
  return useSyncExternalStore(subscribe, getFilmGrainMode, () => DEFAULT_FILM_GRAIN_MODE);
}

/** Test seam: forget the cached value so the next read goes back to storage. */
export function resetFilmGrainModeForTests(): void {
  currentMode = null;
  listeners.clear();
}
