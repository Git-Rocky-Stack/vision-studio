import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

/**
 * The MIT text is only MIT if all of it is there. The warranty disclaimer and
 * the liability limitation are two separate paragraphs, and shipping the first
 * without the second is a materially different licence - it disclaims fitness
 * while leaving the author exposed. These are the load-bearing clauses.
 */
const REQUIRED_CLAUSES = [
  'Permission is hereby granted, free of charge',
  'The above copyright notice and this permission notice shall be included in all',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
  'IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE',
];

const COPYRIGHT = 'Copyright (c) 2024-2026 Rocky Elsalaymeh';

/** Licence text is hard-wrapped, and where the wrap falls is not meaningful. */
const unwrap = (text: string): string => text.replace(/\s+/g, ' ').trim();

describe('license integrity', () => {
  it('ships a complete MIT license', () => {
    const license = unwrap(readFileSync(resolve(ROOT, 'LICENSE'), 'utf8'));
    expect(license).toContain('MIT License');
    expect(license).toContain(COPYRIGHT);
    for (const clause of REQUIRED_CLAUSES) {
      expect(license, `LICENSE is missing a required MIT clause`).toContain(clause);
    }
  });

  it('keeps exactly one license file so no copy can drift from it', () => {
    // Two byte-identical licences are one careless edit away from two
    // different licences, and nothing tells you which one is authoritative.
    const licenseFiles = readdirSync(ROOT).filter((name) => /^(LICENSE|COPYING)\b/i.test(name));
    expect(licenseFiles).toEqual(['LICENSE']);
  });

  it('never lets a build script author its own licence text', () => {
    // scripts/build-windows.cjs used to synthesise a LICENSE.txt when one was
    // absent, and the text it wrote named the wrong holder and stopped short of
    // the liability clause entirely. A licence has exactly one source.
    const script = unwrap(readFileSync(resolve(ROOT, 'scripts/build-windows.cjs'), 'utf8'));
    expect(script).not.toContain('Permission is hereby granted, free of charge');
    expect(script).not.toContain('THE SOFTWARE IS PROVIDED');
  });
});
