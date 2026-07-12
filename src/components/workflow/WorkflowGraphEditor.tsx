import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow';
import {
  addNodeActions,
  getDefaultOutputForClassType,
  getDefaultInputForConnection,
} from '@/features/workflow/nodeDefaults';
import type { WorkflowLoraOption } from '@/features/workflow/workflowLoras';
import { cn } from '@/utils/cn';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 86;

type GraphSelection = { type: 'node' | 'edge'; id: string };

interface WorkflowGraphEditorProps {
  graph: WorkflowGraph;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onAddNode: (classType: string) => void;
  onConnectNodes: (edge: Omit<WorkflowGraphEdge, 'id'>) => void;
  onDeleteSelection: (selection: GraphSelection) => void;
  /** #43: installed-LoRA options for the LoRA Loader node inspector. */
  loraOptions?: WorkflowLoraOption[];
  /** #43: writes a literal node input (LoRA selection, strengths). */
  onUpdateNodeInput?: (nodeId: string, inputName: string, value: string | number) => void;
}

interface DragState {
  nodeId: string;
  cleanup: () => void;
}

function getEdgePath(
  edge: WorkflowGraphEdge,
  graph: WorkflowGraph,
  previewPositions: Record<string, WorkflowGraphNode['position']>
) {
  const source = graph.nodes[edge.sourceNodeId];
  const target = graph.nodes[edge.targetNodeId];
  if (!source || !target) return '';

  const sourcePosition = previewPositions[source.id] ?? source.position;
  const targetPosition = previewPositions[target.id] ?? target.position;
  const sourceX = sourcePosition.x + NODE_WIDTH;
  const sourceY = sourcePosition.y + NODE_HEIGHT / 2;
  const targetX = targetPosition.x;
  const targetY = targetPosition.y + NODE_HEIGHT / 2;
  const curveOffset = Math.max(72, Math.abs(targetX - sourceX) / 2);

  return `M ${sourceX} ${sourceY} C ${sourceX + curveOffset} ${sourceY}, ${targetX - curveOffset} ${targetY}, ${targetX} ${targetY}`;
}

export function WorkflowGraphEditor({
  graph,
  onMoveNode,
  onAddNode,
  onConnectNodes,
  onDeleteSelection,
  loraOptions = [],
  onUpdateNodeInput,
}: WorkflowGraphEditorProps) {
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [previewPositions, setPreviewPositions] = useState<Record<string, WorkflowGraphNode['position']>>({});
  const dragRef = useRef<DragState | null>(null);
  const nodes = useMemo(() => Object.values(graph.nodes), [graph.nodes]);
  const selectedNode = selection?.type === 'node' ? graph.nodes[selection.id] : null;
  const selectedEdge =
    selection?.type === 'edge' ? graph.edges.find((edge) => edge.id === selection.id) : null;
  const connectionDescription = graph.edges
    .map((edge) => {
      const source = graph.nodes[edge.sourceNodeId];
      const target = graph.nodes[edge.targetNodeId];
      return source && target ? `${source.label} connects to ${target.label}` : null;
    })
    .filter(Boolean)
    .join('. ');

  function selectNode(node: WorkflowGraphNode) {
    if (connectionSourceId && connectionSourceId !== node.id) {
      const source = graph.nodes[connectionSourceId];
      if (source) {
        const sourceOutput = getDefaultOutputForClassType(source.classType);

        onConnectNodes({
          sourceNodeId: source.id,
          sourceOutput,
          targetNodeId: node.id,
          targetInput: getDefaultInputForConnection(sourceOutput, node.classType),
        });
      }
      setConnectionSourceId(null);
    }

    setSelection({ type: 'node', id: node.id });
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) {
    if (event.button !== 0) return;
    selectNode(node);

    const renderedPosition = previewPositions[node.id] ?? node.position;
    const pointerStart = { x: event.clientX, y: event.clientY };
    const calculatePosition = (pointerEvent: PointerEvent) => ({
      x: Math.round(renderedPosition.x + pointerEvent.clientX - pointerStart.x),
      y: Math.round(renderedPosition.y + pointerEvent.clientY - pointerStart.y),
    });
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      setPreviewPositions((positions) => ({
        ...positions,
        [drag.nodeId]: calculatePosition(pointerEvent),
      }));
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const nextPosition = calculatePosition(pointerEvent);

      setPreviewPositions((positions) => ({
        ...positions,
        [drag.nodeId]: nextPosition,
      }));
      onMoveNode(drag.nodeId, nextPosition);
      drag.cleanup();
      dragRef.current = null;
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    dragRef.current = {
      nodeId: node.id,
      cleanup,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handleNodeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, node: WorkflowGraphNode) {
    const step = event.shiftKey ? 64 : 16;
    const movement: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };
    const delta = movement[event.key];
    if (!delta) {
      return;
    }

    event.preventDefault();
    selectNode(node);
    const currentPosition = previewPositions[node.id] ?? node.position;
    const nextPosition = {
      x: currentPosition.x + delta.x,
      y: currentPosition.y + delta.y,
    };
    setPreviewPositions((positions) => ({
      ...positions,
      [node.id]: nextPosition,
    }));
    onMoveNode(node.id, nextPosition);
  }

  return (
    <section
      role="region"
      aria-label="Workflow graph editor"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3">
        {addNodeActions.map((action) => (
          <button
            key={action.classType}
            type="button"
            onClick={() => onAddNode(action.classType)}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary"
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          disabled={selection?.type !== 'node'}
          onClick={() => {
            if (selection?.type === 'node') setConnectionSourceId(selection.id);
          }}
          className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start connection from selected node
        </button>
        <button
          type="button"
          disabled={!selection}
          onClick={() => {
            if (!selection) return;

            onDeleteSelection(selection);
            if (selection.type === 'node' && connectionSourceId === selection.id) {
              setConnectionSourceId(null);
            }
            setSelection(null);
          }}
          className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete selection
        </button>
      </div>

      <div className="relative min-h-[520px] flex-1 overflow-auto">
        <div className="relative h-[640px] min-w-[980px]">
          <svg
            className="absolute inset-0 h-full w-full"
            aria-label={`Workflow graph with ${nodes.length} nodes and ${graph.edges.length} ${graph.edges.length === 1 ? 'connection' : 'connections'}`}
          >
            <title>Workflow graph editor</title>
            <desc>{connectionDescription || 'No workflow connections.'}</desc>
            {graph.edges.map((edge) => {
              const isSelected = selection?.type === 'edge' && selection.id === edge.id;
              const path = getEdgePath(edge, graph, previewPositions);
              if (!path) return null;

              return (
                <path
                  key={edge.id}
                  data-testid={`workflow-edge-${edge.id}`}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isSelected ? 3 : 2}
                  className={isSelected ? 'text-accent-primary' : 'text-border-hover'}
                />
              );
            })}
          </svg>

          {graph.edges.map((edge) => {
            const source = graph.nodes[edge.sourceNodeId];
            const target = graph.nodes[edge.targetNodeId];
            if (!source || !target) return null;
            const sourcePosition = previewPositions[source.id] ?? source.position;
            const targetPosition = previewPositions[target.id] ?? target.position;

            return (
              <button
                key={edge.id}
                type="button"
                aria-label={`${source.label} to ${target.label} edge`}
                onClick={() => setSelection({ type: 'edge', id: edge.id })}
                className="absolute h-6 w-6 rounded-md border border-border bg-surface type-meta text-text-body"
                style={{
                  left: `${(sourcePosition.x + targetPosition.x + NODE_WIDTH) / 2 - 12}px`,
                  top: `${(sourcePosition.y + targetPosition.y + NODE_HEIGHT) / 2 - 12}px`,
                }}
              >
                +
              </button>
            );
          })}

          {nodes.map((node) => {
            const isSelected = selection?.type === 'node' && selection.id === node.id;
            const isConnectionSource = connectionSourceId === node.id;
            const position = previewPositions[node.id] ?? node.position;

            return (
              <button
                key={node.id}
                type="button"
                aria-label={`${node.label} node`}
                onClick={() => selectNode(node)}
                onKeyDown={(event) => handleNodeKeyDown(event, node)}
                onPointerDown={(event) => startDrag(event, node)}
                className={cn(
                  'absolute flex flex-col items-start rounded-md border bg-surface px-3 py-3 text-left shadow-sm transition-all',
                  isSelected
                    ? 'border-accent-primary-border text-accent-primary'
                    : 'border-border text-text-primary',
                  isConnectionSource && 'ring-2 ring-accent-primary/35'
                )}
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  width: `${node.size?.width ?? NODE_WIDTH}px`,
                  minHeight: `${node.size?.height ?? NODE_HEIGHT}px`,
                }}
              >
                <span className="type-section">{node.label}</span>
                <span className="mt-2 type-ui text-text-muted">
                  {Object.keys(node.inputs).length} inputs
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="border-t border-border bg-surface px-4 py-3">
        {selectedNode ? (
          <div>
            <h3 className="type-section">{selectedNode.label}</h3>
            <p className="mt-1 type-caption">{selectedNode.classType}</p>
            <p className="mt-2 type-ui text-text-muted">
              Position {selectedNode.position.x}, {selectedNode.position.y}
            </p>
            {selectedNode.classType === 'LoraLoader' && (
              <LoraLoaderInspector
                node={selectedNode}
                loraOptions={loraOptions}
                onUpdateNodeInput={onUpdateNodeInput}
              />
            )}
          </div>
        ) : selectedEdge ? (
          <div>
            <h3 className="type-section">Selected edge</h3>
            <p className="mt-1 type-caption">
              {selectedEdge.sourceNodeId}.{selectedEdge.sourceOutput} to {selectedEdge.targetNodeId}.
              {selectedEdge.targetInput}
            </p>
          </div>
        ) : (
          <p className="type-caption">Select a node or edge to inspect it.</p>
        )}
      </aside>
    </section>
  );
}

/**
 * LoRA Loader node inspector (#43): selection from the installed-LoRA library
 * (base-arch-incompatible entries stay visible but disabled) plus the model
 * strength that maps onto the stack weight at execution.
 */
function LoraLoaderInspector({
  node,
  loraOptions,
  onUpdateNodeInput,
}: {
  node: WorkflowGraphNode;
  loraOptions: WorkflowLoraOption[];
  onUpdateNodeInput?: (nodeId: string, inputName: string, value: string | number) => void;
}) {
  const nameInput = node.inputs.lora_name;
  const currentLoraName =
    nameInput?.kind === 'literal' && typeof nameInput.value === 'string' ? nameInput.value : '';
  const strengthInput = node.inputs.strength_model;
  const currentStrength =
    strengthInput?.kind === 'literal' && typeof strengthInput.value === 'number'
      ? strengthInput.value
      : 1;

  if (loraOptions.length === 0) {
    return (
      <p className="mt-3 type-caption">
        No LoRAs installed. Pull one from the Foundry library to use this node.
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <label className="space-y-1">
        <span className="type-caption text-text-muted">LoRA</span>
        <select
          aria-label="LoRA selection"
          value={currentLoraName}
          onChange={(event) => onUpdateNodeInput?.(node.id, 'lora_name', event.target.value)}
          className="w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-primary focus:outline-none transition-all"
        >
          <option value="">Select a LoRA</option>
          {loraOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={!option.compatible}>
              {option.compatible ? option.label : `${option.label} (incompatible base)`}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="type-caption text-text-muted">Model strength</span>
        <input
          aria-label="LoRA model strength"
          type="number"
          min={0}
          max={2}
          step={0.05}
          value={currentStrength}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) {
              onUpdateNodeInput?.(node.id, 'strength_model', value);
            }
          }}
          className="w-full rounded-md border border-border bg-elevated px-2 py-1.5 data-mono text-text-primary focus:border-accent-primary focus:outline-none transition-all"
        />
      </label>
    </div>
  );
}
