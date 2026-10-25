import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useResolvedCssColors } from './useResolvedCssColors';

const TOKENS = { accent: '--test-accent' } as const;

describe('useResolvedCssColors', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--test-accent');
    delete document.documentElement.dataset.theme;
  });

  it('resolves tokens to computed values, falling back to var() when undefined', () => {
    const { result: missing } = renderHook(() => useResolvedCssColors(TOKENS));
    expect(missing.current.accent).toBe('var(--test-accent)');

    document.documentElement.style.setProperty('--test-accent', '#111111');
    const { result } = renderHook(() => useResolvedCssColors(TOKENS));
    expect(result.current.accent).toBe('#111111');
  });

  it('re-resolves when the document theme changes', async () => {
    document.documentElement.style.setProperty('--test-accent', '#111111');
    const { result } = renderHook(() => useResolvedCssColors(TOKENS));

    await act(async () => {
      document.documentElement.style.setProperty('--test-accent', '#eeeeee');
      document.documentElement.dataset.theme = 'light';
      await Promise.resolve();
    });

    expect(result.current.accent).toBe('#eeeeee');
  });
});
