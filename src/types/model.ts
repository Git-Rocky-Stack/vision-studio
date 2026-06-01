export type ModelStatus =
  | 'ready'
  | 'downloading'
  | 'error'
  | 'not_found'
  | 'queued'
  | 'verifying'
  | 'paused'
  | 'cancelled';

export type ModelCapability = 'image' | 'video' | 'edit' | 'inpaint';
export type ModelRuntime = 'local' | 'comfyui' | 'cloud' | 'byom';
export type ModelTier = 'verified' | 'compatible' | 'experimental';
export type ModelQuality = 'draft' | 'balanced' | 'pro' | 'experimental' | 'local';
export type ModelHardwareClass = 'laptop' | 'creator' | 'workstation' | 'unknown';

/** Legacy thin model shape. Retained for existing consumers. */
export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
  status: ModelStatus;
  progress?: number;
  type?: string;
  format?: string;
}

/**
 * The Foundry's atomic unit. A superset of ModelInfo - a ModelRecord is
 * always assignable where a ModelInfo is expected (M1 reuses ModelStatus).
 */
export interface ModelRecord {
  id: string;
  name: string;
  artifact_type: string;
  capability: ModelCapability;
  base_architecture: string;
  source: 'huggingface' | 'civitai' | 'local' | 'linked';
  repo_id: string | null;
  revision: string;
  aux_repo_id: string | null;
  size: string;
  status: ModelStatus;
  tier: ModelTier;
  quality: ModelQuality;
  runtime: ModelRuntime;
  hardware_class: ModelHardwareClass;
  vram: string;
  description: string;
  license: string | null;
  gated: boolean;
  // Optional legacy-compat fields some consumers read:
  type?: string;
  progress?: number;
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'ready'
  | 'error'
  | 'cancelled';

/**
 * Transient download telemetry for a single model. Streamed from the backend
 * via GET /api/models/downloads; correlated to a ModelRecord by model_id.
 * Deliberately NOT part of ModelRecord (which stays durable). Never carries a
 * token.
 */
export interface DownloadJob {
  model_id: string;
  status: DownloadStatus;
  progress: number;
  speed: number;
  eta: number | null;
  total_bytes: number;
  error: string | null;
  gate_url: string | null;
}

export function isImageCapability(record: Pick<ModelRecord, 'capability'>): boolean {
  return record.capability !== 'video';
}
