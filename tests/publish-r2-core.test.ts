import { describe, expect, it } from 'vitest';
// CJS import is fine under vitest's node project
import corePkg from '../scripts/publish-r2-core.cjs';

const { planUploads, planMirrorUploads, orderForFeedSafety, RELEASE_ARTIFACT_PATTERNS, contentTypeFor } =
  corePkg;

describe('publish-r2 core', () => {
  const files = [
    'Vision-Studio-3.1.1-Setup.exe',
    'Vision-Studio-3.1.1-Setup.exe.blockmap',
    'vision-studio-3.1.1-x64.nsis.7z', // nsis-web app package the stub downloads
    'vision-studio-3.1.1-win.zip',
    'latest.yml',
    'builder-debug.yml', // build noise, never published
    'README-Windows.txt', // docs, never published
  ];

  it('plans keys under the prefix with correct content types', () => {
    const plan = planUploads(files, { dir: 'release', prefix: 'win/' });
    const byKey = Object.fromEntries(plan.map((u) => [u.key, u]));
    expect(byKey['win/Vision-Studio-3.1.1-Setup.exe'].contentType).toBe('application/octet-stream');
    expect(byKey['win/Vision-Studio-3.1.1-Setup.exe.blockmap'].contentType).toBe(
      'application/octet-stream',
    );
    // The nsis-web stub downloads this at install time - filtering it out
    // would publish an installer that 404s for every user.
    expect(byKey['win/vision-studio-3.1.1-x64.nsis.7z'].contentType).toBe(
      'application/octet-stream',
    );
    expect(byKey['win/latest.yml'].contentType).toBe('text/yaml');
    expect(byKey['win/vision-studio-3.1.1-win.zip'].contentType).toBe('application/zip');
    expect(plan.some((u) => u.key.includes('builder-debug'))).toBe(false);
    expect(plan.some((u) => u.key.includes('README'))).toBe(false);
  });

  it('resolves file paths inside the source dir', () => {
    const plan = planUploads(['latest.yml'], { dir: 'release', prefix: 'win/' });
    expect(plan[0].filePath.replace(/\\/g, '/')).toBe('release/latest.yml');
  });

  it('orders the feed file last so clients never see a feed for missing binaries', () => {
    const plan = orderForFeedSafety(planUploads(files, { dir: 'release', prefix: 'win/' }));
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[plan.length - 1].key).toBe('win/latest.yml');
    // Every binary precedes the feed.
    const feedIndex = plan.findIndex((u) => u.key === 'win/latest.yml');
    expect(feedIndex).toBe(plan.length - 1);
  });

  it('publishes only release artifacts', () => {
    expect(RELEASE_ARTIFACT_PATTERNS.some((re: RegExp) => re.test('latest.yml'))).toBe(true);
    expect(RELEASE_ARTIFACT_PATTERNS.some((re: RegExp) => re.test('builder-debug.yml'))).toBe(
      false,
    );
  });

  it('falls back to octet-stream for unknown types', () => {
    expect(contentTypeFor('something.bin')).toBe('application/octet-stream');
  });

  describe('mirror mode (docs/R2-DELIVERY.md section 5)', () => {
    it('uploads every staged file - weights are not release artifacts', () => {
      // The release filter excludes .safetensors by design; mirror mode must
      // not, or the documented mirror-upload procedure publishes nothing.
      const plan = planMirrorUploads(['v1-5-pruned-emaonly.safetensors', 'model_index.json'], {
        dir: 'staging',
        prefix: 'models/sd-1-5/',
      });
      const byKey = Object.fromEntries(plan.map((u) => [u.key, u]));
      expect(byKey['models/sd-1-5/v1-5-pruned-emaonly.safetensors'].contentType).toBe(
        'application/octet-stream',
      );
      expect(byKey['models/sd-1-5/model_index.json'].contentType).toBe('application/json');
      expect(plan).toHaveLength(2);
    });

    it('normalizes nested Windows paths to forward-slash object keys', () => {
      // A backslash key would never match the manifest mirror file name the
      // DownloadManager joins with '/' - the object would be unreachable.
      const plan = planMirrorUploads(['unet\\diffusion_pytorch_model.safetensors'], {
        dir: 'staging',
        prefix: 'models/some-diffusers-model/',
      });
      expect(plan[0].key).toBe('models/some-diffusers-model/unet/diffusion_pytorch_model.safetensors');
    });
  });
});
