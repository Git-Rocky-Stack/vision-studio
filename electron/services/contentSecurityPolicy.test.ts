import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY } from './contentSecurityPolicy';

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
});
