import { useAppStore } from '@/store/appStore';
import { runEditTool, type EditToolResult } from '@/features/edit/runEditTool';
import { runGuidedEditTool } from '@/features/edit/runGuidedEditTool';
import type { PipelineDefinition, PipelineStep, PipelineStepType } from '@/types/pipeline';

/**
 * Pipeline executor. A pipeline runs its enabled steps in order on one
 * image; each step is a real job on the existing edit bridge (the same
 * /api/v1/edit and guided-pass jobs the AI Tools panel submits), and its
 * output becomes the next step's input. The finished frame lands on the
 * Edit canvas exactly like an AI-tool result.
 *
 * Step types with no backend operation (denoise, sharpen, colour correct,
 * blur, crop/resize, custom) are refused before anything runs, with an
 * honest message on that step, so a pipeline never half-runs and never
 * pretends to have done something it cannot.
 */

type StepRunner = (step: PipelineStep, sourcePath: string, signal: AbortSignal) => Promise<EditToolResult>;

const STEP_LABELS: Record<PipelineStepType, string> = {
  upscale: 'Upscale',
  denoise: 'Denoise',
  sharpen: 'Sharpen',
  'face-restore': 'Face Restore',
  'color-correct': 'Color Correct',
  'background-remove': 'Background Remove',
  'style-transfer': 'Style Transfer',
  blur: 'Blur',
  'crop-resize': 'Crop / Resize',
  custom: 'Custom',
};

export function unsupportedStepMessage(type: PipelineStepType): string {
  return `${STEP_LABELS[type] ?? type} steps have no backend operation yet, so this pipeline cannot run.`;
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const STEP_RUNNERS: Partial<Record<PipelineStepType, StepRunner>> = {
  upscale: (step, source_path, signal) =>
    runEditTool(
      'upscale',
      { source_path, scale: numberParam(step.params.scale, 4) <= 2 ? 2 : 4 },
      { signal },
    ),
  'face-restore': (step, source_path, signal) =>
    runEditTool(
      'restore-faces',
      { source_path, strength: Math.max(0, Math.min(1, numberParam(step.params.strength, 0.8))) },
      { signal },
    ),
  'background-remove': (step, source_path, signal) =>
    runEditTool(
      'remove-background',
      {
        source_path,
        ...(typeof step.params.edge_refinement === 'number' ? { edge_refinement: step.params.edge_refinement } : {}),
      },
      { signal },
    ),
  'style-transfer': (step, source_path, signal) =>
    runGuidedEditTool(
      'style-transfer',
      {
        source_path,
        styleModifier: typeof step.params.style === 'string' ? step.params.style : undefined,
        prompt: typeof step.params.prompt === 'string' ? step.params.prompt : undefined,
        styleStrength:
          typeof step.params.strength === 'number' ? Math.round(step.params.strength * 100) : undefined,
      },
      { signal },
    ),
};

/** First reason this pipeline cannot run, or null when every enabled step maps to a real op. */
export function pipelineUnsupportedReason(
  pipeline: PipelineDefinition,
  runners: Partial<Record<PipelineStepType, StepRunner>> = STEP_RUNNERS,
): string | null {
  const enabled = pipeline.steps.filter((s) => s.enabled);
  if (enabled.length === 0) return 'This pipeline has no enabled steps.';
  const unsupported = enabled.find((s) => !runners[s.type]);
  return unsupported ? unsupportedStepMessage(unsupported.type) : null;
}

const controllers = new Map<string, AbortController>();

export interface StartPipelineRunOptions {
  store?: typeof useAppStore;
  runners?: Partial<Record<PipelineStepType, StepRunner>>;
}

export interface PipelineRunResult {
  executionId: string | null;
  status: 'complete' | 'error' | 'cancelled';
  error?: string;
}

/**
 * Record and execute a pipeline run on `sourcePath`. Resolves when the run
 * ends; status and per-step results stream into pipelineExecutions.
 */
export async function startPipelineRun(
  pipelineId: string,
  sourcePath: string,
  { store = useAppStore, runners = STEP_RUNNERS }: StartPipelineRunOptions = {},
): Promise<PipelineRunResult> {
  const pipeline = store.getState().pipelines.find((p) => p.id === pipelineId);
  const executionId = store.getState().runPipeline(pipelineId, sourcePath);
  if (!pipeline || !executionId) {
    return { executionId: null, status: 'error', error: 'Pipeline not found.' };
  }
  const state = () => store.getState();

  const fail = (error: string, stepId?: string): PipelineRunResult => {
    if (stepId) state().updatePipelineStepResult(executionId, stepId, { status: 'error', error });
    state().updatePipelineExecution(executionId, { status: 'error', error });
    return { executionId, status: 'error', error };
  };

  // Refuse up front: never run half a pipeline and stop at a step that was
  // never going to work.
  const enabledSteps = pipeline.steps.filter((s) => s.enabled);
  if (enabledSteps.length === 0) {
    return fail('This pipeline has no enabled steps.');
  }
  const unsupported = enabledSteps.find((s) => !runners[s.type]);
  if (unsupported) {
    return fail(unsupportedStepMessage(unsupported.type), unsupported.id);
  }

  const controller = new AbortController();
  controllers.set(executionId, controller);
  state().updatePipelineExecution(executionId, { status: 'running' });

  let currentSource = sourcePath;
  try {
    for (const [index, step] of pipeline.steps.entries()) {
      if (controller.signal.aborted) break;
      if (!step.enabled) {
        state().updatePipelineStepResult(executionId, step.id, { status: 'skipped' });
        continue;
      }
      state().updatePipelineExecution(executionId, { currentStepIndex: index });
      state().updatePipelineStepResult(executionId, step.id, { status: 'running' });

      let result: EditToolResult;
      try {
        result = await runners[step.type]!(step, currentSource, controller.signal);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'Step failed.' };
      }

      if (controller.signal.aborted) break;
      if (!result.ok) {
        // A run with no error and no abort is a backend-side cancel.
        return fail(result.error ?? `${step.label} was cancelled.`, step.id);
      }

      // The edit bridge lands each output on the Edit canvas; that frame is
      // the next step's input.
      const landed = state();
      currentSource = landed.currentImageAssetPath ?? currentSource;
      state().updatePipelineStepResult(executionId, step.id, {
        status: 'complete',
        output: landed.currentImage ?? undefined,
      });
    }

    if (controller.signal.aborted) {
      state().cancelPipelineExecution(executionId);
      return { executionId, status: 'cancelled' };
    }
    state().updatePipelineExecution(executionId, { status: 'complete', finalOutput: currentSource });
    return { executionId, status: 'complete' };
  } finally {
    controllers.delete(executionId);
  }
}

/** Stop a running execution: aborts its in-flight job and marks it cancelled. */
export function cancelPipelineRun(executionId: string, store: typeof useAppStore = useAppStore): void {
  controllers.get(executionId)?.abort();
  store.getState().cancelPipelineExecution(executionId);
}

export function isPipelineRunActive(executionId: string): boolean {
  return controllers.has(executionId);
}
