import { describe, expect, it } from 'vitest';
import { applyThemeToDocument, resolveThemeMode } from './theme';

describe('resolveThemeMode', () => {
  it('returns explicit dark and light preferences unchanged', () => {
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('light', true)).toBe('light');
  });

  it('resolves system preference based on OS setting', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });
});

describe('applyThemeToDocument', () => {
  it('sets document dataset and color scheme', () => {
    const fakeDocument = {
      documentElement: {
        dataset: { theme: '' },
        style: { colorScheme: '' },
      },
      body: {
        dataset: { theme: '' },
      },
    };

    applyThemeToDocument('system', true, fakeDocument);

    expect(fakeDocument.documentElement.dataset.theme).toBe('dark');
    expect(fakeDocument.documentElement.style.colorScheme).toBe('dark');
    expect(fakeDocument.body.dataset.theme).toBe('dark');
  });
});
