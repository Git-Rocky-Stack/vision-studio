import { describe, expect, it } from 'vitest';
// CJS import is fine under vitest's node project
import corePkg from '../scripts/publish-r2-core.cjs';

const { planUploads, orderForFeedSafety, RELEASE_ARTIFACT_PATTERNS, contentTypeFor } = corePkg;

describe('publish-r2 core', () => {
  const files = [
    'Vision Studio Setup 3.1.1.exe',
    'Vision Studio Setup 3.1.1.exe.blockmap',
    'vision-studio-3.1.1-win.zip',
    'latest.yml',
    'builder-debug.yml', // build noise, never published
    'README-Windows.txt', // docs, never published
  ];

  it('plans keys under the prefix with correct content types', () => {
    const plan = planUploads(files, { dir: 'release', prefix: 'win/' });
    const byKey = Object.fromEntries(plan.map((u) => [u.key, u]));
    expect(byKey['win/Vision Studio Setup 3.1.1.exe'].contentType).toBe('application/octet-stream');
    expect(byKey['win/Vision Studio Setup 3.1.1.exe.blockmap'].contentType).toBe(
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
});
