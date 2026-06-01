import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const selectorSource = readFileSync(path.join(here, 'ModelSelector.tsx'), 'utf-8');

describe('ModelSelector single-source-of-truth (drift guard)', () => {
  it('declares no hardcoded model catalogs', () => {
    // These literals were the drift source - they must never come back.
    expect(selectorSource).not.toMatch(/const\s+IMAGE_MODELS\b/);
    expect(selectorSource).not.toMatch(/const\s+VIDEO_MODELS\b/);
  });

  it('sources its models from the store registry', () => {
    expect(selectorSource).toMatch(/useAppStore/);
    expect(selectorSource).toMatch(/selectModelsByCapability/);
  });

  it('embeds no model repo ids (catalog data lives only in verified-catalog.json)', () => {
    expect(selectorSource).not.toMatch(/black-forest-labs\//);
    expect(selectorSource).not.toMatch(/stabilityai\//);
    expect(selectorSource).not.toMatch(/Lightricks\//);
  });
});
