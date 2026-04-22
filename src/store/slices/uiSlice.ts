import type { AppState, AppSet, AppGet } from '../appStore.types';
import {
  LEFT_DOCK_MAX_WIDTH,
  LEFT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_CANVAS_DEFAULT_RATIOS,
  RIGHT_DOCK_CANVAS_MIN_RATIO,
  RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
  RIGHT_DOCK_DUAL_MIN_RATIO,
  RIGHT_DOCK_MAX_WIDTH,
  RIGHT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
  RIGHT_DOCK_TRIPLE_MIN_RATIO,
  clampDockWidth,
  createDefaultLayoutPreferences,
  normalizePanelRatios,
} from '../layoutPreferences';

export const uiInitialState = {
  activeViewerItemId: null as string | null,
  darkMode: true,
  layoutPreferences: createDefaultLayoutPreferences(),
  showAdvancedGeneration: false,
  batchViewMode: 'grid' as const,
  batchSortBy: 'created' as const,
  batchFilterBy: 'all' as const,
  activeTab: 'generate' as const,
  activeSubMode: 'generate' as const,
  centerView: 'canvas' as const,
  aspectRatio: '1:1' as const,
  resolutionTier: 'ultra' as const,
  customWidth: 1024,
  customHeight: 1024,
  generationMode: 'image' as const,
  startFrameImage: null as string | null,
  endFrameImage: null as string | null,
};

export function createUIActions(set: AppSet, _get: AppGet) {
  return {
    setActiveViewerItemId: (itemId: string | null) => set({ activeViewerItemId: itemId }),
    setLeftDockWidth: (width: number) =>
      set((state) => ({
        layoutPreferences: {
          ...state.layoutPreferences,
          leftDockWidth: clampDockWidth(width, LEFT_DOCK_MIN_WIDTH, LEFT_DOCK_MAX_WIDTH),
        },
      })),
    setRightDockWidth: (width: number) =>
      set((state) => ({
        layoutPreferences: {
          ...state.layoutPreferences,
          rightDockWidth: clampDockWidth(width, RIGHT_DOCK_MIN_WIDTH, RIGHT_DOCK_MAX_WIDTH),
        },
      })),
    setRightDockCanvasRatios: (ratios: [number, number]) =>
      set((state) => ({
        layoutPreferences: {
          ...state.layoutPreferences,
          rightDockCanvasRatios: normalizePanelRatios<[number, number]>(
            ratios,
            RIGHT_DOCK_CANVAS_DEFAULT_RATIOS,
            RIGHT_DOCK_CANVAS_MIN_RATIO,
          ),
        },
      })),
    setRightDockDualRatios: (ratios: [number, number]) =>
      set((state) => ({
        layoutPreferences: {
          ...state.layoutPreferences,
          rightDockDualRatios: normalizePanelRatios<[number, number]>(
            ratios,
            RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
            RIGHT_DOCK_DUAL_MIN_RATIO,
          ),
        },
      })),
    setRightDockTripleRatios: (ratios: [number, number, number]) =>
      set((state) => ({
        layoutPreferences: {
          ...state.layoutPreferences,
          rightDockTripleRatios: normalizePanelRatios<[number, number, number]>(
            ratios,
            RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
            RIGHT_DOCK_TRIPLE_MIN_RATIO,
          ),
        },
      })),
    setShowAdvancedGeneration: (show: boolean) => set({ showAdvancedGeneration: show }),
    setBatchViewMode: (mode: AppState['batchViewMode']) => set({ batchViewMode: mode }),
    setBatchSortBy: (sort: AppState['batchSortBy']) => set({ batchSortBy: sort }),
    setBatchFilterBy: (filter: AppState['batchFilterBy']) => set({ batchFilterBy: filter }),
    setActiveTab: (tab: AppState['activeTab']) => {
      const subModeDefaults: Record<string, AppState['activeSubMode']> = {
        generate: 'generate',
        canvas: null,
        story: 'storyboard',
        workflows: 'workflows',
        assets: null,
        collections: null,
        settings: null,
      };
      set({ activeTab: tab, activeSubMode: subModeDefaults[tab] ?? null });
    },
    setActiveSubMode: (subMode: AppState['activeSubMode']) => set({ activeSubMode: subMode }),
    setCenterView: (view: AppState['centerView']) => set({ centerView: view }),
    setAspectRatio: (ratio: AppState['aspectRatio']) => set({ aspectRatio: ratio }),
    setResolutionTier: (tier: AppState['resolutionTier']) => set({ resolutionTier: tier }),
    setCustomWidth: (width: number) => set({ customWidth: Math.max(256, Math.min(2048, width)) }),
    setCustomHeight: (height: number) => set({ customHeight: Math.max(256, Math.min(2048, height)) }),
    setGenerationMode: (mode: AppState['generationMode']) => set({ generationMode: mode }),
    setStartFrameImage: (image: string | null) => set({ startFrameImage: image }),
    setEndFrameImage: (image: string | null) => set({ endFrameImage: image }),
  };
}
