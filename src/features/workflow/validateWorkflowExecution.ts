import type {
  WorkflowExecutionContext,
  WorkflowExecutionIssue,
  WorkflowExecutionValidationResult,
  WorkflowGraphNode,
  WorkflowRecord,
} from '@/types/workflow';
import { validateWorkflowGraphForComfyExport } from './comfyExport';

const SUPPORTED_WORKFLOW_NODE_TYPES = new Set([
  'CLIPTextEncode',
  'CheckpointLoaderSimple',
  'KSampler',
  'PreviewImage',
  'SaveImage',
]);

export function validateWorkflowExecution(
  workflow: WorkflowRecord,
  _context: WorkflowExecutionContext
): WorkflowExecutionValidationResult {
  const issues: WorkflowExecutionIssue[] = [];

  try {
    validateWorkflowGraphForComfyExport(workflow.graph);
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'invalid-graph',
      message: error instanceof Error ? error.message : 'Workflow graph is invalid.',
    });
  }

  for (const node of Object.values(workflow.graph.nodes)) {
    if (!SUPPORTED_WORKFLOW_NODE_TYPES.has(node.classType)) {
      issues.push({
        severity: 'error',
        code: 'unsupported-node',
        message: `${node.classType} is not supported by workflow execution yet.`,
        nodeId: node.id,
      });
    }
  }

  const samplerNodes = Object.values(workflow.graph.nodes).filter(
    (node) => node.classType === 'KSampler'
  );

  if (samplerNodes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'missing-sampler',
      message: 'Workflow execution requires one KSampler node.',
    });
  }

  if (samplerNodes.length > 1) {
    issues.push({
      severity: 'error',
      code: 'multiple-samplers',
      message: 'Workflow execution supports exactly one KSampler node in this milestone.',
    });
  }

  const samplerNode = samplerNodes[0];
  if (samplerNode) {
    if (!hasConnectedInput(samplerNode, 'positive')) {
      issues.push({
        severity: 'error',
        code: 'missing-prompt',
        message: 'Sampler positive input must be connected to a prompt encoder.',
        nodeId: samplerNode.id,
      });
    }

    if (!hasConnectedInput(samplerNode, 'model')) {
      issues.push({
        severity: 'error',
        code: 'missing-model',
        message: 'Sampler model input must be connected to a checkpoint loader.',
        nodeId: samplerNode.id,
      });
    }
  }

  return {
    issues,
    summary: null,
  };
}

function hasConnectedInput(node: WorkflowGraphNode, inputName: string) {
  const input = node.inputs[inputName];
  return input?.kind === 'link' && Boolean(input.nodeId);
}
