import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');
const config = parse(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8'));

describe('packaging config honesty rails', () => {
  it('publishes the update feed to the generic R2 host, not GitHub', () => {
    // GitHub caps release assets at 2 GB; the ~6 GB heavy installer cannot
    // ship there. The electron-updater feed (latest.yml + blockmap) lives on
    // the R2 custom domain.
    expect(config.publish.provider).toBe('generic');
    expect(config.publish.url).toBe('https://updates.vision-studio-x.com/win/');
  });

  it('disables multi-range differential requests (unsupported by R2/S3)', () => {
    expect(config.publish.useMultipleRangeRequest).toBe(false);
  });

  it('keeps update signature verification on', () => {
    expect(config.win.verifyUpdateCodeSignature).toBe(true);
  });

  it('keeps the heavy-by-design beforePack gate wired and present', () => {
    expect(config.beforePack).toBe('scripts/assert-native-backend.cjs');
    expect(() => readFileSync(resolve(ROOT, config.beforePack))).not.toThrow();
  });

  it('ships the third-party license compliance doc as an extra resource', () => {
    const entries = (config.extraResources ?? []).map((e: { from: string }) => e.from);
    expect(entries).toContain('THIRD-PARTY-LICENSES.md');
  });
});
