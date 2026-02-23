import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string;
}

export interface GenerationJob {
  id: string;
  type: 'image' | 'video';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  params: Record<string, any>;
  result?: {
    images?: string[];
    video?: string;
    seed?: number;
    [key: string]: any;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'youtube' | 'marketing' | 'art';
  thumbnail: string;
  settings: {
    width: number;
    height: number;
    model: string;
    steps: number;
    cfgScale: number;
    prompt: string;
    negativePrompt: string;
  };
}

export interface BatchJob {
  id: string;
  name: string;
  prompts: string[];
  currentIndex: number;
  completedJobs: string[];
  failedJobs: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
}

// Predefined templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'High-impact 1280x720 thumbnail for YouTube videos',
    category: 'youtube',
    thumbnail: '🎬',
    settings: {
      width: 1280,
      height: 720,
      model: 'flux-dev',
      steps: 25,
      cfgScale: 7.5,
      prompt: 'cinematic YouTube thumbnail, dramatic lighting, bold text overlay area, professional, high contrast, vibrant colors',
      negativePrompt: 'blurry, low quality, distorted, ugly'
    }
  },
  {
    id: 'tiktok-vertical',
    name: 'TikTok/Reels',
    description: '9:16 vertical format for short-form video',
    category: 'social',
    thumbnail: '📱',
    settings: {
      width: 720,
      height: 1280,
      model: 'flux-dev',
      steps: 25,
      cfgScale: 7.5,
      prompt: 'vertical mobile content, vibrant colors, eye-catching, social media style, modern aesthetic',
      negativePrompt: 'horizontal, landscape, blurry'
    }
  },
  {
    id: 'instagram-square',
    name: 'Instagram Post',
    description: '1:1 square format for Instagram feed',
    category: 'social',
    thumbnail: '📸',
    settings: {
      width: 1080,
      height: 1080,
      model: 'flux-dev',
      steps: 25,
      cfgScale: 7.5,
      prompt: 'Instagram aesthetic, cohesive color palette, lifestyle photography style, polished, engaging',
      negativePrompt: 'low resolution, blurry, distorted'
    }
  },
  {
    id: 'story-vertical',
    name: 'Stories',
    description: '9:16 format for Instagram/Facebook Stories',
    category: 'social',
    thumbnail: '✨',
    settings: {
      width: 1080,
      height: 1920,
      model: 'flux-dev',
      steps: 20,
      cfgScale: 7.0,
      prompt: 'story format, immersive, full screen, engaging, social media story aesthetic',
      negativePrompt: 'text, watermark, logo'
    }
  },
  {
    id: 'cinematic-wide',
    name: 'Cinematic Wide',
    description: '16:9 widescreen for cinematic content',
    category: 'art',
    thumbnail: '🎞️',
    settings: {
      width: 1920,
      height: 1080,
      model: 'flux-dev',
      steps: 30,
      cfgScale: 7.5,
      prompt: 'cinematic composition, film grain, anamorphic lens, dramatic lighting, movie still, high production value',
      negativePrompt: 'amateur, low quality, distorted, fisheye'
    }
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Clean professional product photography',
    category: 'marketing',
    thumbnail: '🛍️',
    settings: {
      width: 1024,
      height: 1024,
      model: 'flux-dev',
      steps: 30,
      cfgScale: 8.0,
      prompt: 'professional product photography, clean background, studio lighting, commercial quality, sharp focus',
      negativePrompt: 'cluttered background, harsh shadows, blurry, amateur'
    }
  },
  {
    id: 'portrait-mode',
    name: 'AI Portrait',
    description: 'Optimized for AI portrait generation',
    category: 'art',
    thumbnail: '👤',
    settings: {
      width: 896,
      height: 1152,
      model: 'flux-dev',
      steps: 25,
      cfgScale: 7.5,
      prompt: 'portrait, professional headshot, studio lighting, sharp focus, detailed skin texture, flattering angle',
      negativePrompt: 'deformed, ugly, duplicate, blurry, bad anatomy, disfigured, poorly drawn face'
    }
  },
  {
    id: 'wallpaper-4k',
    name: '4K Wallpaper',
    description: 'High-res desktop wallpaper',
    category: 'art',
    thumbnail: '🖥️',
    settings: {
      width: 1920,
      height: 1080,
      model: 'flux-dev',
      steps: 35,
      cfgScale: 7.5,
      prompt: 'desktop wallpaper, detailed, high resolution, crisp, clean composition, visually stunning',
      negativePrompt: 'busy, cluttered, low resolution, blurry'
    }
  }
];

interface AppState {
  // UI State
  sidebarCollapsed: boolean;
  activePanel: 'generate' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch';
  darkMode: boolean;
  
  // Projects
  currentProject: Project | null;
  recentProjects: Project[];
  
  // Generation
  activeJobs: GenerationJob[];
  completedJobs: GenerationJob[];
  
  // Batch
  batchJobs: BatchJob[];
  
  // System
  systemInfo: {
    gpuAvailable: boolean;
    gpuName?: string;
    gpuVram?: string;
    cudaVersion?: string;
    comfyuiConnected: boolean;
    modelsCount: number;
  };
  
  // Models
  availableModels: any[];
  
  // Actions
  toggleSidebar: () => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setCurrentProject: (project: Project | null) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  setSystemInfo: (info: AppState['systemInfo']) => void;
  setAvailableModels: (models: any[]) => void;
  addBatchJob: (batchJob: BatchJob) => void;
  updateBatchJob: (batchId: string, updates: Partial<BatchJob>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      activePanel: 'generate',
      darkMode: true,
      currentProject: null,
      recentProjects: [],
      activeJobs: [],
      completedJobs: [],
      batchJobs: [],
      systemInfo: {
        gpuAvailable: false,
        comfyuiConnected: false,
        modelsCount: 0,
      },
      availableModels: [],

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      
      setActivePanel: (panel) => set({ activePanel: panel }),
      
      setCurrentProject: (project) => set({ currentProject: project }),
      
      addJob: (job) => set((state) => ({ 
        activeJobs: [...state.activeJobs, job] 
      })),
      
      updateJob: (jobId, updates) => set((state) => ({
        activeJobs: state.activeJobs.map((job) =>
          job.id === jobId ? { ...job, ...updates } : job
        ),
      })),
      
      removeJob: (jobId) => set((state) => {
        const job = state.activeJobs.find((j) => j.id === jobId);
        return {
          activeJobs: state.activeJobs.filter((j) => j.id !== jobId),
          completedJobs: job 
            ? [...state.completedJobs, job].slice(-50)
            : state.completedJobs,
        };
      }),
      
      setSystemInfo: (info) => set({ systemInfo: info }),
      
      setAvailableModels: (models) => set({ availableModels: models }),
      
      addBatchJob: (batchJob) => set((state) => ({
        batchJobs: [...state.batchJobs, batchJob]
      })),
      
      updateBatchJob: (batchId, updates) => set((state) => ({
        batchJobs: state.batchJobs.map((batch) =>
          batch.id === batchId ? { ...batch, ...updates } : batch
        ),
      })),
    }),
    {
      name: 'vision-studio-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        darkMode: state.darkMode,
        recentProjects: state.recentProjects,
      }),
    }
  )
);
