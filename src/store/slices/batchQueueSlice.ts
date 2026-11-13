import type {
  AppGet,
  AppSet,
  BatchNotice,
  BatchQueuePrompt,
  BatchSeedStrategy,
} from '../appStore.types';

/**
 * The Batch prompt queue (#J14). Session state, never persisted: the queue
 * lives in the store rather than in BatchPanel so a batch keeps its cards,
 * statuses and results while the panel is unmounted (the job watcher writes
 * outcomes here by job id), and so reorder / import / duplicate / clear are
 * plain, testable actions.
 */

export function createBatchQueuePrompt(prompt = ''): BatchQueuePrompt {
  return { id: crypto.randomUUID(), prompt, status: 'pending' };
}

/** Largest seed the backend accepts (backend SEED_MAX, 2^32 - 1). */
export const BATCH_SEED_MAX = 4294967295;

export const batchQueueInitialState = {
  batchQueue: [createBatchQueuePrompt()] as BatchQueuePrompt[],
  batchSeedStrategy: { mode: 'random', baseSeed: 42 } as BatchSeedStrategy,
  activeBatchId: null as string | null,
  batchNotice: null as BatchNotice | null,
};

function isBlankQueue(queue: BatchQueuePrompt[]) {
  return queue.every((entry) => !entry.prompt.trim() && !entry.jobId);
}

function clampSeed(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(BATCH_SEED_MAX, Math.max(0, Math.round(value)));
}

export function createBatchQueueActions(set: AppSet, get: AppGet) {
  return {
    addBatchQueuePrompt: (prompt = '') =>
      set((state) => ({ batchQueue: [...state.batchQueue, createBatchQueuePrompt(prompt)] })),

    /**
     * Appends imported prompts. A queue that holds nothing but blank cards is
     * replaced instead, so importing into a fresh panel does not leave an empty
     * card on top. Returns how many prompts were added.
     */
    appendBatchQueuePrompts: (prompts: string[]) => {
      const added = prompts
        .map((prompt) => prompt.trim())
        .filter(Boolean)
        .map((prompt) => createBatchQueuePrompt(prompt));
      if (added.length === 0) return 0;
      set((state) => ({
        batchQueue: isBlankQueue(state.batchQueue) ? added : [...state.batchQueue, ...added],
      }));
      return added.length;
    },

    updateBatchQueuePrompt: (id: string, patch: Partial<Omit<BatchQueuePrompt, 'id'>>) =>
      set((state) => ({
        batchQueue: state.batchQueue.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      })),

    updateBatchQueuePromptByJob: (
      jobId: string,
      patch: Partial<Omit<BatchQueuePrompt, 'id' | 'jobId'>>,
    ) => {
      if (!get().batchQueue.some((entry) => entry.jobId === jobId)) return;
      set((state) => ({
        batchQueue: state.batchQueue.map((entry) =>
          entry.jobId === jobId ? { ...entry, ...patch } : entry,
        ),
      }));
    },

    /** The queue always keeps one card to type into. */
    removeBatchQueuePrompt: (id: string) =>
      set((state) =>
        state.batchQueue.length > 1
          ? { batchQueue: state.batchQueue.filter((entry) => entry.id !== id) }
          : {},
      ),

    /** Inserts a fresh, unsubmitted copy of the card directly after it. */
    duplicateBatchQueuePrompt: (id: string) =>
      set((state) => {
        const index = state.batchQueue.findIndex((entry) => entry.id === id);
        if (index === -1) return {};
        const next = [...state.batchQueue];
        next.splice(index + 1, 0, createBatchQueuePrompt(state.batchQueue[index].prompt));
        return { batchQueue: next };
      }),

    /** Moves `activeId` into the position currently held by `overId`. */
    moveBatchQueuePrompt: (activeId: string, overId: string) =>
      set((state) => {
        if (activeId === overId) return {};
        const from = state.batchQueue.findIndex((entry) => entry.id === activeId);
        const to = state.batchQueue.findIndex((entry) => entry.id === overId);
        if (from === -1 || to === -1) return {};
        const next = [...state.batchQueue];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { batchQueue: next };
      }),

    clearBatchQueue: () => set({ batchQueue: [createBatchQueuePrompt()], batchNotice: null }),

    setBatchQueue: (prompts: BatchQueuePrompt[]) =>
      set({ batchQueue: prompts.length > 0 ? prompts : [createBatchQueuePrompt()] }),

    setBatchSeedStrategy: (patch: Partial<BatchSeedStrategy>) =>
      set((state) => ({
        batchSeedStrategy: {
          ...state.batchSeedStrategy,
          ...patch,
          ...(patch.baseSeed !== undefined ? { baseSeed: clampSeed(patch.baseSeed) } : {}),
        },
      })),

    setActiveBatchId: (batchId: string | null) => set({ activeBatchId: batchId }),

    setBatchNotice: (notice: BatchNotice | null) => set({ batchNotice: notice }),
  };
}

/**
 * Seeds for `count` prompts under a strategy. 'random' draws an explicit seed
 * per prompt so every result is reproducible from its recorded seed.
 */
export function resolveBatchSeeds(
  strategy: BatchSeedStrategy,
  count: number,
  random: () => number = Math.random,
): number[] {
  const base = clampSeed(strategy.baseSeed);
  return Array.from({ length: count }, (_, index) => {
    if (strategy.mode === 'fixed') return base;
    if (strategy.mode === 'increment') return (base + index) % (BATCH_SEED_MAX + 1);
    return Math.floor(random() * (BATCH_SEED_MAX + 1));
  });
}
