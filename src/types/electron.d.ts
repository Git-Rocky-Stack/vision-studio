/**
 * Type definitions for Electron API exposed via contextBridge
 */

import type { ImageGenerationRequestPayload } from './generation';
import type {
  DownloadJob,
  ModelRecord,
  LibraryRoot,
  DetectedRoot,
  ScanResult,
  SearchSource,
  SearchResponse,
  ConsentKind,
  HardwareProfile,
  RuntimePlan,
} from './model';

export type GenerationParams = ImageGenerationRequestPayload;

export interface OpenRouterUsageSnapshot {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export interface VideoGenerationParams {
  prompt: string;
  image_path?: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  steps?: number;
  model?: string;
  seed?: number;
}

export interface TimelineExportLayerParams {
  source_path: string;
  media_type: 'image' | 'video';
  source_time_ms: number;
  opacity: number;
}

export interface TimelineExportAudioLayerParams {
  source_path: string;
  source_time_ms: number;
  timeline_offset_ms: number;
  duration_ms: number;
  clip_offset_ms: number;
  clip_duration_ms: number;
  gain: number;
  fade_in_ms: number;
  fade_out_ms: number;
}

export interface TimelineExportFrameParams {
  time_ms: number;
  layers: TimelineExportLayerParams[];
}

export interface TimelineExportParams {
  sequence_name: string;
  width: number;
  height: number;
  fps: number;
  output_path: string;
  frames: TimelineExportFrameParams[];
  audio_layers: TimelineExportAudioLayerParams[];
}

export interface BatchParams {
  prompts: string[];
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  model?: string;
}

export interface JobResponse {
  success: boolean;
  jobId?: string;
  jobIds?: string[];
  error?: string;
}

export interface ImportedAssetFile {
  originalPath: string;
  importedPath: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  importedAt: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step?: number;
  type: 'image' | 'video';
  created_at: string;
  completed_at?: string;
  result?: {
    images?: string[];
    video?: string;
    seed?: number;
    [key: string]: any;
  };
  error?: string;
}

export interface SystemInfo {
  gpu_available: boolean;
  gpu_name?: string;
  gpu_vram?: string;
  cuda_version?: string;
  comfyui_connected: boolean;
  models_count: number;
  backendConnected?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  type: string;
  source: string;
  size: string;
  status: string;
  description: string;
  progress?: number;
}

export interface UserAccountSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    promptEnhancementProvider: 'local' | 'openrouter' | 'huggingface';
    openRouterModel: string;
    imageGenerationProvider: 'local' | 'openrouter' | 'huggingface';
    openRouterImageModel: string;
    huggingFaceModel: string;
    huggingFaceImageModel: string;
    huggingFaceVideoModel: string;
    fallbackProvider: 'openrouter' | 'huggingface' | null;
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

export interface UserAccountsSnapshot {
  activeAccountId: string | null;
  accounts: UserAccountSummary[];
}

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

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    getPath: (name: 'userData' | 'documents' | 'downloads' | 'pictures') => Promise<string>;
    openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
    selectMediaFiles: () => Promise<string[]>;
    saveFile: (options: { defaultPath?: string; filters?: any[] }) => Promise<string | null>;
  };
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    reset: () => Promise<void>;
  };
  settings: {
    get: () => Promise<{
      theme: 'dark' | 'light' | 'system';
      autoSave: boolean;
      defaultOutputPath: string;
      backendAutostart: boolean;
      notifyOnGenerationComplete: boolean;
      notifyOnGenerationFailed: boolean;
      notifyOnModelDownloads: boolean;
      autoRouteOnOverBudget: boolean;
      pythonPath?: string;
    }>;
    update: (patch: Record<string, unknown>) => Promise<{
      theme: 'dark' | 'light' | 'system';
      autoSave: boolean;
      defaultOutputPath: string;
      backendAutostart: boolean;
      notifyOnGenerationComplete: boolean;
      notifyOnGenerationFailed: boolean;
      notifyOnModelDownloads: boolean;
      autoRouteOnOverBudget: boolean;
      pythonPath?: string;
    }>;
    reset: () => Promise<{
      theme: 'dark' | 'light' | 'system';
      autoSave: boolean;
      defaultOutputPath: string;
      backendAutostart: boolean;
      notifyOnGenerationComplete: boolean;
      notifyOnGenerationFailed: boolean;
      notifyOnModelDownloads: boolean;
      autoRouteOnOverBudget: boolean;
      pythonPath?: string;
    }>;
  };
  accounts: {
    list: () => Promise<UserAccountsSnapshot>;
    create: (payload?: { name?: string }) => Promise<UserAccountsSnapshot>;
    update: (
      accountId: string,
      patch: {
        name?: string;
        promptEnhancementProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterModel?: string;
        imageGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterImageModel?: string;
        huggingFaceModel?: string;
        huggingFaceImageModel?: string;
        huggingFaceVideoModel?: string;
        fallbackProvider?: 'openrouter' | 'huggingface' | null;
      }
    ) => Promise<UserAccountsSnapshot>;
    delete: (accountId: string) => Promise<UserAccountsSnapshot>;
    setActive: (accountId: string) => Promise<UserAccountsSnapshot>;
    setOpenRouterApiKey: (payload: { accountId: string; apiKey: string }) => Promise<UserAccountsSnapshot>;
    clearOpenRouterApiKey: (accountId: string) => Promise<UserAccountsSnapshot>;
    setHuggingFaceToken: (payload: { accountId: string; token: string }) => Promise<UserAccountsSnapshot>;
    clearHuggingFaceToken: (accountId: string) => Promise<UserAccountsSnapshot>;
  };
  openrouter: {
    testConnection: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      keyInfo?: OpenRouterKeyInfo;
      accounts?: UserAccountsSnapshot;
    }>;
    getKeyInfo: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      keyInfo?: OpenRouterKeyInfo;
      accounts?: UserAccountsSnapshot;
    }>;
    listModels: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      models: OpenRouterModelSummary[];
    }>;
    listImageModels: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      models: OpenRouterModelSummary[];
    }>;
  };
  assets: {
    importFiles: (sourcePaths: string[]) => Promise<{ success: boolean; files?: ImportedAssetFile[]; error?: string }>;
    export: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; destinationPath?: string; error?: string }>;
    exportMany: (sourcePaths: string[], destinationDir: string) => Promise<{ success: boolean; exportedCount?: number; error?: string }>;
    delete: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
    reveal: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
    clearCache: () => Promise<{ success: boolean; error?: string }>;
  };
  generation: {
    generateImage: (params: GenerationParams) => Promise<JobResponse>;
    generateVideo: (params: VideoGenerationParams) => Promise<JobResponse>;
    exportTimelineSequence: (params: TimelineExportParams) => Promise<JobResponse>;
    batch: (params: BatchParams) => Promise<JobResponse>;
    enhancePrompt: (params: {
      prompt: string;
      mode?: string;
    }) => Promise<{
      success?: boolean;
      error?: string;
      mode?: string;
      prompt?: string;
      variations?: string[];
      usage?: OpenRouterUsageSnapshot | null;
    }>;
    suggestNegativePrompt: (params: {
      prompt: string;
      negativePrompt?: string;
    }) => Promise<{
      success?: boolean;
      error?: string;
      negativePrompt?: string;
      suggestions?: string[];
      source?: 'openrouter' | 'huggingface' | 'heuristic';
      usage?: OpenRouterUsageSnapshot | null;
    }>;
    cropImage: (params: {
      source_path: string;
      crop_box?: { left: number; top: number; width: number; height: number };
      rotation?: number;
      flip_horizontal?: boolean;
      flip_vertical?: boolean;
    }) => Promise<any>;
    extractVideoFrame: (params: {
      source_path: string;
      time_ms?: number;
    }) => Promise<any>;
    upscaleImage: (params: {
      source_path: string;
      scale_factor?: number;
    }) => Promise<any>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean }>;
    listJobs: (options?: { status?: string; limit?: number }) => Promise<{ jobs: any[] }>;
    onProgress: (callback: (data: any) => void) => () => void;
  };
  system: {
    getInfo: () => Promise<SystemInfo>;
  };
  models: {
    list: () => Promise<ModelRecord[]>;
    get: (modelId: string) => Promise<ModelRecord | null>;
    // The backend returns a DownloadJob (202 Accepted) when a pull is enqueued.
    download: (modelId: string) => Promise<DownloadJob>;
    downloadPause: (modelId: string) => Promise<DownloadJob>;
    downloadResume: (modelId: string) => Promise<DownloadJob>;
    downloadCancel: (modelId: string) => Promise<DownloadJob>;
    downloadsList: () => Promise<DownloadJob[]>;
    subscribeDownloads: () => Promise<DownloadJob[]>;
    getStatus: (modelId: string) => Promise<ModelInfo | null>;
    delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
    importRoot: (path: string, layoutHint: string) => Promise<LibraryRoot>;
    scan: () => Promise<ScanResult>;
    librariesList: () => Promise<LibraryRoot[]>;
    librariesRemove: (rootId: string) => Promise<{ removed: boolean; records_dropped: number }>;
    librariesDetect: () => Promise<DetectedRoot[]>;
    search: (
      query: string,
      source: SearchSource,
      page: number,
      nsfw: boolean
    ) => Promise<SearchResponse>;
    consent: (
      modelId: string,
      kind: ConsentKind,
      granted: boolean
    ) => Promise<{ success: boolean; error?: string; [k: string]: unknown }>;
    convert: (modelId: string) => Promise<{ success: boolean; error?: string; [k: string]: unknown }>;
    resolveRuntime: (modelId: string) => Promise<RuntimePlan | { success: false; error: string }>;
  };
  hardware: {
    /** GET /api/hardware. Returns HardwareProfile on success. */
    get: () => Promise<HardwareProfile | { success: false; error: string }>;
  };
  auth: {
    setHfToken: (token: string) => Promise<{ success: boolean }>;
    setCivitaiToken: (token: string) => Promise<{ success: boolean }>;
  };
  notifications: {
    notify: (
      type: 'generation_complete' | 'generation_failed' | 'model_download',
      payload: { title: string; body: string }
    ) => Promise<{ success: boolean; skipped?: boolean }>;
  };
  backend: {
    start: () => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ running: boolean; pid?: number; bundled?: boolean }>;
    checkBundled: () => Promise<{ exists: boolean; path?: string | null }>;
    onStatusChange: (callback: (status: { running: boolean }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
