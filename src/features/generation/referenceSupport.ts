import type { GenerationReferenceImageLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/ip_adapter.py + guided/passes.py
 * (#34 PR4). The backend is the source of truth; keep every map and
 * message below in sync with it verbatim.
 */

export const REFERENCE_ADAPTERS: Record<
  string,
  { adapterRecordId: string; encoderRecordId: string; masked: boolean }
> = {
  sd15: { adapterRecordId: 'ip-adapter-sd15', encoderRecordId: 'ip-adapter-encoder-vit-h', masked: true },
  sdxl: { adapterRecordId: 'ip-adapter-sdxl', encoderRecordId: 'ip-adapter-encoder-vit-h', masked: true },
  flux: { adapterRecordId: 'ip-adapter-flux', encoderRecordId: 'ip-adapter-encoder-clip-vit-l', masked: false },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

/** Known-incompatible catalog checkpoints inside supported families. */
export const REFERENCE_CHECKPOINT_DECLINES: Record<string, string> = {
  'flux-schnell':
    'FLUX.1 [schnell] is a distilled checkpoint the FLUX IP-Adapter does not support - switch to FLUX.1 [dev].',
};

export const MSG_SD35_SINGLE_IMAGE =
  'The SD 3.5 IP-Adapter accepts a single image, so multiple reference layers cannot run on SD 3.5 - keep one visible reference image layer or switch to SD 1.5, SDXL, or FLUX.1 [dev].';

export const MSG_INPAINT_PLUS_REFERENCE =
  'Use either an inpaint mask or a reference image layer for a single generation - combining them is not supported yet (#34).';

export const NOTICE_REFERENCE_MASKS_GLOBAL =
  'Reference masks are not supported on FLUX - every reference image was applied to the whole generation.';

export interface ReferencePreflight {
  errors: string[];
  missingRecordIds: string[];
  notices: string[];
}

const EMPTY: ReferencePreflight = { errors: [], missingRecordIds: [], notices: [] };

/** Adapter + encoder records multi-reference needs on a family. */
export function requiredReferenceRecords(baseArchitecture: string | null): string[] {
  const spec = baseArchitecture ? REFERENCE_ADAPTERS[baseArchitecture] : undefined;
  return spec ? [spec.adapterRecordId, spec.encoderRecordId] : [];
}

/**
 * Best-effort client mirror of the backend multi-reference 422 pre-flight.
 * A null family (models list not loaded) stays silent - the backend check
 * is authoritative.
 */
export function resolveReferencePreflight(
  layers: GenerationReferenceImageLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
  options: { modelId?: string | null; hasInpaint?: boolean } = {},
): ReferencePreflight {
  if (options.hasInpaint && layers.length > 0) {
    return { errors: [MSG_INPAINT_PLUS_REFERENCE], missingRecordIds: [], notices: [] };
  }
  if (layers.length < 2 || !baseArchitecture) {
    return EMPTY;
  }
  if (baseArchitecture === 'sd35') {
    return { errors: [MSG_SD35_SINGLE_IMAGE], missingRecordIds: [], notices: [] };
  }
  const spec = REFERENCE_ADAPTERS[baseArchitecture];
  if (!spec) {
    const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
    return {
      errors: [
        `Multiple reference images are not supported on ${label} - keep one visible ` +
          'reference image layer or switch to an SD 1.5, SDXL, or FLUX.1 [dev] checkpoint.',
      ],
      missingRecordIds: [],
      notices: [],
    };
  }
  const decline = REFERENCE_CHECKPOINT_DECLINES[options.modelId ?? ''];
  if (decline) {
    return { errors: [decline], missingRecordIds: [], notices: [] };
  }

  const errors: string[] = [];
  const missing: string[] = [];
  for (const recordId of [spec.adapterRecordId, spec.encoderRecordId]) {
    const record = availableModels.find((model) => model.id === recordId);
    if (record?.status !== 'ready') {
      errors.push(`Reference layers need '${recordId}' - install it from the Foundry first.`);
      missing.push(recordId);
    }
  }
  return {
    errors,
    missingRecordIds: missing,
    notices: spec.masked ? [] : [NOTICE_REFERENCE_MASKS_GLOBAL],
  };
}
