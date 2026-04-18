import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode } from '@/store/appStore';
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
}

interface DragState {
  nodeId: string;
  origin: WorkflowGraphNode['position'];
  pointerStart: { x: number; y: number };
  cleanup: () => void;
}

const addNodeActions = [
  { label: 'Add Prompt Encode node', classType: 'CLIPTextEncode' },
  { label: 'Add Model Loader node', classType: 'CheckpointLoaderSimple' },
  { label: 'Add Sampler node', classType: 'KSampler' },
  { label: 'Add Preview node', classType: 'PreviewImage' },
  { label: 'Add Save Output node', classType: 'SaveImage' },
];

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

function getEdgePath(edge: WorkflowGraphEdge, graph: WorkflowGraph) {
  const source = graph.nodes[edge.sourceNodeId];
  const target = graph.nodes[edge.targetNodeId];
  if (!source || !target) return '';

  const sourceX = source.position.x + NODE_WIDTH;
  const sourceY = source.position.y + NODE_HEIGHT / 2;
  const targetX = target.position.x;
  const targetY = target.position.y + NODE_HEIGHT / 2;
  const curveOffset = Math.max(72, Math.abs(targetX - sourceX) / 2);

  return `M ${sourceX} ${sourceY} C ${sourceX + curveOffset} ${sourceY}, ${targetX - curveOffset} ${targetY}, ${targetX} ${targetY}`;
}

export function WorkflowGraphEditor({
  graph,
  onMoveNode,
  onAddNode,
  onConnectNodes,
  onDeleteSelection,
}: WorkflowGraphEditorProps) {
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodes = useMemo(() => Object.values(graph.nodes), [graph.nodes]);
  const selectedNode = selection?.type === 'node' ? graph.nodes[selection.id] : null;
  const selectedEdge =
    selection?.type === 'edge' ? graph.edges.find((edge) => edge.id === selection.id) : null;

  function selectNode(node: WorkflowGraphNode) {
    if (connectionSourceId && connectionSourceId !== node.id) {
      const source = graph.nodes[connectionSourceId];
      if (source) {
        onConnectNodes({
          sourceNodeId: source.id,
          sourceOutput: getDefaultOutputForClassType(source.classType),
          targetNodeId: node.id,
          targetInput: getDefaultInputForClassType(node.classType),
        });
      }
      setConnectionSourceId(null);
    }

    setSelection({ type: 'node', id: node.id });
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) {
    if (event.button !== 0) return;
    selectNode(node);

    const handlePointerMove = () => {};
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const nextPosition = {
        x: Math.round(drag.origin.x + pointerEvent.clientX - drag.pointerStart.x),
        y: Math.round(drag.origin.y + pointerEvent.clientY - drag.pointerStart.y),
      };

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
      origin: { ...node.position },
      pointerStart: { x: event.clientX, y: event.clientY },
      cleanup,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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
            if (selection) onDeleteSelection(selection);
          }}
          className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete selection
        </button>
      </div>

      <div className="relative min-h-[520px] flex-1 overflow-auto">
        <div className="relative h-[640px] min-w-[980px]">
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {graph.edges.map((edge) => {
              const isSelected = selection?.type === 'edge' && selection.id === edge.id;
              const path = getEdgePath(edge, graph);
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

            return (
              <button
                key={edge.id}
                type="button"
                aria-label={`${source.label} to ${target.label} edge`}
                onClick={() => setSelection({ type: 'edge', id: edge.id })}
                className="absolute h-6 w-6 rounded-md border border-border bg-surface type-meta text-text-body"
                style={{
                  left: `${(source.position.x + target.position.x + NODE_WIDTH) / 2 - 12}px`,
                  top: `${(source.position.y + target.position.y + NODE_HEIGHT) / 2 - 12}px`,
                }}
              >
                +
              </button>
            );
          })}

          {nodes.map((node) => {
            const isSelected = selection?.type === 'node' && selection.id === node.id;
            const isConnectionSource = connectionSourceId === node.id;

            return (
              <button
                key={node.id}
                type="button"
                aria-label={`${node.label} node`}
                onClick={() => selectNode(node)}
                onPointerDown={(event) => startDrag(event, node)}
                className={cn(
                  'absolute flex flex-col items-start rounded-md border bg-surface px-3 py-3 text-left shadow-sm transition-all',
                  isSelected
                    ? 'border-accent-primary-border text-accent-primary'
                    : 'border-border text-text-primary',
                  isConnectionSource && 'ring-2 ring-accent-primary/35'
                )}
                style={{
                  left: `${node.position.x}px`,
                  top: `${node.position.y}px`,
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
