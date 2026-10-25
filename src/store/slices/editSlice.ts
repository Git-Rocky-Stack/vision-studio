import type {
  Layer,
  EditHistoryEntry,
  ImageAdjustments,
  EditStroke,
  EditFilterState,
  EditStateSnapshot,
} from '@/types/editor';
import { DEFAULT_ADJUSTMENTS, DEFAULT_EDIT_FILTERS } from '@/types/editor';
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

/** Longest gap between two same-key edits that still merge into one undo step. */
export const EDIT_HISTORY_COALESCE_MS = 600;
export const EDIT_HISTORY_LIMIT = 100;
export const DEFAULT_EDIT_BRUSH_COLOR = '#e6e6e6';

type EditContent = Pick<AppState, 'editLayers' | 'imageAdjustments' | 'editStrokes' | 'editFilters'>;
type EditStateFields = EditContent & Pick<AppState, 'editHistory' | 'editHistoryIndex'>;

function snapshotOf(state: EditContent): EditStateSnapshot {
  return {
    layers: state.editLayers,
    adjustments: state.imageAdjustments,
    strokes: state.editStrokes,
    filters: state.editFilters,
  };
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Record an edit into history. `next` is the edit content after the change;
 * `prev` is the state before it. The first recorded change seeds an
 * "Original" entry so the very first edit is undoable. A change whose
 * coalesceKey matches the top entry within the coalesce window replaces that
 * entry instead of pushing, so one slider drag is one undo step.
 */
export function recordEditHistory(
  prev: EditStateFields,
  next: EditContent,
  action: string,
  coalesceKey?: string,
  now: Date = new Date(),
): Pick<AppState, 'editHistory' | 'editHistoryIndex'> {
  let history = prev.editHistory.slice(0, prev.editHistoryIndex + 1);
  if (history.length === 0) {
    history = [{ id: newEntryId(), action: 'Original', timestamp: now, state: snapshotOf(prev) }];
  }

  const top = history[history.length - 1];
  const entry: EditHistoryEntry = {
    id: newEntryId(),
    action,
    timestamp: now,
    state: snapshotOf(next),
    coalesceKey,
  };

  if (
    coalesceKey &&
    top.coalesceKey === coalesceKey &&
    history.length > 1 &&
    now.getTime() - new Date(top.timestamp).getTime() <= EDIT_HISTORY_COALESCE_MS
  ) {
    history = [...history.slice(0, -1), { ...entry, id: top.id }];
  } else {
    history = [...history, entry];
  }

  if (history.length > EDIT_HISTORY_LIMIT) {
    history = history.slice(-EDIT_HISTORY_LIMIT);
  }
  return { editHistory: history, editHistoryIndex: history.length - 1 };
}

function restoreEntry(state: AppState, index: number): Partial<AppState> {
  const entry = state.editHistory[index];
  if (!entry?.state) return { editHistoryIndex: index };
  const layers = entry.state.layers;
  return {
    editHistoryIndex: index,
    editLayers: layers,
    imageAdjustments: entry.state.adjustments,
    editStrokes: entry.state.strokes,
    editFilters: entry.state.filters,
    selectedEditLayerId:
      state.selectedEditLayerId && layers.some((l) => l.id === state.selectedEditLayerId)
        ? state.selectedEditLayerId
        : null,
  };
}

function layerName(state: AppState, id: string): string {
  return state.editLayers.find((l) => l.id === id)?.name ?? 'layer';
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
  editStrokes: [] as EditStroke[],
  editFilters: { ...DEFAULT_EDIT_FILTERS } as EditFilterState,
  editBrushColor: DEFAULT_EDIT_BRUSH_COLOR,
  editBrushSize: 10,
  editCompareOriginal: false,
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
    addEditLayer: (layer: Layer, historyLabel?: string) =>
      set((state) => {
        const editLayers = [...state.editLayers, layer];
        return {
          editLayers,
          ...recordEditHistory(state, { ...state, editLayers }, historyLabel ?? `Add layer "${layer.name}"`),
        };
      }),
    updateEditLayer: (id: string, updates: Partial<Layer>, historyLabel?: string) =>
      set((state) => {
        const editLayers = state.editLayers.map((l) => (l.id === id ? { ...l, ...updates } : l));
        return {
          editLayers,
          ...recordEditHistory(
            state,
            { ...state, editLayers },
            historyLabel ?? `Edit layer "${layerName(state, id)}"`,
            `layer:${id}:${Object.keys(updates).sort().join(',')}`,
          ),
        };
      }),
    removeEditLayer: (id: string, historyLabel?: string) =>
      set((state) => {
        const editLayers = state.editLayers.filter((l) => l.id !== id);
        return {
          editLayers,
          // A removed layer must never stay selected (#32).
          selectedEditLayerId: state.selectedEditLayerId === id ? null : state.selectedEditLayerId,
          ...recordEditHistory(
            state,
            { ...state, editLayers },
            historyLabel ?? `Remove layer "${layerName(state, id)}"`,
          ),
        };
      }),
    setSelectedEditLayerId: (id: string | null) => set({ selectedEditLayerId: id }),
    setCurrentImageSize: (size: { width: number; height: number } | null) =>
      set({ currentImageSize: size }),
    reorderEditLayers: (layerIds: string[]) =>
      set((state) => {
        const layerMap = new Map(state.editLayers.map((l) => [l.id, l]));
        const editLayers = layerIds
          .map((id) => layerMap.get(id))
          .filter((l): l is Layer => l !== undefined);
        return {
          editLayers,
          ...recordEditHistory(state, { ...state, editLayers }, 'Reorder layers'),
        };
      }),
    addEditStroke: (stroke: EditStroke) =>
      set((state) => {
        const editStrokes = [...state.editStrokes, stroke];
        return {
          editStrokes,
          ...recordEditHistory(
            state,
            { ...state, editStrokes },
            stroke.tool === 'eraser' ? 'Eraser stroke' : 'Brush stroke',
          ),
        };
      }),
    clearEditStrokes: () =>
      set((state) => {
        if (state.editStrokes.length === 0) return state;
        const editStrokes: EditStroke[] = [];
        return {
          editStrokes,
          ...recordEditHistory(state, { ...state, editStrokes }, 'Clear strokes'),
        };
      }),
    setEditFilters: (filters: Partial<EditFilterState>) =>
      set((state) => {
        const editFilters = { ...state.editFilters, ...filters };
        const intensityOnly = Object.keys(filters).length === 1 && 'intensity' in filters;
        return {
          editFilters,
          ...recordEditHistory(
            state,
            { ...state, editFilters },
            intensityOnly ? 'Filter intensity' : 'Change filters',
            intensityOnly ? 'filters:intensity' : undefined,
          ),
        };
      }),
    setEditBrushColor: (color: string) => set({ editBrushColor: color }),
    setEditBrushSize: (size: number) => set({ editBrushSize: Math.max(1, Math.min(200, size)) }),
    setEditCompareOriginal: (on: boolean) => set({ editCompareOriginal: on }),
    pushEditHistory: (entry: EditHistoryEntry) =>
      set((state) => {
        const truncated = state.editHistory.slice(0, state.editHistoryIndex + 1);
        const newHistory = [...truncated, { state: snapshotOf(state), ...entry }].slice(
          -EDIT_HISTORY_LIMIT,
        );
        return {
          editHistory: newHistory,
          editHistoryIndex: newHistory.length - 1,
        };
      }),
    undo: () =>
      set((state) => {
        if (state.editHistoryIndex <= 0) return state;
        return restoreEntry(state, state.editHistoryIndex - 1);
      }),
    redo: () =>
      set((state) => {
        if (state.editHistoryIndex >= state.editHistory.length - 1) return state;
        return restoreEntry(state, state.editHistoryIndex + 1);
      }),
    jumpToEditHistory: (index: number) =>
      set((state) => {
        if (index < 0 || index >= state.editHistory.length || index === state.editHistoryIndex) {
          return state;
        }
        return restoreEntry(state, index);
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
        // Strokes and filters belong to the old image's pixel space and look.
        editStrokes: [],
        editFilters: { ...DEFAULT_EDIT_FILTERS },
        editCompareOriginal: false,
        editAiMask: null,
      }),
    setEditAiMask: (mask: RegionMask | null) => set({ editAiMask: mask }),
    setEditAiMaskTool: (tool: AppState['editAiMaskTool']) => set({ editAiMaskTool: tool }),
    setEditAiMaskBrushSize: (size: number) => set({ editAiMaskBrushSize: size }),
    setEditAiMaskDrawing: (drawing: boolean) => set({ editAiMaskDrawing: drawing }),
    setImageAdjustments: (adjustments: Partial<ImageAdjustments>) =>
      set((state) => {
        const imageAdjustments = { ...state.imageAdjustments, ...adjustments };
        const keys = Object.keys(adjustments).sort().join(',');
        return {
          imageAdjustments,
          ...recordEditHistory(state, { ...state, imageAdjustments }, `Adjust ${keys}`, `adjust:${keys}`),
        };
      }),
    resetImageAdjustments: () =>
      set((state) => {
        const imageAdjustments = { ...DEFAULT_ADJUSTMENTS };
        return {
          imageAdjustments,
          ...recordEditHistory(state, { ...state, imageAdjustments }, 'Reset adjustments'),
        };
      }),
  };
}
