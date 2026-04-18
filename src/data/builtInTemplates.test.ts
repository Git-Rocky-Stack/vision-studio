import { describe, it, expect } from 'vitest';
import { BUILT_IN_PROMPT_TEMPLATES } from './builtInTemplates';
import type { PromptTemplateCategory } from '../types/promptStudio';

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
});