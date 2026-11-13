import { describe, expect, it } from 'vitest';
import { isPathInsideRoots, resolveAssetPath, resolveAssetPathFromRoots } from './assets';

describe('resolveAssetPath', () => {
  it('maps backend output URLs into the configured output directory', () => {
    expect(
      resolveAssetPath('/outputs/job-image-1/image_001.png', 'D:/VisionStudio/Outputs')
    ).toBe('D:/VisionStudio/Outputs/job-image-1/image_001.png');
  });

  it('leaves absolute file paths untouched', () => {
    expect(
      resolveAssetPath('D:/VisionStudio/Outputs/job-image-1/image_001.png', 'D:/VisionStudio/Outputs')
    ).toBe('D:/VisionStudio/Outputs/job-image-1/image_001.png');
  });
});

describe('isPathInsideRoots', () => {
  it('accepts a file that lives under a managed output root', () => {
    expect(
      isPathInsideRoots(
        'D:/VisionStudio/Outputs/job-image-1/image_001.png',
        ['D:/VisionStudio/Outputs', 'C:/Users/test/AppData/Roaming/Vision Studio/outputs']
      )
    ).toBe(true);
  });

  it('rejects a file outside managed output roots', () => {
    expect(
      isPathInsideRoots(
        'C:/Users/test/Documents/taxes.pdf',
        ['D:/VisionStudio/Outputs', 'C:/Users/test/AppData/Roaming/Vision Studio/outputs']
      )
    ).toBe(false);
  });
});

describe('managed-asset containment (S1)', () => {
  const roots = ['D:/VisionStudio/Outputs', 'C:/Users/test/AppData/Roaming/Vision Studio/outputs'];
  const noRealpath = (): string => {
    throw new Error('ENOENT');
  };

  it('resolves dot segments before checking, so /outputs/../../x cannot escape', () => {
    const resolved = resolveAssetPath('/outputs/../../Windows/win.ini', 'D:/VisionStudio/Outputs');
    expect(resolved).toBe('D:/Windows/win.ini');
    expect(isPathInsideRoots(resolved, roots, { realpath: noRealpath })).toBe(false);
  });

  it('refuses traversal, prefix siblings, UNC and device paths', () => {
    for (const candidate of [
      'D:/VisionStudio/Outputs/../../x',
      'D:\\VisionStudio\\Outputs\\..\\Secrets\\x.png',
      'D:/VisionStudio/Outputs-evil/x.png',
      '\\\\host\\share\\x.png',
      '\\\\?\\D:\\VisionStudio\\Outputs\\x.png',
      '\\\\.\\D:\\VisionStudio\\Outputs\\x.png',
    ]) {
      expect(isPathInsideRoots(candidate, roots, { realpath: noRealpath }), candidate).toBe(false);
    }
  });

  it('matches roots case-insensitively and across separators on Windows', () => {
    expect(isPathInsideRoots('d:\\visionstudio\\outputs\\job\\x.png', roots, { realpath: noRealpath })).toBe(true);
  });
});

describe('resolveAssetPathFromRoots', () => {
  it('falls back to an older managed root when a legacy relative asset is no longer under the current root', () => {
    const existingPaths = new Set([
      'D:/VisionStudio/PreviousOutputs/job-image-1/image_001.png',
    ]);

    expect(
      resolveAssetPathFromRoots(
        '/outputs/job-image-1/image_001.png',
        'D:/VisionStudio/NewOutputs',
        ['D:/VisionStudio/NewOutputs', 'D:/VisionStudio/PreviousOutputs'],
        (candidatePath) => existingPaths.has(candidatePath)
      )
    ).toBe('D:/VisionStudio/PreviousOutputs/job-image-1/image_001.png');
  });
});
