import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { BUILT_IN_PROMPT_TEMPLATES } from './builtInTemplates';
import type { PromptTemplateCategory } from '../types/promptStudio';
import { ASPECT_RATIOS } from '../types/resolution';

/** The model catalog the backend serves - the only source of model ids. */
const CATALOG = JSON.parse(
  readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/foundry/verified-catalog.json'),
    'utf-8',
  ),
) as Record<string, { id: string; capability: string }>;

const REQUIRED_STRING_FIELDS = ['id', 'name', 'description', 'category', 'promptText'] as const;

const DECLARED_CATEGORIES: PromptTemplateCategory[] = [
  'portrait',
  'landscape',
  'product',
  'cinematic',
];

describe('BUILT_IN_PROMPT_TEMPLATES', () => {
  it('has at least 8 templates', () => {
    expect(BUILT_IN_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('all templates have required string fields', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      for (const field of REQUIRED_STRING_FIELDS) {
        expect(typeof template[field]).toBe('string');
        expect(template[field].length).toBeGreaterThan(0);
      }
    }
  });

  it('all templates have isBuiltIn set to true', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      expect(template.isBuiltIn).toBe(true);
    }
  });

  it('all templates have isFavorite set to false', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      expect(template.isFavorite).toBe(false);
    }
  });

  it('all templates have a valid createdAt', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      expect(typeof template.createdAt).toBe('number');
      expect(template.createdAt).toBeGreaterThan(0);
    }
  });

  it('all template IDs are unique', () => {
    const ids = BUILT_IN_PROMPT_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('covers all declared categories (portrait, landscape, product, cinematic)', () => {
    const categories = new Set(BUILT_IN_PROMPT_TEMPLATES.map((t) => t.category));
    for (const cat of DECLARED_CATEGORIES) {
      expect(categories.has(cat), `Missing category: ${cat}`).toBe(true);
    }
  });

  it('has valid suggested settings when present', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      if (template.suggestedSettings) {
        if (template.suggestedSettings.steps !== undefined) {
          expect(template.suggestedSettings.steps).toBeGreaterThan(0);
        }
        if (template.suggestedSettings.cfgScale !== undefined) {
          expect(template.suggestedSettings.cfgScale).toBeGreaterThan(0);
        }
      }
    }
  });

  it('negative prompts are strings when present', () => {
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      if (template.negativePrompt !== undefined) {
        expect(typeof template.negativePrompt).toBe('string');
        expect(template.negativePrompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('suggests only image models that exist in the catalog', () => {
    // 'sd-xl' shipped here for several releases; the catalog id is 'sdxl-base'.
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      const model = template.suggestedSettings?.model;
      if (model === undefined) continue;
      expect(CATALOG[model], `${template.id} suggests unknown model ${model}`).toBeDefined();
      expect(CATALOG[model].capability, `${template.id} suggests a non-image model`).toBe('image');
    }
  });

  it('suggests only aspect ratios the generator offers', () => {
    const offered = new Set<string>(ASPECT_RATIOS.map((r) => r.id));
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      const ratio = template.suggestedSettings?.aspectRatio;
      if (ratio !== undefined) expect(offered.has(ratio), `${template.id}: ${ratio}`).toBe(true);
    }
  });

  it('writes prompts in plain language, with no A1111 weighting syntax', () => {
    // The backend passes prompts to diffusers verbatim; it has no weighting
    // parser, so "(term:1.3)" and "[term]" would reach the model as literal text.
    for (const template of BUILT_IN_PROMPT_TEMPLATES) {
      for (const text of [template.promptText, template.negativePrompt ?? '']) {
        expect(text, template.id).not.toMatch(/\([^()]*:\s*\d+(?:\.\d+)?\s*\)/);
        expect(text, template.id).not.toMatch(/[[\]()]/);
      }
    }
  });
});
