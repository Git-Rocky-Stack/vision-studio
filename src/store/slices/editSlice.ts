import type { Layer, EditHistoryEntry, ImageAdjustments } from '@/types/editor';
import { DEFAULT_ADJUSTMENTS } from '@/types/editor';
import type { RegionMask } from '@/types/project';
import type { AppSet, AppGet, AppState } from '../appStore.types';

function createBaseImageLayer(imagePath: string, assetPath?: string | null): Layer {
  return {
    id: 'base-image-layer',
    name: 'Base Image',
    type: 'image',
    visible: true,
    opacity: 1,
    blendMode: 'Normal',
    locked: false,
    data: {
      previewUrl: imagePath,
      assetPath: assetPath ?? null,
      thumbnail: imagePath,
    },
  };
}

export const editInitialState = {
  activeEditTool: 'move' as const,
  editLayers: [] as Layer[],
  // #32: layer selection shared by EditCanvas, LayerPanel, and TextControls.
  selectedEditLayerId: null as string | null,
  // #32: intrinsic pixel size of the loaded edit image, recorded by EditCanvas
  // so new text layers can be placed at the image center.
  currentImageSize: null as { width: number; height: number } | null,
  editHistory: [] as EditHistoryEntry[],
  editHistoryIndex: -1,
  currentImage: null as string | null,
  currentImageAssetPath: null as string | null,
  imageAdjustments: { ...DEFAULT_ADJUSTMENTS } as ImageAdjustments,
  // #34 PR2: shared inpaint mask for the AI tools (Generative Fill / Object
  // Removal). One mask at a time, in intrinsic image pixels; cleared whenever
  // the edit image changes because its coordinates belong to the old image.
  editAiMask: null as RegionMask | null,
  editAiMaskTool: 'brush' as 'brush' | 'rectangle',
  editAiMaskBrushSize: 40,
  editAiMaskDrawing: false,
};

export function createEditActions(set: AppSet, _get: AppGet) {
  return {
    setActiveEditTool: (tool: AppState['activeEditTool']) => set({ activeEditTool: tool }),
    addEditLayer: (layer: Layer) => set((state) => ({
      editLayers: [...state.editLayers, layer],
    })),
    updateEditLayer: (id: string, updates: Partial<Layer>) => set((state) => ({
      editLayers: state.editLayers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    })),
    removeEditLayer: (id: string) => set((state) => ({
      editLayers: state.editLayers.filter((l) => l.id !== id),
      // A removed layer must never stay selected (#32).
      selectedEditLayerId: state.selectedEditLayerId === id ? null : state.selectedEditLayerId,
    })),
    setSelectedEditLayerId: (id: string | null) => set({ selectedEditLayerId: id }),
    setCurrentImageSize: (size: { width: number; height: number } | null) =>
      set({ currentImageSize: size }),
    reorderEditLayers: (layerIds: string[]) => set((state) => {
      const layerMap = new Map(state.editLayers.map((l) => [l.id, l]));
      return {
        editLayers: layerIds
          .map((id) => layerMap.get(id))
          .filter((l): l is Layer => l !== undefined),
      };
    }),
    pushEditHistory: (entry: EditHistoryEntry) => set((state) => {
      const truncated = state.editHistory.slice(0, state.editHistoryIndex + 1);
      const newHistory = [...truncated, entry].slice(-100);
      return {
        editHistory: newHistory,
        editHistoryIndex: newHistory.length - 1,
      };
    }),
    undo: () => set((state) => {
      if (state.editHistoryIndex <= 0) return state;
      const newIndex = state.editHistoryIndex - 1;
      return { editHistoryIndex: newIndex };
    }),
    redo: () => set((state) => {
      if (state.editHistoryIndex >= state.editHistory.length - 1) return state;
      const newIndex = state.editHistoryIndex + 1;
      return { editHistoryIndex: newIndex };
    }),
    canUndo: () => _get().editHistoryIndex > 0,
    canRedo: () => _get().editHistoryIndex < _get().editHistory.length - 1,
    setCurrentImage: (imagePath: string | null, assetPath?: string | null) =>
      set({
        currentImage: imagePath,
        currentImageAssetPath: assetPath ?? null,
        editLayers: imagePath ? [createBaseImageLayer(imagePath, assetPath)] : [],
        // Layers were replaced, so the selection and the recorded intrinsic
        // size belong to the old image (#32).
        selectedEditLayerId: null,
        currentImageSize: null,
        editHistory: [],
        editHistoryIndex: -1,
        imageAdjustments: { ...DEFAULT_ADJUSTMENTS },
        editAiMask: null,
      }),
    setEditAiMask: (mask: RegionMask | null) => set({ editAiMask: mask }),
    setEditAiMaskTool: (tool: AppState['editAiMaskTool']) => set({ editAiMaskTool: tool }),
    setEditAiMaskBrushSize: (size: number) => set({ editAiMaskBrushSize: size }),
    setEditAiMaskDrawing: (drawing: boolean) => set({ editAiMaskDrawing: drawing }),
    setImageAdjustments: (adjustments: Partial<ImageAdjustments>) => set((state) => ({
      imageAdjustments: { ...state.imageAdjustments, ...adjustments },
    })),
    resetImageAdjustments: () => set({ imageAdjustments: { ...DEFAULT_ADJUSTMENTS } }),
  };
}