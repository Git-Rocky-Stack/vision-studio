import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';
import type { RegionMask } from '@/types/project';
import { EDIT_BACKEND_DOWN_MESSAGE } from './runEditTool';
import {
  AI_EXPAND_DEFAULT_PROMPT,
  EMPTY_MASK_MESSAGE,
  NO_IMAGE_MODEL_MESSAGE,
  OBJECT_REMOVAL_NEGATIVE,
  OBJECT_REMOVAL_PROMPT,
  buildGuidedEditRequest,
  runGuidedEditTool,
  snapDimension,
} from './runGuidedEditTool';

function checkpoint(over: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'sd-1-5', name: 'SD 1.5', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'sd15', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '4 GB', status: 'ready', tier: 'verified', quality: 'balanced',
    runtime: 'local', hardware_class: 'creator', vram: '4 GB', description: '', license: null,
    gated: false, ...over,
  };
}

const MASK: RegionMask = {
  type: 'brush',
  points: [
    { x: 10, y: 10 },
    { x: 40, y: 40 },
  ],
  bounds: { x: 10, y: 10, width: 30, height: 30 },
  brushSize: 32,
  featherRadius: 2,
  blendEdges: true,
};

const CONTEXT = {
  model: 'sd-1-5',
  steps: 25,
  cfgScale: 7.5,
  scheduler: 'euler',
  sourceWidth: 512,
  sourceHeight: 512,
};

function makeElectron(overrides: Record<string, unknown> = {}) {
  return {
    app: { getPath: vi.fn().mockResolvedValue('C:/users/u/AppData/Roaming/vision-studio') },
    settings: { get: vi.fn().mockResolvedValue({ defaultOutputPath: '' }) },
    generation: {
      generateImage: vi.fn().mockResolvedValue({ success: true, jobId: 'gen-1' }),
      getStatus: vi.fn().mockResolvedValue({
        job_id: 'gen-1', status: 'completed', progress: 100, type: 'image',
        created_at: '2026-07-05T00:00:00Z',
        result: { images: ['/outputs/gen-1/generated.png'] },
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    ...overrides,
  } as any;
}

const measureImage = vi.fn().mockResolvedValue({ width: 512, height: 512 });

describe('snapDimension', () => {
  it('rounds to a multiple of 8 within engine bounds', () => {
    expect(snapDimension(511)).toBe(512);
    expect(snapDimension(100)).toBe(256);
    expect(snapDimension(4000)).toBe(2048);
  });
});

describe('buildGuidedEditRequest', () => {
  it('style-transfer maps strength onto denoising 0.30-0.90 and joins prompts', () => {
    const low = buildGuidedEditRequest('style-transfer', {
      source_path: 'C:/img.png', styleModifier: 'oil painting', styleStrength: 0,
    }, CONTEXT);
    const high = buildGuidedEditRequest('style-transfer', {
      source_path: 'C:/img.png', styleModifier: 'oil painting', styleStrength: 100,
      prompt: 'a castle',
    }, CONTEXT);
    expect(low.denoising_strength).toBe(0.3);
    expect(high.denoising_strength).toBe(0.9);
    expect(high.prompt).toBe('a castle, oil painting');
    expect(low.prompt).toBe('oil painting');
    expect(high.reference_images?.[0]).toMatchObject({
      layer_id: 'edit-style-transfer',
      source_path: 'C:/img.png',
    });
    expect(high.width).toBe(512);
    expect(high.height).toBe(512);
  });

  it('generative-fill builds an inpaint payload with the converted mask', () => {
    const request = buildGuidedEditRequest('generative-fill', {
      source_path: 'C:/img.png', prompt: 'a red door', mask: MASK,
    }, CONTEXT);
    expect(request.prompt).toBe('a red door');
    expect(request.denoising_strength).toBe(1);
    expect(request.inpaint).toMatchObject({
      layer_id: 'edit-generative-fill',
      image_path: 'C:/img.png',
      mask: { type: 'brush', brush_size: 32 },
    });
    expect(request.inpaint?.mask.points).toHaveLength(2);
  });

  it('object-removal uses the removal-tuned prompt pair', () => {
    const request = buildGuidedEditRequest('object-removal', {
      source_path: 'C:/img.png', mask: MASK,
    }, CONTEXT);
    expect(request.prompt).toBe(OBJECT_REMOVAL_PROMPT);
    expect(request.negative_prompt).toBe(OBJECT_REMOVAL_NEGATIVE);
    expect(request.inpaint?.layer_id).toBe('edit-object-removal');
  });

  it('ai-expand grows the request dimensions and clamps pixels', () => {
    const request = buildGuidedEditRequest('ai-expand', {
      source_path: 'C:/img.png', directions: ['right'], pixels: 128,
    }, CONTEXT);
    expect(request.width).toBe(640);
    expect(request.height).toBe(512);
    expect(request.prompt).toBe(AI_EXPAND_DEFAULT_PROMPT);
    expect(request.outpaint).toEqual({
      image_path: 'C:/img.png', directions: ['right'], pixels: 128,
    });
    const clamped = buildGuidedEditRequest('ai-expand', {
      source_path: 'C:/img.png', directions: ['up', 'down'], pixels: 9999,
    }, CONTEXT);
    expect(clamped.outpaint?.pixels).toBe(512);
    expect(clamped.height).toBe(1536);
  });

  it('background-replace carries the image and rides the main prompt', () => {
    const request = buildGuidedEditRequest('background-replace', {
      source_path: 'C:/img.png', prompt: 'a beach at sunset',
    }, CONTEXT);
    expect(request.prompt).toBe('a beach at sunset');
    expect(request.background_replace).toEqual({ image_path: 'C:/img.png' });
    expect(request.denoising_strength).toBe(1);
    expect(request.inpaint).toBeUndefined();
  });
});

describe('runGuidedEditTool', () => {
  beforeEach(() => {
    measureImage.mockClear();
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: true },
      activeJobs: [],
      completedJobs: [],
      assetLibrary: [],
      availableModels: [checkpoint()],
      selectedImageModelId: 'sd-1-5',
      currentImage: 'preview://img.png',
      currentImageAssetPath: 'C:/img.png',
    });
  });

  it('refuses when the backend is down', async () => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: false },
    });
    const electron = makeElectron();
    const result = await runGuidedEditTool('style-transfer', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0, measureImage,
    });
    expect(result).toEqual({ ok: false, error: EDIT_BACKEND_DOWN_MESSAGE });
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('refuses honestly when the selected model is not a ready checkpoint', async () => {
    useAppStore.setState({ availableModels: [checkpoint({ status: 'not_found' })] });
    const electron = makeElectron();
    const result = await runGuidedEditTool('style-transfer', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0, measureImage,
    });
    expect(result).toEqual({ ok: false, error: NO_IMAGE_MODEL_MESSAGE });
    expect(NO_IMAGE_MODEL_MESSAGE).toMatch(/install .* from the Foundry/i);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('refuses fill and removal without a drawn mask', async () => {
    const electron = makeElectron();
    const result = await runGuidedEditTool('generative-fill', {
      source_path: 'C:/img.png', prompt: 'a red door', mask: null,
    }, { electron, pollIntervalMs: 0, measureImage });
    expect(result).toEqual({ ok: false, error: EMPTY_MASK_MESSAGE });
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('submits, polls to completion, and lands on the edit canvas', async () => {
    const electron = makeElectron();
    const result = await runGuidedEditTool('generative-fill', {
      source_path: 'C:/img.png', prompt: 'a red door', mask: MASK,
    }, { electron, pollIntervalMs: 0, measureImage });
    expect(result.ok).toBe(true);
    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'sd-1-5',
        prompt: 'a red door',
        denoising_strength: 1,
        inpaint: expect.objectContaining({ image_path: 'C:/img.png' }),
        acceleration_settings: expect.any(Object),
      }),
    );
    const state = useAppStore.getState();
    expect(state.currentImage).toContain('/outputs/gen-1/generated.png');
    expect(state.completedJobs.find((job) => job.id === 'gen-1')?.status).toBe('completed');
    expect(state.completedJobs.find((job) => job.id === 'gen-1')?.type).toBe('image');
  });

  it('surfaces a failed job error verbatim', async () => {
    const message =
      "FLUX inpainting uses the FLUX.1 Fill model - install 'flux-fill' from the Foundry first.";
    const electron = makeElectron();
    electron.generation.generateImage = vi
      .fn()
      .mockResolvedValue({ success: false, error: message });
    const result = await runGuidedEditTool('generative-fill', {
      source_path: 'C:/img.png', prompt: 'a red door', mask: MASK,
    }, { electron, pollIntervalMs: 0, measureImage });
    expect(result).toEqual({ ok: false, error: message });
  });
});
