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
  format?: string | null;
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
  // M3 location/index fields (absent on older payloads):
  locations?: string[];
  identity?: string | null;
  availability?: 'available' | 'unavailable';
  library_root_id?: string | null;
  // M4 classification + security fields (absent on older payloads):
  tier_reason?: string | null;
  format?: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code?: boolean;
  nsfw?: boolean;
  download_url?: string | null;
  sha256?: string | null;
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

export type LayoutHint = 'comfyui' | 'a1111' | 'generic';

/** A user library root indexed in place - bytes are referenced, never copied. */
export interface LibraryRoot {
  id: string;
  path: string;
  layout_hint: LayoutHint;
  added_at: string;
}

/** First-run detection offer (existing ComfyUI/A1111 install). Opt-in only. */
export interface DetectedRoot {
  path: string;
  layout_hint: LayoutHint;
}

export interface ScanResult {
  records_indexed: number;
  warnings: string[];
}

export function isImageCapability(record: Pick<ModelRecord, 'capability'>): boolean {
  return record.capability !== 'video';
}
