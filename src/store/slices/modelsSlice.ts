import type { AppSet, AppGet, DownloadActionResult } from '../appStore.types';
import { pushNotice } from '@/features/notices/notices';
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

/** The catalog's default still-image model, used when nothing is installed yet. */
export const DEFAULT_IMAGE_MODEL_ID = 'flux-dev';

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
  // #34 PR3: mirror of the GeneratePanel's live image-checkpoint selection
  // (its default), so panels outside GeneratePanel can show honest
  // per-checkpoint install/compat state. Session-only, never persisted.
  selectedImageModelId: DEFAULT_IMAGE_MODEL_ID as string,
};

type DownloadVerb = 'start' | 'pause' | 'resume' | 'cancel';

/** The bridge resolves `{ success: false, error }` on a backend failure instead of throwing. */
interface ErrorEnvelope {
  success: false;
  error?: string;
}

function readErrorEnvelope(response: unknown): string | null {
  if (!response || typeof response !== 'object') {
    return 'the backend returned no download job';
  }
  const record = response as { success?: unknown; error?: unknown; model_id?: unknown };
  if (record.success === false) {
    return typeof record.error === 'string' && record.error ? record.error : 'the backend refused the request';
  }
  if (typeof record.model_id !== 'string' || !record.model_id) {
    return 'the backend returned no download job';
  }
  return null;
}

export function createModelsActions(set: AppSet, get: AppGet) {
  const mergeJob = (jobLike: DownloadJob | null | undefined) => {
    if (!jobLike || !jobLike.model_id) return;
    set((state) => ({
      downloads: { ...state.downloads, [jobLike.model_id]: jobLike },
    }));
  };

  /**
   * Runs one download control against the bridge. A failure leaves the known
   * queue intact (local-first) but is no longer silent: the user gets a notice
   * naming the model and the reason, and the caller gets a result to act on.
   */
  const runDownloadAction = async (
    verb: DownloadVerb,
    modelId: string,
    call: () => Promise<DownloadJob | ErrorEnvelope | null | undefined>,
  ): Promise<DownloadActionResult> => {
    try {
      const response = await call();
      const failure = readErrorEnvelope(response);
      if (failure !== null) {
        return reportDownloadFailure(verb, modelId, failure);
      }
      mergeJob(response as DownloadJob);
      return { ok: true };
    } catch (error) {
      return reportDownloadFailure(
        verb,
        modelId,
        error instanceof Error && error.message ? error.message : 'the backend did not respond',
      );
    }
  };

  const reportDownloadFailure = (
    verb: DownloadVerb,
    modelId: string,
    reason: string,
  ): DownloadActionResult => {
    const name = get().availableModels.find((model) => model.id === modelId)?.name ?? modelId;
    pushNotice('error', `Could not ${verb} the download of ${name}: ${reason}`);
    return { ok: false, error: reason };
  };

  return {
    setAvailableModels: (models: ModelRecord[]) => set({ availableModels: models }),
    setSelectedImageModelId: (modelId: string) => set({ selectedImageModelId: modelId }),
    loadModels: async () => {
      try {
        const models = await window.electron.models.list();
        set({ availableModels: models });
      } catch {
        // Local-first: a backend hiccup must not wipe the known catalog.
      }
    },

    // Downloads -----------------------------------------------------------
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
    enqueueDownload: (modelId: string) =>
      runDownloadAction('start', modelId, () => window.electron.models.download(modelId)),
    pauseDownload: (modelId: string) =>
      runDownloadAction('pause', modelId, () => window.electron.models.downloadPause(modelId)),
    resumeDownload: (modelId: string) =>
      runDownloadAction('resume', modelId, () => window.electron.models.downloadResume(modelId)),
    cancelDownload: (modelId: string) =>
      runDownloadAction('cancel', modelId, () => window.electron.models.downloadCancel(modelId)),

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

// Only records a generation pipeline can actually load belong in the model
// pickers. Auxiliary records (loras, controlnets, annotators, ip-adapters,
// #34 edit-model weights) are capability-tagged too, but they are not
// checkpoints - listing them was a pre-existing leak fixed in #34.
const SELECTABLE_ARTIFACT_TYPES = new Set(['checkpoint', 'diffusers-pipeline']);

/** Filter helper: records routable for a given generation capability. */
export function selectModelsByCapability(
  models: ModelRecord[],
  generationType: 'image' | 'video',
): ModelRecord[] {
  const wanted: ModelCapability[] =
    generationType === 'video' ? ['video'] : ['image', 'edit', 'inpaint'];
  return models.filter(
    (model) =>
      SELECTABLE_ARTIFACT_TYPES.has(model.artifact_type) &&
      wanted.includes(model.capability),
  );
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

/**
 * Installed LoRA records (artifact_type 'lora'), present on disk. Generic so
 * narrower model projections (e.g. the workflow execution context, #43) reuse
 * the same installed-LoRA rule as the mixer.
 */
export function selectInstalledLoras<
  T extends { artifact_type?: string; availability?: string },
>(models: T[]): T[] {
  return models.filter(
    (model) =>
      model.artifact_type === 'lora' &&
      (model.availability ?? 'available') !== 'unavailable',
  );
}

function isInstalledImageCheckpoint(model: ModelRecord) {
  return (
    SELECTABLE_ARTIFACT_TYPES.has(model.artifact_type) &&
    model.capability === 'image' &&
    model.status === 'ready' &&
    (model.availability ?? 'available') !== 'unavailable'
  );
}

/** True when `modelId` is a still-image checkpoint present on disk. */
export function isImageModelInstalled(models: ModelRecord[], modelId: string): boolean {
  return models.some((model) => model.id === modelId && isInstalledImageCheckpoint(model));
}

/**
 * The still-image model a template should default to (#J16): `preferred` when
 * it is installed, else the first installed image checkpoint, else the
 * catalog default (first run, before the core set has landed).
 */
export function resolveDefaultImageModelId(models: ModelRecord[], preferred?: string): string {
  if (preferred && isImageModelInstalled(models, preferred)) return preferred;
  return models.find(isInstalledImageCheckpoint)?.id ?? DEFAULT_IMAGE_MODEL_ID;
}
