import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';

/**
 * One id -> record index per asset-library snapshot.
 *
 * The library array is replaced (never mutated) on every change, so it is a
 * perfect cache key: every consumer of the same snapshot - each collection
 * card, the open collection's detail grid - shares a single Map instead of
 * rebuilding one per component per render. The WeakMap lets superseded
 * snapshots (and their index) be garbage-collected.
 */
const indexCache = new WeakMap<readonly AssetRecord[], ReadonlyMap<string, AssetRecord>>();

export function indexAssetsById(library: readonly AssetRecord[]): ReadonlyMap<string, AssetRecord> {
  let index = indexCache.get(library);
  if (!index) {
    index = new Map(library.map((asset) => [asset.id, asset]));
    indexCache.set(library, index);
  }
  return index;
}

/** The shared id -> record index for the current asset library. */
export function useAssetsById(): ReadonlyMap<string, AssetRecord> {
  return indexAssetsById(useAppStore((s) => s.assetLibrary));
}
