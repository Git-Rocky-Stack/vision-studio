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
