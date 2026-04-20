import type { PromptTemplate, CompositionLayerState } from '@/types/promptStudio';
import { BUILT_IN_PROMPT_TEMPLATES } from '@/data/builtInTemplates';
import type { AppSet, AppGet } from '../appStore.types';

export const promptStudioInitialState = {
  promptTemplates: BUILT_IN_PROMPT_TEMPLATES as PromptTemplate[],
  compositionLayers: {
    aspectFrame: { visible: true, opacity: 1 },
    reference: { visible: true, opacity: 1, blendMode: 'normal' as const },
    controlNet: { visible: true, opacity: 0.7 },
    regionMasks: { visible: true, opacity: 0.5 },
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

      set((state) => ({
        promptTemplates: state.promptTemplates.map((t) =>
          t.id === id ? { ...t, lastUsedAt: Date.now() } : t,
        ),
        generationDraft: draft
          ? { ...draft, prompt: updatedPrompt, negativePrompt: updatedNegative }
          : { generationType: 'image', prompt: updatedPrompt, negativePrompt: updatedNegative, width: 1024, height: 1024 },
      }));
    },
  };
}