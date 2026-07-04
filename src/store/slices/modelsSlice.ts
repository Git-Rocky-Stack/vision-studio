import type { AppSet, AppGet, AppState } from '../appStore.types';
import type {
  ModelRecord,
  ModelCapability,
  DownloadJob,
  LibraryRoot,
  DetectedRoot,
  LayoutHint,
  SearchResult,
  SearchResponse,
  SearchSource,
  ConsentKind,
  HardwareProfile,
  RuntimePlan,
} from '@/types/model';

export const modelsInitialState = {
  availableModels: [] as ModelRecord[],
  downloads: {} as Record<string, DownloadJob>,
  libraryRoots: [] as LibraryRoot[],
  detectedRoots: [] as DetectedRoot[],
  // Hub search (M4). Transient browse state - none of it is persisted
  // (the appStore partialize allowlist excludes the whole group).
  searchResults: [] as SearchResult[],
  searchStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'offline',
  searchQuery: '',
  searchSource: 'hf' as SearchSource,
  searchPage: 1,
  searchWarning: null as string | null,
  // Session-only CivitAI NSFW opt-in. Deliberately NOT persisted: every
  // session starts safe-search-on.
  nsfwOptIn: false,
  // GPU/CPU snapshot (M5). Deliberately NOT persisted - hardware can change
  // between sessions (driver updates, eGPU, VRAM pressure), so a stale
  // profile is worse than none. The appStore partialize allowlist excludes it.
  hardwareProfile: null as HardwareProfile | null,
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
        set({ availableModels: models });
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
        const job = await window.electron.models.download(modelId);
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

    // Library roots ---------------------------------------------------------
    loadLibraryRoots: async () => {
      try {
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        set({ libraryRoots: roots });
      } catch {
        // Local-first: keep last-known roots on a backend hiccup.
      }
    },
    addLibraryRoot: async (path: string, layoutHint: LayoutHint) => {
      try {
        await window.electron.models.importRoot(path, layoutHint);
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        const models = await window.electron.models.list();
        set({ libraryRoots: roots, availableModels: models });
      } catch {
        /* local-first */
      }
    },
    removeLibraryRoot: async (rootId: string) => {
      try {
        await window.electron.models.librariesRemove(rootId);
        const roots = (await window.electron.models.librariesList()) as LibraryRoot[];
        const models = await window.electron.models.list();
        set({ libraryRoots: roots, availableModels: models });
      } catch {
        /* local-first */
      }
    },
    scanLibraries: async () => {
      try {
        await window.electron.models.scan();
        const models = await window.electron.models.list();
        set({ availableModels: models });
      } catch {
        /* local-first */
      }
    },
    detectLibraries: async () => {
      try {
        const offers = (await window.electron.models.librariesDetect()) as DetectedRoot[];
        set({ detectedRoots: offers });
      } catch {
        /* local-first */
      }
    },

    // Hub search (M4) ------------------------------------------------------
    searchModels: async (query: string, source: SearchSource, page = 1) => {
      set({ searchStatus: 'loading', searchQuery: query, searchSource: source, searchPage: page });
      // NSFW is a CivitAI-only concept; HF searches always send false.
      const nsfw = source === 'civitai' ? get().nsfwOptIn : false;
      try {
        const response = (await window.electron.models.search(
          query,
          source,
          page,
          nsfw,
        )) as SearchResponse;
        set({
          searchResults: response.results ?? [],
          searchStatus: response.offline ? 'offline' : 'ready',
          searchWarning: response.warning ?? null,
        });
      } catch {
        // Local-first: the IPC layer already degrades to an offline envelope;
        // this guards the bridge itself dying mid-flight.
        set({ searchResults: [], searchStatus: 'offline', searchWarning: null });
      }
    },
    setNsfwOptIn: (optIn: boolean) => set({ nsfwOptIn: optIn }),
    // Consent + convert deliberately do NOT swallow errors like the
    // local-first actions above: a consent grant that did not persist or a
    // failed conversion must surface to the caller, never be silently lost.
    // (The IPC layer returns {success:false, error} envelopes for backend
    // errors; a rejection here means the bridge itself failed.)
    grantConsent: async (modelId: string, kind: ConsentKind, granted: boolean) => {
      return window.electron.models.consent(modelId, kind, granted);
    },
    convertModel: async (modelId: string) => window.electron.models.convert(modelId),

    // Hardware + preflight (M5) -------------------------------------------
    loadHardwareProfile: async () => {
      try {
        const profile = await window.electron.hardware.get();
        if (profile && typeof profile === 'object' && 'success' in profile) {
          // {success:false, error} envelope: treat like a bridge failure and
          // keep the last-known profile (local-first).
          return;
        }
        set({ hardwareProfile: profile as HardwareProfile });
      } catch {
        // Local-first: a backend hiccup must not wipe the last-known profile.
      }
    },
    // resolveRuntime deliberately does NOT swallow errors like the
    // local-first actions above: preflight truth must surface to the caller,
    // never be silently lost (same deviation as consent/convert). The IPC
    // layer returns {success:false, error} envelopes for backend errors;
    // those are normalized to throws here, and a rejection means the bridge
    // itself failed.
    resolveRuntime: async (modelId: string): Promise<RuntimePlan> => {
      const plan = await window.electron.models.resolveRuntime(modelId);
      if (plan && typeof plan === 'object' && 'success' in plan && plan.success === false) {
        throw new Error(plan.error || 'Runtime preflight failed');
      }
      return plan as RuntimePlan;
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

/**
 * #136: families a checkpoint of the given base architecture can load LoRAs
 * from. 'sd-unet-family' is the classifier's label for sd15/sdxl non-DiT loras
 * (kohya/diffusers unet- or te-targeting), so it is accepted by both bases and
 * by AnimateDiff (SD1.5 spatial UNet).
 */
const LORA_COMPATIBILITY: Record<string, string[]> = {
  flux: ['flux'],
  sdxl: ['sdxl', 'sd-unet-family'],
  sd15: ['sd15', 'sd-unet-family'],
  sd35: ['sd35'],
  animatediff: ['animatediff', 'sd15', 'sd-unet-family'],
  ltx: ['ltx'],
  svd: [],
};

/** True when a LoRA of `loraFamily` can stack on a `checkpointFamily` pipeline. */
export function isLoraCompatible(
  checkpointFamily: string | null,
  loraFamily: string,
): boolean {
  if (!checkpointFamily) return false;
  const allowed = LORA_COMPATIBILITY[checkpointFamily];
  return allowed ? allowed.includes(loraFamily) : false;
}

/** Installed LoRA records (artifact_type 'lora'), present on disk. */
export function selectInstalledLoras(models: ModelRecord[]): ModelRecord[] {
  return models.filter(
    (model) =>
      model.artifact_type === 'lora' &&
      (model.availability ?? 'available') !== 'unavailable',
  );
}

/** Selector: the live download job for a model id, or null. */
export function selectDownloadFor(state: AppState, modelId: string): DownloadJob | null {
  return state.downloads[modelId] ?? null;
}
