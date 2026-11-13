import type { PromptTemplate, CompositionLayerState } from '@/types/promptStudio';
import { BUILT_IN_PROMPT_TEMPLATES } from '@/data/builtInTemplates';
import { ASPECT_RATIOS, computeDimensions, type AspectRatio } from '@/types/resolution';
import type { AppSet, AppGet } from '../appStore.types';
import { isImageModelInstalled } from './modelsSlice';

/**
 * Persisted prompt templates with the built-ins refreshed from the shipped
 * catalog (#J16). promptTemplates is persisted whole, so without this an
 * existing install keeps the built-ins as they were when it first ran (an old
 * model id, an old prompt syntax) forever. Built-ins are replaced by id with
 * the current catalog entry, keeping only the user's own state on them
 * (favorite, last used); built-ins the catalog no longer ships are dropped,
 * and new ones appear. User templates are kept exactly as stored.
 */
export function refreshBuiltInPromptTemplates(
  persisted: readonly PromptTemplate[],
  catalog: readonly PromptTemplate[] = BUILT_IN_PROMPT_TEMPLATES,
): PromptTemplate[] {
  const persistedById = new Map(
    persisted.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t] as const),
  );
  const catalogIds = new Set(catalog.map((t) => t.id));
  const builtIns = catalog.map((template) => {
    const stored = persistedById.get(template.id);
    if (!stored) return template;
    return {
      ...template,
      isFavorite: typeof stored.isFavorite === 'boolean' ? stored.isFavorite : template.isFavorite,
      ...(typeof stored.lastUsedAt === 'number' ? { lastUsedAt: stored.lastUsedAt } : {}),
      ...(typeof stored.createdAt === 'number' ? { createdAt: stored.createdAt } : {}),
    };
  });
  const userTemplates = persisted.filter(
    (t) => t && typeof t.id === 'string' && !t.isBuiltIn && !catalogIds.has(t.id),
  );
  return [...builtIns, ...userTemplates];
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === 'string' && ASPECT_RATIOS.some((option) => option.id === value);
}

export const promptStudioInitialState = {
  promptTemplates: BUILT_IN_PROMPT_TEMPLATES as PromptTemplate[],
  compositionLayers: {
    aspectFrame: { visible: true, opacity: 1 },
    reference: { visible: true, opacity: 1, blendMode: 'normal' as const },
  } satisfies CompositionLayerState,
};

export function createPromptStudioActions(set: AppSet, _get: AppGet) {
  return {
    addUserPromptTemplate: (template: PromptTemplate) =>
      set((state) => ({
        promptTemplates: [...state.promptTemplates, template],
      })),

    deleteUserPromptTemplate: (id: string) =>
      set((state) => ({
        promptTemplates: state.promptTemplates.filter(
          (t) => t.id !== id || t.isBuiltIn,
        ),
      })),

    togglePromptTemplateFavorite: (id: string) =>
      set((state) => ({
        promptTemplates: state.promptTemplates.map((t) =>
          t.id === id ? { ...t, isFavorite: !t.isFavorite } : t,
        ),
      })),

    setCompositionLayerVisibility: (
      layer: keyof CompositionLayerState,
      visible: boolean,
    ) =>
      set((state) => ({
        compositionLayers: {
          ...state.compositionLayers,
          [layer]: { ...state.compositionLayers[layer], visible },
        },
      })),

    setCompositionLayerOpacity: (
      layer: keyof CompositionLayerState,
      opacity: number,
    ) =>
      set((state) => ({
        compositionLayers: {
          ...state.compositionLayers,
          [layer]: { ...state.compositionLayers[layer], opacity },
        },
      })),

    applyPromptTemplate: (id: string, mode: 'replace' | 'merge') => {
      const state = _get();
      const template = state.promptTemplates.find((t) => t.id === id);
      if (!template) return;

      const draft = state.generationDraft;
      // #J16: a template's suggested settings travel with it. The model is
      // only adopted when it is installed - a suggestion the user cannot run
      // would turn the next generation into an error.
      const suggested = template.suggestedSettings ?? {};
      const suggestedModel =
        typeof suggested.model === 'string' && isImageModelInstalled(state.availableModels, suggested.model)
          ? suggested.model
          : undefined;
      const aspectRatio = isAspectRatio(suggested.aspectRatio) ? suggested.aspectRatio : state.aspectRatio;
      const steps = typeof suggested.steps === 'number' && suggested.steps > 0 ? Math.round(suggested.steps) : undefined;
      const cfgScale = typeof suggested.cfgScale === 'number' && suggested.cfgScale > 0 ? suggested.cfgScale : undefined;
      const scheduler = typeof suggested.scheduler === 'string' && suggested.scheduler ? suggested.scheduler : undefined;
      const updatedPrompt = mode === 'replace'
        ? template.promptText
        : draft
          ? `${draft.prompt} ${template.promptText}`.trim()
          : template.promptText;

      const updatedNegative = mode === 'replace'
        ? (template.negativePrompt ?? draft?.negativePrompt ?? '')
        : template.negativePrompt
          ? draft
            ? `${draft.negativePrompt} ${template.negativePrompt}`.trim()
            : template.negativePrompt
          : draft?.negativePrompt ?? '';
      const dimensions = computeDimensions(
        aspectRatio,
        state.resolutionTier,
        state.customWidth,
        state.customHeight,
      );

      set((state) => ({
        promptTemplates: state.promptTemplates.map((t) =>
          t.id === id ? { ...t, lastUsedAt: Date.now() } : t,
        ),
        aspectRatio,
        generationDraft: draft
          ? {
              ...draft,
              prompt: updatedPrompt,
              negativePrompt: updatedNegative,
              ...(suggested.aspectRatio && aspectRatio !== 'custom'
                ? { width: dimensions.width, height: dimensions.height }
                : {}),
              ...(steps !== undefined ? { steps } : {}),
              ...(cfgScale !== undefined ? { cfgScale } : {}),
              ...(scheduler !== undefined ? { scheduler } : {}),
              ...(suggestedModel && draft.generationType === 'image' ? { model: suggestedModel } : {}),
            }
          : {
              generationType: 'image',
              prompt: updatedPrompt,
              negativePrompt: updatedNegative,
              width: dimensions.width,
              height: dimensions.height,
              steps: steps ?? state.advancedGeneration.steps,
              cfgScale: cfgScale ?? state.advancedGeneration.cfgScale,
              model: suggestedModel ?? state.selectedImageModelId,
              scheduler: scheduler ?? state.advancedGeneration.scheduler,
              seed: state.advancedGeneration.seed,
            },
      }));
    },
  };
}
