import type { WorkflowGraphNode } from '@/types/workflow';

export interface NodeRegistryEntry {
  label: string;
  defaultOutput: string;
  defaultInput: string;
  connectionMap?: Record<string, string>;
}

export const NODE_REGISTRY: Record<string, NodeRegistryEntry> = {
  CLIPTextEncode: {
    label: 'Prompt Encode',
    defaultOutput: 'CONDITIONING',
    defaultInput: 'input',
  },
  CheckpointLoaderSimple: {
    label: 'Model Loader',
    defaultOutput: 'MODEL',
    defaultInput: 'input',
  },
  KSampler: {
    label: 'Sampler',
    defaultOutput: 'IMAGE',
    defaultInput: 'positive',
    connectionMap: {
      MODEL: 'model',
      CONDITIONING: 'positive',
      LATENT: 'latent_image',
    },
  },
  PreviewImage: {
    label: 'Preview',
    defaultOutput: 'output',
    defaultInput: 'images',
  },
  SaveImage: {
    label: 'Save Output',
    defaultOutput: 'output',
    defaultInput: 'images',
  },
};

export const addNodeActions = Object.entries(NODE_REGISTRY).map(([classType, entry]) => ({
  label: `Add ${entry.label} node`,
  classType,
}));

export function getDefaultOutputForClassType(classType: string): string {
  return NODE_REGISTRY[classType]?.defaultOutput ?? 'output';
}

export function getDefaultInputForClassType(classType: string): string {
  return NODE_REGISTRY[classType]?.defaultInput ?? 'input';
}

export function getDefaultInputForConnection(sourceOutput: string, targetClassType: string): string {
  const entry = NODE_REGISTRY[targetClassType];
  if (entry?.connectionMap?.[sourceOutput]) return entry.connectionMap[sourceOutput];
  return getDefaultInputForClassType(targetClassType);
}

export function createWorkflowNodeFromClassType(
  classType: string,
  nodeCount: number
): Omit<WorkflowGraphNode, 'id'> {
  const offset = nodeCount * 24;
  const entry = NODE_REGISTRY[classType];
  const label = entry?.label ?? classType;

  const defaults: Record<string, Omit<WorkflowGraphNode, 'id'>> = {
    CLIPTextEncode: {
      classType: 'CLIPTextEncode',
      label,
      position: { x: 80 + offset, y: 120 + offset },
      inputs: {
        text: { kind: 'literal', value: '' },
      },
      metadata: {
        state: 'pending',
        description: 'Encode prompt text for generation.',
      },
    },
    CheckpointLoaderSimple: {
      classType: 'CheckpointLoaderSimple',
      label,
      position: { x: 80 + offset, y: 280 + offset },
      inputs: {
        ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' },
      },
      metadata: {
        state: 'pending',
        description: 'Load a model checkpoint.',
      },
    },
    KSampler: {
      classType: 'KSampler',
      label,
      position: { x: 360 + offset, y: 200 + offset },
      inputs: {
        seed: { kind: 'literal', value: 1 },
        steps: { kind: 'literal', value: 25 },
        cfg: { kind: 'literal', value: 7.5 },
      },
      metadata: {
        state: 'pending',
        description: 'Queue the image generation run.',
      },
    },
    PreviewImage: {
      classType: 'PreviewImage',
      label,
      position: { x: 640 + offset, y: 120 + offset },
      inputs: {},
      metadata: {
        state: 'pending',
        description: 'Preview generated output.',
      },
    },
    SaveImage: {
      classType: 'SaveImage',
      label,
      position: { x: 640 + offset, y: 300 + offset },
      inputs: {
        filename_prefix: { kind: 'literal', value: 'vision-studio' },
      },
      metadata: {
        state: 'pending',
        description: 'Save accepted output.',
      },
    },
  };

  return (
    defaults[classType] ?? {
      classType,
      label,
      position: { x: 120 + offset, y: 120 + offset },
      inputs: {},
      metadata: {
        state: 'pending',
      },
    }
  );
}