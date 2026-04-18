import type { AppSet, AppGet } from '../appStore.types';
import type {
  WorkflowStepRecord,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphEdge,
  WorkflowGraphInput,
  WorkflowRecord,
  WorkflowRunRecord,
  WorkflowRunInput,
} from '@/types/workflow';

const baselineWorkflowSteps: WorkflowStepRecord[] = [
  { id: 'prompt', label: 'Prompt', detail: 'Collect prompt, negative prompt, and references.', state: 'ready' },
  { id: 'model', label: 'Model', detail: 'Use the selected generation profile.', state: 'ready' },
  { id: 'generate', label: 'Generate', detail: 'Queue the image generation run.', state: 'pending' },
  { id: 'review', label: 'Review', detail: 'Send output to Viewer for comparison.', state: 'pending' },
  { id: 'save', label: 'Save', detail: 'Capture accepted output to Boards and Gallery.', state: 'pending' },
];

const baselineWorkflowGraph: WorkflowGraph = {
  nodes: {
    prompt: { id: 'prompt', classType: 'CLIPTextEncode', label: 'Prompt Encode', position: { x: 40, y: 120 }, inputs: { text: { kind: 'literal', value: '' } }, metadata: { state: 'ready', description: 'Encode prompt text for generation.' } },
    model: { id: 'model', classType: 'CheckpointLoaderSimple', label: 'Model Loader', position: { x: 40, y: 300 }, inputs: { ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' } }, metadata: { state: 'ready', description: 'Load a model checkpoint.' } },
    sampler: { id: 'sampler', classType: 'KSampler', label: 'Sampler', position: { x: 360, y: 200 }, inputs: { positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' }, model: { kind: 'link', nodeId: 'model', output: 'MODEL' }, seed: { kind: 'literal', value: 1 }, steps: { kind: 'literal', value: 25 }, cfg: { kind: 'literal', value: 7.5 } }, metadata: { state: 'pending', description: 'Queue the image generation run.' } },
    preview: { id: 'preview', classType: 'PreviewImage', label: 'Preview', position: { x: 620, y: 120 }, inputs: { images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' } }, metadata: { state: 'pending', description: 'Preview generated output.' } },
    save: { id: 'save', classType: 'SaveImage', label: 'Save Output', position: { x: 620, y: 300 }, inputs: { images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' }, filename_prefix: { kind: 'literal', value: 'vision-studio' } }, metadata: { state: 'pending', description: 'Save accepted output.' } },
  },
  edges: [
    { id: 'edge-prompt-sampler-positive', sourceNodeId: 'prompt', sourceOutput: 'CONDITIONING', targetNodeId: 'sampler', targetInput: 'positive' },
    { id: 'edge-model-sampler-model', sourceNodeId: 'model', sourceOutput: 'MODEL', targetNodeId: 'sampler', targetInput: 'model' },
    { id: 'edge-sampler-preview-images', sourceNodeId: 'sampler', sourceOutput: 'IMAGE', targetNodeId: 'preview', targetInput: 'images' },
    { id: 'edge-sampler-save-images', sourceNodeId: 'sampler', sourceOutput: 'IMAGE', targetNodeId: 'save', targetInput: 'images' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export const DEFAULT_WORKFLOWS: WorkflowRecord[] = [
  {
    id: 'image-generation-baseline',
    name: 'Image generation baseline',
    status: 'draft',
    description: 'Reusable text-to-image pass for current prompt and reference context.',
    tags: ['image', 'baseline'],
    notes: 'Use this path before branching accepted output into Viewer, Boards, or Gallery.',
    profile: 'Balanced image run',
    summary: '1024 x 1024, 25 steps, CFG 7.5',
    settings: { width: 1024, height: 1024, steps: 25, cfgScale: 7.5 },
    inputs: ['Prompt', 'References'],
    steps: baselineWorkflowSteps,
    graph: baselineWorkflowGraph,
    runOutputSummary: null,
    runHistory: [],
  },
  {
    id: 'storyboard-frame',
    name: 'Storyboard frame',
    status: 'draft',
    description: 'Creates a scene-aligned frame while preserving character and board context.',
    tags: ['storyboard', 'scene'],
    notes: 'Use this path when a single board frame needs continuity before review.',
    profile: 'Scene continuity run',
    summary: '1280 x 720, 30 steps, CFG 7',
    settings: { width: 1280, height: 720, steps: 30, cfgScale: 7 },
    inputs: ['Scene prompt', 'Character references'],
    steps: baselineWorkflowSteps.map((step) => ({ ...step })),
    graph: baselineWorkflowGraph,
    runOutputSummary: null,
    runHistory: [],
  },
];

function cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
  return structuredClone(graph);
}

function cloneWorkflow(workflow: WorkflowRecord): WorkflowRecord {
  return structuredClone(workflow);
}

function createWorkflowEdgeId(edge: Omit<WorkflowGraphEdge, 'id'>): string {
  return `edge-${crypto.randomUUID()}`;
}

function createDraftWorkflow(name: string): WorkflowRecord {
  return {
    ...cloneWorkflow(DEFAULT_WORKFLOWS[0]),
    id: `workflow-${crypto.randomUUID()}`,
    name,
    status: 'draft',
    description: '',
    tags: [],
    notes: '',
    runOutputSummary: null,
    runHistory: [],
  };
}

export const workflowInitialState = {
  workflowRecords: DEFAULT_WORKFLOWS.map(cloneWorkflow),
  activeWorkflowId: DEFAULT_WORKFLOWS[0].id,
};

export function createWorkflowActions(set: AppSet, get: AppGet) {
  return {
    setActiveWorkflow: (workflowId: string) =>
      set((state) =>
        state.workflowRecords.some((workflow) => workflow.id === workflowId)
          ? { activeWorkflowId: workflowId }
          : {}
      ),

    createWorkflow: (name: string): WorkflowRecord => {
      const workflow = createDraftWorkflow(name);
      set((state) => ({
        workflowRecords: [...state.workflowRecords, workflow],
        activeWorkflowId: workflow.id,
      }));
      return workflow;
    },

    recordWorkflowRun: (workflowId: string, run: WorkflowRunInput) =>
      set((state) => ({
        workflowRecords: state.workflowRecords.map((workflow) => {
          if (workflow.id !== workflowId) return workflow;

          const storedRun: WorkflowRunRecord = {
            id: run.id ?? `run-${crypto.randomUUID()}`,
            status: run.status,
            summary: run.summary,
            createdAt: run.createdAt ?? new Date().toISOString(),
            ...(run.outputAssetId ? { outputAssetId: run.outputAssetId } : {}),
          };

          return {
            ...workflow,
            runOutputSummary: storedRun.summary,
            runHistory: [storedRun, ...workflow.runHistory].slice(0, 10),
          };
        }),
      })),

    addWorkflowNode: (
      workflowId: string,
      node: Omit<WorkflowGraphNode, 'id'>
    ): WorkflowGraphNode | null => {
      const workflow = get().workflowRecords.find((record) => record.id === workflowId);
      if (!workflow) return null;

      const storedNode: WorkflowGraphNode = {
        ...node,
        id: `node-${crypto.randomUUID()}`,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).map(([inputName, input]) => [inputName, { ...input }])
        ),
        position: { ...node.position },
        size: node.size ? { ...node.size } : undefined,
        metadata: node.metadata ? { ...node.metadata } : undefined,
      };

      set((state) => ({
        workflowRecords: state.workflowRecords.map((record) => {
          if (record.id !== workflowId) return record;

          return {
            ...record,
            graph: {
              ...record.graph,
              nodes: {
                ...record.graph.nodes,
                [storedNode.id]: storedNode,
              },
            },
          };
        }),
      }));

      return storedNode;
    },

    moveWorkflowNode: (
      workflowId: string,
      nodeId: string,
      position: WorkflowGraphNode['position']
    ): void => {
      const workflow = get().workflowRecords.find((record) => record.id === workflowId);
      if (!workflow?.graph.nodes[nodeId]) return;

      set((state) => ({
        workflowRecords: state.workflowRecords.map((w) => {
          if (w.id !== workflowId) return w;
          const node = w.graph.nodes[nodeId];
          if (!node) return w;

          return {
            ...w,
            graph: {
              ...w.graph,
              nodes: {
                ...w.graph.nodes,
                [nodeId]: {
                  ...node,
                  position: { ...position },
                },
              },
            },
          };
        }),
      }));
    },

    updateWorkflowNode: (
      workflowId: string,
      nodeId: string,
      updates: Partial<Omit<WorkflowGraphNode, 'id'>>
    ): void => {
      const workflow = get().workflowRecords.find((record) => record.id === workflowId);
      if (!workflow?.graph.nodes[nodeId]) return;

      set((state) => ({
        workflowRecords: state.workflowRecords.map((w) => {
          if (w.id !== workflowId) return w;
          const node = w.graph.nodes[nodeId];
          if (!node) return w;

          return {
            ...w,
            graph: {
              ...w.graph,
              nodes: {
                ...w.graph.nodes,
                [nodeId]: {
                  ...node,
                  ...updates,
                  inputs: updates.inputs
                    ? Object.fromEntries(
                        Object.entries(updates.inputs).map(([inputName, input]) => [
                          inputName,
                          { ...input },
                        ])
                      )
                    : node.inputs,
                  position: updates.position ? { ...updates.position } : node.position,
                  size: updates.size ? { ...updates.size } : node.size,
                  metadata: updates.metadata ? { ...updates.metadata } : node.metadata,
                },
              },
            },
          };
        }),
      }));
    },

    deleteWorkflowNode: (workflowId: string, nodeId: string): void => {
      const workflow = get().workflowRecords.find((record) => record.id === workflowId);
      if (!workflow?.graph.nodes[nodeId]) return;

      set((state) => ({
        workflowRecords: state.workflowRecords.map((w) => {
          if (w.id !== workflowId) return w;

          const { [nodeId]: _deletedNode, ...nodes } = w.graph.nodes;
          const cleanedNodes = Object.fromEntries(
            Object.entries(nodes).map(([id, node]) => [
              id,
              {
                ...node,
                inputs: Object.fromEntries(
                  Object.entries(node.inputs).filter(([, input]) =>
                    input.kind === 'link' ? input.nodeId !== nodeId : true
                  )
                ),
              },
            ])
          );

          return {
            ...w,
            graph: {
              ...w.graph,
              nodes: cleanedNodes,
              edges: w.graph.edges.filter(
                (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
              ),
            },
          };
        }),
      }));
    },

    connectWorkflowNodes: (
      workflowId: string,
      edge: Omit<WorkflowGraphEdge, 'id'>
    ): WorkflowGraphEdge | null => {
      const workflow = get().workflowRecords.find((record) => record.id === workflowId);
      if (!workflow) return null;
      if (edge.sourceNodeId === edge.targetNodeId) return null;
      if (!workflow.graph.nodes[edge.sourceNodeId]) return null;
      if (!workflow.graph.nodes[edge.targetNodeId]) return null;

      const storedEdge: WorkflowGraphEdge = {
        ...edge,
        id: createWorkflowEdgeId(edge),
      };

      set((state) => ({
        workflowRecords: state.workflowRecords.map((record) => {
          if (record.id !== workflowId) return record;
          const targetNode = record.graph.nodes[edge.targetNodeId];

          return {
            ...record,
            graph: {
              ...record.graph,
              nodes: {
                ...record.graph.nodes,
                [edge.targetNodeId]: {
                  ...targetNode,
                  inputs: {
                    ...targetNode.inputs,
                    [edge.targetInput]: {
                      kind: 'link',
                      nodeId: edge.sourceNodeId,
                      output: edge.sourceOutput,
                    },
                  },
                },
              },
              edges: [
                ...record.graph.edges.filter(
                  (item) =>
                    item.targetNodeId !== edge.targetNodeId ||
                    item.targetInput !== edge.targetInput
                ),
                storedEdge,
              ],
            },
          };
        }),
      }));

      return storedEdge;
    },

    deleteWorkflowEdge: (workflowId: string, edgeId: string): void =>
      set((state) => ({
        workflowRecords: state.workflowRecords.map((workflow) => {
          if (workflow.id !== workflowId) return workflow;
          const edge = workflow.graph.edges.find((item) => item.id === edgeId);
          if (!edge) return workflow;
          const targetNode = workflow.graph.nodes[edge.targetNodeId];
          const targetInput = targetNode?.inputs[edge.targetInput];
          const shouldDeleteInput =
            targetInput?.kind === 'link' &&
            targetInput.nodeId === edge.sourceNodeId &&
            targetInput.output === edge.sourceOutput;

          return {
            ...workflow,
            graph: {
              ...workflow.graph,
              nodes:
                targetNode && shouldDeleteInput
                  ? {
                      ...workflow.graph.nodes,
                      [targetNode.id]: {
                        ...targetNode,
                        inputs: Object.fromEntries(
                          Object.entries(targetNode.inputs).filter(
                            ([inputName]) => inputName !== edge.targetInput
                          )
                        ),
                      },
                    }
                  : workflow.graph.nodes,
              edges: workflow.graph.edges.filter((item) => item.id !== edgeId),
            },
          };
        }),
      })),

    setWorkflowGraphViewport: (
      workflowId: string,
      viewport: NonNullable<WorkflowGraph['viewport']>
    ): void =>
      set((state) => ({
        workflowRecords: state.workflowRecords.map((workflow) =>
          workflow.id === workflowId
            ? {
                ...workflow,
                graph: {
                  ...workflow.graph,
                  viewport: { ...viewport },
                },
              }
            : workflow
        ),
      })),
  };
}