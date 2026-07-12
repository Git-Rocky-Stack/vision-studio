import { isLoraCompatible } from '@/store/slices/modelsSlice';
import type {
  WorkflowExecutionContext,
  WorkflowExecutionIssue,
  WorkflowExecutionSummary,
  WorkflowGenerationRequest,
  WorkflowGraphNode,
  WorkflowRecord,
} from '@/types/workflow';
import { resolveCheckpointRecord, resolveLoraByComfyName } from './workflowLoras';

interface WorkflowGenerationResolution {
  request: WorkflowGenerationRequest | null;
  summary: WorkflowExecutionSummary | null;
  issues: WorkflowExecutionIssue[];
}

export function resolveWorkflowGenerationRequest(
  workflow: WorkflowRecord,
  context: WorkflowExecutionContext
): WorkflowGenerationResolution {
  const issues: WorkflowExecutionIssue[] = [];
  const samplerNodes = Object.values(workflow.graph.nodes).filter(
    (node) => node.classType === 'KSampler'
  );
  const samplerNode = samplerNodes.length === 1 ? samplerNodes[0] : null;

  if (!samplerNode) {
    return {
      request: null,
      summary: null,
      issues,
    };
  }

  const promptNode = getLinkedNode(workflow, samplerNode, 'positive', 'CLIPTextEncode');
  // #43: the sampler's model input may chain through LoraLoader nodes before
  // reaching the checkpoint, mirroring how ComfyUI stacks adapters.
  const { modelNode, loraNodes } = walkModelChain(workflow, samplerNode);

  const prompt = getPrompt(promptNode, context);
  if (!prompt) {
    issues.push({
      severity: 'error',
      code: 'missing-prompt',
      message: 'Workflow execution requires a prompt from the graph, active scene, or draft.',
      nodeId: samplerNode.id,
    });
  }

  const model = getModel(modelNode, context);
  if (!model) {
    issues.push({
      severity: 'error',
      code: 'missing-model',
      message: 'Workflow execution requires a checkpoint from the graph or draft context.',
      nodeId: samplerNode.id,
    });
  }

  const loras = resolveLoraSelections(loraNodes, model, context, issues);

  const steps = readPositiveNumberInput(
    samplerNode,
    'steps',
    workflow.settings.steps,
    samplerNode.id,
    issues
  );
  const cfgScale = readPositiveNumberInput(
    samplerNode,
    'cfg',
    workflow.settings.cfgScale,
    samplerNode.id,
    issues
  );
  const seed = readSeedInput(samplerNode, context, samplerNode.id, issues);

  if (issues.some((issue) => issue.severity === 'error')) {
    return {
      request: null,
      summary: null,
      issues,
    };
  }

  const summary: WorkflowExecutionSummary = {
    prompt: prompt!,
    negativePrompt: getNegativePrompt(context),
    model: model!,
    width: workflow.settings.width,
    height: workflow.settings.height,
    steps: steps!,
    cfgScale: cfgScale!,
    ...(typeof seed === 'number' ? { seed } : {}),
  };

  return {
    request: {
      prompt: summary.prompt,
      negative_prompt: summary.negativePrompt,
      model: summary.model,
      width: summary.width,
      height: summary.height,
      steps: summary.steps,
      cfg_scale: summary.cfgScale,
      ...(summary.seed !== undefined ? { seed: summary.seed } : {}),
      ...(loras.length > 0 ? { loras } : {}),
    },
    summary,
    issues,
  };
}

/**
 * Follow the sampler's model input upstream: collect LoraLoader nodes until
 * the CheckpointLoaderSimple terminates the chain. Returned LoRA nodes are
 * checkpoint-first, matching ComfyUI stacking order. A broken or cyclic chain
 * returns modelNode null (the draft-model fallback then applies).
 */
function walkModelChain(workflow: WorkflowRecord, samplerNode: WorkflowGraphNode) {
  const loraNodes: WorkflowGraphNode[] = [];
  const visited = new Set<string>();
  let input = samplerNode.inputs.model;

  while (input?.kind === 'link') {
    const node = workflow.graph.nodes[input.nodeId];
    if (!node || visited.has(node.id)) break;
    visited.add(node.id);

    if (node.classType === 'CheckpointLoaderSimple') {
      return { modelNode: node, loraNodes: loraNodes.reverse() };
    }
    if (node.classType !== 'LoraLoader') {
      break;
    }
    loraNodes.push(node);
    input = node.inputs.model;
  }

  return { modelNode: null, loraNodes: loraNodes.reverse() };
}

/**
 * Map each LoRA Loader selection onto the installed library (#136 contract:
 * { id, weight }), validating presence, library membership, base-architecture
 * compatibility against the resolved checkpoint, and strength.
 */
function resolveLoraSelections(
  loraNodes: WorkflowGraphNode[],
  model: string | null,
  context: WorkflowExecutionContext,
  issues: WorkflowExecutionIssue[],
): Array<{ id: string; weight: number }> {
  if (loraNodes.length === 0) {
    return [];
  }

  const checkpointFamily = model
    ? (resolveCheckpointRecord(model, context.availableModels)?.base_architecture ?? null)
    : null;
  const selections: Array<{ id: string; weight: number }> = [];

  for (const node of loraNodes) {
    const nameInput = node.inputs.lora_name;
    const loraName =
      nameInput?.kind === 'literal' && typeof nameInput.value === 'string'
        ? nameInput.value.trim()
        : '';

    if (!loraName) {
      issues.push({
        severity: 'error',
        code: 'missing-lora',
        message: 'LoRA Loader node needs a LoRA selected from the installed library.',
        nodeId: node.id,
      });
      continue;
    }

    const record = resolveLoraByComfyName(loraName, context.availableModels);
    if (!record?.id) {
      issues.push({
        severity: 'error',
        code: 'unknown-lora',
        message: `"${loraName}" is not in the installed LoRA library. Pull it from the Foundry first.`,
        nodeId: node.id,
      });
      continue;
    }

    // Known incompatibility is refused up front; an unresolved checkpoint
    // skips the check and defers to the backend's fail-soft loader (#136).
    if (
      checkpointFamily &&
      record.base_architecture &&
      !isLoraCompatible(checkpointFamily, record.base_architecture)
    ) {
      issues.push({
        severity: 'error',
        code: 'incompatible-lora',
        message: `${record.name ?? record.id} (${record.base_architecture}) cannot load on a ${checkpointFamily} checkpoint.`,
        nodeId: node.id,
      });
      continue;
    }

    const strengthInput = node.inputs.strength_model;
    let weight = 1;
    if (strengthInput && strengthInput.kind === 'literal' && strengthInput.value !== null) {
      if (typeof strengthInput.value !== 'number' || !Number.isFinite(strengthInput.value)) {
        issues.push({
          severity: 'error',
          code: 'invalid-lora-strength',
          message: 'LoRA model strength must be a finite number.',
          nodeId: node.id,
        });
        continue;
      }
      weight = strengthInput.value;
    }

    selections.push({ id: record.id, weight });
  }

  return selections;
}

function getLinkedNode(
  workflow: WorkflowRecord,
  samplerNode: WorkflowGraphNode,
  inputName: string,
  expectedClassType: string
) {
  const input = samplerNode.inputs[inputName];
  if (input?.kind !== 'link') {
    return null;
  }

  const node = workflow.graph.nodes[input.nodeId];
  if (!node || node.classType !== expectedClassType) {
    return null;
  }

  return node;
}

function getPrompt(node: WorkflowGraphNode | null, context: WorkflowExecutionContext) {
  const graphPrompt =
    node?.inputs.text?.kind === 'literal' && typeof node.inputs.text.value === 'string'
      ? node.inputs.text.value.trim()
      : '';
  if (graphPrompt) {
    return graphPrompt;
  }

  const scenePrompt = context.activeScenePrompt?.trim() ?? '';
  if (scenePrompt) {
    return scenePrompt;
  }

  const draftPrompt = context.generationDraft?.prompt.trim() ?? '';
  return draftPrompt || null;
}

function getNegativePrompt(context: WorkflowExecutionContext) {
  return (
    context.activeSceneNegativePrompt?.trim() ??
    context.generationDraft?.negativePrompt.trim() ??
    ''
  );
}

function getModel(node: WorkflowGraphNode | null, context: WorkflowExecutionContext) {
  const graphModel =
    node?.inputs.ckpt_name?.kind === 'literal' && typeof node.inputs.ckpt_name.value === 'string'
      ? node.inputs.ckpt_name.value.trim()
      : '';
  if (graphModel) {
    return graphModel;
  }

  const draftModel = context.generationDraft?.model.trim() ?? '';
  return draftModel || null;
}

function readPositiveNumberInput(
  node: WorkflowGraphNode,
  inputName: string,
  fallback: number,
  nodeId: string,
  issues: WorkflowExecutionIssue[]
) {
  const input = node.inputs[inputName];
  if (!input || input.kind !== 'literal' || input.value === null) {
    return fallback;
  }

  if (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value <= 0) {
    issues.push({
      severity: 'error',
      code: 'invalid-sampler-value',
      message: `Sampler ${inputName} must be a positive number.`,
      nodeId,
    });
    return null;
  }

  return input.value;
}

function readSeedInput(
  node: WorkflowGraphNode,
  context: WorkflowExecutionContext,
  nodeId: string,
  issues: WorkflowExecutionIssue[]
) {
  const input = node.inputs.seed;
  if (!input) {
    return normalizeSeed(context.generationDraft?.seed);
  }

  if (input.kind !== 'literal' || input.value === null) {
    issues.push({
      severity: 'error',
      code: 'invalid-sampler-value',
      message: 'Sampler seed must be a number when provided.',
      nodeId,
    });
    return null;
  }

  if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
    issues.push({
      severity: 'error',
      code: 'invalid-sampler-value',
      message: 'Sampler seed must be a finite number.',
      nodeId,
    });
    return null;
  }

  return normalizeSeed(input.value);
}

function normalizeSeed(seed: number | undefined) {
  if (seed === undefined || seed === -1) {
    return undefined;
  }

  return seed;
}
