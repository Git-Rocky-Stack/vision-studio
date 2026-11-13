import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import viteReact from '@vitejs/plugin-react';
import { describe, expect, it } from 'vitest';

import {
  CONTENT_SECURITY_POLICY,
  HEADER_ONLY_CSP_DIRECTIVES,
  META_CONTENT_SECURITY_POLICY,
  REACT_REFRESH_PREAMBLE_HASH,
  withBackendOutputCors,
} from './contentSecurityPolicy';

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

function readIndexHtml() {
  return readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
}

function readMetaCsp(html: string) {
  const metaTag = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  expect(metaTag, 'index.html must declare a Content-Security-Policy meta tag').not.toBeNull();
  // The attribute is double-quoted but contains single-quoted sources ('self'),
  // so capture by the opening delimiter via a backreference rather than [^"'].
  const content = metaTag![0].match(/content=(["'])([\s\S]*?)\1/i);
  expect(content, 'CSP meta tag must have a content attribute').not.toBeNull();
  return content![2];
}

describe('CONTENT_SECURITY_POLICY', () => {
  const directives = parseCsp(CONTENT_SECURITY_POLICY);

  // The local backend serves generated media at http://localhost:8000/outputs/... and the
  // renderer loads it into <img>/<video> elements (MediaPreview, assetRecords). Element loads
  // are governed by img-src/media-src, NOT connect-src, so the backend origins must be
  // allowlisted here or generated previews fail with a CSP violation in the packaged app.
  const backendOrigins = ['http://localhost:8000', 'http://127.0.0.1:8000'];

  it('allows the local backend (port 8000 only) for generated image and media previews', () => {
    for (const origin of backendOrigins) {
      expect(directives['img-src']).toContain(origin);
      expect(directives['media-src']).toContain(origin);
    }
    for (const directive of ['img-src', 'media-src', 'connect-src']) {
      expect(directives[directive].some((source) => source.endsWith(':*')), directive).toBe(false);
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

  it('pins connect-src to self and the backend over http and ws (S11)', () => {
    expect(directives['connect-src']).toEqual([
      "'self'",
      'http://127.0.0.1:8000',
      'http://localhost:8000',
      'ws://127.0.0.1:8000',
      'ws://localhost:8000',
    ]);
  });

  it('allows no inline script; only the hash of the Vite dev React Refresh preamble (S11)', () => {
    expect(directives['script-src']).toEqual(["'self'", REACT_REFRESH_PREAMBLE_HASH]);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
  });

  it('pins the preamble hash to the installed @vitejs/plugin-react (dev HMR keeps working)', () => {
    // plugin-react injects exactly getPreambleCode(base) as an inline module
    // script; Vite's dev base is '/'. An upgrade that changes it must update the hash.
    const preamble = (viteReact as unknown as { preambleCode: string }).preambleCode.replace('__BASE__', '/');
    const hash = `'sha256-${createHash('sha256').update(preamble, 'utf8').digest('base64')}'`;
    expect(REACT_REFRESH_PREAMBLE_HASH).toBe(hash);
  });

  it('locks down plugins, base URLs, forms and framing', () => {
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'none'"]);
    expect(directives['form-action']).toEqual(["'none'"]);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
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
    const metaDirectives = parseCsp(readMetaCsp(readIndexHtml()));
    const headerOnly = new Set(HEADER_ONLY_CSP_DIRECTIVES.map(([name]) => name));

    // Every directive in the header policy must be present and identical in the meta,
    // except those a <meta> CSP cannot carry (frame-ancestors).
    for (const [directive, sources] of Object.entries(directives)) {
      if (headerOnly.has(directive)) {
        expect(metaDirectives[directive], `${directive} is ignored in a meta CSP`).toBeUndefined();
        continue;
      }
      expect(
        metaDirectives[directive],
        `index.html meta CSP "${directive}" must match contentSecurityPolicy.ts`,
      ).toEqual(sources);
    }
    // ...and the meta must not introduce directives the header does not declare.
    expect(Object.keys(metaDirectives).sort()).toEqual(
      Object.keys(directives).filter((name) => !headerOnly.has(name)).sort(),
    );
    expect(parseCsp(META_CONTENT_SECURITY_POLICY)).toEqual(metaDirectives);
  });
});

describe('index.html (S11/S12)', () => {
  const html = readIndexHtml();

  it('has no inline scripts: every <script> loads a file', () => {
    const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script, script).toMatch(/\bsrc=/);
      expect(script.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '').trim()).toBe('');
    }
  });

  it('loads the pre-paint theme script and favicon by relative path (works under file://)', () => {
    expect(html).toContain('<script src="./theme-init.js"></script>');
    expect(html).toMatch(/<link rel="icon" type="image\/png" href="\.\/favicon\.png"/);
    expect(html).not.toContain('vite.svg');
    const publicDir = path.join(repoRoot, 'public');
    const favicon = readFileSync(path.join(publicDir, 'favicon.png'));
    expect(favicon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(readFileSync(path.join(publicDir, 'theme-init.js'), 'utf8')).toContain('vision-studio-storage');
  });
});

describe('withBackendOutputCors', () => {
  it('marks backend /outputs GETs readable for the app session only', () => {
    for (const url of [
      'http://localhost:8000/outputs/job-1/image.png',
      'http://127.0.0.1:8000/outputs/job-1/image.png',
    ]) {
      const headers = withBackendOutputCors(url, 'GET', { 'access-control-allow-origin': ['http://localhost:5173'] });
      expect(headers['Access-Control-Allow-Origin']).toEqual(['*']);
      expect(headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('leaves the authenticated API, other ports, other hosts and writes alone', () => {
    for (const [url, method] of [
      ['http://localhost:8000/api/jobs', 'GET'],
      ['http://localhost:8001/outputs/job-1/image.png', 'GET'],
      ['https://example.com/outputs/x.png', 'GET'],
      ['http://localhost:8000/outputs/job-1/image.png', 'POST'],
    ] as const) {
      expect(withBackendOutputCors(url, method, {})['Access-Control-Allow-Origin']).toBeUndefined();
    }
  });
});
