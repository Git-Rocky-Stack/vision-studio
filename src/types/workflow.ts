export type WorkbenchView = 'canvas' | 'viewer' | 'workflow' | 'launchpad';

export type WorkflowStepState = 'ready' | 'pending' | 'complete';

export interface WorkflowStepRecord {
  id: string;
  label: string;
  detail: string;
  state: WorkflowStepState;
}

export interface WorkflowRunRecord {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string;
  createdAt: string;
  outputAssetId?: string;
}

export type WorkflowRunInput = Omit<WorkflowRunRecord, 'id' | 'createdAt'> &
  Partial<Pick<WorkflowRunRecord, 'id' | 'createdAt'>>;

export interface WorkflowExecutionIssue {
  severity: 'error' | 'warning';
  code:
    | 'invalid-graph'
    | 'unsupported-node'
    | 'missing-sampler'
    | 'multiple-samplers'
    | 'missing-prompt'
    | 'missing-model'
    | 'invalid-sampler-value'
    | 'backend-unavailable';
  message: string;
  nodeId?: string;
}

export interface WorkflowExecutionSummary {
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed?: number;
}

export interface WorkflowRuntimeState {
  issues: WorkflowExecutionIssue[];
  activeJobId: string | null;
  lastRunId: string | null;
  lastFailureMessage: string | null;
  lastResolvedRequest: WorkflowExecutionSummary | null;
}

export interface WorkflowExecutionContext {
  activeScenePrompt: string | null;
  activeSceneNegativePrompt: string | null;
  generationDraft: {
    prompt: string;
    negativePrompt: string;
    model: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    scheduler: string;
    seed: number;
    generationType: 'image' | 'video';
  } | null;
  availableModels: Array<{ id?: string; name?: string }>;
}

export interface WorkflowExecutionValidationResult {
  issues: WorkflowExecutionIssue[];
  summary: WorkflowExecutionSummary | null;
}

export interface WorkflowGraph {
  nodes: Record<string, WorkflowGraphNode>;
  edges: WorkflowGraphEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkflowGraphNode {
  id: string;
  classType: string;
  label: string;
  inputs: Record<string, WorkflowGraphInput>;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  metadata?: {
    state?: WorkflowStepState;
    description?: string;
  };
}

export type WorkflowGraphInput =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'link'; nodeId: string; output: string };

export interface WorkflowGraphEdge {
  id: string;
  sourceNodeId: string;
  sourceOutput: string;
  targetNodeId: string;
  targetInput: string;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  status: 'draft' | 'ready' | 'running' | 'complete';
  description: string;
  tags: string[];
  notes: string;
  profile: string;
  summary: string;
  settings: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
  };
  inputs: string[];
  steps: WorkflowStepRecord[];
  graph: WorkflowGraph;
  runOutputSummary: string | null;
  runHistory: WorkflowRunRecord[];
}
