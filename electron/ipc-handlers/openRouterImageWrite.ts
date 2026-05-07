import fs from 'node:fs';
import path from 'node:path';

/**
 * Disk-write side of the OpenRouter still-image pipeline.
 *
 * OpenRouter returns generated images as base64 data URLs. We persist
 * them under `<outputRoot>/openrouter/<YYYY-MM-DD>/<jobId>-<n>.<ext>`,
 * where `<n>` is one-based so a renderer can show "image 1 of N" without
 * shifting. The path returned is POSIX-normalized so the renderer can
 * compare and display it without dealing with Windows backslashes.
 *
 * The mimeType passed in is the OpenRouter envelope's `mimeType` field,
 * not whatever the data URL prefix claims -- the prefix is stripped and
 * discarded before base64 decoding.
 */

export function toNormalizedFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function extensionForMimeType(mimeType: string): 'jpg' | 'webp' | 'gif' | 'png' {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'jpg';
  }
  if (normalized.includes('webp')) {
    return 'webp';
  }
  if (normalized.includes('gif')) {
    return 'gif';
  }
  return 'png';
}

export async function writeOpenRouterImageDataUrl({
  dataUrl,
  mimeType,
  jobId,
  index,
  outputRoot,
}: {
  dataUrl: string;
  mimeType: string;
  jobId: string;
  index: number;
  outputRoot: string;
}): Promise<string> {
  const base64Payload = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const directory = path.join(outputRoot, 'openrouter', new Date().toISOString().slice(0, 10));
  await fs.promises.mkdir(directory, { recursive: true });

  const extension = extensionForMimeType(mimeType);
  const filePath = path.join(directory, `${jobId}-${index + 1}.${extension}`);
  await fs.promises.writeFile(filePath, Buffer.from(base64Payload, 'base64'));
  return toNormalizedFilePath(filePath);
}
