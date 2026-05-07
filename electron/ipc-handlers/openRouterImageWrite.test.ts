import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  extensionForMimeType,
  toNormalizedFilePath,
  writeOpenRouterImageDataUrl,
} from './openRouterImageWrite';

// Background: OpenRouter returns generated images as base64 data URLs.
// The IPC handler turns those into real files on disk under the user's
// configured output root, partitioned by date so a daily output folder
// never balloons unbounded. Path normalization to POSIX-style separators
// happens at the boundary so renderer code can compare paths without
// caring about Windows backslashes.

describe('toNormalizedFilePath', () => {
  it('replaces every backslash with a forward slash', () => {
    expect(toNormalizedFilePath('C:\\users\\rocky\\out.png')).toBe('C:/users/rocky/out.png');
  });

  it('leaves a POSIX path unchanged', () => {
    expect(toNormalizedFilePath('/home/rocky/out.png')).toBe('/home/rocky/out.png');
  });

  it('handles an empty string', () => {
    expect(toNormalizedFilePath('')).toBe('');
  });
});

describe('extensionForMimeType', () => {
  it('returns jpg for jpeg or jpg mime types', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/jpg')).toBe('jpg');
  });

  it('returns webp for webp', () => {
    expect(extensionForMimeType('image/webp')).toBe('webp');
  });

  it('returns gif for gif', () => {
    expect(extensionForMimeType('image/gif')).toBe('gif');
  });

  it('returns png for png', () => {
    expect(extensionForMimeType('image/png')).toBe('png');
  });

  it('returns png as the safe default for unknown mime types', () => {
    expect(extensionForMimeType('image/avif')).toBe('png');
    expect(extensionForMimeType('application/octet-stream')).toBe('png');
    expect(extensionForMimeType('')).toBe('png');
  });

  it('is case-insensitive', () => {
    expect(extensionForMimeType('IMAGE/JPEG')).toBe('jpg');
    expect(extensionForMimeType('Image/WebP')).toBe('webp');
  });
});

describe('writeOpenRouterImageDataUrl', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'or-write-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  // 4-byte payload "PNG!" base64-encoded.
  const tinyBase64 = Buffer.from('PNG!', 'utf-8').toString('base64');
  const tinyDataUrl = `data:image/png;base64,${tinyBase64}`;

  it('writes the decoded payload to disk and returns the POSIX path', async () => {
    const written = await writeOpenRouterImageDataUrl({
      dataUrl: tinyDataUrl,
      mimeType: 'image/png',
      jobId: 'openrouter-image-test-123',
      index: 0,
      outputRoot: tempRoot,
    });

    expect(written).not.toContain('\\');
    expect(written.endsWith('.png')).toBe(true);
    expect(written).toContain('openrouter-image-test-123-1.png');

    const actual = await fs.promises.readFile(written.replace(/\//g, path.sep));
    expect(actual.toString('utf-8')).toBe('PNG!');
  });

  it('creates the date-partitioned subdirectory under <outputRoot>/openrouter/', async () => {
    const written = await writeOpenRouterImageDataUrl({
      dataUrl: tinyDataUrl,
      mimeType: 'image/png',
      jobId: 'openrouter-image-dir-1',
      index: 0,
      outputRoot: tempRoot,
    });

    const today = new Date().toISOString().slice(0, 10);
    expect(written).toContain(`/openrouter/${today}/`);
  });

  it('uses index+1 in the filename so jobs with multiple images do not collide', async () => {
    const a = await writeOpenRouterImageDataUrl({
      dataUrl: tinyDataUrl,
      mimeType: 'image/png',
      jobId: 'openrouter-image-multi',
      index: 0,
      outputRoot: tempRoot,
    });
    const b = await writeOpenRouterImageDataUrl({
      dataUrl: tinyDataUrl,
      mimeType: 'image/png',
      jobId: 'openrouter-image-multi',
      index: 1,
      outputRoot: tempRoot,
    });

    expect(a).toContain('openrouter-image-multi-1.png');
    expect(b).toContain('openrouter-image-multi-2.png');
    expect(a).not.toBe(b);
  });

  it('picks the file extension from the mimeType, not the data URL prefix', async () => {
    // The data URL header lies about the mimeType; the explicit param wins,
    // because the source data URL is what we actually decode but the mime
    // type is what the OpenRouter envelope reports as authoritative.
    const written = await writeOpenRouterImageDataUrl({
      dataUrl: 'data:application/octet-stream;base64,QUJDRA==', // ABCD
      mimeType: 'image/jpeg',
      jobId: 'openrouter-image-ext-test',
      index: 0,
      outputRoot: tempRoot,
    });
    expect(written.endsWith('.jpg')).toBe(true);
  });

  it('strips the data: prefix before decoding base64', async () => {
    const written = await writeOpenRouterImageDataUrl({
      dataUrl: tinyDataUrl,
      mimeType: 'image/png',
      jobId: 'openrouter-image-strip',
      index: 0,
      outputRoot: tempRoot,
    });
    const actual = await fs.promises.readFile(written.replace(/\//g, path.sep));
    // If the prefix wasn't stripped, the decode would corrupt the bytes
    // and we'd see something other than 'PNG!'.
    expect(actual.toString('utf-8')).toBe('PNG!');
  });
});
