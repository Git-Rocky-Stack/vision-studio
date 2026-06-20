import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphInput,
  WorkflowGraphNode,
} from '@/types/workflow';
import type { ComfyPrompt } from './comfyExport';
import { FIRST_CLASS_NODES, NODE_REGISTRY } from './nodeDefaults';
import { slotToNamedOutput } from './nodeSlots';
import { evaluateGraphSafety } from './comfyImportSafety';

export interface ImportFidelityReport {
  totalNodes: number;
  firstClassNodes: number;
  opaqueNodes: { id: string; classType: string }[];
  unresolvedModels: { nodeId: string; field: string; value: string }[];
  warnings: string[];
  /** True iff every node is first-class, all model refs resolve, and the safety pre-check is clean. */
  executable: boolean;
}

export interface ImportResult {
  graph: WorkflowGraph;
  report: ImportFidelityReport;
}

const MODEL_FIELDS = ['ckpt_name', 'lora_name', 'vae_name'];
const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 160;

type ComfyInputValue = ComfyPrompt[string]['inputs'][string];

function isLinkTuple(value: ComfyInputValue, prompt: ComfyPrompt): value is [string, string | number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    (typeof value[1] === 'string' || typeof value[1] === 'number') &&
    prompt[value[0]] !== undefined
  );
}

/** Advisory drift-normalizer: lowercase, drop extension + separators, drop version
 *  digits that sit between letters (flux1dev -> fluxdev) so flux-dev ~ flux1-dev. */
function normalizeModelFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[-_ .]/g, '')
    .replace(/(?<=[a-z])\d+(?=[a-z])/g, '');
}

function computeDepths(prompt: ComfyPrompt): Record<string, number> {
  const memo: Record<string, number> = {};
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (memo[id] !== undefined) return memo[id];
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let d = 0;
    for (const value of Object.values(prompt[id]?.inputs ?? {})) {
      if (isLinkTuple(value, prompt)) d = Math.max(d, depth(value[0]) + 1);
    }
    visiting.delete(id);
    memo[id] = d;
    return d;
  };
  for (const id of Object.keys(prompt)) depth(id);
  return memo;
}

function layout(prompt: ComfyPrompt): Record<string, { x: number; y: number }> {
  const depths = computeDepths(prompt);
  const byColumn: Record<number, string[]> = {};
  for (const id of Object.keys(prompt).sort()) {
    (byColumn[depths[id]] ??= []).push(id);
  }
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [depth, ids] of Object.entries(byColumn)) {
    ids.forEach((id, row) => {
      positions[id] = { x: Number(depth) * COLUMN_WIDTH, y: row * ROW_HEIGHT };
    });
  }
  return positions;
}

export function importComfyPromptToWorkflowGraph(
  prompt: ComfyPrompt,
  context: { knownModelFilenames: string[] }
): ImportResult {
  const positions = layout(prompt);
  const knownModels = new Set(context.knownModelFilenames.map(normalizeModelFilename));
  const nodes: Record<string, WorkflowGraphNode> = {};
  const edges: WorkflowGraphEdge[] = [];
  const opaqueNodes: { id: string; classType: string }[] = [];
  const unresolvedModels: { nodeId: string; field: string; value: string }[] = [];
  const warnings: string[] = [];

  for (const [nodeId, node] of Object.entries(prompt)) {
    const isFirstClass = FIRST_CLASS_NODES.has(node.class_type);
    if (!isFirstClass) opaqueNodes.push({ id: nodeId, classType: node.class_type });

    const inputs: Record<string, WorkflowGraphInput> = {};
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLinkTuple(value, prompt)) {
        const sourceClassType = prompt[value[0]].class_type;
        const slot = typeof value[1] === 'number' ? value[1] : Number(value[1]);
        const named = slotToNamedOutput(sourceClassType, slot);
        const output = named ?? String(value[1]);
        if (!named) warnings.push(`Node ${nodeId} link "${name}" kept raw output slot "${value[1]}"`);
        inputs[name] = { kind: 'link', nodeId: value[0], output };
        edges.push({
          id: `edge-${value[0]}-${nodeId}-${name}`,
          sourceNodeId: value[0],
          sourceOutput: output,
          targetNodeId: nodeId,
          targetInput: name,
        });
      } else {
        inputs[name] = { kind: 'literal', value: value as string | number | boolean | null };
        if (MODEL_FIELDS.includes(name) && typeof value === 'string') {
          if (!knownModels.has(normalizeModelFilename(value))) {
            unresolvedModels.push({ nodeId, field: name, value });
          }
        }
      }
    }

    nodes[nodeId] = {
      id: nodeId,
      classType: node.class_type,
      label: node._meta?.title ?? NODE_REGISTRY[node.class_type]?.label ?? node.class_type,
      inputs,
      position: positions[nodeId] ?? { x: 0, y: 0 },
      metadata: { state: 'pending' },
    };
  }

  const safety = evaluateGraphSafety(prompt);
  const report: ImportFidelityReport = {
    totalNodes: Object.keys(prompt).length,
    firstClassNodes: Object.keys(prompt).length - opaqueNodes.length,
    opaqueNodes,
    unresolvedModels,
    warnings,
    executable: safety.safe && unresolvedModels.length === 0,
  };

  return { graph: { nodes, edges }, report };
}
