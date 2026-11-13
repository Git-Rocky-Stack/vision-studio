import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';

/** A sub-mode the settings rail offers for a tab, with its segmented-control label. */
export interface SubModeOption {
  value: NonNullable<ActiveSubMode>;
  label: string;
}

/**
 * Per-tab workspace layout. This is the single source of truth for which
 * docks a tab shows, which center views it offers and which sub-modes its
 * settings rail lists (DockviewSettingsPanel renders `subModes` verbatim).
 */
export interface LayoutPreset {
  tabId: ActiveTab;
  hasLeftDock: boolean;
  hasRightDock: boolean;
  centerViews: CenterView[];
  subModes: SubModeOption[];
  leftDockMinWidth: number;
  rightDockMinWidth: number;
}

const presets: Record<ActiveTab, LayoutPreset> = {
  generate: {
    tabId: 'generate',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas', 'viewer', 'workflow', 'launchpad'],
    subModes: [
      { value: 'generate', label: 'Generate' },
      { value: 'quick', label: 'Quick' },
      { value: 'batch', label: 'Batch' },
      { value: 'studio', label: 'Studio' },
    ],
    leftDockMinWidth: 380,
    rightDockMinWidth: 280,
  },
  canvas: {
    tabId: 'canvas',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    subModes: [],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  story: {
    tabId: 'story',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    subModes: [
      { value: 'storyboard', label: 'Storyboard' },
      { value: 'templates', label: 'Templates' },
    ],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  workflows: {
    tabId: 'workflows',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['workflow'],
    subModes: [
      { value: 'workflows', label: 'Workflows' },
      { value: 'pipelines', label: 'Pipelines' },
    ],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  assets: {
    tabId: 'assets',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  collections: {
    tabId: 'collections',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  foundry: {
    tabId: 'foundry',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  settings: {
    tabId: 'settings',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
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
