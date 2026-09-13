import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { basename, join, resolve, sep } from 'path';

const ROOT = resolve(__dirname, '..');

/**
 * Dated working documents - design specs, implementation plans, spikes and
 * point-in-time reviews - ship with the repository, and the repository is
 * public. A reader who arrives through `docs/INDEX.md` is told these are
 * "historical references for the date in the filename, not authoritative
 * specs"; a reader who arrives from a search engine lands on the file itself
 * and is told nothing. To that second reader a proposal written in the present
 * tense - "MP4 export includes the expected audio mix" - reads as a
 * description of the shipped product.
 *
 * So the framing travels in the file. Every archived record opens with a
 * blockquote banner naming its date and its status as a record of intent.
 */
const ARCHIVE_DIRS = ['docs/plans', 'docs/superpowers'];

/** The banner is a blockquote so it can never itself read as a claim. */
const BANNER = (date: string) => `> **Historical design record - ${date}.**`;

function archiveDocs(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) found.push(full);
    }
  };
  for (const dir of ARCHIVE_DIRS) walk(resolve(ROOT, dir));
  return found;
}

const rel = (f: string) => f.slice(ROOT.length + 1).split(sep).join('/');

describe('archived design records declare their own provenance', () => {
  it('banners every dated record as historical, dated from its filename', () => {
    const docs = archiveDocs();
    // A sweep that silently found nothing would pass every assertion below.
    expect(docs.length).toBeGreaterThan(50);

    const undated: string[] = [];
    const unbannered: string[] = [];

    for (const file of docs) {
      const name = basename(file);
      if (name === 'README.md') continue; // the directory's own index, not a record
      const date = /^(\d{4}-\d{2}-\d{2})-/.exec(name)?.[1];
      if (!date) {
        undated.push(rel(file));
        continue;
      }
      if (!readFileSync(file, 'utf8').includes(BANNER(date))) unbannered.push(rel(file));
    }

    expect(undated, 'archived records are named <date>-<slug>.md').toEqual([]);
    expect(
      unbannered,
      `${unbannered.length} archived record(s) carry no provenance banner`,
    ).toEqual([]);
  });

  it('gives each archive directory an index that says what it holds', () => {
    for (const dir of ARCHIVE_DIRS) {
      const readme = resolve(ROOT, dir, 'README.md');
      expect(existsSync(readme), `${dir}/README.md is missing`).toBe(true);
      expect(readFileSync(readme, 'utf8')).toMatch(/historical/i);
    }
  });
});

// NOTE. A staleness check over .claude/verify-ignore used to live here and was
// removed rather than skipped: .gitignore:80 excludes .claude/, so the file is
// machine-local and absent from every CI clone - the check threw ENOENT on the
// Linux pr-gate runner. Whether that ignore list has rotted is a question for
// the local sweep that reads it, not for a suite that can never see it.
describe('the API reference tracks the implementation it documents', () => {
  it('documents exactly the feeds POST /api/models/scan merges', () => {
    const doc = readFileSync(resolve(ROOT, 'docs/API_ENDPOINTS.md'), 'utf8');
    const start = doc.indexOf('#### `POST /api/models/scan`');
    expect(start, 'the scan endpoint section is gone from the API reference').toBeGreaterThan(-1);
    // Terminate on the next heading of ANY level, not just the next `####`.
    // Stopping only at `####` would run this slice through an intervening `###`
    // and on into unrelated endpoints, where the feed assertions below could
    // match text that has nothing to do with the scan endpoint.
    const after = doc.slice(start);
    const boundary = after.slice(1).search(/\n#{1,6}\s/);
    const section = boundary === -1 ? after : after.slice(0, boundary + 1);

    const impl = readFileSync(resolve(ROOT, 'backend/foundry/index_service.py'), 'utf8');
    const scanStart = impl.indexOf('def scan(self)');
    expect(scanStart, 'IndexService.scan is gone').toBeGreaterThan(-1);
    const nextDef = impl.indexOf('\n    def ', scanStart + 1);
    const scanBody = impl.slice(scanStart, nextDef === -1 ? undefined : nextDef);

    // Each feed the reference advertises has to be a feed scan() really merges.
    expect(section).toMatch(/app tree/i);
    expect(scanBody).toContain('_APP_ROOT_ID');
    expect(section).toMatch(/HF cache/i);
    expect(scanBody).toContain('scan_hf_cache(');
    expect(section).toMatch(/library root/i);
    expect(scanBody).toContain('self._roots.list()');

    // Gate 4: the claim carries the anchor a reader can check it against.
    expect(section).toContain('backend/foundry/index_service.py');
  });
});
