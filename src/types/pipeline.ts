/**
 * Pipeline type definitions for Vision Studio.
 *
 * A Pipeline is an ordered sequence of processing steps (upscale, denoise,
 * face-restore, etc.) that can be run on a source image. Built-in presets
 * are immutable; users create their own by duplicating or building from
 * scratch.
 */

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

/** The kinds of processing operations a pipeline step can perform. */
export type PipelineStepType =
  | 'upscale'
  | 'denoise'
  | 'sharpen'
  | 'face-restore'
  | 'color-correct'
  | 'background-remove'
  | 'style-transfer'
  | 'blur'
  | 'crop-resize'
  | 'custom';

/** A single step within a pipeline definition. */
export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  label: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline definition
// ---------------------------------------------------------------------------

/** A reusable pipeline template containing an ordered list of steps. */
export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  isBuiltIn: boolean;
  created: string;
  modified: string;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Status of a single step during pipeline execution. */
export type StepExecutionStatus = 'pending' | 'running' | 'complete' | 'error';

/** Result snapshot for one step in a running execution. */
export interface StepExecutionResult {
  stepId: string;
  status: StepExecutionStatus;
  output?: string;
  error?: string;
}

/** A running or completed pipeline execution against a source image. */
export interface PipelineExecution {
  id: string;
  pipelineId: string;
  sourceImageId: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  currentStepIndex: number;
  stepResults: StepExecutionResult[];
  finalOutput?: string;
  created: string;
}
