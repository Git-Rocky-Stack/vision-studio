import { describe, expect, it } from 'vitest';

import type { RegionLock } from '@/types/project';
import {
  REGION_EMPTY_MASK_MESSAGE,
  REGION_FILL_PROMPT_MESSAGE,
  REGION_INVERT_UNSUPPORTED_MESSAGE,
  REGION_STYLE_UNSUPPORTED_MESSAGE,
  REGION_UPSCALE_UNSUPPORTED_MESSAGE,
  planRegionLockGeneration,
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
  it('maps generative fill onto the masked inpaint pass', () => {
    const plan = planRegionLockGeneration(region(), 'C:/a.png');
    expect(plan).toMatchObject({
      ok: true,
      operation: 'generative-fill',
      input: { source_path: 'C:/a.png', prompt: 'a red door' },
    });
  });

  it('maps remove onto object removal', () => {
    expect(planRegionLockGeneration(region({ aiTool: 'remove' }), 'C:/a.png')).toMatchObject({
      ok: true,
      operation: 'object-removal',
    });
  });

  it.each([
    [{ mask: { ...region().mask, points: [] } }, REGION_EMPTY_MASK_MESSAGE],
    [{ invertMask: true }, REGION_INVERT_UNSUPPORTED_MESSAGE],
    [{ prompt: '  ' }, REGION_FILL_PROMPT_MESSAGE],
    [{ aiTool: 'style-transfer' as const }, REGION_STYLE_UNSUPPORTED_MESSAGE],
    [{ aiTool: 'upscale' as const }, REGION_UPSCALE_UNSUPPORTED_MESSAGE],
  ])('refuses honestly: %o', (overrides, message) => {
    expect(planRegionLockGeneration(region(overrides), 'C:/a.png')).toEqual({ ok: false, error: message });
  });
});
