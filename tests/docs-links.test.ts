import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, posix, resolve, sep } from 'path';

const ROOT = resolve(__dirname, '..');

/**
 * The files a visitor lands on first. A dead link here is a 404 in public, and
 * the local filesystem will not tell you: NTFS and APFS resolve
 * `docs/ARCHITECTURE.md` to `docs/architecture.md` quite happily, while
 * GitHub - which serves these paths case-sensitively - does not. Every link is
 * therefore checked against the exact directory entry, not against
 * `existsSync`.
 */
const PUBLIC_DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'BUNDLING.md',
  'DEPLOYMENT.md',
  'WINDOWS_BUILD.md',
  'docs/INDEX.md',
];

/** `[text](target)` - skipping images, anchors, and absolute URLs. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const dirCache = new Map<string, Set<string>>();

function entries(dir: string): Set<string> {
  let cached = dirCache.get(dir);
  if (!cached) {
    try {
      cached = new Set(readdirSync(dir));
    } catch {
      cached = new Set();
    }
    dirCache.set(dir, cached);
  }
  return cached;
}

/** Case-exact existence check: every path segment must match a real entry. */
function existsExactly(relativePath: string): boolean {
  const segments = relativePath.split('/').filter((s) => s.length > 0 && s !== '.');
  let current = ROOT;
  for (const segment of segments) {
    if (segment === '..') {
      current = dirname(current);
      continue;
    }
    if (!entries(current).has(segment)) return false;
    current = join(current, segment);
  }
  return true;
}

function relativeLinks(doc: string): string[] {
  const source = readFileSync(resolve(ROOT, doc), 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    // Drop any in-page anchor; only the file part is a filesystem path.
    found.push(target.split('#')[0]);
  }
  return found.filter((t) => t.length > 0);
}

describe('public documentation links resolve', () => {
  for (const doc of PUBLIC_DOCS) {
    it(`${doc} has no broken relative links`, () => {
      const base = posix.dirname(doc.split(sep).join('/'));
      const broken = relativeLinks(doc).filter((target) => {
        const full = target.startsWith('/')
          ? target.slice(1)
          : posix.normalize(base === '.' ? target : `${base}/${target}`);
        return !existsExactly(full);
      });

      expect(broken, `${doc} links to paths that do not exist`).toEqual([]);
    });
  }

  it('rejects a link whose case does not match the file on disk', () => {
    // Self-guard: on a case-insensitive filesystem a naive existsSync check
    // passes here, which is exactly the bug this suite exists to catch.
    expect(existsExactly('README.md')).toBe(true);
    expect(existsExactly('readme.md')).toBe(false);
  });

  it('resolves paths relative to the linking document, not the repo root', () => {
    expect(existsExactly('docs/INDEX.md')).toBe(true);
    expect(existsExactly('docs/../README.md')).toBe(true);
    expect(existsExactly('docs/nope/../INDEX.md')).toBe(false);
  });
});
