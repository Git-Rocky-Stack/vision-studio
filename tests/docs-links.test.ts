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

/**
 * Dated records: implementation plans, design specs, spikes and reviews. Their
 * prose is history and is not kept current, but their links still have to
 * resolve - a plan whose file links point at one contributor's disk
 * (`/C:/vision-studio/src/...`) is a plan nobody else can follow.
 */
const RECORD_DIRS = ['docs/plans', 'docs/superpowers'];

function markdownUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...markdownUnder(rel));
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out.sort();
}

const RECORD_DOCS = RECORD_DIRS.flatMap(markdownUnder);

/** `[text](target)` - skipping images, anchors, and absolute URLs. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * The document with fenced code blocks and inline code spans blanked out:
 * GitHub renders `[text](url)` inside code as literal text, not as a link, so
 * it is neither a broken link nor a dangling anchor. Line numbers are kept.
 */
function linkSource(doc: string): string {
  let fenced = false;
  return readFileSync(resolve(ROOT, doc), 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return '';
      }
      if (fenced) return '';
      return line.replace(/(`+)(?:(?!\1).)+?\1/g, (span) => ' '.repeat(span.length));
    })
    .join('\n');
}

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
  const source = linkSource(doc);
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
  const source = linkSource(doc);
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

  it('finds the dated records under docs/plans and docs/superpowers', () => {
    // Self-guard: an empty list would pass every record check below vacuously.
    expect(RECORD_DOCS.length).toBeGreaterThan(50);
    expect(RECORD_DOCS).toContain('docs/plans/2026-04-22-ui-polish-rollout.md');
  });

  it('ignores link syntax inside code spans and fenced blocks', () => {
    // This plan quotes `[text](url)` in prose about the licence parser; on
    // GitHub that renders as code, not as a link to a file called "url".
    const doc = 'docs/superpowers/plans/2026-07-10-self-contained-installer-pr3-first-run-ux.md';
    expect(readFileSync(resolve(ROOT, doc), 'utf8')).toContain('`[text](url)`');
    expect(relativeLinks(doc)).not.toContain('url');
  });

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

describe('plan and spec links resolve', () => {
  for (const doc of RECORD_DOCS) {
    it(`${doc} has no broken relative links or anchors`, () => {
      const broken = relativeLinks(doc).filter((target) => !existsExactly(resolveFrom(doc, target)));
      expect(broken, `${doc} links to paths that do not exist`).toEqual([]);
      expect(brokenAnchors(doc), `${doc} links to anchors no heading produces`).toEqual([]);
    });
  }
});

describe("no documentation link points into one machine's filesystem", () => {
  // `/C:/vision-studio/src/...` resolved in the author's editor and nowhere
  // else: on GitHub it is a 404, and on any other clone it points at nothing.
  const LOCAL_PATH = /\]\(\s*<?(?:\/?[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home)\/)/;

  it('recognizes the shapes it is meant to reject', () => {
    expect(LOCAL_PATH.test('[x](/C:/vision-studio/src/App.tsx)')).toBe(true);
    expect(LOCAL_PATH.test('[x](C:\\vision-studio\\src\\App.tsx)')).toBe(true);
    expect(LOCAL_PATH.test('[x](file:///home/me/App.tsx)')).toBe(true);
    expect(LOCAL_PATH.test('[x](../../src/App.tsx)')).toBe(false);
  });

  for (const doc of [...PUBLIC_DOCS, ...RECORD_DOCS]) {
    it(`${doc} has no absolute local-filesystem links`, () => {
      const offending = linkSource(doc)
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => LOCAL_PATH.test(line))
        .map(({ number }) => `${doc}:${number}`);
      expect(offending).toEqual([]);
    });
  }
});

describe('docs/INDEX.md lists every current document', () => {
  // INDEX.md calls itself the authoritative entry point; a doc it does not
  // list is a doc nobody finds. Dated records live under archive/, plans/ and
  // superpowers/, which INDEX.md links as directories.
  const indexed = new Set(
    relativeLinks('docs/INDEX.md').map((target) => resolveFrom('docs/INDEX.md', target).replace(/\/$/, '')),
  );

  const topLevelDocs = readdirSync(resolve(ROOT, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'INDEX.md')
    .map((entry) => `docs/${entry.name}`);
  const rootDocs = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  it('finds documents to check', () => {
    expect(topLevelDocs).toContain('docs/USER_GUIDE.md');
    expect(rootDocs).toContain('README.md');
  });

  for (const doc of [...topLevelDocs, ...rootDocs, 'docs/diagrams/diagrams.md', 'docs/api/openapi.json']) {
    it(`links ${doc}`, () => {
      expect(indexed.has(doc), `docs/INDEX.md does not link ${doc}`).toBe(true);
    });
  }

  for (const dir of ['docs/archive', 'docs/plans', 'docs/superpowers']) {
    it(`links the ${dir} records`, () => {
      expect(indexed.has(dir), `docs/INDEX.md does not link ${dir}/`).toBe(true);
    });
  }
});

