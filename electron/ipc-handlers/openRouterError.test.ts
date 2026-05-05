import { describe, expect, it } from 'vitest';

import { toOpenRouterRendererMessage } from './openRouterError';

describe('toOpenRouterRendererMessage', () => {
  // The IPC layer wraps OpenRouter calls and returns either a clean,
  // user-safe message (rate limit, insufficient quota, validation rejection)
  // or a generic fallback. The helper distinguishes hand-authored Error
  // instances (safe to surface) from JS-engine error subclasses
  // (TypeError / ReferenceError / etc., which usually expose internals).

  it('surfaces the message of a direct Error instance', () => {
    const result = toOpenRouterRendererMessage(
      new Error('Rate limit exceeded for this key.'),
      'Prompt enhancement failed',
    );
    expect(result).toBe('Rate limit exceeded for this key.');
  });

  it('surfaces wrapped openRouter errors (Error with cause set)', () => {
    const cause = new Error('axios: Request failed with status code 429');
    const wrapped = new Error('Rate limit exceeded.', { cause });
    expect(toOpenRouterRendererMessage(wrapped, 'fallback')).toBe('Rate limit exceeded.');
  });

  it('returns the fallback for a TypeError (programming bug)', () => {
    const result = toOpenRouterRendererMessage(
      new TypeError("Cannot read properties of undefined (reading 'trim')"),
      'Prompt enhancement failed',
    );
    expect(result).toBe('Prompt enhancement failed');
  });

  it('returns the fallback for a ReferenceError', () => {
    const result = toOpenRouterRendererMessage(
      new ReferenceError('foo is not defined'),
      'Prompt enhancement failed',
    );
    expect(result).toBe('Prompt enhancement failed');
  });

  it('returns the fallback for a string error', () => {
    expect(toOpenRouterRendererMessage('boom', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for null', () => {
    expect(toOpenRouterRendererMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for undefined', () => {
    expect(toOpenRouterRendererMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for a custom Error subclass (conservative)', () => {
    class CustomInternalError extends Error {}
    const result = toOpenRouterRendererMessage(
      new CustomInternalError('internal pathy thing /Users/x/secret'),
      'fallback',
    );
    expect(result).toBe('fallback');
  });
});
