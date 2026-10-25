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
  'DESIGN.md',
  'docs/INDEX.md',
  // Everything docs/INDEX.md presents as current, rather than as a dated record.
  'docs/USER_GUIDE.md',
  'docs/TROUBLESHOOTING.md',
  'docs/UAT_CHECKLIST.md',
  'docs/ARCHITECTURE.md',
  'docs/API_ENDPOINTS.md',
  'docs/DATABASE_SCHEMA.md',
  'docs/R2-DELIVERY.md',
  'docs/RELEASE_SCREENSHOTS.md',
  'docs/TENSORRT_VERIFICATION.md',
  'docs/code-signing.md',
  'docs/dependency-security.md',
  'docs/qa-testing-strategy.md',
  'docs/archive/README.md',
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

/** Resolve a link target relative to the document that contains it. */
function resolveFrom(doc: string, target: string): string {
  const base = posix.dirname(doc.split(sep).join('/'));
  return target.startsWith('/')
    ? target.slice(1)
    : posix.normalize(base === '.' ? target : `${base}/${target}`);
}

/**
 * GitHub's heading anchor: the rendered heading text, lower-cased, with every
 * character that is not a letter, digit, space, hyphen or underscore removed,
 * and each space turned into a hyphen. A repeated heading gets `-1`, `-2`, ...
 */
function githubSlug(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) renders as text
    .replace(/<[^>]+>/g, '') // inline HTML renders as nothing
    .replace(/[`*~]/g, '') // code and emphasis markers render as nothing
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

const anchorCache = new Map<string, Set<string>>();

/** Every anchor a file offers: its headings, plus explicit `<a id>` / `<a name>`. */
function anchorsOf(file: string): Set<string> {
  const cached = anchorCache.get(file);
  if (cached) return cached;
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of readFileSync(resolve(ROOT, file), 'utf8').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const m of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(m[1]);
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const slug = githubSlug(heading[1]);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

/** `file.md#anchor` and `#anchor` links whose anchor no heading produces. */
function brokenAnchors(doc: string): string[] {
  const source = readFileSync(resolve(ROOT, doc), 'utf8');
  const broken: string[] = [];
  for (const match of source.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const hash = target.indexOf('#');
    if (hash === -1) continue;
    const filePart = target.slice(0, hash);
    const anchor = target.slice(hash + 1);
    if (!anchor) continue;
    const file = filePart === '' ? doc : resolveFrom(doc, filePart);
    // Only markdown has headings to check; a missing file is the path test's job.
    if (!file.endsWith('.md') || !existsExactly(file)) continue;
    if (!anchorsOf(file).has(decodeURIComponent(anchor))) broken.push(target);
  }
  return broken;
}

describe('public documentation links resolve', () => {
  for (const doc of PUBLIC_DOCS) {
    it(`${doc} has no broken relative links`, () => {
      const broken = relativeLinks(doc).filter((target) => !existsExactly(resolveFrom(doc, target)));

      expect(broken, `${doc} links to paths that do not exist`).toEqual([]);
    });

    it(`${doc} has no links to headings that do not exist`, () => {
      expect(brokenAnchors(doc), `${doc} links to anchors no heading produces`).toEqual([]);
    });
  }

  it('rejects a link whose case does not match the file on disk', () => {
    // Self-guard: on a case-insensitive filesystem a naive existsSync check
    // passes here, which is exactly the bug this suite exists to catch.
    expect(existsExactly('README.md')).toBe(true);
    expect(existsExactly('readme.md')).toBe(false);
  });

  it('derives heading anchors the way GitHub does', () => {
    // Self-guard: a slugger that disagrees with GitHub would pass broken links
    // or fail good ones.
    expect(githubSlug('10. Testing strategy')).toBe('10-testing-strategy');
    expect(githubSlug('File sizes (v3.2.0)')).toBe('file-sizes-v320');
    expect(githubSlug('Gated models: 401 / 403, "is gated"')).toBe('gated-models-401--403-is-gated');
    expect(githubSlug('`POST /api/models/scan`')).toBe('post-apimodelsscan');
    expect(githubSlug('Code Style & Conventions')).toBe('code-style--conventions');
    expect(githubSlug('[Linked](./x.md) heading')).toBe('linked-heading');
  });

  it('finds the anchors a document really has, and only those', () => {
    const anchors = anchorsOf('CONTRIBUTING.md');
    expect(anchors.has('development-setup')).toBe(true);
    expect(anchors.has('no-such-heading')).toBe(false);
    // An explicit HTML anchor counts as a target.
    expect(anchorsOf('docs/API_ENDPOINTS.md').has('acceleration-settings')).toBe(true);
  });

  it('resolves paths relative to the linking document, not the repo root', () => {
    expect(existsExactly('docs/INDEX.md')).toBe(true);
    expect(existsExactly('docs/../README.md')).toBe(true);
    expect(existsExactly('docs/nope/../INDEX.md')).toBe(false);
  });
});
