import { toPreviewUrl } from '@/features/assets/assetRecords';
import type { AssetRecord } from '@/types/assets';

/**
 * Job-params flags that describe a finished job whose backend output was
 * replaced by a renderer-side result (a Blend Edges composite, see
 * features/edit/supersedeRawEditOutput.ts):
 *
 * - `suppressAssetSync`: job-status sync must not register the job's raw
 *   output in the asset library (it is an intermediate, possibly deleted).
 * - `replacedByAssetPath`: library path of the file that is the job's real
 *   result; thumbnails and results shown for the job use it.
 */
export const SUPPRESS_ASSET_SYNC_PARAM = 'suppressAssetSync';
export const REPLACED_BY_ASSET_PATH_PARAM = 'replacedByAssetPath';

type JobParams = Record<string, unknown> | null | undefined;

/** True when job-status sync must skip asset registration for this job. */
export function isAssetSyncSuppressed(params: JobParams): boolean {
  return params?.[SUPPRESS_ASSET_SYNC_PARAM] === true;
}

/** The library path that replaced the job's backend output, if any. */
export function replacementAssetPath(params: JobParams): string | null {
  const value = params?.[REPLACED_BY_ASSET_PATH_PARAM];
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Display URL for a library path: the registered record's preview when the
 * library holds one (it may be a file:// URL the main process granted), the
 * derived preview URL otherwise.
 */
export function previewUrlForAssetPath(
  assetPath: string,
  assetLibrary: readonly Pick<AssetRecord, 'path' | 'previewUrl'>[] = [],
): string {
  const target = normalizePath(assetPath);
  const record = assetLibrary.find((asset) => normalizePath(asset.path) === target);
  return record?.previewUrl || toPreviewUrl(assetPath, { type: 'image' });
}

/**
 * Loadable thumbnail URL for a finished image job: the replacement result
 * when the job's output was superseded, otherwise the job's first image as a
 * preview URL (the backend reports `/outputs/<job>/generated.png`, which is
 * not loadable by an <img> on its own). Empty when the job produced no image.
 */
export function resolveJobImageThumbnail(
  job: { params?: JobParams; result?: { images?: string[] } | null },
  assetLibrary: readonly Pick<AssetRecord, 'path' | 'previewUrl'>[] = [],
): string {
  const replacement = replacementAssetPath(job.params);
  if (replacement) return previewUrlForAssetPath(replacement, assetLibrary);
  const image = job.result?.images?.[0];
  return image ? toPreviewUrl(image, { type: 'image' }) : '';
}

/** Matches a URL scheme (http:, file:, data:, blob:) but not a Windows drive letter. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]+:/i;

/**
 * Display form of a stored iteration thumbnail. Nodes recorded before
 * thumbnails were stored as preview URLs hold the backend-relative path
 * (`/outputs/...`); a URL or an empty value passes through unchanged.
 */
export function toIterationThumbnailUrl(thumbnail: string): string {
  if (!thumbnail || URL_SCHEME.test(thumbnail)) return thumbnail;
  return toPreviewUrl(thumbnail, { type: 'image' });
}
