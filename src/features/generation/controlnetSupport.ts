import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/controlnet_registry.py (#34 PR2).
 * The backend registry is the source of truth; keep the two in sync when
 * families or preprocessors land (FLUX/SD3.5 + SDXL union arrive in PR3).
 */
export const CONTROLNET_STACKS: Record<string, Record<string, { recordId: string; annotatorRecordId: string | null }>> = {
  sd15: {
    canny: { recordId: 'controlnet-canny-sd15', annotatorRecordId: null },
    depth: { recordId: 'controlnet-depth-sd15', annotatorRecordId: 'annotator-midas' },
    openpose: { recordId: 'controlnet-openpose-sd15', annotatorRecordId: 'annotator-openpose' },
    scribble: { recordId: 'controlnet-scribble-sd15', annotatorRecordId: null },
    normal: { recordId: 'controlnet-normal-sd15', annotatorRecordId: 'annotator-normalbae' },
  },
  sdxl: {
    canny: { recordId: 'controlnet-canny-sdxl', annotatorRecordId: null },
    depth: { recordId: 'controlnet-depth-sdxl', annotatorRecordId: 'annotator-midas' },
    openpose: { recordId: 'controlnet-openpose-sdxl', annotatorRecordId: 'annotator-openpose' },
  },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

export interface ControlNetPreflight {
  errors: string[];
  missingRecordIds: string[];
}

/**
 * Best-effort client mirror of the backend 422 pre-flight. A null family
 * (models list not loaded) stays silent - the backend check is authoritative.
 */
export function resolveControlNetPreflight(
  layers: GenerationControlNetLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
): ControlNetPreflight {
  if (layers.length === 0 || !baseArchitecture) {
    return { errors: [], missingRecordIds: [] };
  }

  const stacks = CONTROLNET_STACKS[baseArchitecture];
  const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
  if (!stacks) {
    return {
      errors: [
        `ControlNet on ${label} is not supported yet - it lands in the next update (#34 PR3). ` +
          'Switch to an SD 1.5 or SDXL checkpoint, or hide the ControlNet layer(s).',
      ],
      missingRecordIds: [],
    };
  }

  const errors = new Set<string>();
  const missing = new Set<string>();
  for (const layer of layers) {
    const entry = stacks[layer.preprocessor];
    if (!entry) {
      const supported = Object.keys(stacks).sort().join(', ');
      errors.add(
        `No ControlNet model is available for the '${layer.preprocessor}' preprocessor on ${label} yet - ` +
          `supported on ${label}: ${supported}.`,
      );
      continue;
    }
    const required = [entry.recordId, entry.annotatorRecordId].filter(
      (recordId): recordId is string => recordId !== null,
    );
    for (const recordId of required) {
      const record = availableModels.find((model) => model.id === recordId);
      if (record?.status !== 'ready') {
        errors.add(`${layer.layer_name} needs '${recordId}' - install it from the Foundry first.`);
        missing.add(recordId);
      }
    }
  }
  return { errors: [...errors], missingRecordIds: [...missing] };
}
