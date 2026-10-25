import { describe, expect, it } from 'vitest';

import { MAX_DATA_URL_ASSET_BYTES, decodePngDataUrl, sanitizeAssetBaseName } from './dataUrlAsset';

describe('sanitizeAssetBaseName', () => {
  it('keeps only a plain base name with no directories or extension', () => {
    expect(sanitizeAssetBaseName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAssetBaseName('C:\\Users\\me\\shot.edit.png')).toBe('shot-edit');
    expect(sanitizeAssetBaseName('  ..hidden  ')).toBe('hidden');
    expect(sanitizeAssetBaseName('')).toBe('edit');
    expect(sanitizeAssetBaseName(undefined)).toBe('edit');
    expect(sanitizeAssetBaseName('a'.repeat(200))).toHaveLength(80);
  });
});

describe('decodePngDataUrl', () => {
  it('refuses a payload whose decoded size exceeds the cap before decoding it', () => {
    const huge = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_DATA_URL_ASSET_BYTES * 4) / 3) + 8)}`;
    const result = decodePngDataUrl(huge, 'x');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/too large/);
  });
});
