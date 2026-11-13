import { describe, expect, it } from 'vitest';

import type { RegionLock } from '@/types/project';
import {
  REGION_EMPTY_MASK_MESSAGE,
  REGION_FILL_PROMPT_MESSAGE,
  REGION_STYLE_PROMPT_MESSAGE,
  REGION_TOOL_AVAILABILITY,
  REGION_UPSCALE_UNSUPPORTED_MESSAGE,
  planRegionLockGeneration,
  regionToolUsesPrompt,
} from './regionLockGeneration';

function region(overrides: Partial<RegionLock> = {}): RegionLock {
  return {
    id: 'r1',
    sceneId: 's1',
    frameId: 'f1',
    name: 'Region 1',
    mask: {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      featherRadius: 2,
      blendEdges: true,
    },
    targetLayers: [],
    protectedLayers: [],
    generationConfig: {},
    aiTool: 'generative-fill',
    prompt: 'a red door',
    strength: 0.85,
    invertMask: false,
    ...overrides,
  };
}

describe('planRegionLockGeneration', () => {
  it('maps generative fill onto the masked inpaint pass at the region strength', () => {
    const plan = planRegionLockGeneration(region(), 'C:/a.png');
    expect(plan).toMatchObject({
      ok: true,
      operation: 'generative-fill',
      input: { source_path: 'C:/a.png', prompt: 'a red door', denoisingStrength: 0.85 },
    });
    expect(plan.ok && plan.input.invertMask).toBeFalsy();
  });

  it('maps remove onto object removal, without the prompt, at the region strength', () => {
    const plan = planRegionLockGeneration(region({ aiTool: 'remove', strength: 0.4 }), 'C:/a.png');
    expect(plan).toMatchObject({
      ok: true,
      operation: 'object-removal',
      input: { denoisingStrength: 0.4 },
    });
    expect(plan.ok && plan.input.prompt).toBeUndefined();
  });

  it('maps style transfer onto the masked restyle pass with the strength as style strength', () => {
    expect(
      planRegionLockGeneration(region({ aiTool: 'style-transfer', prompt: 'ukiyo-e', strength: 0.5 }), 'C:/a.png'),
    ).toMatchObject({
      ok: true,
      operation: 'region-style-transfer',
      input: { prompt: 'ukiyo-e', styleStrength: 50 },
    });
  });

  it('passes Invert Mask through to the request builder', () => {
    expect(planRegionLockGeneration(region({ invertMask: true }), 'C:/a.png')).toMatchObject({
      ok: true,
      input: { invertMask: true },
    });
  });

  it.each([
    [{ mask: { ...region().mask, points: [] } }, REGION_EMPTY_MASK_MESSAGE],
    [{ prompt: '  ' }, REGION_FILL_PROMPT_MESSAGE],
    [{ aiTool: 'style-transfer' as const, prompt: '' }, REGION_STYLE_PROMPT_MESSAGE],
    [{ aiTool: 'upscale' as const }, REGION_UPSCALE_UNSUPPORTED_MESSAGE],
  ])('refuses honestly: %o', (overrides, message) => {
    expect(planRegionLockGeneration(region(overrides), 'C:/a.png')).toEqual({ ok: false, error: message });
  });

  it('declares upscale unavailable up front and only prompt-driven tools use the prompt', () => {
    expect(REGION_TOOL_AVAILABILITY.upscale).toEqual({ available: false, reason: REGION_UPSCALE_UNSUPPORTED_MESSAGE });
    expect(REGION_TOOL_AVAILABILITY['style-transfer'].available).toBe(true);
    expect(regionToolUsesPrompt('remove')).toBe(false);
    expect(regionToolUsesPrompt('upscale')).toBe(false);
    expect(regionToolUsesPrompt('generative-fill')).toBe(true);
  });

  it('asks for the Blend Edges paste-back with the Feather radius when blending is on', () => {
    const plan = planRegionLockGeneration(region(), 'C:/a.png');
    expect(plan.ok && plan.input.blend).toEqual({ featherRadius: 2 });
  });

  it('asks for no paste-back when Blend Edges is off', () => {
    const off = region();
    off.mask = { ...off.mask, blendEdges: false, featherRadius: 9 };
    const plan = planRegionLockGeneration(off, 'C:/a.png');
    expect(plan.ok && 'blend' in plan.input).toBe(false);
  });
});
