# Workflow Comfy Graph Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an editable ComfyUI-style workflow graph to the Workflow workbench, including a pure exporter that converts stored graph data into ComfyUI API prompt JSON.

**Architecture:** Store a ComfyUI-inspired `WorkflowGraph` on each `WorkflowRecord`, with graph nodes keyed by id and edges represented as source-output to target-input links. Keep the current workflow metadata/library/run-output shell, replace the center linear run plan with a graph editor, and expose a deterministic exporter for ComfyUI API prompt JSON. Preserve existing `steps` as a compatibility summary during this slice.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Vitest, Testing Library, custom HTML/SVG graph rendering.

---

## Reference Documents

- Design: `docs/plans/2026-04-17-workflow-comfy-graph-design.md`
- Current workflow component: `src/components/workflow/WorkflowWorkbench.tsx`
- Current workflow tests: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Current store: `src/store/appStore.ts`
- Current store tests: `src/store/appStore.test.ts`

## Task 1: Add Workflow Graph Types And Seed Defaults

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`

**Step 1: Write the failing default graph test**

Add tests under `describe('workflow records')` in `src/store/appStore.test.ts`.

```ts
it('seeds default workflows with editable graph nodes and edges', () => {
  const workflow = useAppStore.getState().workflowRecords[0];

  expect(Object.keys(workflow.graph.nodes)).toEqual([
    'prompt',
    'model',
    'sampler',
    'preview',
    'save',
  ]);
  expect(workflow.graph.nodes.prompt.classType).toBe('CLIPTextEncode');
  expect(workflow.graph.nodes.sampler.inputs.model).toEqual({
    kind: 'link',
    nodeId: 'model',
    output: 'MODEL',
  });
  expect(workflow.graph.edges).toContainEqual({
    id: 'edge-model-sampler-model',
    sourceNodeId: 'model',
    sourceOutput: 'MODEL',
    targetNodeId: 'sampler',
    targetInput: 'model',
  });
});

it('creates draft workflows with cloned editable graph state', () => {
  const workflow = useAppStore.getState().createWorkflow('Product pass');

  expect(workflow.graph).toBeDefined();
  expect(workflow.graph.nodes.prompt).toBeDefined();
  expect(workflow.graph.nodes.prompt).not.toBe(
    useAppStore.getState().workflowRecords[0].graph.nodes.prompt
  );
});
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because `WorkflowRecord` has no `graph` field.

**Step 3: Add graph types and default graph**

In `src/store/appStore.ts`, add the graph interfaces near existing workflow interfaces.

```ts
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
```

Add `graph: WorkflowGraph;` to `WorkflowRecord`.

Create a `baselineWorkflowGraph` constant after `baselineWorkflowSteps`. Keep positions stable and simple.

```ts
const baselineWorkflowGraph: WorkflowGraph = {
  nodes: {
    prompt: {
      id: 'prompt',
      classType: 'CLIPTextEncode',
      label: 'Prompt Encode',
      position: { x: 40, y: 120 },
      inputs: {
        text: { kind: 'literal', value: '' },
      },
      metadata: {
        state: 'ready',
        description: 'Encode prompt text for generation.',
      },
    },
    model: {
      id: 'model',
      classType: 'CheckpointLoaderSimple',
      label: 'Model Loader',
      position: { x: 40, y: 300 },
      inputs: {
        ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' },
      },
      metadata: {
        state: 'ready',
        description: 'Load the selected model checkpoint.',
      },
    },
    sampler: {
      id: 'sampler',
      classType: 'KSampler',
      label: 'Sampler',
      position: { x: 320, y: 210 },
      inputs: {
        model: { kind: 'link', nodeId: 'model', output: 'MODEL' },
        positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
        seed: { kind: 'literal', value: 1 },
        steps: { kind: 'literal', value: 25 },
        cfg: { kind: 'literal', value: 7.5 },
      },
      metadata: {
        state: 'pending',
        description: 'Queue the image generation run.',
      },
    },
    preview: {
      id: 'preview',
      classType: 'PreviewImage',
      label: 'Preview',
      position: { x: 620, y: 120 },
      inputs: {
        images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' },
      },
      metadata: {
        state: 'pending',
        description: 'Preview generated output in the workbench.',
      },
    },
    save: {
      id: 'save',
      classType: 'SaveImage',
      label: 'Save Output',
      position: { x: 620, y: 300 },
      inputs: {
        images: { kind: 'link', nodeId: 'sampler', output: 'IMAGE' },
        filename_prefix: { kind: 'literal', value: 'vision-studio' },
      },
      metadata: {
        state: 'pending',
        description: 'Capture accepted output to Boards and Gallery.',
      },
    },
  },
  edges: [
    {
      id: 'edge-prompt-sampler-positive',
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'sampler',
      targetInput: 'positive',
    },
    {
      id: 'edge-model-sampler-model',
      sourceNodeId: 'model',
      sourceOutput: 'MODEL',
      targetNodeId: 'sampler',
      targetInput: 'model',
    },
    {
      id: 'edge-sampler-preview-images',
      sourceNodeId: 'sampler',
      sourceOutput: 'IMAGE',
      targetNodeId: 'preview',
      targetInput: 'images',
    },
    {
      id: 'edge-sampler-save-images',
      sourceNodeId: 'sampler',
      sourceOutput: 'IMAGE',
      targetNodeId: 'save',
      targetInput: 'images',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};
```

Add a clone helper:

```ts
function cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          position: { ...node.position },
          size: node.size ? { ...node.size } : undefined,
          inputs: Object.fromEntries(
            Object.entries(node.inputs).map(([key, input]) => [key, { ...input }])
          ),
          metadata: node.metadata ? { ...node.metadata } : undefined,
        },
      ])
    ),
    edges: graph.edges.map((edge) => ({ ...edge })),
    viewport: graph.viewport ? { ...graph.viewport } : undefined,
  };
}
```

Set `graph: cloneWorkflowGraph(baselineWorkflowGraph)` on each default workflow and clone it inside `cloneWorkflow` and `createDraftWorkflow`.

**Step 4: Run the test to verify it passes**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(workflow): seed comfy graph records"
```

## Task 2: Add Store Actions For Editable Graphs

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`

**Step 1: Write failing store action tests**

Add tests under `describe('workflow records')`.

```ts
it('adds and moves a workflow graph node', () => {
  const node = useAppStore.getState().addWorkflowNode('image-generation-baseline', {
    classType: 'PreviewImage',
    label: 'Alt Preview',
    position: { x: 900, y: 120 },
    inputs: {},
  });

  expect(node.id).toMatch(/^node-/);

  useAppStore.getState().moveWorkflowNode('image-generation-baseline', node.id, { x: 940, y: 180 });
  const workflow = useAppStore
    .getState()
    .workflowRecords.find((record) => record.id === 'image-generation-baseline');

  expect(workflow?.graph.nodes[node.id].position).toEqual({ x: 940, y: 180 });
});

it('connects nodes and replaces an existing target input link', () => {
  const edge = useAppStore.getState().connectWorkflowNodes('image-generation-baseline', {
    sourceNodeId: 'prompt',
    sourceOutput: 'CONDITIONING',
    targetNodeId: 'sampler',
    targetInput: 'positive',
  });

  const workflow = useAppStore
    .getState()
    .workflowRecords.find((record) => record.id === 'image-generation-baseline');

  expect(edge.id).toBe('edge-prompt-sampler-positive');
  expect(workflow?.graph.edges.filter((item) => item.targetNodeId === 'sampler' && item.targetInput === 'positive')).toHaveLength(1);
  expect(workflow?.graph.nodes.sampler.inputs.positive).toEqual({
    kind: 'link',
    nodeId: 'prompt',
    output: 'CONDITIONING',
  });
});

it('rejects invalid workflow graph connections', () => {
  expect(() =>
    useAppStore.getState().connectWorkflowNodes('image-generation-baseline', {
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'prompt',
      targetInput: 'text',
    })
  ).toThrow('Cannot connect a workflow node to itself');
});

it('deletes workflow graph nodes and removes connected edges', () => {
  useAppStore.getState().deleteWorkflowNode('image-generation-baseline', 'prompt');

  const workflow = useAppStore
    .getState()
    .workflowRecords.find((record) => record.id === 'image-generation-baseline');

  expect(workflow?.graph.nodes.prompt).toBeUndefined();
  expect(workflow?.graph.edges.some((edge) => edge.sourceNodeId === 'prompt')).toBe(false);
  expect(workflow?.graph.nodes.sampler.inputs.positive).toBeUndefined();
});
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because graph actions do not exist.

**Step 3: Add action types to `AppState`**

Add action signatures near the workflow actions.

```ts
addWorkflowNode: (
  workflowId: string,
  node: Omit<WorkflowGraphNode, 'id'>
) => WorkflowGraphNode;
moveWorkflowNode: (
  workflowId: string,
  nodeId: string,
  position: WorkflowGraphNode['position']
) => void;
updateWorkflowNode: (
  workflowId: string,
  nodeId: string,
  updates: Partial<Omit<WorkflowGraphNode, 'id'>>
) => void;
deleteWorkflowNode: (workflowId: string, nodeId: string) => void;
connectWorkflowNodes: (
  workflowId: string,
  edge: Omit<WorkflowGraphEdge, 'id'>
) => WorkflowGraphEdge;
deleteWorkflowEdge: (workflowId: string, edgeId: string) => void;
setWorkflowGraphViewport: (
  workflowId: string,
  viewport: NonNullable<WorkflowGraph['viewport']>
) => void;
```

**Step 4: Add minimal action implementations**

Implement actions inside the store object. Use immutable updates and throw clear errors for invalid connections.

Important helper:

```ts
function createWorkflowEdgeId(edge: Omit<WorkflowGraphEdge, 'id'>): string {
  return `edge-${edge.sourceNodeId}-${edge.targetNodeId}-${edge.targetInput}`;
}
```

For `connectWorkflowNodes`:

- throw if workflow missing
- throw if source or target node missing
- throw if `sourceNodeId === targetNodeId`
- remove any previous edge targeting the same `targetNodeId + targetInput`
- update `target.inputs[targetInput]` to `{ kind: 'link', nodeId: sourceNodeId, output: sourceOutput }`
- return the stored edge

For `deleteWorkflowNode`:

- delete the node
- remove connected edges
- remove linked inputs that reference the deleted node

**Step 5: Run the test to verify it passes**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(workflow): edit graph records"
```

## Task 3: Add ComfyUI API JSON Exporter

**Files:**
- Create: `src/features/workflow/comfyExport.ts`
- Create: `src/features/workflow/comfyExport.test.ts`

**Step 1: Write failing exporter tests**

Create `src/features/workflow/comfyExport.test.ts`.

```ts
import { describe, expect, it } from 'vitest';

import type { WorkflowGraph } from '@/store/appStore';
import { exportWorkflowGraphToComfyPrompt } from './comfyExport';

const graph: WorkflowGraph = {
  nodes: {
    prompt: {
      id: 'prompt',
      classType: 'CLIPTextEncode',
      label: 'Prompt Encode',
      position: { x: 0, y: 0 },
      inputs: {
        text: { kind: 'literal', value: 'cinematic frame' },
      },
    },
    sampler: {
      id: 'sampler',
      classType: 'KSampler',
      label: 'Sampler',
      position: { x: 240, y: 0 },
      inputs: {
        positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
        steps: { kind: 'literal', value: 25 },
      },
    },
  },
  edges: [
    {
      id: 'edge-prompt-sampler-positive',
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'sampler',
      targetInput: 'positive',
    },
  ],
};

describe('exportWorkflowGraphToComfyPrompt', () => {
  it('exports literal and linked inputs to ComfyUI API prompt JSON', () => {
    expect(exportWorkflowGraphToComfyPrompt(graph)).toEqual({
      prompt: {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'cinematic frame',
        },
        _meta: {
          title: 'Prompt Encode',
        },
      },
      sampler: {
        class_type: 'KSampler',
        inputs: {
          positive: ['prompt', 'CONDITIONING'],
          steps: 25,
        },
        _meta: {
          title: 'Sampler',
        },
      },
    });
  });

  it('throws for links that reference missing source nodes', () => {
    expect(() =>
      exportWorkflowGraphToComfyPrompt({
        ...graph,
        nodes: {
          sampler: graph.nodes.sampler,
        },
      })
    ).toThrow('Workflow graph link references missing source node "prompt"');
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/features/workflow/comfyExport.test.ts --project unit
```

Expected: FAIL because the module does not exist.

**Step 3: Implement the exporter**

Create `src/features/workflow/comfyExport.ts`.

```ts
import type { WorkflowGraph } from '@/store/appStore';

export type ComfyPrompt = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, string | number | boolean | null | [string, string]>;
    _meta?: {
      title?: string;
    };
  }
>;

export function exportWorkflowGraphToComfyPrompt(graph: WorkflowGraph): ComfyPrompt {
  validateWorkflowGraphForComfyExport(graph);

  return Object.fromEntries(
    Object.values(graph.nodes).map((node) => [
      node.id,
      {
        class_type: node.classType,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).map(([name, input]) => [
            name,
            input.kind === 'link' ? [input.nodeId, input.output] : input.value,
          ])
        ),
        _meta: {
          title: node.label,
        },
      },
    ])
  );
}

export function validateWorkflowGraphForComfyExport(graph: WorkflowGraph): void {
  const targetInputs = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.sourceNodeId === edge.targetNodeId) {
      throw new Error(`Workflow graph edge "${edge.id}" cannot connect a node to itself`);
    }
    if (!graph.nodes[edge.sourceNodeId]) {
      throw new Error(`Workflow graph edge "${edge.id}" references missing source node "${edge.sourceNodeId}"`);
    }
    if (!graph.nodes[edge.targetNodeId]) {
      throw new Error(`Workflow graph edge "${edge.id}" references missing target node "${edge.targetNodeId}"`);
    }

    const targetKey = `${edge.targetNodeId}:${edge.targetInput}`;
    if (targetInputs.has(targetKey)) {
      throw new Error(`Workflow graph has duplicate links for input "${targetKey}"`);
    }
    targetInputs.add(targetKey);
  }

  for (const node of Object.values(graph.nodes)) {
    for (const input of Object.values(node.inputs)) {
      if (input.kind === 'link' && !graph.nodes[input.nodeId]) {
        throw new Error(`Workflow graph link references missing source node "${input.nodeId}"`);
      }
    }
  }
}
```

**Step 4: Run the test to verify it passes**

Run:

```powershell
npx vitest run src/features/workflow/comfyExport.test.ts --project unit
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/features/workflow/comfyExport.ts src/features/workflow/comfyExport.test.ts
git commit -m "feat(workflow): export comfy prompt json"
```

## Task 4: Create Graph Editor Component Shell

**Files:**
- Create: `src/components/workflow/WorkflowGraphEditor.tsx`
- Create: `src/components/workflow/WorkflowGraphEditor.test.tsx`

**Step 1: Write failing render and selection tests**

Create `src/components/workflow/WorkflowGraphEditor.test.tsx`.

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowGraph } from '@/store/appStore';
import { WorkflowGraphEditor } from './WorkflowGraphEditor';

const graph: WorkflowGraph = {
  nodes: {
    prompt: {
      id: 'prompt',
      classType: 'CLIPTextEncode',
      label: 'Prompt Encode',
      position: { x: 40, y: 80 },
      inputs: {
        text: { kind: 'literal', value: 'test prompt' },
      },
    },
    sampler: {
      id: 'sampler',
      classType: 'KSampler',
      label: 'Sampler',
      position: { x: 320, y: 80 },
      inputs: {
        positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
      },
    },
  },
  edges: [
    {
      id: 'edge-prompt-sampler-positive',
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'sampler',
      targetInput: 'positive',
    },
  ],
};

describe('WorkflowGraphEditor', () => {
  afterEach(cleanup);

  it('renders graph nodes and edges', () => {
    render(<WorkflowGraphEditor graph={graph} onMoveNode={() => {}} onAddNode={() => {}} onConnectNodes={() => {}} onDeleteSelection={() => {}} />);

    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompt Encode node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
    expect(screen.getByTestId('workflow-edge-edge-prompt-sampler-positive')).toBeInTheDocument();
  });

  it('selects a node and shows inspector details', () => {
    render(<WorkflowGraphEditor graph={graph} onMoveNode={() => {}} onAddNode={() => {}} onConnectNodes={() => {}} onDeleteSelection={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));

    expect(screen.getByRole('heading', { name: 'Sampler' })).toBeInTheDocument();
    expect(screen.getByText('KSampler')).toBeInTheDocument();
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: FAIL because `WorkflowGraphEditor` does not exist.

**Step 3: Implement minimal graph editor**

Create `WorkflowGraphEditor.tsx` with:

- relative canvas region
- SVG edge layer
- absolutely positioned node buttons
- local selected item state
- inspector panel in top-right or bottom area

Use fixed node dimensions for first slice:

```ts
const NODE_WIDTH = 180;
const NODE_HEIGHT = 86;
```

Props:

```ts
interface WorkflowGraphEditorProps {
  graph: WorkflowGraph;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onAddNode: (classType: string) => void;
  onConnectNodes: (edge: Omit<WorkflowGraphEdge, 'id'>) => void;
  onDeleteSelection: (selection: { type: 'node' | 'edge'; id: string }) => void;
}
```

Implement click selection first. Drag and toolbar actions land in later tasks.

**Step 4: Run the test to verify it passes**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowGraphEditor.tsx src/components/workflow/WorkflowGraphEditor.test.tsx
git commit -m "feat(workflow): render editable graph shell"
```

## Task 5: Wire Graph Editor Into Workflow Workbench

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`

**Step 1: Write failing workbench graph tests**

Modify `WorkflowWorkbench.test.tsx`.

Add:

```ts
it('renders the editable workflow graph in the center work surface', () => {
  render(<WorkflowWorkbench />);

  expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Prompt Encode node' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
});
```

Update the old linear run plan test so it no longer requires the center ordered list. If keeping a summary is useful, assert graph node order instead.

**Step 2: Run the test to verify it fails**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because workbench still renders the linear run plan.

**Step 3: Replace the center run plan with `WorkflowGraphEditor`**

Import:

```ts
import { WorkflowGraphEditor } from './WorkflowGraphEditor';
```

Replace the center `<main>` contents with:

```tsx
<main className="flex min-h-0 flex-col">
  <div className="border-b border-border bg-surface px-5 py-3">
    <p className="type-caption">Graph Editor</p>
    <h3 className="mt-1 type-section">ComfyUI prompt graph</h3>
  </div>

  <WorkflowGraphEditor
    graph={activeWorkflow.graph}
    onMoveNode={(nodeId, position) => moveWorkflowNode(activeWorkflow.id, nodeId, position)}
    onAddNode={(classType) => {
      addWorkflowNode(activeWorkflow.id, createWorkflowNodeFromClassType(classType));
    }}
    onConnectNodes={(edge) => connectWorkflowNodes(activeWorkflow.id, edge)}
    onDeleteSelection={(selection) => {
      if (selection.type === 'node') deleteWorkflowNode(activeWorkflow.id, selection.id);
      if (selection.type === 'edge') deleteWorkflowEdge(activeWorkflow.id, selection.id);
    }}
  />
</main>
```

Add missing store action selectors in the component.

If `createWorkflowNodeFromClassType` does not exist yet, add a local helper for now. It can move later.

**Step 4: Run tests**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): show graph editor in workbench"
```

## Task 6: Add Toolbar Actions For Add, Connect, Delete

**Files:**
- Modify: `src/components/workflow/WorkflowGraphEditor.tsx`
- Modify: `src/components/workflow/WorkflowGraphEditor.test.tsx`

**Step 1: Write failing toolbar tests**

Add tests:

```tsx
it('adds a sampler node from the toolbar', () => {
  const onAddNode = vi.fn();
  render(<WorkflowGraphEditor graph={graph} onMoveNode={() => {}} onAddNode={onAddNode} onConnectNodes={() => {}} onDeleteSelection={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Add Sampler node' }));

  expect(onAddNode).toHaveBeenCalledWith('KSampler');
});

it('deletes the selected node', () => {
  const onDeleteSelection = vi.fn();
  render(<WorkflowGraphEditor graph={graph} onMoveNode={() => {}} onAddNode={() => {}} onConnectNodes={() => {}} onDeleteSelection={onDeleteSelection} />);

  fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selection' }));

  expect(onDeleteSelection).toHaveBeenCalledWith({ type: 'node', id: 'sampler' });
});

it('connects selected source and target nodes with default slots', () => {
  const onConnectNodes = vi.fn();
  render(<WorkflowGraphEditor graph={graph} onMoveNode={() => {}} onAddNode={() => {}} onConnectNodes={onConnectNodes} onDeleteSelection={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Prompt Encode node' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start connection from selected node' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));

  expect(onConnectNodes).toHaveBeenCalledWith({
    sourceNodeId: 'prompt',
    sourceOutput: 'CONDITIONING',
    targetNodeId: 'sampler',
    targetInput: 'positive',
  });
});
```

**Step 2: Run tests to verify failure**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: FAIL because toolbar buttons do not exist.

**Step 3: Implement toolbar**

Add toolbar buttons:

- `Add Prompt Encode node`
- `Add Model Loader node`
- `Add Sampler node`
- `Add Preview node`
- `Add Save Output node`
- `Start connection from selected node`
- `Delete selection`

For first slice, connection can use class defaults:

```ts
function getDefaultOutputForClassType(classType: string) {
  if (classType === 'CLIPTextEncode') return 'CONDITIONING';
  if (classType === 'CheckpointLoaderSimple') return 'MODEL';
  if (classType === 'KSampler') return 'IMAGE';
  return 'output';
}

function getDefaultInputForClassType(classType: string) {
  if (classType === 'KSampler') return 'positive';
  if (classType === 'PreviewImage') return 'images';
  if (classType === 'SaveImage') return 'images';
  return 'input';
}
```

**Step 4: Run tests**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowGraphEditor.tsx src/components/workflow/WorkflowGraphEditor.test.tsx
git commit -m "feat(workflow): edit graph from toolbar"
```

## Task 7: Add Drag-To-Move Node Editing

**Files:**
- Modify: `src/components/workflow/WorkflowGraphEditor.tsx`
- Modify: `src/components/workflow/WorkflowGraphEditor.test.tsx`

**Step 1: Write failing drag test**

Add:

```tsx
it('moves a node by pointer drag', () => {
  const onMoveNode = vi.fn();
  render(<WorkflowGraphEditor graph={graph} onMoveNode={onMoveNode} onAddNode={() => {}} onConnectNodes={() => {}} onDeleteSelection={() => {}} />);

  const node = screen.getByRole('button', { name: 'Prompt Encode node' });
  fireEvent.pointerDown(node, { clientX: 50, clientY: 90, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 90, clientY: 120, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 90, clientY: 120, pointerId: 1 });

  expect(onMoveNode).toHaveBeenCalledWith('prompt', { x: 80, y: 110 });
});
```

**Step 2: Run tests to verify failure**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: FAIL because dragging is not implemented.

**Step 3: Implement pointer drag**

Use local refs/state:

- store drag start node id
- store original position
- store pointer start coordinates
- listen to `window.pointermove` and `window.pointerup` while dragging
- call `onMoveNode` on pointer up with rounded position

Keep this simple. Do not add pan/zoom in this task.

**Step 4: Run tests**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowGraphEditor.tsx src/components/workflow/WorkflowGraphEditor.test.tsx
git commit -m "feat(workflow): move graph nodes"
```

## Task 8: Expose ComfyUI JSON Export In The Workbench

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Import from: `src/features/workflow/comfyExport.ts`

**Step 1: Write failing export UI test**

Add to `WorkflowWorkbench.test.tsx`:

```tsx
it('exports the active graph as ComfyUI API JSON', async () => {
  const user = userEvent.setup();

  render(<WorkflowWorkbench />);
  await user.click(screen.getByRole('button', { name: 'Export ComfyUI JSON' }));

  expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent('"class_type": "KSampler"');
  expect(screen.getByRole('region', { name: 'ComfyUI API JSON export' })).toHaveTextContent('"positive"');
});
```

**Step 2: Run the test to verify failure**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because export UI does not exist.

**Step 3: Add export state and button**

In `WorkflowWorkbench`:

- import `useState`
- import `exportWorkflowGraphToComfyPrompt`
- keep local state `exportedJson: string | null`
- add a button in the graph header:

```tsx
<button
  type="button"
  onClick={() => setExportedJson(JSON.stringify(exportWorkflowGraphToComfyPrompt(activeWorkflow.graph), null, 2))}
  className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary"
>
  Export ComfyUI JSON
</button>
```

Render export panel when `exportedJson` exists:

```tsx
{exportedJson && (
  <pre
    role="region"
    aria-label="ComfyUI API JSON export"
    className="max-h-48 overflow-auto border-t border-border bg-canvas p-3 type-meta text-text-body"
  >
    {exportedJson}
  </pre>
)}
```

**Step 4: Run tests**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): expose comfy json export"
```

## Task 9: Full Verification

**Files:**
- No code changes unless verification exposes failures.

**Step 1: Run focused workflow tests**

Run:

```powershell
npx vitest run src/store/appStore.test.ts src/features/workflow/comfyExport.test.ts --project unit
npx vitest run src/components/workflow/WorkflowGraphEditor.test.tsx src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: PASS.

**Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

**Step 3: Run full frontend test suite**

Run:

```powershell
npm run test
```

Expected: PASS.

**Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS with no CSS optimizer warning and no renderer chunk-size warning.

If build modifies generated Electron bundles, restore them before committing:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Step 5: Check diff hygiene**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended source/test files modified.

**Step 6: Final commit if needed**

If any verification fixes were required:

```powershell
git add <changed files>
git commit -m "fix(workflow): stabilize comfy graph editor"
```

## Task 10: Push And Report

**Files:**
- No code changes.

**Step 1: Push**

Run:

```powershell
git push
```

Expected: branch pushes to `origin/main`.

**Step 2: Confirm clean state**

Run:

```powershell
git status --short --branch
```

Expected: `## main...origin/main`.

**Step 3: Report**

Include:

- commit hashes
- files changed by task
- tests/build commands run
- note that ComfyUI execution/import remains out of scope for this slice
