import { describe, expect, it } from 'vitest';

import type { MediaAsset, ReferenceSet } from '@/types/media';
import type { CanvasControlLayer, Scene } from '@/types/project';
import { DEFAULT_CANVAS_CONTROL_LAYER_MASK, DEFAULT_GENERATION_CONFIG, DEFAULT_SCENE_METADATA, DEFAULT_SCENE_TRANSITION } from '@/types/project';
import { resolveCanvasControlLayers } from './resolveCanvasControlLayers';

function buildMask() {
  return {
    ...DEFAULT_CANVAS_CONTROL_LAYER_MASK,
    points: [
      { x: 24, y: 32 },
      { x: 224, y: 32 },
      { x: 224, y: 196 },
      { x: 24, y: 196 },
    ],
    bounds: { x: 24, y: 32, width: 200, height: 164 },
  };
}

function buildLayer(overrides: Partial<CanvasControlLayer>): CanvasControlLayer {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sceneId: overrides.sceneId ?? 'scene-1',
    name: overrides.name ?? 'Layer',
    type: overrides.type ?? 'controlnet',
    mask: overrides.mask ?? buildMask(),
    visible: overrides.visible ?? true,
    opacity: overrides.opacity ?? 1,
    previewTint: overrides.previewTint ?? '#d1d5db',
    sourceMediaAssetId: overrides.sourceMediaAssetId,
    sourcePath: overrides.sourcePath,
    referenceSetId: overrides.referenceSetId,
    preprocessor: overrides.preprocessor,
    weight: overrides.weight,
    startStep: overrides.startStep,
    endStep: overrides.endStep,
    controlMode: overrides.controlMode,
    prompt: overrides.prompt,
    negativePrompt: overrides.negativePrompt,
    metadata: overrides.metadata ?? {},
  };
}

function buildScene(canvasControlLayers: CanvasControlLayer[]): Scene {
  return {
    id: 'scene-1',
    orderIndex: 0,
    name: 'Shot 1',
    prompt: 'hero walks into frame',
    negativePrompt: '',
    generationConfig: { ...DEFAULT_GENERATION_CONFIG },
    referenceImages: [],
    referenceSetIds: [],
    canvasControlLayers,
    activeCanvasControlLayerId: canvasControlLayers[0]?.id ?? null,
    timelineClipIds: [],
    frames: [],
    regionLocks: [],
    transitions: { ...DEFAULT_SCENE_TRANSITION },
    camera: [],
    metadata: { ...DEFAULT_SCENE_METADATA, created: '', modified: '' },
    status: 'draft',
    characterRefs: [],
  };
}

const mediaAssets: MediaAsset[] = [
  {
    id: 'asset-controlnet',
    legacyAssetId: null,
    jobId: null,
    name: 'Pose Map',
    type: 'image',
    source: 'imported',
    path: 'C:/vision-studio-inputs/pose-map.png',
    previewUrl: 'file:///C:/vision-studio-inputs/pose-map.png',
    thumbnailUrl: 'file:///C:/vision-studio-inputs/pose-map.png',
    posterUrl: null,
    width: 1024,
    height: 1024,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
  },
  {
    id: 'asset-reference',
    legacyAssetId: null,
    jobId: null,
    name: 'Style Frame',
    type: 'image',
    source: 'imported',
    path: 'C:/vision-studio-inputs/style-frame.png',
    previewUrl: 'file:///C:/vision-studio-inputs/style-frame.png',
    thumbnailUrl: 'file:///C:/vision-studio-inputs/style-frame.png',
    posterUrl: null,
    width: 1024,
    height: 1024,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
  },
];

const referenceSets: ReferenceSet[] = [
  {
    id: 'reference-set-1',
    name: 'Style references',
    scope: 'scene',
    projectId: 'project-1',
    sceneId: 'scene-1',
    clipId: null,
    items: [
      {
        id: 'reference-item-1',
        slot: 'style',
        mediaAssetId: 'asset-reference',
        path: 'C:/vision-studio-inputs/style-frame.png',
        label: 'Style Frame',
        orderIndex: 0,
      },
    ],
    notes: '',
    tags: [],
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
  },
];

describe('resolveCanvasControlLayers', () => {
  it('resolves visible image control layers into generation payload fragments', () => {
    const scene = buildScene([
      buildLayer({
        id: 'controlnet-layer',
        name: 'Pose Guide',
        type: 'controlnet',
        sourceMediaAssetId: 'asset-controlnet',
        preprocessor: 'openpose',
        weight: 0.8,
        startStep: 0,
        endStep: 0.6,
      }),
      buildLayer({
        id: 'reference-layer',
        name: 'Style Guide',
        type: 'reference-image',
        referenceSetId: 'reference-set-1',
      }),
      buildLayer({
        id: 'inpaint-layer',
        name: 'Fill Mask',
        type: 'inpaint-mask',
        prompt: 'restore the missing shoulder detail',
      }),
    ]);

    const resolved = resolveCanvasControlLayers({
      scene,
      mediaAssets,
      referenceSets,
      generationType: 'image',
      baseImagePath: 'C:/vision-studio-output/current/frame.png',
    });

    expect(resolved.visibleLayerCount).toBe(3);
    expect(resolved.errors).toEqual([]);
    expect(resolved.controlnet).toEqual([
      expect.objectContaining({
        layer_id: 'controlnet-layer',
        source_path: 'C:/vision-studio-inputs/pose-map.png',
        preprocessor: 'openpose',
        strength: 0.8,
      }),
    ]);
    expect(resolved.referenceImages).toEqual([
      expect.objectContaining({
        layer_id: 'reference-layer',
        source_path: 'C:/vision-studio-inputs/style-frame.png',
      }),
    ]);
    expect(resolved.inpaint).toEqual(
      expect.objectContaining({
        layer_id: 'inpaint-layer',
        image_path: 'C:/vision-studio-output/current/frame.png',
        prompt: 'restore the missing shoulder detail',
      }),
    );
  });

  it('reports invalid visible layers instead of silently ignoring them', () => {
    const scene = buildScene([
      buildLayer({
        id: 'broken-controlnet',
        name: 'Broken ControlNet',
        type: 'controlnet',
        preprocessor: undefined,
        sourcePath: undefined,
      }),
      buildLayer({
        id: 'broken-reference',
        name: 'Broken Reference',
        type: 'reference-image',
        sourcePath: 'C:/vision-studio-inputs/reference.mp4',
        mask: {
          ...DEFAULT_CANVAS_CONTROL_LAYER_MASK,
          points: [],
          bounds: { x: 0, y: 0, width: 0, height: 0 },
        },
      }),
      buildLayer({
        id: 'mask-one',
        name: 'Mask One',
        type: 'inpaint-mask',
      }),
      buildLayer({
        id: 'mask-two',
        name: 'Mask Two',
        type: 'inpaint-mask',
      }),
    ]);

    const resolved = resolveCanvasControlLayers({
      scene,
      mediaAssets,
      referenceSets,
      generationType: 'image',
      baseImagePath: null,
    });

    expect(resolved.controlnet).toEqual([]);
    expect(resolved.referenceImages).toEqual([]);
    expect(resolved.inpaint).toBeNull();
    expect(resolved.errors).toContain('Broken ControlNet needs a source image or reference target.');
    expect(resolved.errors).toContain('Broken Reference needs a drawn mask on the canvas.');
    expect(resolved.errors).toContain('Broken Reference requires an image source.');
    expect(resolved.errors).toContain('Only one visible inpaint mask is supported at a time.');
    expect(resolved.errors).toContain('Mask One needs a usable base image on the canvas.');
  });

  it('ignores canvas control layers outside image generation mode', () => {
    const scene = buildScene([
      buildLayer({
        id: 'controlnet-layer',
        name: 'Pose Guide',
        type: 'controlnet',
        sourceMediaAssetId: 'asset-controlnet',
        preprocessor: 'openpose',
      }),
    ]);

    const resolved = resolveCanvasControlLayers({
      scene,
      mediaAssets,
      referenceSets,
      generationType: 'video',
      baseImagePath: 'C:/vision-studio-output/current/frame.png',
    });

    expect(resolved).toEqual({
      visibleLayerCount: 0,
      controlnet: [],
      referenceImages: [],
      inpaint: null,
      errors: [],
    });
  });
});
