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
  /** null = unpinned (M5 Task 2: backend changed Optional[str] = None). */
  revision: string | null;
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
  // M5 Task 6: companion model IDs (e.g. VAE, text encoder) and measured VRAM.
  companions?: string[];
  measured_vram_bytes?: number | null;
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

/** Hub search source selector ('hf' = Hugging Face). */
export type SearchSource = 'hf' | 'civitai';

/** Security consent categories gated before download/load (M4). */
export type ConsentKind = 'pickle' | 'trust_remote_code';

/**
 * One hub search hit. Mirrors the backend SearchResultSchema - a transient,
 * pre-registry shape; becomes a ModelRecord only once the user pulls it.
 */
export interface SearchResult {
  id: string;
  source: 'huggingface' | 'civitai';
  name: string;
  repo_id: string | null;
  tier: ModelTier;
  tier_reason: string;
  artifact_type: string;
  base_architecture: string;
  capability: ModelCapability;
  downloads: number;
  likes: number;
  author: string | null;
  license: string | null;
  gated: boolean;
  nsfw: boolean;
  format: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code: boolean;
  size: string;
  tags: string[];
}

/** Envelope for GET /api/models/search. `offline: true` degrades gracefully. */
export interface SearchResponse {
  source: SearchSource;
  query: string;
  page: number;
  results: SearchResult[];
  offline: boolean;
  warning: string | null;
}

export function isImageCapability(record: Pick<ModelRecord, 'capability'>): boolean {
  return record.capability !== 'video';
}

// ── M5 hardware + runtime plan wire types ────────────────────────────────

/**
 * GPU/CPU snapshot from GET /api/hardware.
 * Mirrors backend HardwareProfileSchema (spec 6.1). Snake_case wire format.
 */
export interface HardwareProfile {
  gpu_available: boolean;
  gpu_name: string | null;
  vram_total_bytes: number;
  vram_free_bytes: number;
  compute_major: number;
  compute_minor: number;
  cuda_version: string | null;
  torch_available: boolean;
  system_ram_total_bytes: number;
  system_ram_available_bytes: number;
  disk_free_bytes: number;
}

/**
 * VRAM breakdown for a single model load.
 * Mirrors backend VramEstimateSchema (spec 6.2). Snake_case wire format.
 */
export interface VramEstimate {
  weight_bytes: number;
  activation_bytes: number;
  runtime_bytes: number;
  total_bytes: number;
  /** 'measured' | 'estimated' */
  basis: string;
}

/**
 * Resolved pipeline runtime plan from POST /api/models/{id}/resolve-runtime.
 * Mirrors backend RuntimePlanSchema (spec 6.4). Snake_case wire format.
 * A refusal is an informational 200 payload (refusal field set); never a 4xx/5xx.
 */
export interface RuntimePlan {
  pipeline_class: string | null;
  precision: string | null;
  offload: boolean;
  vae_tiling: boolean;
  attention_slicing: boolean;
  single_file: boolean;
  config_catalog_id: string | null;
  vram_plan: VramEstimate | null;
  fit: string | null;
  missing_components: string[];
  fallback_ladder: string[];
  readiness: string;
  refusal: string | null;
}
