import type { WorkflowGraph } from '@/types/workflow';
import { namedOutputToSlot } from './nodeSlots';

export type ComfyPrompt = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, string | number | boolean | null | [string, string | number]>;
    _meta?: {
      title?: string;
    };
  }
>;

/**
 * Resolve an in-app named output to the integer slot ComfyUI requires. First-class
 * source nodes map to their canonical slot index; opaque or unmapped outputs pass
 * through verbatim so no link is silently dropped (M8 S4).
 */
function resolveExportSlot(graph: WorkflowGraph, nodeId: string, output: string): string | number {
  const sourceClassType = graph.nodes[nodeId]?.classType;
  const slot = sourceClassType ? namedOutputToSlot(sourceClassType, output) : null;
  return slot ?? output;
}

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
            input.kind === 'link'
              ? [input.nodeId, resolveExportSlot(graph, input.nodeId, input.output)]
              : input.value,
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

  for (const node of Object.values(graph.nodes)) {
    for (const input of Object.values(node.inputs)) {
      if (input.kind === 'link' && !graph.nodes[input.nodeId]) {
        throw new Error(`Workflow graph link references missing source node "${input.nodeId}"`);
      }
    }
  }

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
}
