export type ActiveTab = 'generate' | 'canvas' | 'story' | 'workflows' | 'assets' | 'collections' | 'settings';

export type GenerateSubMode = 'generate' | 'quick' | 'batch' | 'studio';

export type StorySubMode = 'storyboard' | 'templates';

export type WorkflowsSubMode = 'workflows' | 'pipelines';

export type ActiveSubMode = GenerateSubMode | StorySubMode | WorkflowsSubMode | null;

export type CenterView = 'canvas' | 'viewer' | 'workflow' | 'launchpad';

export interface NavBarTab {
  id: ActiveTab;
  label: string;
  icon: string;
  cluster: 'top' | 'bottom';
}