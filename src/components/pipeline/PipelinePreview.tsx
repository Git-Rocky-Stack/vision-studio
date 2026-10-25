import { memo } from 'react';
import { cn } from '@/utils/cn';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import type { PipelineExecution } from '@/types/pipeline';
import { Eye, Loader2 } from 'lucide-react';

interface PipelinePreviewProps {
  execution: PipelineExecution | null;
  stepIndex: number | null;
  /**
   * Move the preview to another step. When omitted the dots degrade to plain
   * status indicators rather than announcing themselves as buttons that do
   * nothing.
   */
  onStepSelect?: (index: number) => void;
  className?: string;
}

export const PipelinePreview = memo(function PipelinePreview({
  execution,
  stepIndex,
  onStepSelect,
  className,
}: PipelinePreviewProps) {
  if (!execution) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 p-6 rounded-md border border-border bg-surface', className)}>
        <Eye className="w-8 h-8 text-text-muted" />
        <p className="text-sm text-text-muted text-center">Run the pipeline to see previews</p>
      </div>
    );
  }

  const steps = execution.stepResults;
  const activeStep = stepIndex !== null ? steps[stepIndex] : null;
  const isRunning = execution.status === 'running' || execution.status === 'queued';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h4 className="text-label text-text-primary font-medium px-1">Preview</h4>

      {/* Step progress dots */}
      <div className="flex items-center gap-1.5 px-1" role="group" aria-label="Pipeline step progress">
        {steps.map((step, i) => {
          const isActive = i === stepIndex;
          // Status tokens; the old bg-warning / bg-success names were never
          // defined, so running and complete dots rendered blank.
          const colors: Record<typeof step.status, string> = {
            pending: 'bg-surface border-border',
            running: 'bg-status-warning/30 border-status-warning animate-pulse',
            complete: 'bg-status-success/30 border-status-success',
            error: 'bg-status-error/30 border-status-error',
            skipped: 'bg-transparent border-border border-dashed',
          };
          const color = colors[step.status];

          const label = `Step ${i + 1}: ${step.status}`;
          const dotClass = cn(
            'w-3 h-3 rounded-full border transition',
            color,
            isActive && 'ring-2 ring-accent-primary/40 ring-offset-1 ring-offset-void'
          );

          if (!onStepSelect) {
            return <span key={step.stepId} aria-label={label} className={dotClass} />;
          }

          return (
            <button
              key={step.stepId}
              type="button"
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              onClick={() => onStepSelect(i)}
              className={cn(dotClass, 'hover:scale-125')}
            />
          );
        })}
      </div>

      {/* Preview image */}
      <div className="relative rounded-md border border-border bg-canvas overflow-hidden aspect-square">
        {activeStep?.output ? (
          <ImageWithFallback
            src={activeStep.output}
            alt={`Pipeline step ${stepIndex !== null ? stepIndex + 1 : ''} preview`}
            className="w-full h-full object-contain"
          />
        ) : isRunning ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full">
            <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
            <p className="text-xs text-text-muted">Processing...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 h-full">
            <Eye className="w-6 h-6 text-text-muted" />
            <p className="text-xs text-text-muted">
              {execution.status === 'error'
                ? 'Pipeline failed'
                : execution.status === 'cancelled'
                  ? 'Pipeline cancelled'
                  : 'No preview available'}
            </p>
          </div>
        )}
      </div>

      {execution.status === 'error' && execution.error && (
        <p role="alert" className="px-1 text-xs text-status-error">
          {execution.error}
        </p>
      )}

      {/* Step status text */}
      {activeStep && (
        <div className="px-1 text-xs text-text-muted">
          {activeStep.status === 'complete' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} complete`}
          {activeStep.status === 'running' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} processing...`}
          {activeStep.status === 'pending' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} pending`}
          {activeStep.status === 'skipped' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} skipped (disabled)`}
          {activeStep.status === 'error' && activeStep.error && (
            <span className="text-status-error">Error: {activeStep.error}</span>
          )}
        </div>
      )}
    </div>
  );
});
