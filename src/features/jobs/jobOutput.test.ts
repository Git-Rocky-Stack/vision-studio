import { describe, expect, it } from 'vitest';

import {
  isAssetSyncSuppressed,
  previewUrlForAssetPath,
  replacementAssetPath,
  resolveJobImageThumbnail,
  toIterationThumbnailUrl,
} from './jobOutput';

describe('jobOutput', () => {
  it('reads the superseded-output flags strictly', () => {
    expect(isAssetSyncSuppressed({ suppressAssetSync: true })).toBe(true);
    expect(isAssetSyncSuppressed({ suppressAssetSync: 'true' })).toBe(false);
    expect(isAssetSyncSuppressed(undefined)).toBe(false);
    expect(replacementAssetPath({ replacedByAssetPath: 'C:/e/a.png' })).toBe('C:/e/a.png');
    expect(replacementAssetPath({ replacedByAssetPath: '  ' })).toBeNull();
    expect(replacementAssetPath({ replacedByAssetPath: 3 })).toBeNull();
  });

  it('prefers a registered record preview for a library path', () => {
    const library = [{ path: 'C:\\e\\a.png', previewUrl: 'file:///C:/e/a.png?granted' }];
    expect(previewUrlForAssetPath('C:/e/a.png', library)).toBe('file:///C:/e/a.png?granted');
    expect(previewUrlForAssetPath('C:/e/b.png', library)).toBe('file:///C:/e/b.png');
  });

  it('resolves a loadable job thumbnail', () => {
    expect(resolveJobImageThumbnail({ result: { images: ['/outputs/j/generated.png'] } })).toBe(
      'http://localhost:8000/outputs/j/generated.png',
    );
    expect(
      resolveJobImageThumbnail({
        params: { replacedByAssetPath: 'C:/e/a.png' },
        result: { images: ['/outputs/j/generated.png'] },
      }),
    ).toBe('file:///C:/e/a.png');
    expect(resolveJobImageThumbnail({ result: {} })).toBe('');
  });

  it('upgrades a legacy backend-relative iteration thumbnail and passes URLs through', () => {
    expect(toIterationThumbnailUrl('/outputs/j/generated.png')).toBe('http://localhost:8000/outputs/j/generated.png');
    expect(toIterationThumbnailUrl('C:/out/j.png')).toBe('file:///C:/out/j.png');
    for (const url of ['http://localhost:8000/outputs/j.png', 'file:///C:/a.png', 'data:image/png;base64,AA', '']) {
      expect(toIterationThumbnailUrl(url)).toBe(url);
    }
  });
});
