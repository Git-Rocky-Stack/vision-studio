/**
 * Decoding for `assets:save-data-url` - the renderer's flattened Canvas edit,
 * sent as a PNG data URL, written into the managed output tree.
 *
 * The payload crosses the IPC boundary from the renderer, so nothing about it
 * is trusted: only base64 PNG data URLs are accepted, the decoded bytes must
 * carry the PNG signature, the size is capped, and the requested file name is
 * reduced to a plain base name (no directories, no traversal, no extension
 * other than .png).
 */

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 8K x 8K RGBA is ~256 MB raw; a PNG of a real edit is far smaller. */
export const MAX_DATA_URL_ASSET_BYTES = 200 * 1024 * 1024;

export type DecodedDataUrlAsset =
  | { ok: true; bytes: Buffer; baseName: string }
  | { ok: false; error: string };

export function sanitizeAssetBaseName(fileName: unknown, fallback = 'edit'): string {
  const raw = typeof fileName === 'string' ? fileName : '';
  // Last path segment only, extension dropped: the writer always appends .png.
  const lastSegment = raw.split(/[\\/]/).pop() ?? '';
  const withoutExt = lastSegment.replace(/^[. ]+/, '').replace(/\.[^.]*$/, '');
  const cleaned = withoutExt
    .replace(/[^A-Za-z0-9 _-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export function decodePngDataUrl(dataUrl: unknown, fileName: unknown): DecodedDataUrlAsset {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return { ok: false, error: 'Only PNG images can be saved from the editor.' };
  }

  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  // base64 inflates by 4/3: refuse oversized payloads before decoding them.
  if (Math.floor((payload.length * 3) / 4) > MAX_DATA_URL_ASSET_BYTES) {
    return { ok: false, error: 'The edited image is too large to save.' };
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return { ok: false, error: 'The edited image data is not valid base64.' };
  }

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { ok: false, error: 'The edited image data is not a PNG.' };
  }

  return { ok: true, bytes, baseName: sanitizeAssetBaseName(fileName) };
}
