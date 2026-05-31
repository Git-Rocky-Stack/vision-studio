import type { AppSet, AppGet } from '../appStore.types';
import type { ModelRecord, ModelCapability } from '@/types/model';

export const modelsInitialState = {
  availableModels: [] as ModelRecord[],
};

export function createModelsActions(set: AppSet, _get: AppGet) {
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
