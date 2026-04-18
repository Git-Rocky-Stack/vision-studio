import type { AppSet, AppGet } from '../appStore.types';

const MAX_STEP_IMAGES = 10;

export const generationPreviewInitialState = {
  stepImages: new Map<number, string>(),
  currentStep: 0,
  totalSteps: 0,
  isPreviewActive: false,
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
          currentStep: step,
          isPreviewActive: true,
        };
      }),

    setTotalSteps: (total: number) => set({ totalSteps: total }),

    clearPreview: () =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps: 0,
        isPreviewActive: false,
      }),

    setPreviewActive: (active: boolean) => set({ isPreviewActive: active }),
  };
}