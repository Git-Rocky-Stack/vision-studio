import { contextBridge, ipcRenderer } from 'electron';

type AccountPreferences = {
  promptEnhancementProvider: 'local' | 'openrouter';
  openRouterModel: string;
  imageGenerationProvider: 'local' | 'openrouter';
  openRouterImageModel: string;
};

type AccountSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: AccountPreferences;
  openRouter: {
    apiKeyStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
};

type AccountsSnapshot = {
  activeAccountId: string | null;
  accounts: AccountSummary[];
};

type OpenRouterModelListResult = Promise<{
  success: boolean;
  error?: string;
  models: Array<{
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
  }>;
}>;

// Type definitions for the exposed API
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
  director: {
    syncCorpus: (records: import('../shared/retrieval').IngestRecord[]) => Promise<{ ingested: number; skipped: number; total: number }>;
    ingestRecord: (record: import('../shared/retrieval').IngestRecord) => Promise<{ ingested: number; skipped: number; total: number }>;
    clearIndex: () => Promise<{ success: boolean }>;
    indexStats: () => Promise<{ count: number; mode: 'semantic' | 'lexical' }>;
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
      pythonPath?: string;
    }>;
  };
  accounts: {
    list: () => Promise<AccountsSnapshot>;
    create: (payload?: { name?: string }) => Promise<AccountsSnapshot>;
    update: (
      accountId: string,
      patch: {
        name?: string;
        promptEnhancementProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterModel?: string;
        imageGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
        videoGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterImageModel?: string;
        huggingFaceModel?: string;
        huggingFaceImageModel?: string;
        huggingFaceVideoModel?: string;
        fallbackProvider?: 'openrouter' | 'huggingface' | null;
      }
    ) => Promise<AccountsSnapshot>;
    delete: (accountId: string) => Promise<AccountsSnapshot>;
    setActive: (accountId: string) => Promise<AccountsSnapshot>;
    setOpenRouterApiKey: (payload: { accountId: string; apiKey: string }) => Promise<AccountsSnapshot>;
    clearOpenRouterApiKey: (accountId: string) => Promise<AccountsSnapshot>;
    setHuggingFaceToken: (payload: { accountId: string; token: string }) => Promise<AccountsSnapshot>;
    clearHuggingFaceToken: (accountId: string) => Promise<AccountsSnapshot>;
  };
  openrouter: {
    testConnection: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      keyInfo?: {
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
      };
      accounts?: AccountsSnapshot;
    }>;
    getKeyInfo: (accountId?: string) => Promise<{
      success: boolean;
      error?: string;
      keyInfo?: {
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
      };
      accounts?: AccountsSnapshot;
    }>;
    listModels: (accountId?: string) => OpenRouterModelListResult;
    listImageModels: (accountId?: string) => OpenRouterModelListResult;
  };
  assets: {
    importFiles: (sourcePaths: string[]) => Promise<{ success: boolean; files?: Array<{
      originalPath: string;
      importedPath: string;
      name: string;
      type: 'image' | 'video' | 'audio';
      importedAt: string;
    }>; error?: string }>;
    export: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; destinationPath?: string; error?: string }>;
    exportMany: (sourcePaths: string[], destinationDir: string) => Promise<{ success: boolean; exportedCount?: number; error?: string }>;
    delete: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
    reveal: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
    clearCache: () => Promise<{ success: boolean; error?: string }>;
  };
  generation: {
    generateImage: (params: {
      prompt: string;
      negative_prompt?: string;
      width: number;
      height: number;
      steps: number;
      cfg_scale: number;
      seed?: number;
      model?: string;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    generateVideo: (params: {
      prompt: string;
      image_path?: string;
      width: number;
      height: number;
      duration: number;
      fps: number;
      steps?: number;
      model?: string;
      seed?: number;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    exportTimelineSequence: (params: {
      sequence_name: string;
      width: number;
      height: number;
      fps: number;
      output_path: string;
      frames: Array<{
        time_ms: number;
        layers: Array<{
          source_path: string;
          media_type: 'image' | 'video';
          source_time_ms: number;
          opacity: number;
        }>;
      }>;
      audio_layers: Array<{
        source_path: string;
        source_time_ms: number;
        timeline_offset_ms: number;
        duration_ms: number;
        clip_offset_ms: number;
        clip_duration_ms: number;
        gain: number;
        fade_in_ms: number;
        fade_out_ms: number;
      }>;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
    batch: (params: {
      prompts: string[];
      negative_prompt?: string;
      width: number;
      height: number;
      steps: number;
      cfg_scale: number;
      model?: string;
    }) => Promise<{ success: boolean; jobIds?: string[]; error?: string }>;
    enhancePrompt: (params: {
      prompt: string;
      mode?: string;
      augment?: { sources: import('../shared/retrieval').RetrievalSource[]; modelFamily: string | null };
    }) => Promise<{
      success?: boolean;
      error?: string;
      mode?: string;
      prompt?: string;
      variations?: string[];
      usage?: {
        promptTokens: number | null;
        completionTokens: number | null;
        totalTokens: number | null;
        cost: number | null;
      } | null;
      provenance?: import('../shared/retrieval').ContextProvenanceItem[];
      contextMode?: 'semantic' | 'lexical';
    }>;
    suggestNegativePrompt: (params: {
      prompt: string;
      negativePrompt?: string;
      augment?: { sources: import('../shared/retrieval').RetrievalSource[]; modelFamily: string | null };
    }) => Promise<{
      success?: boolean;
      error?: string;
      negativePrompt?: string;
      suggestions?: string[];
      source?: 'openrouter' | 'heuristic';
      usage?: {
        promptTokens: number | null;
        completionTokens: number | null;
        totalTokens: number | null;
        cost: number | null;
      } | null;
      provenance?: import('../shared/retrieval').ContextProvenanceItem[];
      contextMode?: 'semantic' | 'lexical';
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
    getStatus: (jobId: string) => Promise<any>;
    cancel: (jobId: string) => Promise<{ success: boolean }>;
    listJobs: (options?: { status?: string; limit?: number }) => Promise<any>;
    onProgress: (callback: (data: any) => void) => () => void;
  };
  workflow: {
    runGraph: (params: { graph: unknown; generationType: 'image' | 'video' }) => Promise<{
      job_id: string;
      status: string;
      message: string;
    }>;
  };
  system: {
    getInfo: () => Promise<{
      gpu_available: boolean;
      gpu_name?: string;
      gpu_vram?: string;
      cuda_version?: string;
      comfyui_connected: boolean;
      models_count: number;
      backendConnected?: boolean;
    }>;
  };
  models: {
    list: () => Promise<any[]>;
    get: (modelId: string) => Promise<any>;
    download: (modelId: string) => Promise<{ model_id: string; status: string; [k: string]: unknown }>;
    downloadPause: (modelId: string) => Promise<any>;
    downloadResume: (modelId: string) => Promise<any>;
    downloadCancel: (modelId: string) => Promise<any>;
    downloadsList: () => Promise<any[]>;
    subscribeDownloads: () => Promise<any[]>;
    getStatus: (modelId: string) => Promise<any>;
    delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
    importRoot: (path: string, layoutHint: string) => Promise<{ id: string; path: string; layout_hint: string; added_at: string }>;
    scan: () => Promise<{ records_indexed: number; warnings: string[] }>;
    librariesList: () => Promise<any[]>;
    librariesRemove: (rootId: string) => Promise<{ removed: boolean; records_dropped: number }>;
    librariesDetect: () => Promise<any[]>;
    search: (
      query: string,
      source: 'hf' | 'civitai',
      page: number,
      nsfw: boolean
    ) => Promise<{
      source: 'hf' | 'civitai';
      query: string;
      page: number;
      results: any[];
      offline: boolean;
      warning: string | null;
    }>;
    consent: (
      modelId: string,
      kind: 'pickle' | 'trust_remote_code',
      granted: boolean
    ) => Promise<{ success: boolean; error?: string; [k: string]: unknown }>;
    convert: (modelId: string) => Promise<{ success: boolean; error?: string; [k: string]: unknown }>;
    resolveRuntime: (modelId: string) => Promise<any>;
  };
  hardware: {
    get: () => Promise<any>;
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

// Expose the API to the renderer process
const electronAPI: ElectronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    getPath: (name) => ipcRenderer.invoke('app:get-path', name),
    openPath: (filePath) => ipcRenderer.invoke('app:open-path', filePath),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    selectMediaFiles: () => ipcRenderer.invoke('dialog:select-media-files'),
    saveFile: (options) => ipcRenderer.invoke('dialog:save-file', options),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    reset: () => ipcRenderer.invoke('store:reset'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },
  director: {
    syncCorpus: (records) => ipcRenderer.invoke('director:sync-corpus', records),
    ingestRecord: (record) => ipcRenderer.invoke('director:ingest-record', record),
    clearIndex: () => ipcRenderer.invoke('director:clear-index'),
    indexStats: () => ipcRenderer.invoke('director:index-stats'),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (payload) => ipcRenderer.invoke('accounts:create', payload),
    update: (accountId, patch) => ipcRenderer.invoke('accounts:update', accountId, patch),
    delete: (accountId) => ipcRenderer.invoke('accounts:delete', accountId),
    setActive: (accountId) => ipcRenderer.invoke('accounts:set-active', accountId),
    setOpenRouterApiKey: (payload) => ipcRenderer.invoke('accounts:set-openrouter-api-key', payload),
    clearOpenRouterApiKey: (accountId) => ipcRenderer.invoke('accounts:clear-openrouter-api-key', accountId),
    setHuggingFaceToken: (payload) => ipcRenderer.invoke('accounts:set-huggingface-token', payload),
    clearHuggingFaceToken: (accountId) => ipcRenderer.invoke('accounts:clear-huggingface-token', accountId),
  },
  openrouter: {
    testConnection: (accountId) => ipcRenderer.invoke('openrouter:test-connection', accountId),
    getKeyInfo: (accountId) => ipcRenderer.invoke('openrouter:get-key-info', accountId),
    listModels: (accountId) => ipcRenderer.invoke('openrouter:list-models', accountId),
    listImageModels: (accountId) => ipcRenderer.invoke('openrouter:list-image-models', accountId),
  },
  assets: {
    importFiles: (sourcePaths) => ipcRenderer.invoke('assets:import-files', sourcePaths),
    export: (sourcePath, destinationPath) => ipcRenderer.invoke('assets:export', sourcePath, destinationPath),
    exportMany: (sourcePaths, destinationDir) => ipcRenderer.invoke('assets:export-many', sourcePaths, destinationDir),
    delete: (sourcePath) => ipcRenderer.invoke('assets:delete', sourcePath),
    reveal: (sourcePath) => ipcRenderer.invoke('assets:reveal', sourcePath),
    clearCache: () => ipcRenderer.invoke('assets:clear-cache'),
  },
  generation: {
    generateImage: (params) => ipcRenderer.invoke('generation:generate-image', params),
    generateVideo: (params) => ipcRenderer.invoke('generation:generate-video', params),
    exportTimelineSequence: (params) => ipcRenderer.invoke('generation:export-timeline-sequence', params),
    batch: (params) => ipcRenderer.invoke('generation:batch', params),
    enhancePrompt: (params) => ipcRenderer.invoke('generation:enhance-prompt', params),
    suggestNegativePrompt: (params) => ipcRenderer.invoke('generation:suggest-negative-prompt', params),
    cropImage: (params) => ipcRenderer.invoke('generation:crop-image', params),
    extractVideoFrame: (params) => ipcRenderer.invoke('generation:extract-video-frame', params),
    upscaleImage: (params) => ipcRenderer.invoke('generation:upscale-image', params),
    getStatus: (jobId: string) => ipcRenderer.invoke('generation:get-status', jobId),
    cancel: (jobId: string) => ipcRenderer.invoke('generation:cancel', jobId),
    listJobs: (options) => ipcRenderer.invoke('generation:list-jobs', options),
    onProgress: (callback) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('generation:progress', handler);
      return () => ipcRenderer.off('generation:progress', handler);
    },
  },
  workflow: {
    runGraph: (params: { graph: unknown; generationType: 'image' | 'video' }) =>
      ipcRenderer.invoke('workflow:run-graph', params),
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    get: (modelId: string) => ipcRenderer.invoke('models:get', modelId),
    download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
    downloadPause: (modelId: string) => ipcRenderer.invoke('models:download:pause', modelId),
    downloadResume: (modelId: string) => ipcRenderer.invoke('models:download:resume', modelId),
    downloadCancel: (modelId: string) => ipcRenderer.invoke('models:download:cancel', modelId),
    downloadsList: () => ipcRenderer.invoke('models:downloads:list'),
    subscribeDownloads: () => ipcRenderer.invoke('models:downloads:subscribe'),
    getStatus: (modelId: string) => ipcRenderer.invoke('models:get-status', modelId),
    delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
    importRoot: (path: string, layoutHint: string) => ipcRenderer.invoke('models:import', path, layoutHint),
    scan: () => ipcRenderer.invoke('models:scan'),
    librariesList: () => ipcRenderer.invoke('models:libraries:list'),
    librariesRemove: (rootId: string) => ipcRenderer.invoke('models:libraries:remove', rootId),
    librariesDetect: () => ipcRenderer.invoke('models:libraries:detect'),
    search: (query: string, source: 'hf' | 'civitai', page: number, nsfw: boolean) =>
      ipcRenderer.invoke('models:search', query, source, page, nsfw),
    consent: (modelId: string, kind: 'pickle' | 'trust_remote_code', granted: boolean) =>
      ipcRenderer.invoke('models:consent', modelId, kind, granted),
    convert: (modelId: string) => ipcRenderer.invoke('models:convert', modelId),
    resolveRuntime: (modelId: string) => ipcRenderer.invoke('models:resolveRuntime', modelId),
  },
  hardware: {
    get: () => ipcRenderer.invoke('hardware:get'),
  },
  auth: {
    setHfToken: (token: string) => ipcRenderer.invoke('auth:setHfToken', token),
    setCivitaiToken: (token: string) => ipcRenderer.invoke('auth:setCivitaiToken', token),
  },
  notifications: {
    notify: (type, payload) => ipcRenderer.invoke('notifications:notify', type, payload),
  },
  backend: {
    start: () => ipcRenderer.invoke('backend:start'),
    stop: () => ipcRenderer.invoke('backend:stop'),
    getStatus: () => ipcRenderer.invoke('backend:status'),
    checkBundled: () => ipcRenderer.invoke('backend:check-bundled'),
    onStatusChange: (callback) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('backend:status', handler);
      return () => ipcRenderer.off('backend:status', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);

// Global type declaration
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
