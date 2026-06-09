import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY } from './contentSecurityPolicy';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Parse a CSP header string into a directive -> source-list map. */
function parseCsp(policy: string): Record<string, string[]> {
  return policy.split(';').reduce<Record<string, string[]>>((acc, part) => {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return acc;
    }
    const [directive, ...sources] = tokens;
    acc[directive] = sources;
    return acc;
  }, {});
}

describe('CONTENT_SECURITY_POLICY', () => {
  const directives = parseCsp(CONTENT_SECURITY_POLICY);

  // The local backend serves generated media at http://localhost:8000/outputs/... and the
  // renderer loads it into <img>/<video> elements (MediaPreview, assetRecords). Element loads
  // are governed by img-src/media-src, NOT connect-src, so the backend origins must be
  // allowlisted here or generated previews fail with a CSP violation in the packaged app.
  const backendOrigins = ['http://localhost:*', 'http://127.0.0.1:*'];

  it('allows local backend origins for generated image previews', () => {
    for (const origin of backendOrigins) {
      expect(directives['img-src']).toContain(origin);
    }
  });

  it('allows local backend origins for generated video/audio previews', () => {
    for (const origin of backendOrigins) {
      expect(directives['media-src']).toContain(origin);
    }
  });

  // Imported local assets resolve to file:// URLs (assetRecords.toFileUrl / MediaPreview),
  // which are likewise <img>/<video> loads and need the file: scheme allowlisted.
  it('allows the file: scheme for imported local media', () => {
    expect(directives['img-src']).toContain('file:');
    expect(directives['media-src']).toContain('file:');
  });

  it('still permits self, data, and blob sources', () => {
    expect(directives['img-src']).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'blob:']),
    );
    expect(directives['media-src']).toEqual(
      expect.arrayContaining(["'self'", 'blob:']),
    );
  });

  it('keeps connect-src scoped to self and local backend origins (regression guard)', () => {
    expect(directives['connect-src']).toEqual(
      expect.arrayContaining(["'self'", 'http://localhost:*', 'http://127.0.0.1:*']),
    );
  });

  it('keeps default-src locked to self', () => {
    expect(directives['default-src']).toEqual(["'self'"]);
  });

  // Regression guard for the bug a real completed-generation E2E surfaced: the
  // session-header CSP (this constant) was fixed to allow the backend origins,
  // but the redundant <meta http-equiv="Content-Security-Policy"> in index.html
  // still carried the old `img-src 'self' data: blob:`. The browser enforces the
  // INTERSECTION of both, so the stale meta kept blocking generated previews even
  // though the header allowed them. This locks the two sources together.
  it('keeps the index.html meta CSP in sync with the session-header CSP', () => {
    const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const metaTag = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
    expect(metaTag, 'index.html must declare a Content-Security-Policy meta tag').not.toBeNull();
    // The attribute is double-quoted but contains single-quoted sources ('self'),
    // so capture by the opening delimiter via a backreference rather than [^"'].
    const content = metaTag![0].match(/content=(["'])([\s\S]*?)\1/i);
    expect(content, 'CSP meta tag must have a content attribute').not.toBeNull();

    const metaDirectives = parseCsp(content![2]);

    // Every directive in the header policy must be present and identical in the meta.
    for (const [directive, sources] of Object.entries(directives)) {
      expect(
        metaDirectives[directive],
        `index.html meta CSP "${directive}" must match contentSecurityPolicy.ts`,
      ).toEqual(sources);
    }
    // ...and the meta must not introduce directives the header does not declare.
    expect(Object.keys(metaDirectives).sort()).toEqual(Object.keys(directives).sort());
  });
});
