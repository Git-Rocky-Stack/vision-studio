/**
 * Type definitions for Electron API exposed via contextBridge
 */

export interface GenerationParams {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed?: number;
  model?: string;
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

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
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

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
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
    generateImage: (params: GenerationParams) => Promise<JobResponse>;
    generateVideo: (params: VideoGenerationParams) => Promise<JobResponse>;
    batch: (params: BatchParams) => Promise<JobResponse>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean }>;
    listJobs: (options?: { status?: string; limit?: number }) => Promise<{ jobs: any[] }>;
    onProgress: (callback: (data: any) => void) => () => void;
  };
  system: {
    getInfo: () => Promise<SystemInfo>;
  };
  models: {
    list: () => Promise<ModelInfo[]>;
    download: (modelId: string) => Promise<{ success: boolean; message?: string }>;
    getStatus: (modelId: string) => Promise<ModelInfo | null>;
  };
  backend: {
    start: () => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ running: boolean; pid?: number }>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
