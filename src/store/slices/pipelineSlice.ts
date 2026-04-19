import type { AppSet } from '../appStore.types';
import type { PipelineDefinition, PipelineStep, PipelineExecution } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

function builtInPresets(): PipelineDefinition[] {
  const t = now();
  return [
    {
      id: 'builtin-upscale-4x',
      name: 'Upscale 4x',
      description: 'Upscale image to 4x resolution with detail enhancement',
      steps: [
        { id: 's1', type: 'upscale', label: 'Upscale 4x', params: { scale: 4 }, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
    {
      id: 'builtin-face-restore',
      name: 'Face Restore',
      description: 'Restore and enhance facial details',
      steps: [
        { id: 's1', type: 'face-restore', label: 'Face Restore', params: { strength: 0.8 }, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
    {
      id: 'builtin-denoise-clean',
      name: 'Denoise Clean',
      description: 'Remove noise while preserving details',
      steps: [
        { id: 's1', type: 'denoise', label: 'Denoise', params: { strength: 0.5 }, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
    {
      id: 'builtin-bg-remove',
      name: 'Background Remove',
      description: 'Remove background and create transparent PNG',
      steps: [
        { id: 's1', type: 'background-remove', label: 'Background Remove', params: {}, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
    {
      id: 'builtin-style-transfer',
      name: 'Style Transfer',
      description: 'Apply artistic style to image',
      steps: [
        { id: 's1', type: 'style-transfer', label: 'Style Transfer', params: { style: 'artistic' }, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
    {
      id: 'builtin-hdr-enhance',
      name: 'HDR Enhance',
      description: 'Enhance dynamic range and color vibrancy',
      steps: [
        { id: 's1', type: 'color-correct', label: 'HDR Color', params: { saturation: 1.2, contrast: 1.1 }, enabled: true },
        { id: 's2', type: 'sharpen', label: 'Detail Sharpen', params: { amount: 0.3 }, enabled: true },
      ],
      isBuiltIn: true,
      created: t,
      modified: t,
    },
  ];
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const pipelineInitialState = {
  pipelines: builtInPresets(),
  activePipelineId: null as string | null,
  pipelineExecutions: [] as PipelineExecution[],
  isPipelineBuilderOpen: false,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function createPipelineActions(set: AppSet) {
  return {
    createPipeline: (params: { name: string; description: string; steps: PipelineStep[] }) =>
      set((s) => ({
        pipelines: [
          ...s.pipelines,
          {
            id: uid(),
            name: params.name,
            description: params.description,
            steps: params.steps,
            isBuiltIn: false,
            created: now(),
            modified: now(),
          },
        ],
      })),

    updatePipeline: (id: string, updates: Partial<Pick<PipelineDefinition, 'name' | 'description' | 'steps'>>) =>
      set((s) => ({
        pipelines: s.pipelines.map((p) =>
          p.id === id ? { ...p, ...updates, modified: now() } : p
        ),
      })),

    deletePipeline: (id: string) =>
      set((s) => {
        const pipeline = s.pipelines.find((p) => p.id === id);
        if (pipeline?.isBuiltIn) return s; // Cannot delete built-in presets
        return { pipelines: s.pipelines.filter((p) => p.id !== id) };
      }),

    duplicatePipeline: (id: string, newName: string) =>
      set((s) => {
        const source = s.pipelines.find((p) => p.id === id);
        if (!source) return s;
        return {
          pipelines: [
            ...s.pipelines,
            {
              ...source,
              id: uid(),
              name: newName,
              isBuiltIn: false,
              created: now(),
              modified: now(),
            },
          ],
        };
      }),

    runPipeline: (pipelineId: string, sourceImageId: string) =>
      set((s) => {
        const pipeline = s.pipelines.find((p) => p.id === pipelineId);
        if (!pipeline) return s;
        return {
          pipelineExecutions: [
            ...s.pipelineExecutions,
            {
              id: uid(),
              pipelineId,
              sourceImageId,
              status: 'queued' as const,
              currentStepIndex: 0,
              stepResults: pipeline.steps.map((step) => ({
                stepId: step.id,
                status: 'pending' as const,
              })),
              created: now(),
            },
          ],
        };
      }),

    cancelPipelineExecution: (executionId: string) =>
      set((s) => ({
        pipelineExecutions: s.pipelineExecutions.map((e) =>
          e.id === executionId ? { ...e, status: 'error' as const } : e
        ),
      })),

    setActivePipelineId: (id: string | null) => set({ activePipelineId: id }),
    setPipelineBuilderOpen: (open: boolean) => set({ isPipelineBuilderOpen: open }),
  };
}
