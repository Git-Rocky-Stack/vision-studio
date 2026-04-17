import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EditTool, Layer, EditHistoryEntry, ImageAdjustments } from '@/types/editor';
import { DEFAULT_ADJUSTMENTS } from '@/types/editor';
import type {
  PromptHistoryEntry,
  StylePreset,
  GenerationQueueItem,
  BatchResult,
  GenerationDraft,
} from '@/types/generation';
import { BUILT_IN_STYLE_PRESETS } from '@/types/generation';
import type { AssetJobStatus, AssetRecord, DerivedAssetResult } from '@/types/assets';
import { createDerivedAssetRecord, upsertAssetsFromJobStatus } from '@/features/assets/assetRecords';
import type {
  Project,
  Scene,
  CharacterRef,
  RegionLock,
  SceneStatus,
  GenerationConfig,
  MaskType,
} from '@/types/project';
import {
  DEFAULT_GENERATION_CONFIG,
  DEFAULT_SCENE_TRANSITION,
  DEFAULT_SCENE_METADATA,
} from '@/types/project';

/** Lightweight recent-project entry (file-system project, not the storyboard Project). */
export interface RecentProject {
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
  isCustom?: boolean;
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

export type WorkbenchView = 'canvas' | 'viewer' | 'workflow';

// Predefined templates
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

interface AppState {
  // UI State
  sidebarCollapsed: boolean;
  activePanel: 'generate' | 'quick' | 'storyboard' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch';
  activeWorkbenchView: WorkbenchView;
  activeViewerItemId: string | null;
  darkMode: boolean;

  // Recent Projects (file-system level, not storyboard)
  currentProject: RecentProject | null;
  recentProjects: RecentProject[];

  // ─── Phase 1: Storyboard & Surgical AI ──────────────────────────────────
  projects: Project[];
  activeProjectId: string | null;
  activeSceneId: string | null;

  // Region lock mode
  regionMode: boolean;
  activeRegionId: string | null;
  activeMaskTool: MaskType | 'select';
  maskBrushSize: number;
  maskInverted: boolean;

  // Migration
  migrationStatus: 'idle' | 'running' | 'complete' | 'error';
  migrationProgress: number; // 0–100

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
    backendConnected: boolean;
  };

  // Models
  availableModels: any[];

  // -- New state from redesign --

  // Prompt intelligence
  promptHistory: PromptHistoryEntry[];
  favoritePrompts: string[];
  stylePresets: StylePreset[];
  customStylePresets: StylePreset[];

  // Templates
  userTemplates: ProjectTemplate[];

  // Generation queue & batch results
  generationQueue: GenerationQueueItem[];
  batchResults: BatchResult[];

  // Comparison
  comparisonMode: 'off' | 'side-by-side' | 'slider' | 'onion' | 'grid';
  comparisonImages: string[];

  // Assets
  assetLibrary: AssetRecord[];

  // Edit mode
  activeEditTool: EditTool;
  editLayers: Layer[];
  editHistory: EditHistoryEntry[];
  editHistoryIndex: number; // Current position in history (-1 = no history)
  currentImage: string | null;
  currentImageAssetPath: string | null;
  imageAdjustments: ImageAdjustments;
  generationDraft: GenerationDraft | null;

  // Batch view state (shared between BatchPromptQueue & ResultsGrid)
  batchViewMode: 'grid' | 'list' | 'large';
  batchSortBy: 'created' | 'prompt' | 'status';
  batchFilterBy: 'all' | 'completed' | 'failed' | 'favorites';

  // Advanced generation settings (shared between Sidebar & GeneratePanel)
  advancedGeneration: {
    generationType: 'image' | 'video';
    steps: number;
    cfgScale: number;
    scheduler: string;
    clipSkip: number;
    seed: number;
    duration: number;
    fps: number;
  };
  showAdvancedGeneration: boolean;

  // ---- Actions ----

  // Existing actions
  toggleSidebar: () => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setActiveWorkbenchView: (view: WorkbenchView) => void;
  setActiveViewerItemId: (itemId: string | null) => void;
  setCurrentProject: (project: Project | null) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  setSystemInfo: (info: AppState['systemInfo']) => void;
  setAvailableModels: (models: any[]) => void;
  addBatchJob: (batchJob: BatchJob) => void;
  updateBatchJob: (batchId: string, updates: Partial<BatchJob>) => void;

  // Prompt intelligence actions
  addToPromptHistory: (entry: PromptHistoryEntry) => void;
  toggleFavoritePrompt: (prompt: string) => void;
  addCustomStylePreset: (preset: StylePreset) => void;
  removeCustomStylePreset: (id: string) => void;

  // Template actions
  addUserTemplate: (template: ProjectTemplate) => void;
  updateUserTemplate: (id: string, updates: Partial<ProjectTemplate>) => void;
  deleteUserTemplate: (id: string) => void;

  // Generation queue actions
  addToGenerationQueue: (item: GenerationQueueItem) => void;
  removeFromGenerationQueue: (id: string) => void;

  // Batch results actions
  addBatchResult: (result: BatchResult) => void;
  toggleBatchResultFavorite: (id: string) => void;

  // Comparison actions
  setComparisonMode: (mode: AppState['comparisonMode']) => void;
  setComparisonImages: (images: string[]) => void;

  // Asset actions
  syncAssetsFromJobStatus: (status: AssetJobStatus) => void;
  deleteAssetRecord: (assetId: string) => void;
  toggleAssetFavorite: (assetId: string) => void;
  clearAssetLibrary: () => void;
  clearBatchResults: () => void;
  removeAssetsByRoot: (rootPath: string) => void;
  removeAssetRecordsByPaths: (paths: string[]) => void;
  upsertDerivedAsset: (
    result: DerivedAssetResult,
    context: {
      prompt: string;
      negativePrompt?: string;
      model?: string;
      seed?: number;
      params?: Record<string, unknown>;
    }
  ) => void;
  removeBatchResults: (ids: string[]) => void;
  setGenerationDraft: (draft: GenerationDraft | null) => void;
  updateAdvancedGeneration: (patch: Partial<AppState['advancedGeneration']>) => void;
  setShowAdvancedGeneration: (show: boolean) => void;
  setBatchViewMode: (mode: AppState['batchViewMode']) => void;
  setBatchSortBy: (sort: AppState['batchSortBy']) => void;
  setBatchFilterBy: (filter: AppState['batchFilterBy']) => void;

  // Edit mode actions
  setActiveEditTool: (tool: EditTool) => void;
  addEditLayer: (layer: Layer) => void;
  updateEditLayer: (id: string, updates: Partial<Layer>) => void;
  removeEditLayer: (id: string) => void;
  reorderEditLayers: (layerIds: string[]) => void;
  pushEditHistory: (entry: EditHistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setCurrentImage: (imagePath: string | null, assetPath?: string | null) => void;
  setImageAdjustments: (adjustments: Partial<ImageAdjustments>) => void;
  resetImageAdjustments: () => void;

  // ─── Phase 1: Project / Scene / Character actions ────────────────────────

  // Project CRUD
  createProject: (name: string, dimensions?: { width: number; height: number }) => Project;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'dimensions' | 'fps' | 'metadata'>>) => void;

  // Scene CRUD
  addScene: (projectId: string, config?: Partial<Scene>) => Scene;
  deleteScene: (projectId: string, sceneId: string) => void;
  reorderScenes: (projectId: string, sceneIds: string[]) => void;
  duplicateScene: (projectId: string, sceneId: string) => Scene;
  setActiveScene: (id: string | null) => void;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  setSceneStatus: (projectId: string, sceneId: string, status: SceneStatus) => void;

  // Character CRUD
  addCharacter: (projectId: string, char: Omit<CharacterRef, 'id' | 'projectId'>) => CharacterRef;
  updateCharacter: (projectId: string, charId: string, updates: Partial<CharacterRef>) => void;
  deleteCharacter: (projectId: string, charId: string) => void;
  assignCharacterToScene: (projectId: string, sceneId: string, charId: string) => void;
  removeCharacterFromScene: (projectId: string, sceneId: string, charId: string) => void;

  // Region lock CRUD
  createRegionLock: (sceneId: string, frameId: string, config: Partial<RegionLock>) => RegionLock;
  updateRegionLock: (sceneId: string, lockId: string, updates: Partial<RegionLock>) => void;
  deleteRegionLock: (sceneId: string, lockId: string) => void;

  // Region mode state
  setRegionMode: (mode: boolean) => void;
  setActiveRegionId: (id: string | null) => void;
  setActiveMaskTool: (tool: MaskType | 'select') => void;
  setMaskBrushSize: (size: number) => void;
  toggleMaskInverted: () => void;

  // Quick Generate
  quickGenerate: (config: GenerationConfig) => void;
  promoteToProject: (sceneId: string, projectId: string) => void;

  // Migration
  runMigration: () => Promise<void>;
}

function createBaseImageLayer(imagePath: string, assetPath?: string | null): Layer {
  return {
    id: 'base-image-layer',
    name: 'Base Image',
    type: 'image',
    visible: true,
    opacity: 1,
    blendMode: 'Normal',
    locked: false,
    data: {
      previewUrl: imagePath,
      assetPath: assetPath ?? null,
      thumbnail: imagePath,
    },
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // UI State
      sidebarCollapsed: false,
      activePanel: 'generate',
      activeWorkbenchView: 'canvas',
      activeViewerItemId: null,
      darkMode: true,
      currentProject: null,
      recentProjects: [],

      // Phase 1: Storyboard
      projects: [],
      activeProjectId: null,
      activeSceneId: null,
      regionMode: false,
      activeRegionId: null,
      activeMaskTool: 'select',
      maskBrushSize: 20,
      maskInverted: false,
      migrationStatus: 'idle',
      migrationProgress: 0,

      activeJobs: [],
      completedJobs: [],
      batchJobs: [],
      systemInfo: {
        gpuAvailable: false,
        comfyuiConnected: false,
        modelsCount: 0,
        backendConnected: false,
      },
      availableModels: [],

      // New state defaults
      promptHistory: [],
      favoritePrompts: [],
      stylePresets: BUILT_IN_STYLE_PRESETS,
      customStylePresets: [],
      userTemplates: [],
      generationQueue: [],
      batchResults: [],
      comparisonMode: 'off',
      comparisonImages: [],
      assetLibrary: [],
      activeEditTool: 'move',
      editLayers: [],
      editHistory: [],
      editHistoryIndex: -1,
      currentImage: null,
      currentImageAssetPath: null,
      imageAdjustments: { ...DEFAULT_ADJUSTMENTS },
      generationDraft: null,
      batchViewMode: 'grid',
      batchSortBy: 'created',
      batchFilterBy: 'all',
      advancedGeneration: {
        generationType: 'image',
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        clipSkip: 1,
        seed: -1,
        duration: 5,
        fps: 24,
      },
      showAdvancedGeneration: false,

      // --- Existing actions ---

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setActiveWorkbenchView: (view) => set({ activeWorkbenchView: view }),
      setActiveViewerItemId: (itemId) => set({ activeViewerItemId: itemId }),
      setCurrentProject: (project) => set({ currentProject: project }),

      addJob: (job) => set((state) => ({
        activeJobs: [...state.activeJobs.filter((existing) => existing.id !== job.id), job],
      })),

      updateJob: (jobId, updates) => set((state) => {
        const existingJob = state.activeJobs.find((job) => job.id === jobId);
        if (!existingJob) {
          return {
            activeJobs: state.activeJobs,
          };
        }

        const updatedJob = { ...existingJob, ...updates };
        const isTerminal =
          updatedJob.status === 'completed' ||
          updatedJob.status === 'failed' ||
          updatedJob.status === 'cancelled';

        if (!isTerminal) {
          return {
            activeJobs: state.activeJobs.map((job) =>
              job.id === jobId ? updatedJob : job
            ),
          };
        }

        return {
          activeJobs: state.activeJobs.filter((job) => job.id !== jobId),
          completedJobs: [
            updatedJob,
            ...state.completedJobs.filter((job) => job.id !== jobId),
          ].slice(0, 100),
        };
      }),

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

      // --- Prompt intelligence ---

      addToPromptHistory: (entry) => set((state) => ({
        promptHistory: [entry, ...state.promptHistory].slice(0, 50),
      })),

      toggleFavoritePrompt: (prompt) => set((state) => ({
        favoritePrompts: state.favoritePrompts.includes(prompt)
          ? state.favoritePrompts.filter((p) => p !== prompt)
          : [...state.favoritePrompts, prompt],
      })),

      addCustomStylePreset: (preset) => set((state) => ({
        customStylePresets: [...state.customStylePresets, preset],
      })),

      removeCustomStylePreset: (id) => set((state) => ({
        customStylePresets: state.customStylePresets.filter((p) => p.id !== id),
      })),

      // --- Template actions ---

      addUserTemplate: (template) => set((state) => ({
        userTemplates: [...state.userTemplates, template],
      })),

      updateUserTemplate: (id, updates) => set((state) => ({
        userTemplates: state.userTemplates.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      })),

      deleteUserTemplate: (id) => set((state) => ({
        userTemplates: state.userTemplates.filter((t) => t.id !== id),
      })),

      // --- Generation queue ---

      addToGenerationQueue: (item) => set((state) => ({
        generationQueue: [...state.generationQueue, item],
      })),

      removeFromGenerationQueue: (id) => set((state) => ({
        generationQueue: state.generationQueue.filter((i) => i.id !== id),
      })),

      // --- Batch results ---

      addBatchResult: (result) => set((state) => ({
        batchResults: [
          result,
          ...state.batchResults.filter((entry) => entry.id !== result.id),
        ].slice(0, 200),
      })),

      toggleBatchResultFavorite: (id) => set((state) => ({
        batchResults: state.batchResults.map((r) =>
          r.id === id ? { ...r, isFavorite: !r.isFavorite } : r
        ),
      })),

      // --- Comparison ---

      setComparisonMode: (mode) => set({ comparisonMode: mode }),
      setComparisonImages: (images) => set({ comparisonImages: images }),

      // --- Assets ---

      syncAssetsFromJobStatus: (status) => set((state) => ({
        assetLibrary: upsertAssetsFromJobStatus(state.assetLibrary, status),
      })),

      deleteAssetRecord: (assetId) => set((state) => ({
        assetLibrary: state.assetLibrary.filter((asset) => asset.id !== assetId),
      })),

      toggleAssetFavorite: (assetId) => set((state) => ({
        assetLibrary: state.assetLibrary.map((asset) =>
          asset.id === assetId ? { ...asset, favorite: !asset.favorite } : asset
        ),
      })),

      clearAssetLibrary: () => set({ assetLibrary: [] }),
      clearBatchResults: () => set({ batchResults: [] }),
      removeBatchResults: (ids) => set((state) => ({
        batchResults: state.batchResults.filter((result) => !ids.includes(result.id)),
      })),
      removeAssetsByRoot: (rootPath) => set((state) => {
        const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
        return {
          assetLibrary: state.assetLibrary.filter((asset) => {
            const normalizedPath = asset.path.replace(/\\/g, '/');
            return !(
              normalizedPath.startsWith(`${normalizedRoot}/`) ||
              normalizedPath.startsWith('/outputs/')
            );
          }),
        };
      }),
      removeAssetRecordsByPaths: (paths) => set((state) => {
        const normalizedPaths = paths.map((value) => value.replace(/\\/g, '/'));
        return {
          assetLibrary: state.assetLibrary.filter(
            (asset) => !normalizedPaths.includes(asset.path.replace(/\\/g, '/'))
          ),
        };
      }),
      upsertDerivedAsset: (result, context) => set((state) => ({
        assetLibrary: createDerivedAssetRecord(state.assetLibrary, result, context),
      })),
      setGenerationDraft: (draft) => set({ generationDraft: draft }),
      updateAdvancedGeneration: (patch) => set((state) => ({
        advancedGeneration: { ...state.advancedGeneration, ...patch },
      })),
      setShowAdvancedGeneration: (show) => set({ showAdvancedGeneration: show }),
      setBatchViewMode: (mode) => set({ batchViewMode: mode }),
      setBatchSortBy: (sort) => set({ batchSortBy: sort }),
      setBatchFilterBy: (filter) => set({ batchFilterBy: filter }),

      // --- Edit mode ---

      setActiveEditTool: (tool) => set({ activeEditTool: tool }),

      addEditLayer: (layer) => set((state) => ({
        editLayers: [...state.editLayers, layer],
      })),

      updateEditLayer: (id, updates) => set((state) => ({
        editLayers: state.editLayers.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      })),

      removeEditLayer: (id) => set((state) => ({
        editLayers: state.editLayers.filter((l) => l.id !== id),
      })),

      reorderEditLayers: (layerIds) => set((state) => {
        const layerMap = new Map(state.editLayers.map((l) => [l.id, l]));
        return {
          editLayers: layerIds
            .map((id) => layerMap.get(id))
            .filter((l): l is Layer => l !== undefined),
        };
      }),

      pushEditHistory: (entry) => set((state) => {
        // Truncate any "future" history beyond current index
        const truncated = state.editHistory.slice(0, state.editHistoryIndex + 1);
        const newHistory = [...truncated, entry].slice(-100);
        return {
          editHistory: newHistory,
          editHistoryIndex: newHistory.length - 1,
        };
      }),

      undo: () => set((state) => {
        if (state.editHistoryIndex <= 0) return state;
        const newIndex = state.editHistoryIndex - 1;
        return { editHistoryIndex: newIndex };
      }),

      redo: () => set((state) => {
        if (state.editHistoryIndex >= state.editHistory.length - 1) return state;
        const newIndex = state.editHistoryIndex + 1;
        return { editHistoryIndex: newIndex };
      }),

      canUndo: () => useAppStore.getState().editHistoryIndex > 0,
      canRedo: () => useAppStore.getState().editHistoryIndex < useAppStore.getState().editHistory.length - 1,

      setCurrentImage: (imagePath, assetPath) =>
        set({
          currentImage: imagePath,
          currentImageAssetPath: assetPath ?? null,
          editLayers: imagePath ? [createBaseImageLayer(imagePath, assetPath)] : [],
          editHistory: [],
          editHistoryIndex: -1,
          imageAdjustments: { ...DEFAULT_ADJUSTMENTS },
        }),

      setImageAdjustments: (adjustments) => set((state) => ({
        imageAdjustments: { ...state.imageAdjustments, ...adjustments },
      })),

      resetImageAdjustments: () => set({ imageAdjustments: { ...DEFAULT_ADJUSTMENTS } }),

      // ─── Phase 1: Project / Scene / Character actions ────────────────────

      createProject: (name, dimensions) => {
        const now = new Date().toISOString();
        const project: Project = {
          id: crypto.randomUUID(),
          name,
          created: now,
          modified: now,
          dimensions: dimensions ?? { width: 1920, height: 1080 },
          fps: 24,
          characters: [],
          scenes: [],
          metadata: {},
        };
        set((state) => ({ projects: [...state.projects, project] }));
        return project;
      },

      deleteProject: (id) => set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        activeSceneId:
          state.activeProjectId === id ? null : state.activeSceneId,
      })),

      setActiveProject: (id) => set({ activeProjectId: id, activeSceneId: null }),

      updateProject: (id, updates) => set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates, modified: new Date().toISOString() } : p
        ),
      })),

      addScene: (projectId, config) => {
        const now = new Date().toISOString();
        const scene: Scene = {
          id: crypto.randomUUID(),
          orderIndex: 0,
          name: config?.name ?? 'Untitled Scene',
          prompt: config?.prompt ?? '',
          negativePrompt: config?.negativePrompt ?? '',
          generationConfig: config?.generationConfig ?? { ...DEFAULT_GENERATION_CONFIG },
          referenceImages: config?.referenceImages ?? [],
          frames: [],
          regionLocks: [],
          transitions: config?.transitions ?? { ...DEFAULT_SCENE_TRANSITION },
          camera: [],
          metadata: { ...DEFAULT_SCENE_METADATA, created: now, modified: now },
          status: 'draft',
          characterRefs: [],
          thumbnail: config?.thumbnail,
        };
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            const orderIndex = p.scenes.length;
            return {
              ...p,
              scenes: [...p.scenes, { ...scene, orderIndex }],
              modified: now,
            };
          }),
        }));
        return scene;
      },

      deleteScene: (projectId, sceneId) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            scenes: p.scenes
              .filter((s) => s.id !== sceneId)
              .map((s, i) => ({ ...s, orderIndex: i })),
            modified: new Date().toISOString(),
          };
        }),
        activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
      })),

      reorderScenes: (projectId, sceneIds) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          const map = new Map(p.scenes.map((s) => [s.id, s]));
          return {
            ...p,
            scenes: sceneIds
              .map((id, i) => {
                const s = map.get(id);
                return s ? { ...s, orderIndex: i } : null;
              })
              .filter((s): s is Scene => s !== null),
            modified: new Date().toISOString(),
          };
        }),
      })),

      duplicateScene: (projectId, sceneId) => {
        const state = useAppStore.getState();
        const project = state.projects.find((p) => p.id === projectId);
        const scene = project?.scenes.find((s) => s.id === sceneId);
        if (!scene) throw new Error(`Scene ${sceneId} not found`);

        const now = new Date().toISOString();
        const dup: Scene = {
          ...scene,
          id: crypto.randomUUID(),
          name: `${scene.name} (copy)`,
          orderIndex: project.scenes.length,
          metadata: { ...scene.metadata, created: now, modified: now },
          frames: [], // Frames are deep-copied separately if needed
          regionLocks: [],
          status: 'draft',
        };

        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            return { ...p, scenes: [...p.scenes, dup], modified: now };
          }),
        }));
        return dup;
      },

      setActiveScene: (id) => set({ activeSceneId: id }),

      updateScene: (projectId, sceneId, updates) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            scenes: p.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, ...updates, metadata: { ...s.metadata, modified: new Date().toISOString() } }
                : s
            ),
            modified: new Date().toISOString(),
          };
        }),
      })),

      setSceneStatus: (projectId, sceneId, status) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            scenes: p.scenes.map((s) =>
              s.id === sceneId ? { ...s, status } : s
            ),
          };
        }),
      })),

      addCharacter: (projectId, char) => {
        const character: CharacterRef = {
          ...char,
          id: crypto.randomUUID(),
          projectId,
        };
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return { ...p, characters: [...p.characters, character], modified: new Date().toISOString() };
          }),
        }));
        return character;
      },

      updateCharacter: (projectId, charId, updates) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            characters: p.characters.map((c) =>
              c.id === charId ? { ...c, ...updates } : c
            ),
          };
        }),
      })),

      deleteCharacter: (projectId, charId) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            characters: p.characters.filter((c) => c.id !== charId),
            scenes: p.scenes.map((s) => ({
              ...s,
              characterRefs: s.characterRefs.filter((id) => id !== charId),
            })),
            modified: new Date().toISOString(),
          };
        }),
      })),

      assignCharacterToScene: (projectId, sceneId, charId) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            scenes: p.scenes.map((s) => {
              if (s.id !== sceneId) return s;
              if (s.characterRefs.includes(charId)) return s;
              return { ...s, characterRefs: [...s.characterRefs, charId] };
            }),
          };
        }),
      })),

      removeCharacterFromScene: (projectId, sceneId, charId) => set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            scenes: p.scenes.map((s) => {
              if (s.id !== sceneId) return s;
              return { ...s, characterRefs: s.characterRefs.filter((id) => id !== charId) };
            }),
          };
        }),
      })),

      createRegionLock: (sceneId, frameId, config) => {
        const lock: RegionLock = {
          id: crypto.randomUUID(),
          sceneId,
          frameId,
          name: config.name ?? 'Region',
          mask: config.mask ?? { type: 'rectangle', points: [], bounds: { x: 0, y: 0, width: 100, height: 100 }, featherRadius: 2, blendEdges: true },
          targetLayers: config.targetLayers ?? [],
          protectedLayers: config.protectedLayers ?? [],
          generationConfig: config.generationConfig ?? {},
          aiTool: config.aiTool ?? 'generative-fill',
          prompt: config.prompt ?? '',
          strength: config.strength ?? 0.85,
          invertMask: config.invertMask ?? false,
        };
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            scenes: p.scenes.map((s) => {
              if (s.id !== sceneId) return s;
              return { ...s, regionLocks: [...s.regionLocks, lock] };
            }),
          })),
        }));
        return lock;
      },

      updateRegionLock: (sceneId, lockId, updates) => set((state) => ({
        projects: state.projects.map((p) => ({
          ...p,
          scenes: p.scenes.map((s) => {
            if (s.id !== sceneId) return s;
            return {
              ...s,
              regionLocks: s.regionLocks.map((l) =>
                l.id === lockId ? { ...l, ...updates } : l
              ),
            };
          }),
        })),
      })),

      deleteRegionLock: (sceneId, lockId) => set((state) => ({
        projects: state.projects.map((p) => ({
          ...p,
          scenes: p.scenes.map((s) => {
            if (s.id !== sceneId) return s;
            return { ...s, regionLocks: s.regionLocks.filter((l) => l.id !== lockId) };
          }),
        })),
      })),

      // Region mode state
      setRegionMode: (mode) => set((state) => ({
        regionMode: mode,
        activeRegionId: mode ? state.activeRegionId : null,
      })),
      setActiveRegionId: (id) => set({ activeRegionId: id }),
      setActiveMaskTool: (tool) => set({ activeMaskTool: tool }),
      setMaskBrushSize: (size) => set({ maskBrushSize: Math.max(1, Math.min(100, Math.round(size))) }),
      toggleMaskInverted: () => set((s) => ({ maskInverted: !s.maskInverted })),

      quickGenerate: (config) => {
        // Behind the scenes, creates a Scene in the "Quick Captures" project
        const state = useAppStore.getState();
        let quickProject = state.projects.find((p) => p.name === 'Quick Captures');
        if (!quickProject) {
          quickProject = state.createProject('Quick Captures', { width: 1024, height: 1024 });
        }
        const scene = state.addScene(quickProject.id, {
          prompt: '',
          generationConfig: config,
        });
        set({ activeProjectId: quickProject.id, activeSceneId: scene.id });
      },

      promoteToProject: (sceneId, projectId) => {
        const state = useAppStore.getState();
        const sourceProject = state.projects.find((p) =>
          p.scenes.some((s) => s.id === sceneId)
        );
        const scene = sourceProject?.scenes.find((s) => s.id === sceneId);
        if (!scene || !sourceProject) return;

        // Duplicate the scene into the target project
        useAppStore.getState().addScene(projectId, {
          ...scene,
          name: scene.name,
          prompt: scene.prompt,
          negativePrompt: scene.negativePrompt,
          generationConfig: scene.generationConfig,
          thumbnail: scene.thumbnail,
        });

        // Remove from source project
        useAppStore.getState().deleteScene(sourceProject.id, sceneId);
      },

      runMigration: async () => {
        set({ migrationStatus: 'running', migrationProgress: 0 });
        try {
          const state = useAppStore.getState();

          // Create "My Library" project from existing assets
          const libraryProject = state.createProject('My Library', { width: 1024, height: 1024 });

          // Migrate each asset to a scene
          const totalAssets = state.assetLibrary.length;
          for (let i = 0; i < totalAssets; i++) {
            const asset = state.assetLibrary[i];
            useAppStore.getState().addScene(libraryProject.id, {
              name: asset.name,
              prompt: asset.prompt,
              negativePrompt: asset.negativePrompt,
              generationConfig: {
                ...DEFAULT_GENERATION_CONFIG,
                model: asset.model ?? DEFAULT_GENERATION_CONFIG.model,
                width: asset.width ?? DEFAULT_GENERATION_CONFIG.width,
                height: asset.height ?? DEFAULT_GENERATION_CONFIG.height,
                seed: asset.seed ?? -1,
              },
              thumbnail: asset.thumbnail,
              status: 'complete',
            });

            // Update progress
            set({ migrationProgress: Math.round(((i + 1) / totalAssets) * 100) });
          }

          // Create "Quick Captures" project for future single-image generations
          const quickProject = state.projects.find((p) => p.name === 'Quick Captures');
          if (!quickProject) {
            useAppStore.getState().createProject('Quick Captures', { width: 1024, height: 1024 });
          }

          set({ migrationStatus: 'complete', migrationProgress: 100 });
        } catch {
          set({ migrationStatus: 'error', migrationProgress: 0 });
        }
      },
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
// Safe in an Electron renderer context — no external web exposure.
if (typeof window !== 'undefined') {
  (window as unknown as { __VISION_STUDIO_STORE__: typeof useAppStore }).__VISION_STUDIO_STORE__ = useAppStore;
}
