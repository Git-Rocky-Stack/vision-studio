# Workflow Comfy Graph Design

## Goal

Replace the Workflow workbench's linear run-plan surface with an editable graph editor whose source of truth is a ComfyUI-style JSON model. The first implementation must support editable nodes and edges immediately, and it must include an exporter that converts the stored graph into ComfyUI API JSON.

## Current State

`src/components/workflow/WorkflowWorkbench.tsx` renders a three-column surface:

- left workflow metadata, inputs, tags, and notes
- center linear run plan from `WorkflowRecord.steps`
- right workflow library and run output history

`src/store/appStore.ts` stores `WorkflowRecord` objects with metadata, settings, inputs, linear `steps`, output summary, and run history. There is no graph model, no edge model, and no ComfyUI export path.

## Product Direction

The workflow editor should become a real node workflow surface instead of a presentational run plan. The first graph slice should be editable, but still bounded:

- Store graph JSON on each workflow record.
- Render editable graph nodes and edges in the existing center workbench area.
- Preserve the current left metadata panel and right library/output panel.
- Keep linear `steps` as a temporary compatibility summary while graph features land.
- Provide a deterministic exporter to ComfyUI API JSON as a critical feature, not a later nice-to-have.

## ComfyUI-Style Graph Model

Add a graph field to `WorkflowRecord`.

```ts
export interface WorkflowGraph {
  nodes: Record<string, WorkflowGraphNode>;
  edges: WorkflowGraphEdge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface WorkflowGraphNode {
  id: string;
  classType: string;
  label: string;
  inputs: Record<string, WorkflowGraphInput>;
  position: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  metadata?: {
    state?: WorkflowStepState;
    description?: string;
  };
}

export type WorkflowGraphInput =
  | {
      kind: 'literal';
      value: string | number | boolean | null;
    }
  | {
      kind: 'link';
      nodeId: string;
      output: string;
    };

export interface WorkflowGraphEdge {
  id: string;
  sourceNodeId: string;
  sourceOutput: string;
  targetNodeId: string;
  targetInput: string;
}
```

This model is intentionally close to ComfyUI:

- Node IDs are stable string keys.
- `classType` maps to ComfyUI `class_type`.
- Literal inputs stay inline.
- Linked inputs point to `[sourceNodeId, sourceOutput]` during export.
- Unknown node classes are allowed so imported or future nodes do not break the editor.

## Default Graphs

Seed existing workflows with graph nodes equivalent to the current linear steps:

- `CLIPTextEncode` or product-level `PromptEncode`
- `CheckpointLoaderSimple` or product-level `ModelLoader`
- `KSampler`
- `PreviewImage`
- `SaveImage`

Edges should create a simple left-to-right generation flow. Existing `WorkflowRecord.steps` remain for summary labels and tests until a later migration derives them from graph topology.

## Editor Behavior

The first graph editor should support:

- Render graph nodes as compact Carbon Pro cards.
- Render edges as SVG paths between output/input anchors.
- Select a node or edge.
- Drag nodes and persist positions.
- Add a node from predefined node types:
  - Prompt Encode
  - Model Loader
  - Sampler
  - Preview
  - Save Output
- Connect an output to an input.
- Delete a selected node or edge.
- Show a compact selected-node inspector in the graph surface.

Pan/zoom can be deferred unless a graph library makes it essentially free. Node creation, selection, movement, and edge editing are required in the first slice.

## Store Actions

Add actions to `useAppStore`:

- `addWorkflowNode(workflowId, nodeInput)`
- `moveWorkflowNode(workflowId, nodeId, position)`
- `updateWorkflowNode(workflowId, nodeId, updates)`
- `deleteWorkflowNode(workflowId, nodeId)`
- `connectWorkflowNodes(workflowId, edgeInput)`
- `deleteWorkflowEdge(workflowId, edgeId)`
- `setWorkflowGraphViewport(workflowId, viewport)`

Store validation should enforce:

- No self-links.
- No duplicate edge for the same `targetNodeId + targetInput`.
- Source and target nodes must exist.
- Deleting a node removes connected edges and any linked inputs that referenced that node.
- Unknown `classType` is valid and shown as a custom node.

## ComfyUI API JSON Exporter

The exporter is critical and should be implemented alongside the graph data model.

Create a pure utility, likely under `src/features/workflow/comfyExport.ts`, that converts `WorkflowGraph` into ComfyUI API prompt JSON.

Input:

```ts
export function exportWorkflowGraphToComfyPrompt(graph: WorkflowGraph): ComfyPrompt
```

Output shape:

```ts
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
```

Export rules:

- For every graph node, emit a key matching `node.id`.
- Emit `class_type` from `node.classType`.
- Literal inputs export as their literal value.
- Linked inputs export as `[sourceNodeId, sourceOutput]`.
- Node labels export to `_meta.title`.
- Validate links before export.
- Throw a clear error for missing source node, missing target node, duplicate target input, and self-link.

This exporter does not submit to ComfyUI yet. It only produces API-compatible prompt JSON that backend execution can consume in a later integration slice.

## UI Architecture

Create a graph-focused component boundary:

- `WorkflowWorkbench` remains the coordinator.
- `WorkflowGraphEditor` owns graph rendering and local selection state.
- `WorkflowGraphNodeCard` renders a node.
- `WorkflowGraphEdgeLayer` renders edge paths.
- `WorkflowGraphToolbar` adds nodes and triggers delete/export actions.
- `WorkflowNodeInspector` shows selected node details.

The first implementation can use custom HTML/SVG to avoid dependency churn. If interaction quality becomes the bottleneck, the graph data model still maps cleanly to React Flow or XYFlow later.

## Testing

Use TDD for every implementation slice.

Required tests:

- Store graph seeding on default workflows.
- Store add/move/update/delete node.
- Store connect/delete edge.
- Store validation for self-link, duplicate target input, and missing nodes.
- Exporter converts literals and links to ComfyUI API JSON.
- Exporter fails clearly for invalid graph edges.
- Component renders graph nodes and edges.
- Component selects nodes.
- Component adds a node from toolbar.
- Component deletes selected node or edge.

Run focused tests first, then:

```powershell
npm run typecheck
npm run test
npm run build
git diff --check
```

## Non-Goals For First Slice

- Executing graph workflows against ComfyUI.
- Importing arbitrary ComfyUI workflow JSON.
- Full pan/zoom minimap behavior.
- Auto-layout.
- Rich node parameter editors for every ComfyUI class.
- Converting all existing linear workflow tests to graph-only semantics.

## Acceptance Criteria

- Workflow records include editable graph JSON.
- The Workflow center surface is an editable graph, not only a linear list.
- Users can add, select, move, connect, and delete graph nodes/edges.
- Existing workflow library and run output behavior still works.
- A pure exporter converts stored graph JSON into ComfyUI API prompt JSON.
- Tests cover store actions, component behavior, and export conversion.
- Typecheck, full Vitest, and build pass.
