import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState } from './appStore.types';
import type { ProjectTemplate } from '@/types/template';

// Slice imports
import { uiInitialState, createUIActions } from './slices/uiSlice';
import { editInitialState, createEditActions } from './slices/editSlice';
import { generationInitialState, createGenerationActions } from './slices/generationSlice';
import { projectInitialState, createProjectActions } from './slices/projectSlice';
import { workflowInitialState, createWorkflowActions } from './slices/workflowSlice';

// Re-exports: local types
export type {
  RecentProject,
  GenerationJobParams,
  GenerationJobResult,
  GenerationJob,
  BatchJob,
} from './appStore.types';

// Re-exports: external types (backward compat for consumers importing from this module)
export type {
  WorkbenchView,
  WorkflowStepState,
  WorkflowStepRecord,
  WorkflowRunRecord,
  WorkflowRunInput,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphInput,
  WorkflowGraphEdge,
  WorkflowRecord,
} from '@/types/workflow';

export type { ProjectTemplate } from '@/types/template';
export type { ModelInfo, ModelStatus } from '@/types/model';

// Re-exports: constants now owned by slices
export { DEFAULT_WORKFLOWS } from './slices/workflowSlice';

// Predefined project templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'High-impact 1280x720 thumbnail for YouTube videos',
    category: 'youtube',
    thumbnail: 'YT',
    settings: {
      width: 1280, height: 720, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'cinematic YouTube thumbnail, dramatic lighting, bold text overlay area, professional, high contrast, vibrant colors',
      negativePrompt: 'blurry, low quality, distorted, ugly'
    }
  },
  {
    id: 'tiktok-vertical',
    name: 'TikTok/Reels',
    description: '9:16 vertical format for short-form video',
    category: 'social',
    thumbnail: '9:16',
    settings: {
      width: 720, height: 1280, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'vertical mobile content, vibrant colors, eye-catching, social media style, modern aesthetic',
      negativePrompt: 'horizontal, landscape, blurry'
    }
  },
  {
    id: 'instagram-square',
    name: 'Instagram Post',
    description: '1:1 square format for Instagram feed',
    category: 'social',
    thumbnail: '1:1',
    settings: {
      width: 1080, height: 1080, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'Instagram aesthetic, cohesive color palette, lifestyle photography style, polished, engaging',
      negativePrompt: 'low resolution, blurry, distorted'
    }
  },
  {
    id: 'story-vertical',
    name: 'Stories',
    description: '9:16 format for Instagram/Facebook Stories',
    category: 'social',
    thumbnail: 'ST',
    settings: {
      width: 1080, height: 1920, model: 'flux-dev', steps: 20, cfgScale: 7.0,
      prompt: 'story format, immersive, full screen, engaging, social media story aesthetic',
      negativePrompt: 'text, watermark, logo'
    }
  },
  {
    id: 'cinematic-wide',
    name: 'Cinematic Wide',
    description: '16:9 widescreen for cinematic content',
    category: 'art',
    thumbnail: 'CIN',
    settings: {
      width: 1920, height: 1080, model: 'flux-dev', steps: 30, cfgScale: 7.5,
      prompt: 'cinematic composition, film grain, anamorphic lens, dramatic lighting, movie still, high production value',
      negativePrompt: 'amateur, low quality, distorted, fisheye'
    }
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Clean professional product photography',
    category: 'marketing',
    thumbnail: 'PRD',
    settings: {
      width: 1024, height: 1024, model: 'flux-dev', steps: 30, cfgScale: 8.0,
      prompt: 'professional product photography, clean background, studio lighting, commercial quality, sharp focus',
      negativePrompt: 'cluttered background, harsh shadows, blurry, amateur'
    }
  },
  {
    id: 'portrait-mode',
    name: 'AI Portrait',
    description: 'Optimized for AI portrait generation',
    category: 'art',
    thumbnail: 'POR',
    settings: {
      width: 896, height: 1152, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'portrait, professional headshot, studio lighting, sharp focus, detailed skin texture, flattering angle',
      negativePrompt: 'deformed, ugly, duplicate, blurry, bad anatomy, disfigured, poorly drawn face'
    }
  },
  {
    id: 'wallpaper-4k',
    name: '4K Wallpaper',
    description: 'High-res desktop wallpaper',
    category: 'art',
    thumbnail: '4K',
    settings: {
      width: 1920, height: 1080, model: 'flux-dev', steps: 35, cfgScale: 7.5,
      prompt: 'desktop wallpaper, detailed, high resolution, crisp, clean composition, visually stunning',
      negativePrompt: 'busy, cluttered, low resolution, blurry'
    }
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...uiInitialState,
      ...createUIActions(set, get),
      ...editInitialState,
      ...createEditActions(set, get),
      ...generationInitialState,
      ...createGenerationActions(set, get),
      ...projectInitialState,
      ...createProjectActions(set, get),
      ...workflowInitialState,
      ...createWorkflowActions(set, get),
    }),
    {
      name: 'vision-studio-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        darkMode: state.darkMode,
        recentProjects: state.recentProjects,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeSceneId: state.activeSceneId,
        migrationStatus: state.migrationStatus,
        promptHistory: state.promptHistory.slice(0, 50),
        favoritePrompts: state.favoritePrompts,
        customStylePresets: state.customStylePresets,
        userTemplates: state.userTemplates,
        batchResults: state.batchResults.slice(0, 200),
        assetLibrary: state.assetLibrary.slice(0, 500),
      }),
    }
  )
);

// Expose the store on window for E2E test seeding and debugging.
// Safe in an Electron renderer context - no external web exposure.
if (typeof window !== 'undefined') {
  (window as unknown as { __VISION_STUDIO_STORE__: typeof useAppStore }).__VISION_STUDIO_STORE__ = useAppStore;
}