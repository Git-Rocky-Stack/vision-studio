import type { AppState, AppSet, AppGet } from '../appStore.types';

export const uiInitialState = {
  sidebarCollapsed: false,
  activePanel: 'generate' as const,
  activeWorkbenchView: 'canvas' as const,
  activeViewerItemId: null as string | null,
  darkMode: true,
  showAdvancedGeneration: false,
  batchViewMode: 'grid' as const,
  batchSortBy: 'created' as const,
  batchFilterBy: 'all' as const,
  activeTab: 'generate' as const,
  activeSubMode: 'generate' as const,
  centerView: 'canvas' as const,
};

export function createUIActions(set: AppSet, _get: AppGet) {
  return {
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setActivePanel: (panel: AppState['activePanel']) => set({ activePanel: panel }),
    setActiveWorkbenchView: (view: AppState['activeWorkbenchView']) => set({ activeWorkbenchView: view }),
    setActiveViewerItemId: (itemId: string | null) => set({ activeViewerItemId: itemId }),
    setShowAdvancedGeneration: (show: boolean) => set({ showAdvancedGeneration: show }),
    setBatchViewMode: (mode: AppState['batchViewMode']) => set({ batchViewMode: mode }),
    setBatchSortBy: (sort: AppState['batchSortBy']) => set({ batchSortBy: sort }),
    setBatchFilterBy: (filter: AppState['batchFilterBy']) => set({ batchFilterBy: filter }),
    setActiveTab: (tab: AppState['activeTab']) => {
      const subModeDefaults: Record<string, AppState['activeSubMode']> = {
        generate: 'generate',
        canvas: null,
        story: 'storyboard',
        workflows: null,
        assets: null,
        settings: null,
      };
      set({ activeTab: tab, activeSubMode: subModeDefaults[tab] ?? null });
    },
    setActiveSubMode: (subMode: AppState['activeSubMode']) => set({ activeSubMode: subMode }),
    setCenterView: (view: AppState['centerView']) => set({ centerView: view }),
  };
}