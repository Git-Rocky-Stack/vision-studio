import type { AppSet, AppGet } from '../appStore.types';

const MAX_STEP_IMAGES = 10;

export const generationPreviewInitialState = {
  stepImages: new Map<number, string>(),
  currentStep: 0,
  totalSteps: 0,
  isPreviewActive: false,
  // #33: the job the preview canvas is tracking + the last Studio run failure
  // (session-only - never persisted).
  previewJobId: null as string | null,
  previewError: null as string | null,
};

export function createGenerationPreviewActions(set: AppSet, _get: AppGet) {
  return {
    addStepImage: (step: number, imageData: string) =>
      set((state) => {
        const next = new Map(state.stepImages);
        next.set(step, imageData);
        // Evict oldest entries when cap exceeded
        if (next.size > MAX_STEP_IMAGES) {
          const sorted = [...next.keys()].sort((a, b) => a - b);
          const evictCount = next.size - MAX_STEP_IMAGES;
          for (let i = 0; i < evictCount; i++) {
            next.delete(sorted[i]);
          }
        }
        return {
          stepImages: next,
          // #33: monotonic - a throttled frame landing after a poll-driven
          // setPreviewStep must not step the counter backwards.
          currentStep: Math.max(state.currentStep, step),
          isPreviewActive: true,
        };
      }),

    setTotalSteps: (total: number) => set({ totalSteps: total }),

    beginPreview: (jobId: string, totalSteps: number) =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps,
        isPreviewActive: true,
        previewJobId: jobId,
        previewError: null,
      }),

    setPreviewStep: (step: number) =>
      set((state) => (step > state.currentStep ? { currentStep: step } : state)),

    setPreviewError: (message: string | null) => set({ previewError: message }),

    clearPreview: () =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps: 0,
        isPreviewActive: false,
        previewJobId: null,
        // previewError intentionally survives the teardown so the user can
        // still read why the run ended.
      }),

    setPreviewActive: (active: boolean) => set({ isPreviewActive: active }),
  };
}
