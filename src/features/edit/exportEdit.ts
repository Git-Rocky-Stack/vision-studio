import { useAppStore } from '@/store/appStore';
import {
  createImportedAssetRecords,
  createMediaAssetFromImportedFile,
} from '@/features/assets/assetRecords';
import type { ImportedAssetFile } from '@/types/electron';

/**
 * Export the Edit canvas as a new asset. EditCanvas registers a flattener
 * (Konva stage -> PNG data URL at intrinsic resolution, with adjustments,
 * filters, strokes and text baked in); the Export button calls
 * exportEditedImage(), which saves the bytes through the main process and
 * registers the result in the asset library like an import.
 *
 * Main-process bridge required (owned by electron/):
 *   window.electron.assets.saveDataUrl({ dataUrl, fileName })
 *     -> Promise<{ success: boolean; file?: ImportedAssetFile; error?: string }>
 * It must decode the base64 PNG, write it into the managed assets folder the
 * way assets:import-files does, and return the same file record shape.
 */

export type EditFlattener = () => string | null;

let flattener: EditFlattener | null = null;

export function registerEditFlattener(fn: EditFlattener | null): void {
  flattener = fn;
}

export const EXPORT_BRIDGE_MISSING_MESSAGE =
  'Saving edits needs the assets.saveDataUrl bridge, which this build does not include yet.';
export const EXPORT_NO_CANVAS_MESSAGE = 'Open an image in the editor before exporting.';
export const EXPORT_TAINTED_MESSAGE =
  "This image cannot be exported: its server does not allow pixel access (CORS), so the canvas cannot be read back.";

export interface SaveDataUrlApi {
  saveDataUrl?: (params: {
    dataUrl: string;
    fileName: string;
  }) => Promise<{ success: boolean; file?: ImportedAssetFile; error?: string }>;
}

export interface ExportEditResult {
  ok: boolean;
  path?: string;
  error?: string;
}

function exportFileName(sourcePath: string | null, now: Date): string {
  const base = (sourcePath ?? 'image').split(/[\\/]/).pop() ?? 'image';
  const stem = base.replace(/\.[a-z0-9]+$/i, '') || 'image';
  return `${stem}-edit-${now.getTime()}.png`;
}

export async function exportEditedImage({
  assetsApi = ((typeof window !== 'undefined' ? window.electron?.assets : undefined) ?? {}) as SaveDataUrlApi,
  store = useAppStore,
  now = new Date(),
}: {
  assetsApi?: SaveDataUrlApi;
  store?: typeof useAppStore;
  now?: Date;
} = {}): Promise<ExportEditResult> {
  let dataUrl: string | null;
  try {
    dataUrl = flattener?.() ?? null;
  } catch (error) {
    // A tainted canvas throws SecurityError from toDataURL.
    const isSecurity = error instanceof Error && (error.name === 'SecurityError' || error.message === EXPORT_TAINTED_MESSAGE);
    return {
      ok: false,
      error: isSecurity ? EXPORT_TAINTED_MESSAGE : error instanceof Error ? error.message : 'Export failed.',
    };
  }
  if (!dataUrl) {
    return { ok: false, error: EXPORT_NO_CANVAS_MESSAGE };
  }
  if (typeof assetsApi.saveDataUrl !== 'function') {
    return { ok: false, error: EXPORT_BRIDGE_MISSING_MESSAGE };
  }

  try {
    const result = await assetsApi.saveDataUrl({
      dataUrl,
      fileName: exportFileName(store.getState().currentImageAssetPath, now),
    });
    if (!result.success || !result.file) {
      return { ok: false, error: result.error || 'The edited image could not be saved.' };
    }
    const file = result.file;
    store.setState((state) => ({
      assetLibrary: createImportedAssetRecords(state.assetLibrary, [file]),
    }));
    store.getState().upsertMediaAsset(createMediaAssetFromImportedFile(file));
    return { ok: true, path: file.importedPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The edited image could not be saved.' };
  }
}

/** #rrggbb from sampled RGBA; alpha is ignored (the eyedropper sets opaque colours). */
export function rgbToHex(r: number, g: number, b: number): string {
  const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
