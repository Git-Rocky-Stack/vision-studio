import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    getPath: (name: 'userData' | 'documents' | 'downloads' | 'pictures') => Promise<string>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
    saveFile: (options: { defaultPath?: string; filters?: any[] }) => Promise<string | null>;
  };
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    reset: () => Promise<void>;
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
    }>;
  };
  models: {
    list: () => Promise<any[]>;
    download: (modelId: string) => Promise<{ success: boolean; message?: string }>;
    getStatus: (modelId: string) => Promise<any>;
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
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    saveFile: (options) => ipcRenderer.invoke('dialog:save-file', options),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    reset: () => ipcRenderer.invoke('store:reset'),
  },
  generation: {
    generateImage: (params) => ipcRenderer.invoke('generation:generate-image', params),
    generateVideo: (params) => ipcRenderer.invoke('generation:generate-video', params),
    batch: (params) => ipcRenderer.invoke('generation:batch', params),
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
