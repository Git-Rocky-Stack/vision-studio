import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';

export interface LayoutPreset {
  tabId: ActiveTab;
  hasLeftDock: boolean;
  hasRightDock: boolean;
  centerViews: CenterView[];
  rightDockPanels: string[];
  subModes: ActiveSubMode[];
  leftDockMinWidth: number;
  rightDockMinWidth: number;
}

const presets: Record<ActiveTab, LayoutPreset> = {
  generate: {
    tabId: 'generate',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas', 'viewer', 'workflow', 'launchpad'],
    rightDockPanels: ['gallery', 'boards'],
    subModes: ['generate', 'quick', 'batch', 'studio'],
    leftDockMinWidth: 380,
    rightDockMinWidth: 280,
  },
  canvas: {
    tabId: 'canvas',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    rightDockPanels: ['layers', 'gallery'],
    subModes: [],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  story: {
    tabId: 'story',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    rightDockPanels: ['boards', 'gallery'],
    subModes: ['storyboard', 'templates'],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  workflows: {
    tabId: 'workflows',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['workflow'],
    rightDockPanels: ['gallery', 'boards'],
    subModes: [],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  assets: {
    tabId: 'assets',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  collections: {
    tabId: 'collections',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  foundry: {
    tabId: 'foundry',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  settings: {
    tabId: 'settings',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
};

export function getLayoutPreset(tab: ActiveTab): LayoutPreset {
  return presets[tab];
}

/**
 * The center view a tab actually shows.
 *
 * `centerView` is one store field shared by every tab, but only Generate offers
 * a choice of views. Read raw, a view picked there followed the user into a tab
 * that cannot show it: Story opened on the Launchpad with no tab bar to leave
 * it, and Workflows opened on the story canvas instead of the workflow editor.
 * Resolving against the preset keeps the stored choice for Generate and gives
 * every other tab its own view.
 */
export function resolveCenterView(tab: ActiveTab, centerView: CenterView): CenterView {
  const { centerViews } = getLayoutPreset(tab);
  return centerViews.includes(centerView) ? centerView : centerViews[0];
}
