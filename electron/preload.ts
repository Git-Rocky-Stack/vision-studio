import { contextBridge, ipcRenderer } from 'electron';

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
  assets: {
    importFiles: (sourcePaths: string[]) => Promise<{ success: boolean; files?: Array<{
      originalPath: string;
      importedPath: string;
      name: string;
      type: 'image' | 'video';
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
    }) => Promise<{ success?: boolean; error?: string; mode?: string; prompt?: string; variations?: string[] }>;
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
    download: (modelId: string) => Promise<{ success: boolean; message?: string }>;
    getStatus: (modelId: string) => Promise<any>;
    delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
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
    batch: (params) => ipcRenderer.invoke('generation:batch', params),
    enhancePrompt: (params) => ipcRenderer.invoke('generation:enhance-prompt', params),
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
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
    getStatus: (modelId: string) => ipcRenderer.invoke('models:get-status', modelId),
    delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
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
