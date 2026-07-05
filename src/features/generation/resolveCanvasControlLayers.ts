import type {
  GenerationControlNetLayerPayload,
  GenerationInpaintPayload,
  GenerationMaskPayload,
  GenerationMode,
  GenerationReferenceImageLayerPayload,
} from '@/types/generation';
import type { MediaAsset, ReferenceSet } from '@/types/media';
import type { CanvasControlLayer, Scene } from '@/types/project';

const VIDEO_SOURCE_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;

export interface ResolveCanvasControlLayersOptions {
  scene: Scene | null;
  mediaAssets: MediaAsset[];
  referenceSets: ReferenceSet[];
  generationType: GenerationMode;
  baseImagePath?: string | null;
}

export interface ResolvedCanvasControlLayers {
  visibleLayerCount: number;
  controlnet: GenerationControlNetLayerPayload[];
  referenceImages: GenerationReferenceImageLayerPayload[];
  inpaint: GenerationInpaintPayload | null;
  errors: string[];
}

export function resolveCanvasControlLayers({
  scene,
  mediaAssets,
  referenceSets,
  generationType,
  baseImagePath,
}: ResolveCanvasControlLayersOptions): ResolvedCanvasControlLayers {
  if (!scene || generationType !== 'image') {
    return {
      visibleLayerCount: 0,
      controlnet: [],
      referenceImages: [],
      inpaint: null,
      errors: [],
    };
  }

  const visibleLayers = scene.canvasControlLayers.filter((layer) => layer.visible);
  const errors = new Set<string>();
  const controlnet: GenerationControlNetLayerPayload[] = [];
  const referenceImageLayers: GenerationReferenceImageLayerPayload[] = [];
  const visibleInpaintLayers = visibleLayers.filter((layer) => layer.type === 'inpaint-mask');

  if (visibleInpaintLayers.length > 1) {
    errors.add('Only one visible inpaint mask is supported at a time.');
  }

  let inpaint: GenerationInpaintPayload | null = null;
  for (const layer of visibleLayers) {
    const mask = toMaskPayload(layer);
    const hasMask = mask.points.length > 0;
    if (!hasMask) {
      errors.add(`${layer.name} needs a drawn mask on the canvas.`);
    }

    if (!hasValidStepRange(layer)) {
      errors.add(`${layer.name} has an invalid step range.`);
    }

    if (layer.type === 'inpaint-mask') {
      if (visibleInpaintLayers[0]?.id !== layer.id) {
        continue;
      }

      if (!baseImagePath || isVideoLikePath(baseImagePath)) {
        errors.add(`${layer.name} needs a usable base image on the canvas.`);
        continue;
      }

      if (!hasMask) {
        continue;
      }

      inpaint = {
        layer_id: layer.id,
        layer_name: layer.name,
        image_path: baseImagePath,
        mask,
        prompt: layer.prompt,
        negative_prompt: layer.negativePrompt,
      };
      continue;
    }

    const resolvedSourcePath = resolveLayerSourcePath(layer, mediaAssets, referenceSets);
    if (!resolvedSourcePath) {
      errors.add(`${layer.name} needs a source image or reference target.`);
      continue;
    }

    if (isVideoLikePath(resolvedSourcePath)) {
      errors.add(`${layer.name} requires an image source.`);
      continue;
    }

    if (!hasMask) {
      continue;
    }

    if (layer.type === 'controlnet') {
      if (!layer.preprocessor) {
        errors.add(`${layer.name} needs a ControlNet preprocessor.`);
        continue;
      }

      controlnet.push({
        layer_id: layer.id,
        layer_name: layer.name,
        source_path: resolvedSourcePath,
        preprocessor: layer.preprocessor,
        strength: layer.weight ?? 1,
        start_step: layer.startStep ?? 0,
        end_step: layer.endStep ?? 1,
        mask,
        prompt: layer.prompt,
        negative_prompt: layer.negativePrompt,
      });
      continue;
    }

    referenceImageLayers.push({
      layer_id: layer.id,
      layer_name: layer.name,
      source_path: resolvedSourcePath,
      mask,
      strength: layer.weight ?? 1,
    });
  }

  return {
    visibleLayerCount: visibleLayers.length,
    controlnet,
    referenceImages: referenceImageLayers,
    inpaint,
    errors: [...errors],
  };
}

function toMaskPayload(layer: CanvasControlLayer): GenerationMaskPayload {
  return {
    type: layer.mask.type,
    points: layer.mask.points.map((point) => ({ ...point })),
    bounds: { ...layer.mask.bounds },
    ...(layer.mask.brushSize !== undefined ? { brush_size: layer.mask.brushSize } : {}),
  };
}

function hasValidStepRange(layer: CanvasControlLayer) {
  return (
    layer.startStep === undefined ||
    layer.endStep === undefined ||
    layer.startStep <= layer.endStep
  );
}

function resolveLayerSourcePath(
  layer: CanvasControlLayer,
  mediaAssets: MediaAsset[],
  referenceSets: ReferenceSet[],
) {
  if (layer.sourcePath) {
    return layer.sourcePath;
  }

  if (layer.sourceMediaAssetId) {
    return mediaAssets.find((asset) => asset.id === layer.sourceMediaAssetId)?.path ?? null;
  }

  if (!layer.referenceSetId) {
    return null;
  }

  const referenceSet = referenceSets.find((item) => item.id === layer.referenceSetId);
  if (!referenceSet) {
    return null;
  }

  const firstItem = [...referenceSet.items].sort((left, right) => left.orderIndex - right.orderIndex)[0];
  if (!firstItem) {
    return null;
  }

  if (firstItem.path) {
    return firstItem.path;
  }

  return mediaAssets.find((asset) => asset.id === firstItem.mediaAssetId)?.path ?? null;
}

function isVideoLikePath(path: string) {
  return VIDEO_SOURCE_PATTERN.test(path);
}
