import type { ProjectTemplate } from '@/types/template';
import type { ModelInfo } from '@/types/model';
import type { PromptHistoryEntry, StylePreset, GenerationQueueItem, BatchResult, GenerationDraft } from '@/types/generation';
import { BUILT_IN_STYLE_PRESETS } from '@/types/generation';
import type { AssetJobStatus, AssetRecord, DerivedAssetResult } from '@/types/assets';
import { createDerivedAssetRecord, upsertAssetsFromJobStatus } from '@/features/assets/assetRecords';
import type { AppSet, AppGet, AppState, GenerationJob, BatchJob } from '../appStore.types';

export const generationInitialState = {
  activeJobs: [] as GenerationJob[],
  completedJobs: [] as GenerationJob[],
  batchJobs: [] as BatchJob[],
  systemInfo: {
    gpuAvailable: false,
    comfyuiConnected: false,
    modelsCount: 0,
    backendConnected: false,
    backendRunning: false,
    bundledBackend: false,
  },
  availableModels: [] as ModelInfo[],
  promptHistory: [] as PromptHistoryEntry[],
  favoritePrompts: [] as string[],
  customStylePresets: [] as StylePreset[],
  stylePresets: BUILT_IN_STYLE_PRESETS as StylePreset[],
  userTemplates: [] as ProjectTemplate[],
  generationQueue: [] as GenerationQueueItem[],
  batchResults: [] as BatchResult[],
  comparisonMode: 'off' as const,
  comparisonImages: [] as string[],
  assetLibrary: [] as AssetRecord[],
  generationDraft: null as GenerationDraft | null,
  advancedGeneration: {
    generationType: 'image' as const,
    steps: 25,
    cfgScale: 7.5,
    scheduler: 'Euler a',
    clipSkip: 1,
    seed: -1,
    duration: 5,
    fps: 24,
  },
};

export function createGenerationActions(set: AppSet, _get: AppGet) {
  return {
    addJob: (job: GenerationJob) => set((state) => ({
      activeJobs: [...state.activeJobs.filter((existing) => existing.id !== job.id), job],
    })),
    updateJob: (jobId: string, updates: Partial<GenerationJob>) => {
      const state = _get();
      const existingJob = state.activeJobs.find((job) => job.id === jobId);
      if (!existingJob) {
        set((s) => ({ activeJobs: s.activeJobs }));
        return;
      }

      const updatedJob = { ...existingJob, ...updates };
      const isTerminal =
        updatedJob.status === 'completed' ||
        updatedJob.status === 'failed' ||
        updatedJob.status === 'cancelled';

      // When a job completes, add it to the iteration tree
      if (updatedJob.status === 'completed') {
        const thumbnail = (updatedJob.result?.images?.[0]) ?? '';
        const parentId = null; // Root iteration for now; can be wired to re-roll parent later
        state.addIteration({ job: updatedJob, parentId, thumbnail });
      }

      set((s) => {
        if (!isTerminal) {
          return { activeJobs: s.activeJobs.map((job) => job.id === jobId ? updatedJob : job) };
        }

        return {
          activeJobs: s.activeJobs.filter((job) => job.id !== jobId),
          completedJobs: [updatedJob, ...s.completedJobs.filter((job) => job.id !== jobId)].slice(0, 100),
        };
      });
    },
    removeJob: (jobId: string) => set((state) => {
      const job = state.activeJobs.find((j) => j.id === jobId);
      return {
        activeJobs: state.activeJobs.filter((j) => j.id !== jobId),
        completedJobs: job ? [...state.completedJobs, job].slice(-50) : state.completedJobs,
      };
    }),
    deleteCompletedJob: (jobId: string) => set((state) => ({
      completedJobs: state.completedJobs.filter((j) => j.id !== jobId),
    })),
    setSystemInfo: (info: AppState['systemInfo']) => set({ systemInfo: info }),
    setAvailableModels: (models: ModelInfo[]) => set({ availableModels: models }),
    addBatchJob: (batchJob: BatchJob) => set((state) => ({
      batchJobs: [...state.batchJobs, batchJob],
    })),
    updateBatchJob: (batchId: string, updates: Partial<BatchJob>) => set((state) => ({
      batchJobs: state.batchJobs.map((batch) =>
        batch.id === batchId ? { ...batch, ...updates } : batch
      ),
    })),
    addToPromptHistory: (entry: PromptHistoryEntry) => set((state) => ({
      promptHistory: [entry, ...state.promptHistory].slice(0, 50),
    })),
    toggleFavoritePrompt: (prompt: string) => set((state) => ({
      favoritePrompts: state.favoritePrompts.includes(prompt)
        ? state.favoritePrompts.filter((p) => p !== prompt)
        : [...state.favoritePrompts, prompt],
    })),
    addCustomStylePreset: (preset: StylePreset) => set((state) => ({
      customStylePresets: [...state.customStylePresets, preset],
    })),
    removeCustomStylePreset: (id: string) => set((state) => ({
      customStylePresets: state.customStylePresets.filter((p) => p.id !== id),
    })),
    addUserTemplate: (template: ProjectTemplate) => set((state) => ({
      userTemplates: [...state.userTemplates, template],
    })),
    updateUserTemplate: (id: string, updates: Partial<ProjectTemplate>) => set((state) => ({
      userTemplates: state.userTemplates.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),
    deleteUserTemplate: (id: string) => set((state) => ({
      userTemplates: state.userTemplates.filter((t) => t.id !== id),
    })),
    addToGenerationQueue: (item: GenerationQueueItem) => set((state) => ({
      generationQueue: [...state.generationQueue, item],
    })),
    removeFromGenerationQueue: (id: string) => set((state) => ({
      generationQueue: state.generationQueue.filter((i) => i.id !== id),
    })),
    addBatchResult: (result: BatchResult) => set((state) => ({
      batchResults: [result, ...state.batchResults.filter((entry) => entry.id !== result.id)].slice(0, 200),
    })),
    toggleBatchResultFavorite: (id: string) => set((state) => ({
      batchResults: state.batchResults.map((r) =>
        r.id === id ? { ...r, isFavorite: !r.isFavorite } : r
      ),
    })),
    setComparisonMode: (mode: AppState['comparisonMode']) => set({ comparisonMode: mode }),
    setComparisonImages: (images: string[]) => set({ comparisonImages: images }),
    syncAssetsFromJobStatus: (status: AssetJobStatus) => set((state) => ({
      assetLibrary: upsertAssetsFromJobStatus(state.assetLibrary, status),
    })),
    deleteAssetRecord: (assetId: string) => set((state) => ({
      assetLibrary: state.assetLibrary.filter((asset) => asset.id !== assetId),
    })),
    toggleAssetFavorite: (assetId: string) => set((state) => ({
      assetLibrary: state.assetLibrary.map((asset) =>
        asset.id === assetId ? { ...asset, favorite: !asset.favorite } : asset
      ),
    })),
    clearAssetLibrary: () => set({ assetLibrary: [] }),
    clearBatchResults: () => set({ batchResults: [] }),
    removeBatchResults: (ids: string[]) => set((state) => ({
      batchResults: state.batchResults.filter((result) => !ids.includes(result.id)),
    })),
    removeAssetsByRoot: (rootPath: string) => set((state) => {
      const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
      return {
        assetLibrary: state.assetLibrary.filter((asset) => {
          const normalizedPath = asset.path.replace(/\\/g, '/');
          return !(normalizedPath.startsWith(`${normalizedRoot}/`) || normalizedPath.startsWith('/outputs/'));
        }),
      };
    }),
    removeAssetRecordsByPaths: (paths: string[]) => set((state) => {
      const normalizedPaths = paths.map((value) => value.replace(/\\/g, '/'));
      return {
        assetLibrary: state.assetLibrary.filter(
          (asset) => !normalizedPaths.includes(asset.path.replace(/\\/g, '/'))
        ),
      };
    }),
    upsertDerivedAsset: (result: DerivedAssetResult, context: { prompt: string; negativePrompt?: string; model?: string; seed?: number; params?: Record<string, unknown> }) => set((state) => ({
      assetLibrary: createDerivedAssetRecord(state.assetLibrary, result, context),
    })),
    setGenerationDraft: (draft: GenerationDraft | null) => set({ generationDraft: draft }),
    updateAdvancedGeneration: (patch: Partial<AppState['advancedGeneration']>) => set((state) => ({
      advancedGeneration: { ...state.advancedGeneration, ...patch },
    })),
  };
}
