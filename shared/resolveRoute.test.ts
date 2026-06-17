import { describe, expect, it } from 'vitest';
import { resolveRoute, type RouteResolverInput } from './resolveRoute';

function input(overrides: Partial<RouteResolverInput>): RouteResolverInput {
  return {
    modality: 'still-image',
    requested: 'local',
    configuredHosted: [],
    autoRouteOnOverBudget: false,
    fit: 'fits',
    fallbackProvider: null,
    ...overrides,
  };
}

describe('resolveRoute', () => {
  it('routes an explicit, capable, fitting local request', () => {
    expect(resolveRoute(input({ requested: 'local', fit: 'fits' }))).toEqual({
      ok: true,
      provider: 'local',
      reason: 'explicit',
    });
  });

  it('refuses an unsupported provider x modality combo (OpenRouter video)', () => {
    const decision = resolveRoute(input({ requested: 'openrouter', modality: 'video' }));
    expect(decision).toMatchObject({ ok: false, kind: 'unsupported' });
  });

  it('refuses a hosted route with no stored key/model', () => {
    const decision = resolveRoute(
      input({ requested: 'huggingface', modality: 'still-image', configuredHosted: [] }),
    );
    expect(decision).toMatchObject({ ok: false, kind: 'unconfigured' });
  });

  it('routes a configured hosted request explicitly', () => {
    expect(
      resolveRoute(
        input({ requested: 'openrouter', modality: 'still-image', configuredHosted: ['openrouter'] }),
      ),
    ).toEqual({ ok: true, provider: 'openrouter', reason: 'explicit' });
  });

  it('auto-routes an over-budget local job when the setting is on and the fallback is ready', () => {
    expect(
      resolveRoute(
        input({
          requested: 'local',
          fit: 'over-budget',
          autoRouteOnOverBudget: true,
          fallbackProvider: 'huggingface',
          configuredHosted: ['huggingface'],
        }),
      ),
    ).toEqual({ ok: true, provider: 'huggingface', reason: 'fallback-auto' });
  });

  it('prompts (with capable configured candidates) when over-budget and auto is off', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        fit: 'over-budget',
        autoRouteOnOverBudget: false,
        configuredHosted: ['openrouter', 'huggingface'],
        modality: 'still-image',
      }),
    );
    expect(decision).toEqual({
      ok: false,
      kind: 'fallback-prompt',
      candidates: ['openrouter', 'huggingface'],
    });
  });

  it('excludes capability-incompatible providers from over-budget candidates (video)', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        modality: 'video',
        fit: 'over-budget',
        configuredHosted: ['openrouter', 'huggingface'],
      }),
    );
    // Only HuggingFace can do hosted video (OpenRouter cannot), so it is the sole candidate.
    expect(decision).toEqual({ ok: false, kind: 'fallback-prompt', candidates: ['huggingface'] });
  });

  it('prompts even when auto is on but the chosen fallback is not configured', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        fit: 'over-budget',
        autoRouteOnOverBudget: true,
        fallbackProvider: 'huggingface',
        configuredHosted: [],
      }),
    );
    expect(decision).toMatchObject({ ok: false, kind: 'fallback-prompt', candidates: [] });
  });

  it('treats cpu-only as a runnable local state, not an auto-fallback trigger', () => {
    expect(resolveRoute(input({ requested: 'local', fit: 'cpu-only' }))).toEqual({
      ok: true,
      provider: 'local',
      reason: 'explicit',
    });
  });
});
