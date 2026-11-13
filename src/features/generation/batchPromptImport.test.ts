import { describe, expect, it } from 'vitest';

import {
  BATCH_IMPORT_MAX_PROMPTS,
  BatchPromptImportError,
  parseBatchPromptFile,
  parseCsvRows,
} from './batchPromptImport';

describe('parseBatchPromptFile (#J14)', () => {
  it('reads one prompt per line from .txt, skipping blanks and any line ending', () => {
    expect(parseBatchPromptFile('list.txt', 'a red fox\r\n\r\n  a blue bird  \nlast').prompts).toEqual([
      'a red fox',
      'a blue bird',
      'last',
    ]);
  });

  it('reads the first CSV column, honouring quotes, and skips a "prompt" header', () => {
    const csv = '﻿prompt,notes\n"a fox, at dusk","x"\n"say ""hi""",y\n"two\nlines",z\n';
    expect(parseBatchPromptFile('list.csv', csv).prompts).toEqual(['a fox, at dusk', 'say "hi"', 'two\nlines']);
  });

  it('rejects a CSV with an unclosed quote', () => {
    expect(() => parseCsvRows('"open,1\n')).toThrow(BatchPromptImportError);
  });

  it('reads JSON arrays of strings or { prompt } objects', () => {
    expect(parseBatchPromptFile('a.json', '["x", " y ", 3]').prompts).toEqual(['x', 'y']);
    expect(parseBatchPromptFile('b.json', '[{"prompt":"x"},{"other":1}]').prompts).toEqual(['x']);
  });

  it('round-trips the Batch panel export, settings included', () => {
    const exported = JSON.stringify({
      prompts: ['a', 'b'],
      settings: { provider: 'local', width: 768, height: 512, steps: 30, cfgScale: 6, model: 'sdxl-base' },
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(parseBatchPromptFile('batch-prompts-1.json', exported)).toEqual({
      prompts: ['a', 'b'],
      settings: { width: 768, height: 512, steps: 30, cfgScale: 6, model: 'sdxl-base' },
    });
  });

  it.each([
    ['an unsupported extension', 'list.pdf', 'a'],
    ['malformed JSON', 'a.json', '{nope'],
    ['a JSON object without prompts', 'a.json', '{"x":1}'],
    ['a file without prompts', 'a.txt', '\n  \n'],
  ])('refuses %s with a user-facing message', (_label, name, text) => {
    expect(() => parseBatchPromptFile(name, text)).toThrow(BatchPromptImportError);
  });

  it('refuses more prompts than one import may add', () => {
    const text = Array.from({ length: BATCH_IMPORT_MAX_PROMPTS + 1 }, (_, i) => `p${i}`).join('\n');
    expect(() => parseBatchPromptFile('big.txt', text)).toThrow(/at most/);
  });
});
