import { describe, expect, it } from 'vitest';

import {
  OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE,
  OPENROUTER_JOB_PREFIX,
  hasUnsupportedOpenRouterImageInputs,
  isOpenRouterJobId,
  isTerminalJobStatus,
  resolveOpenRouterFailureMessage,
} from './openRouterImageRouting';

// Background: still-image generation is dispatched to either the local
// Python backend or the OpenRouter remote service based on account
// preference. The router has to make two decisions:
//   1. Is the requested job in OpenRouter's supported envelope?
//      OpenRouter currently can't do ControlNet, reference images, image
//      conditioning, masks, or inpainting -- those have to fall back to
//      Local with an actionable explanation.
//   2. Once a job has started, is it still in flight or already terminal?
//      The cancel handler needs to be a no-op on terminal jobs.
//
// resolveOpenRouterFailureMessage owns the renderer-facing error copy
// for the OpenRouter image path: AbortError ('I cancelled this') is
// distinguished from any other failure (delegated to the renderer-safe
// message helper).

describe('OPENROUTER_JOB_PREFIX', () => {
  it('is the documented constant used everywhere job ids are minted', () => {
    expect(OPENROUTER_JOB_PREFIX).toBe('openrouter-image');
  });
});

describe('isOpenRouterJobId', () => {
  it('returns true for ids starting with the documented prefix and a separator', () => {
    expect(isOpenRouterJobId('openrouter-image-abc-123')).toBe(true);
  });

  it('returns false when the prefix is present but the separator is missing', () => {
    // A hypothetical `openrouter-images-...` job from a future provider
    // should NOT be treated as ours.
    expect(isOpenRouterJobId('openrouter-images-abc')).toBe(false);
  });

  it('returns false for backend-shaped ids', () => {
    expect(isOpenRouterJobId('job_12345')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isOpenRouterJobId('')).toBe(false);
  });
});

describe('isTerminalJobStatus', () => {
  it('treats completed, failed, and cancelled as terminal', () => {
    expect(isTerminalJobStatus('completed')).toBe(true);
    expect(isTerminalJobStatus('failed')).toBe(true);
    expect(isTerminalJobStatus('cancelled')).toBe(true);
  });

  it('treats pending and processing as in-flight', () => {
    expect(isTerminalJobStatus('pending')).toBe(false);
    expect(isTerminalJobStatus('processing')).toBe(false);
  });
});

describe('OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE', () => {
  it('explains the limitation and how to work around it', () => {
    expect(OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE).toMatch(/openrouter/i);
    expect(OPENROUTER_IMAGE_UNSUPPORTED_MESSAGE).toMatch(/local/i);
  });
});

describe('hasUnsupportedOpenRouterImageInputs', () => {
  it('returns false for a prompt-only request', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ prompt: 'a tree', width: 1024, height: 1024 })).toBe(false);
  });

  it('returns true when controlnet is supplied with at least one entry', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ controlnet: [{ kind: 'pose' }] })).toBe(true);
  });

  it('returns false when controlnet is an empty array', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ controlnet: [] })).toBe(false);
  });

  it('returns true when reference_images is non-empty', () => {
    expect(
      hasUnsupportedOpenRouterImageInputs({ reference_images: ['ref1.png'] }),
    ).toBe(true);
  });

  it('returns true when image_path is set (img2img)', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ image_path: 'C:/x.png' })).toBe(true);
  });

  it('returns true when mask is set (inpaint mask)', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ mask: 'C:/m.png' })).toBe(true);
  });

  it('returns true when inpaint flag is set', () => {
    expect(hasUnsupportedOpenRouterImageInputs({ inpaint: true })).toBe(true);
  });

  it('returns false for null / undefined params', () => {
    expect(hasUnsupportedOpenRouterImageInputs(null)).toBe(false);
    expect(hasUnsupportedOpenRouterImageInputs(undefined)).toBe(false);
  });
});

describe('resolveOpenRouterFailureMessage', () => {
  it('maps AbortError to a clear cancellation message', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(resolveOpenRouterFailureMessage(err)).toMatch(/cancel/i);
  });

  it('maps a DOMException-shaped abort (name: AbortError, no Error instance) to cancellation', () => {
    expect(resolveOpenRouterFailureMessage({ name: 'AbortError' })).toMatch(/cancel/i);
  });

  it('delegates direct Error instances to the renderer-safe message helper', () => {
    expect(resolveOpenRouterFailureMessage(new Error('Rate limit exceeded.'))).toBe(
      'Rate limit exceeded.',
    );
  });

  it('returns the documented fallback for engine errors (TypeError, etc.)', () => {
    const result = resolveOpenRouterFailureMessage(new TypeError('Cannot read .x of undefined'));
    expect(result).toMatch(/openrouter image generation failed/i);
  });

  it('returns the fallback for null / undefined / non-error values', () => {
    expect(resolveOpenRouterFailureMessage(null)).toMatch(/openrouter image generation failed/i);
    expect(resolveOpenRouterFailureMessage(undefined)).toMatch(/openrouter image generation failed/i);
    expect(resolveOpenRouterFailureMessage('boom')).toMatch(/openrouter image generation failed/i);
  });
});
