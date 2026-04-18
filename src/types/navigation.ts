export type ActiveTab = 'generate' | 'canvas' | 'story' | 'workflows' | 'assets' | 'settings';

export type GenerateSubMode = 'generate' | 'quick' | 'batch';

export type StorySubMode = 'storyboard' | 'templates';

export type ActiveSubMode = GenerateSubMode | StorySubMode | null;

export type CenterView = 'canvas' | 'viewer' | 'workflow' | 'launchpad';

export interface NavBarTab {
  id: ActiveTab;
  label: string;
  icon: string;
  cluster: 'top' | 'bottom';
}