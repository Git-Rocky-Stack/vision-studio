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
