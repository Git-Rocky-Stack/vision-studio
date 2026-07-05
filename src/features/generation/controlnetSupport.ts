import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/controlnet_registry.py (#34 PR2/PR3).
 * The backend registry is the source of truth; keep every map and message
 * below in sync with it verbatim.
 */

export type GuidedKind = 'none' | 'img2img' | 'inpaint';

/** Annotator weights each preprocessor needs (guided/preprocessors.py). */
export const PREPROCESSOR_ANNOTATORS: Record<string, string | null> = {
  canny: null,
  scribble: null,
  depth: 'annotator-midas',
  normal: 'annotator-normalbae',
  openpose: 'annotator-openpose',
};

/** Dedicated one-record-per-preprocessor stacks. */
export const CONTROLNET_DEDICATED: Record<string, Record<string, string>> = {
  sd15: {
    canny: 'controlnet-canny-sd15',
    depth: 'controlnet-depth-sd15',
    openpose: 'controlnet-openpose-sd15',
    scribble: 'controlnet-scribble-sd15',
    normal: 'controlnet-normal-sd15',
  },
  sdxl: {
    canny: 'controlnet-canny-sdxl',
    depth: 'controlnet-depth-sdxl',
    openpose: 'controlnet-openpose-sdxl',
  },
  sd35: {
    canny: 'controlnet-canny-sd35',
    depth: 'controlnet-depth-sd35',
  },
};

/** Union stacks: one record serves several preprocessors via control_mode. */
export const CONTROLNET_UNIONS: Record<string, { recordId: string; modes: Record<string, number> }> = {
  sdxl: {
    recordId: 'controlnet-union-sdxl',
    modes: { openpose: 0, depth: 1, scribble: 2, canny: 3, normal: 4 },
  },
  flux: {
    recordId: 'controlnet-union-flux',
    modes: { canny: 0, depth: 2, openpose: 4 },
  },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

/** Known-incompatible catalog checkpoints inside supported families. */
export const CHECKPOINT_DECLINES: Record<string, string> = {
  'flux-schnell':
    'FLUX.1 [schnell] is a distilled checkpoint the FLUX ControlNet union does not support - switch to FLUX.1 [dev].',
  'sd3.5-medium':
    'The SD 3.5 ControlNets are trained for SD 3.5 Large only - switch to the SD 3.5 Large checkpoint.',
};

/** ControlNet composes only where diffusers ships the combined pipeline. */
const UNSUPPORTED_KINDS: Record<string, Partial<Record<GuidedKind, string>>> = {
  flux: {
    inpaint:
      'FLUX inpainting runs on FLUX.1 Fill, which has no ControlNet path - hide the ControlNet layer(s) or clear the inpaint mask.',
  },
  sd35: {
    img2img:
      'ControlNet with a reference image is not supported on SD 3.5 - remove the reference layer or switch to SD 1.5, SDXL, or FLUX.',
    inpaint:
      'ControlNet with inpainting is not supported on SD 3.5 - clear the inpaint mask or switch to SD 1.5 or SDXL.',
  },
};

export interface ControlNetPreflight {
  errors: string[];
  missingRecordIds: string[];
}

const EMPTY: ControlNetPreflight = { errors: [], missingRecordIds: [] };

/** Preprocessors that can run at all on a family (dedicated or via union). */
export function supportedPreprocessors(baseArchitecture: string | null): string[] {
  if (!baseArchitecture) {
    return Object.keys(PREPROCESSOR_ANNOTATORS).sort();
  }
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture] ?? {};
  const union = CONTROLNET_UNIONS[baseArchitecture];
  return [...new Set([...Object.keys(dedicated), ...Object.keys(union?.modes ?? {})])].sort();
}

/**
 * Per-layer record needs for the properties panel: the layer's own model
 * (dedicated first, union fallback) plus its annotator. Full-stack routing
 * (mixed stacks forcing the union) is the submit preflight's job.
 */
export function requiredRecordsFor(
  preprocessor: string,
  baseArchitecture: string | null,
): string[] {
  if (!baseArchitecture) return [];
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture] ?? {};
  const union = CONTROLNET_UNIONS[baseArchitecture];
  const controlNetRecord =
    dedicated[preprocessor] ??
    (union && preprocessor in union.modes ? union.recordId : null);
  if (!controlNetRecord) return [];
  const annotator = PREPROCESSOR_ANNOTATORS[preprocessor] ?? null;
  return annotator ? [controlNetRecord, annotator] : [controlNetRecord];
}

/**
 * Best-effort client mirror of the backend 422 pre-flight. A null family
 * (models list not loaded) stays silent - the backend check is authoritative.
 */
export function resolveControlNetPreflight(
  layers: GenerationControlNetLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
  options: { modelId?: string | null; kind?: GuidedKind } = {},
): ControlNetPreflight {
  if (layers.length === 0 || !baseArchitecture) {
    return EMPTY;
  }

  const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture];
  const union = CONTROLNET_UNIONS[baseArchitecture];
  if (!dedicated && !union) {
    return {
      errors: [
        `ControlNet is not supported on ${label} - switch to an SD 1.5, SDXL, FLUX, ` +
          'or SD 3.5 Large checkpoint, or hide the ControlNet layer(s).',
      ],
      missingRecordIds: [],
    };
  }

  const decline = CHECKPOINT_DECLINES[options.modelId ?? ''];
  if (decline) {
    return { errors: [decline], missingRecordIds: [] };
  }
  const kindReason = UNSUPPORTED_KINDS[baseArchitecture]?.[options.kind ?? 'none'];
  if (kindReason) {
    return { errors: [kindReason], missingRecordIds: [] };
  }

  const supported = supportedPreprocessors(baseArchitecture);
  const useUnion =
    union != null &&
    (!dedicated || layers.some((layer) => !(layer.preprocessor in dedicated)));

  const errors = new Set<string>();
  const missing = new Set<string>();
  const requireReady = (recordId: string, layerName: string) => {
    const record = availableModels.find((model) => model.id === recordId);
    if (record?.status !== 'ready') {
      errors.add(`${layerName} needs '${recordId}' - install it from the Foundry first.`);
      missing.add(recordId);
    }
  };

  for (const layer of layers) {
    const inUnion = union != null && layer.preprocessor in union.modes;
    const inDedicated = dedicated != null && layer.preprocessor in dedicated;
    if (!(useUnion ? inUnion : inDedicated)) {
      errors.add(
        `No ControlNet model is available for the '${layer.preprocessor}' preprocessor on ` +
          `${label} - supported on ${label}: ${supported.join(', ')}.`,
      );
      continue;
    }
    const controlNetRecord = useUnion ? union.recordId : dedicated[layer.preprocessor];
    requireReady(controlNetRecord, layer.layer_name);
    const annotator = PREPROCESSOR_ANNOTATORS[layer.preprocessor];
    if (annotator) {
      requireReady(annotator, layer.layer_name);
    }
  }
  return { errors: [...errors], missingRecordIds: [...missing] };
}
