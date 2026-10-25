import { afterEach, describe, expect, it } from 'vitest';

import { resolveCssColor } from './resolveCssColor';

describe('resolveCssColor', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--color-status-error');
  });

  it('returns the computed token value', () => {
    document.documentElement.style.setProperty('--color-status-error', ' #ef4444 ');
    expect(resolveCssColor('--color-status-error')).toBe('#ef4444');
  });

  it('falls back to the var() reference when the token is undefined', () => {
    expect(resolveCssColor('--color-status-error')).toBe('var(--color-status-error)');
  });
});
