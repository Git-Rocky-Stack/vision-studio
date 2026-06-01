import type { AppSet, AppGet, AppState } from '../appStore.types';
import type { ModelRecord, ModelCapability, DownloadJob } from '@/types/model';

export const modelsInitialState = {
  availableModels: [] as ModelRecord[],
  downloads: {} as Record<string, DownloadJob>,
};

export function createModelsActions(set: AppSet, get: AppGet) {
  const mergeJob = (jobLike: DownloadJob | null | undefined) => {
    if (!jobLike || !jobLike.model_id) return;
    set((state) => ({
      downloads: { ...state.downloads, [jobLike.model_id]: jobLike },
    }));
  };

  return {
    setAvailableModels: (models: ModelRecord[]) => set({ availableModels: models }),
    loadModels: async () => {
      try {
        const models = await window.electron.models.list();
        set({ availableModels: models as ModelRecord[] });
      } catch {
        // Local-first: a backend hiccup must not wipe the known catalog.
      }
    },

    // Downloads -----------------------------------------------------------
    setDownloadJob: (job: DownloadJob) => mergeJob(job),
    refreshDownloads: async () => {
      try {
        const jobs = (await window.electron.models.downloadsList()) as DownloadJob[];
        const next: Record<string, DownloadJob> = {};
        for (const job of jobs) next[job.model_id] = job;
        set({ downloads: next });
      } catch {
        // Local-first: keep the last-known queue on a backend hiccup.
      }
    },
    enqueueDownload: async (modelId: string) => {
      try {
        const job = (await window.electron.models.download(modelId)) as DownloadJob;
        mergeJob(job);
      } catch {
        // Swallow: the existing downloads map is left intact.
      }
    },
    pauseDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadPause(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
    resumeDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadResume(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
    cancelDownload: async (modelId: string) => {
      try {
        mergeJob((await window.electron.models.downloadCancel(modelId)) as DownloadJob);
      } catch {
        /* local-first */
      }
    },
  };
}

/** Filter helper: records routable for a given generation capability. */
export function selectModelsByCapability(
  models: ModelRecord[],
  generationType: 'image' | 'video',
): ModelRecord[] {
  const wanted: ModelCapability[] =
    generationType === 'video' ? ['video'] : ['image', 'edit', 'inpaint'];
  return models.filter((model) => wanted.includes(model.capability));
}

/** Selector: the live download job for a model id, or null. */
export function selectDownloadFor(state: AppState, modelId: string): DownloadJob | null {
  return state.downloads[modelId] ?? null;
}
