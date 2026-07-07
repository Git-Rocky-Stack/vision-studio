import { useAppStore } from '@/store/appStore';
import { selectModelsByCapability } from '@/store/slices/modelsSlice';
import { toAccelerationRequestPayload } from '@/features/generation/accelerationRequest';
import { resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type {
  GenerationMaskPayload,
  GenerationOutpaintPayload,
  ImageGenerationRequestPayload,
} from '@/types/generation';
import type { RegionMask } from '@/types/project';

import { pollEditJob, type EditJobPollApi, type EditStore } from './editJobPolling';
import { EDIT_BACKEND_DOWN_MESSAGE, type EditToolResult } from './runEditTool';

export type GuidedEditOperation =
  | 'style-transfer'
  | 'generative-fill'
  | 'object-removal'
  | 'ai-expand'
  | 'background-replace';

export const NO_IMAGE_MODEL_MESSAGE =
  "The selected image model isn't installed - install one from the Foundry first.";
export const EMPTY_MASK_MESSAGE = 'Draw a mask over the area on the canvas first.';
export const SOURCE_UNREADABLE_MESSAGE =
  'The source image could not be read - reload it and try again.';

export const STYLE_STRENGTH_MIN = 0.3;
export const STYLE_STRENGTH_MAX = 0.9;
export const OBJECT_REMOVAL_PROMPT =
  'seamless empty background, natural continuation of the surrounding scene';
export const OBJECT_REMOVAL_NEGATIVE =
  'object, person, animal, text, watermark, logo';
export const AI_EXPAND_DEFAULT_PROMPT = 'seamless continuation of the scene';

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const MIN_DIMENSION = 256;
const MAX_DIMENSION = 2048;
const MIN_EXPAND_PIXELS = 64;
const MAX_EXPAND_PIXELS = 512;

export interface GuidedEditInput {
  source_path: string;
  /** style-transfer preset modifier text. */
  styleModifier?: string;
  /** style-transfer strength 0-100 (maps onto denoising 0.30-0.90). */
  styleStrength?: number;
  /** User text: style subject / fill content / expand description / new background. */
  prompt?: string;
  /** generative-fill / object-removal canvas mask. */
  mask?: RegionMask | null;
  /** ai-expand. */
  directions?: GenerationOutpaintPayload['directions'];
  pixels?: number;
}

export interface GuidedRequestContext {
  model: string;
  steps: number;
  cfgScale: number;
  scheduler: string;
  sourceWidth: number;
  sourceHeight: number;
}

/** Pipelines require /8 dimensions; keep the output within engine bounds. */
export function snapDimension(value: number): number {
  const snapped = Math.round(value / 8) * 8;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, snapped));
}

/** Store RegionMask -> backend mask payload (the Canvas control-layer conversion). */
export function toGenerationMask(mask: RegionMask): GenerationMaskPayload {
  return {
    type: mask.type,
    points: mask.points.map((point) => ({ ...point })),
    bounds: { ...mask.bounds },
    ...(mask.brushSize !== undefined ? { brush_size: mask.brushSize } : {}),
  };
}

// A single reference layer runs full-image img2img; its mask field is
// required by the schema but honestly unused (the backend says so).
const EMPTY_LAYER_MASK: GenerationMaskPayload = {
  type: 'rectangle',
  points: [],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
};

export function buildGuidedEditRequest(
  operation: GuidedEditOperation,
  input: GuidedEditInput,
  context: GuidedRequestContext,
): ImageGenerationRequestPayload {
  const base: ImageGenerationRequestPayload = {
    prompt: '',
    negative_prompt: '',
    width: snapDimension(context.sourceWidth),
    height: snapDimension(context.sourceHeight),
    steps: context.steps,
    cfg_scale: context.cfgScale,
    model: context.model,
    scheduler: context.scheduler,
  };

  if (operation === 'style-transfer') {
    const strength = Math.max(0, Math.min(100, input.styleStrength ?? 75));
    const denoising =
      STYLE_STRENGTH_MIN + (strength / 100) * (STYLE_STRENGTH_MAX - STYLE_STRENGTH_MIN);
    return {
      ...base,
      prompt: [input.prompt?.trim(), input.styleModifier?.trim()]
        .filter(Boolean)
        .join(', '),
      reference_images: [
        {
          layer_id: 'edit-style-transfer',
          layer_name: 'Style Transfer',
          source_path: input.source_path,
          mask: { ...EMPTY_LAYER_MASK },
        },
      ],
      denoising_strength: Number(denoising.toFixed(3)),
    };
  }

  if (operation === 'generative-fill' || operation === 'object-removal') {
    const isFill = operation === 'generative-fill';
    return {
      ...base,
      prompt: isFill ? (input.prompt ?? '').trim() : OBJECT_REMOVAL_PROMPT,
      negative_prompt: isFill ? '' : OBJECT_REMOVAL_NEGATIVE,
      inpaint: {
        layer_id: isFill ? 'edit-generative-fill' : 'edit-object-removal',
        layer_name: isFill ? 'Generative Fill' : 'Object Removal',
        image_path: input.source_path,
        mask: toGenerationMask(input.mask as RegionMask),
      },
      denoising_strength: 1,
    };
  }

  if (operation === 'background-replace') {
    return {
      ...base,
      prompt: (input.prompt ?? '').trim(),
      background_replace: { image_path: input.source_path },
      denoising_strength: 1,
    };
  }

  const directions = input.directions ?? [];
  const pixels = Math.max(
    MIN_EXPAND_PIXELS,
    Math.min(MAX_EXPAND_PIXELS, Math.round(input.pixels ?? 256)),
  );
  const horizontal =
    Number(directions.includes('left')) + Number(directions.includes('right'));
  const vertical =
    Number(directions.includes('up')) + Number(directions.includes('down'));
  return {
    ...base,
    prompt: (input.prompt ?? '').trim() || AI_EXPAND_DEFAULT_PROMPT,
    width: snapDimension(context.sourceWidth + pixels * horizontal),
    height: snapDimension(context.sourceHeight + pixels * vertical),
    outpaint: {
      image_path: input.source_path,
      directions,
      pixels,
    },
    denoising_strength: 1,
  };
}

interface GuidedEditElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: EditJobPollApi & {
    generateImage: (
      params: ImageGenerationRequestPayload,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
  };
}

export interface RunGuidedEditToolOptions {
  electron?: GuidedEditElectronApi;
  store?: EditStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  measureImage?: (src: string) => Promise<{ width: number; height: number }>;
}

function defaultMeasureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(SOURCE_UNREADABLE_MESSAGE));
    image.src = src;
  });
}

/**
 * Guided edit-tool run (#34 PR2): builds a real guided-pass generation
 * request from the panel's inputs, submits it through the ordinary image
 * IPC, and lands the finished frame with the shared Edit-page handoff.
 * Refusals are honest and instant: no backend, no ready checkpoint, or a
 * missing mask never submit a job. The consumed mask clears automatically
 * when the finished image lands (setCurrentImage resets editAiMask).
 */
export async function runGuidedEditTool(
  operation: GuidedEditOperation,
  input: GuidedEditInput,
  {
    electron = window.electron as unknown as GuidedEditElectronApi,
    store = useAppStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    pollRetryMs = POLL_RETRY_MS,
    signal,
    onProgress,
    measureImage = defaultMeasureImage,
  }: RunGuidedEditToolOptions = {},
): Promise<EditToolResult> {
  const state = store.getState();
  if (!state.systemInfo.backendConnected) {
    return { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE };
  }

  const checkpoints = selectModelsByCapability(state.availableModels, 'image');
  const record = checkpoints.find((model) => model.id === state.selectedImageModelId);
  if (!record || record.status !== 'ready') {
    return { ok: false, error: NO_IMAGE_MODEL_MESSAGE };
  }

  if (
    (operation === 'generative-fill' || operation === 'object-removal') &&
    !(input.mask && input.mask.points.length > 0)
  ) {
    return { ok: false, error: EMPTY_MASK_MESSAGE };
  }

  let jobId: string;
  let outputRoot: string;
  let request: ImageGenerationRequestPayload;
  try {
    const previewSrc = state.currentImage;
    if (!previewSrc) {
      throw new Error(SOURCE_UNREADABLE_MESSAGE);
    }
    const dimensions = await measureImage(previewSrc);
    request = {
      ...buildGuidedEditRequest(operation, input, {
        model: state.selectedImageModelId,
        steps: state.advancedGeneration.steps,
        cfgScale: state.advancedGeneration.cfgScale,
        scheduler: state.advancedGeneration.scheduler,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
      }),
      acceleration_settings: toAccelerationRequestPayload(state.accelerationSettings),
    };

    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitted = await electron.generation.generateImage(request);
    if (!submitted.success || !submitted.jobId) {
      throw new Error(submitted.error || 'Edit generation failed');
    }
    jobId = submitted.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edit generation failed';
    return { ok: false, error: message };
  }

  store.getState().addJob({
    id: jobId,
    type: 'image',
    status: 'pending',
    progress: 0,
    params: { ...request, operation, output_root: outputRoot, source: 'edit-tool' },
    createdAt: new Date(),
  });

  const polled = await pollEditJob({
    electron: electron.generation,
    store,
    jobId,
    outputRoot,
    fallbackErrorMessage: 'Edit generation failed',
    pollIntervalMs,
    pollRetryMs,
    signal,
    onProgress,
  });
  if (!polled.ok) {
    return polled.error ? { ok: false, jobId, error: polled.error } : { ok: false, jobId };
  }
  return { ok: true, jobId };
}
