import { describe, expect, it } from 'vitest';

import { parseOpenRouterImageJobParams } from './openRouterImageJobParams';

describe('parseOpenRouterImageJobParams', () => {
  // Background: runOpenRouterImageJob used to accept `params: any` from
  // the renderer and pass fields straight to the OpenRouter service.
  // Malformed input (e.g., params.prompt = 42) produced cryptic JS
  // errors instead of clean validation rejections. The parser now
  // validates at the IPC boundary and returns a typed Result.

  const validParams = {
    prompt: 'a sunlit studio portrait',
    negative_prompt: 'extra fingers',
    model: 'google/gemini-2.5-flash-image',
    width: 1024,
    height: 1024,
    seed: 42,
  };

  it('accepts a fully valid request', () => {
    const result = parseOpenRouterImageJobParams(validParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prompt).toBe('a sunlit studio portrait');
      expect(result.value.width).toBe(1024);
    }
  });

  it('preserves extra fields (forward compat for new options)', () => {
    const result = parseOpenRouterImageJobParams({ ...validParams, future_field: 'x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ future_field: 'x' });
    }
  });

  it('rejects when prompt is missing', () => {
    const { prompt: _omit, ...without } = validParams;
    const result = parseOpenRouterImageJobParams(without);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/prompt/i);
    }
  });

  it('rejects when prompt is empty after trim', () => {
    const result = parseOpenRouterImageJobParams({ ...validParams, prompt: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/prompt/i);
    }
  });

  it('rejects when prompt is not a string', () => {
    const result = parseOpenRouterImageJobParams({ ...validParams, prompt: 42 });
    expect(result.ok).toBe(false);
  });

  it('rejects when width is not a positive integer', () => {
    expect(parseOpenRouterImageJobParams({ ...validParams, width: -1 }).ok).toBe(false);
    expect(parseOpenRouterImageJobParams({ ...validParams, width: 0 }).ok).toBe(false);
    expect(parseOpenRouterImageJobParams({ ...validParams, width: 1.5 }).ok).toBe(false);
    expect(parseOpenRouterImageJobParams({ ...validParams, width: 'big' }).ok).toBe(false);
  });

  it('rejects when height is not a positive integer', () => {
    expect(parseOpenRouterImageJobParams({ ...validParams, height: -1 }).ok).toBe(false);
    expect(parseOpenRouterImageJobParams({ ...validParams, height: 0 }).ok).toBe(false);
  });

  it('treats negative_prompt and seed as optional', () => {
    const { negative_prompt: _np, seed: _seed, ...minimal } = validParams;
    const result = parseOpenRouterImageJobParams(minimal);
    expect(result.ok).toBe(true);
  });

  it('rejects null', () => {
    expect(parseOpenRouterImageJobParams(null).ok).toBe(false);
  });

  it('rejects a string payload', () => {
    expect(parseOpenRouterImageJobParams('not an object').ok).toBe(false);
  });
});
