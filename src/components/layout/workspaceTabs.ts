import type { ActiveTab } from '@/types/navigation';

/**
 * The name each workspace tab goes by, wherever it is shown: the nav rail's
 * tooltips and accessible names, and the header title. One map so the two can
 * never disagree about what a tab is called.
 */
export const WORKSPACE_TAB_LABELS: Record<ActiveTab, string> = {
  generate: 'Generate',
  canvas: 'Canvas',
  story: 'Story',
  workflows: 'Workflows',
  assets: 'Assets',
  collections: 'Collections',
  foundry: 'Foundry',
  settings: 'Settings',
};
