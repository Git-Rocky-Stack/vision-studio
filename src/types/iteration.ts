export interface SettingsDiff {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface IterationNode {
  id: string;
  parentId: string | null;
  branchId: string;
  childrenIds: string[];
  generationJob: import('@/store/appStore.types').GenerationJob;
  thumbnail: string;
  settingsDiff: SettingsDiff | null;
  createdAt: number;
  isPinned: boolean;
  note: string;
}

export interface IterationBranch {
  id: string;
  name: string;
  rootNodeId: string;
  activeNodeId: string;
  createdAt: number;
}

export interface IterationTree {
  roots: IterationNode[];
  branches: IterationBranch[];
  getNode: (id: string) => IterationNode | undefined;
  getPath: (id: string) => IterationNode[];
  getSiblings: (id: string) => IterationNode[];
}

export type IterationView = 'panel' | 'timeline' | 'overlay';
export type ComparisonMode = 'side-by-side' | 'slider' | 'grid';
export type ComparisonIds = [string] | [string, string] | null;
