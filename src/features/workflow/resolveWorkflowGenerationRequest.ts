import type {
  WorkflowExecutionContext,
  WorkflowExecutionIssue,
  WorkflowExecutionSummary,
  WorkflowGenerationRequest,
  WorkflowGraphNode,
  WorkflowRecord,
} from '@/types/workflow';

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
  const modelNode = getLinkedNode(workflow, samplerNode, 'model', 'CheckpointLoaderSimple');

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
    },
    summary,
    issues,
  };
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
