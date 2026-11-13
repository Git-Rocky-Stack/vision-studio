/**
 * Wire types for the renderer <-> main IPC bridge (shared, dependency-free).
 *
 * Compiled by tsconfig.app.json (renderer), tsconfig.electron.json (main +
 * preload) and, transitively, tsconfig.tests.json. Nothing here may import
 * node, DOM, electron or a `@/` alias: the electron project has no path
 * aliases. The only cross-tree import is the alias-free renderer model module.
 *
 * Every result type of shared/ipcContract.ts is declared here, so the
 * service implementations (electron/services/*) and the renderer
 * (src/types/electron.d.ts) read one source of truth.
 */

import type {
  ProvisionModel as RendererProvisionModel,
  ProvisionStatus as RendererProvisionStatus,
} from '../src/types/model';
import type { AiDirectorSettings } from './retrieval';

// -- Generic envelopes --------------------------------------------------------

/** The `{ success: false, error }` reply a handler gives for an expected failure. */
export interface BridgeFailure {
  success: false;
  error: string;
}

/**
 * What every `ipcMain.handle` listener returns on the wire. The preload
 * unwraps it: `ok: true` resolves the renderer's promise with `data`, and
 * `ok: false` rejects it with an Error carrying `error.message`.
 */
export type IpcErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN_SENDER' | 'HANDLER_ERROR';

export type IpcEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: IpcErrorCode; message: string } };

export interface SuccessResult {
  success: boolean;
  error?: string;
}

// -- App settings -------------------------------------------------------------

export type ThemePreference = 'dark' | 'light' | 'system';

export interface AppSettings {
  theme?: ThemePreference;
  defaultOutputPath?: string;
  backendAutostart?: boolean;
  notifyOnGenerationComplete?: boolean;
  notifyOnGenerationFailed?: boolean;
  notifyOnModelDownloads?: boolean;
  /** When true, a Local over-budget job silently routes to the account fallback provider (M6 S8). */
  autoRouteOnOverBudget?: boolean;
  /** M7 AI Director: retrieval-augmented prompt-assist settings. */
  aiDirector?: AiDirectorSettings;
}

/**
 * Settings as read back: every field has a release default. (The Python
 * interpreter is no longer a setting; only the VISION_STUDIO_PYTHON env var
 * overrides it, so a renderer can never choose what the main process spawns.)
 */
export type ResolvedAppSettings = Required<AppSettings>;

// -- Accounts -----------------------------------------------------------------

export type PromptEnhancementProvider = 'local' | 'openrouter' | 'huggingface';
export type ImageGenerationProvider = 'local' | 'openrouter' | 'huggingface';
export type VideoGenerationProvider = 'local' | 'openrouter' | 'huggingface';
export type FallbackProvider = 'openrouter' | 'huggingface';

export interface UserAccountRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    promptEnhancementProvider: PromptEnhancementProvider;
    openRouterModel: string;
    imageGenerationProvider: ImageGenerationProvider;
    videoGenerationProvider: VideoGenerationProvider;
    openRouterImageModel: string;
    huggingFaceModel: string;
    huggingFaceImageModel: string;
    huggingFaceVideoModel: string;
    fallbackProvider: FallbackProvider | null;
  };
  openRouter: {
    apiKeyStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
  huggingFace: {
    tokenStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
}

/** Renderer-facing name for one account (identical shape). */
export type UserAccountSummary = UserAccountRecord;

export interface UserAccountsSnapshot {
  activeAccountId: string | null;
  accounts: UserAccountRecord[];
}

// -- OpenRouter ---------------------------------------------------------------

export interface OpenRouterKeyInfo {
  label: string | null;
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  byokUsage: number | null;
  includeByokInLimit: boolean | null;
  isFreeTier: boolean | null;
  expiresAt: string | null;
}

export interface OpenRouterModelSummary {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  outputModalities: string[];
  supportedParameters: string[];
  pricing: {
    prompt: string;
    completion: string;
    image: string;
  };
}

export interface OpenRouterUsageSnapshot {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export interface OpenRouterKeyInfoResult {
  success: boolean;
  error?: string;
  keyInfo?: OpenRouterKeyInfo;
  accounts?: UserAccountsSnapshot;
}

export interface OpenRouterModelListResult {
  success: boolean;
  error?: string;
  models: OpenRouterModelSummary[];
}

// -- Assets -------------------------------------------------------------------

export interface ImportedAssetFile {
  originalPath: string;
  importedPath: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  importedAt: string;
}

export interface ImportFilesResult {
  success: boolean;
  files?: ImportedAssetFile[];
  error?: string;
}

export interface ReadDataUrlResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

export interface SaveDataUrlResult {
  success: boolean;
  file?: ImportedAssetFile;
  error?: string;
}

export interface ExportAssetResult {
  success: boolean;
  destinationPath?: string;
  error?: string;
}

export interface ExportManyResult {
  success: boolean;
  exportedCount?: number;
  error?: string;
}

// -- Generation ---------------------------------------------------------------

export interface JobResponse {
  success: boolean;
  jobId?: string;
  jobIds?: string[];
  error?: string;
}

export type JobLifecycleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobStatus {
  job_id: string;
  status: JobLifecycleStatus;
  progress: number;
  step?: number;
  type: 'image' | 'video' | 'edit';
  created_at: string;
  completed_at?: string;
  result?: {
    images?: string[];
    video?: string;
    seed?: number;
    /** M9: optimizations that actually took effect on this run (snake_case). */
    acceleration?: {
      applied: string[];
      skipped: string[];
      fell_back: string[];
    } | null;
    [key: string]: unknown;
  };
  error?: string;
}

/** Pushed on `generation:progress` - a backend WS `job_update` or a hosted-job lifecycle change. */
export interface GenerationProgressEvent {
  type: 'job_update';
  job_id: string;
  status: JobLifecycleStatus;
  progress: number;
}

/** #33: one decoded step frame pushed during generation (`generation:step-image`). */
export interface StepImageEvent {
  type: 'step_image';
  job_id: string;
  step: number;
  total_steps: number;
  image: string;
}

/**
 * A crop / frame-extract result: the derived still, already written into the
 * managed output tree. A failure rejects the call (IPC envelope) instead of
 * resolving a body without an image.
 */
export interface DerivedImageResult {
  image: string;
  output_path: string;
  width: number;
  height: number;
}

export interface ExtractedFrameResult extends DerivedImageResult {
  time_ms?: number;
  frame_index?: number;
}

export interface EnhancePromptResult {
  success?: boolean;
  error?: string;
  mode?: string;
  prompt?: string;
  variations?: string[];
  usage?: OpenRouterUsageSnapshot | null;
  /** The model's reply was unreadable; `prompt` is the input echoed back. */
  fallback?: boolean;
  provenance?: import('./retrieval').ContextProvenanceItem[];
  contextMode?: 'semantic' | 'lexical';
}

export interface SuggestNegativePromptResult {
  success?: boolean;
  error?: string;
  negativePrompt?: string;
  suggestions?: string[];
  source?: 'openrouter' | 'huggingface' | 'heuristic';
  usage?: OpenRouterUsageSnapshot | null;
  /** The model's reply was unreadable; `negativePrompt` is the input echoed back. */
  fallback?: boolean;
  provenance?: import('./retrieval').ContextProvenanceItem[];
  contextMode?: 'semantic' | 'lexical';
}

/** workflow:run-graph reply: the backend's accepted job, or a failure envelope. */
export type RunGraphResult =
  | { success: true; job_id: string; status: string; message: string }
  | BridgeFailure;

export interface DirectorIngestResult {
  ingested: number;
  skipped: number;
  total: number;
  error?: string;
}

export interface DirectorIndexStats {
  count: number;
  mode: 'semantic' | 'lexical';
}

// -- System / backend / updater ---------------------------------------------

/** Whether an optional capability can run on this machine, and why not. */
export interface CapabilityAvailability {
  available: boolean;
  reason?: string;
}

export interface SystemInfo {
  gpu_available: boolean;
  gpu_name?: string;
  gpu_vram?: string;
  cuda_version?: string;
  comfyui_connected: boolean;
  models_count: number;
  backendConnected?: boolean;
  /** Passed through unchanged from the backend's GET /api/system/info. */
  availability?: {
    quantization?: CapabilityAvailability;
    tensorrt?: CapabilityAvailability;
    semanticRetrieval?: CapabilityAvailability;
  };
}

/** Backend process state. `pid` is null while no child process exists. */
export interface BackendStatusSnapshot {
  running: boolean;
  pid: number | null;
}

/**
 * Pushed on `backend:status-changed` (K6); `error` explains a failed start or
 * identity check. `pid` is included when the sender knows it.
 */
export interface BackendStatusChangedEvent {
  running: boolean;
  pid?: number | null;
  error?: string;
}

/** `backend:status` reply. */
export interface BackendStatus extends BackendStatusSnapshot {
  bundled: boolean;
}

/**
 * Updater lifecycle. A check ends in `available` / `not-available` / `error`;
 * only an explicit `updater:download` moves `available` to `downloading`,
 * which ends in `downloaded` (ready to install) or `error`.
 */
export type UpdaterState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/**
 * Auto-update status snapshot (#34 installer PR4), the one shape
 * electron/services/updater.ts reports. Every value originates from a real
 * electron-updater event.
 */
export interface UpdaterStatus {
  state: UpdaterState;
  /**
   * The update's version: on `available`, `downloading`, `downloaded`, and on
   * an `error` that interrupted a download (the download can be retried).
   */
  version?: string;
  /** Download progress, 0-100 (`downloading` only). */
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

/**
 * `updater:download` reply: the status right after the download started
 * (`downloading`), or the unchanged status when there was nothing to
 * download. Progress and completion arrive over the `updater:status` push.
 */
export type UpdaterDownloadReply = UpdaterStatus;

export interface DownloadTokenSetResult {
  success: true;
  persisted: boolean;
}

export interface NotifyResult {
  success: boolean;
  skipped?: boolean;
}

// -- Provisioning (K3) --------------------------------------------------------

/** Install tier of an auto-set model: `core` is the minimal working set. */
export type ProvisionTier = 'core' | 'extended';

/**
 * One provisioning row: the renderer model plus its install tier and exact
 * size. Optional: a backend that predates K3 omits both.
 */
export interface ProvisionModelEntry extends RendererProvisionModel {
  tier?: ProvisionTier;
  /** Exact on-disk size in bytes from the manifest. */
  size_bytes?: number;
}

export interface ProvisionStatusSnapshot extends Omit<RendererProvisionStatus, 'models'> {
  models: ProvisionModelEntry[];
}

/** Optional `provision:start` subset: omitted = install the whole auto-set. */
export interface ProvisionStartOptions {
  modelIds?: string[];
}
