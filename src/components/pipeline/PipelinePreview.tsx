import { memo } from 'react';
import { cn } from '@/utils/cn';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import type { PipelineExecution } from '@/types/pipeline';
import { Eye, Loader2 } from 'lucide-react';

interface PipelinePreviewProps {
  execution: PipelineExecution | null;
  stepIndex: number | null;
  className?: string;
}

export const PipelinePreview = memo(function PipelinePreview({
  execution,
  stepIndex,
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
          const colors = {
            pending: 'bg-surface border-border',
            running: 'bg-warning/30 border-warning animate-pulse',
            complete: 'bg-success/30 border-success',
            error: 'bg-status-error/30 border-status-error',
          };
          const color = colors[step.status];

          return (
            <button
              key={step.stepId}
              type="button"
              aria-label={`Step ${i + 1}: ${step.status}${isActive ? ' (selected)' : ''}`}
              onClick={() => {}}
              className={cn(
                'w-3 h-3 rounded-full border transition-all',
                color,
                isActive && 'ring-2 ring-accent-primary/40 ring-offset-1 ring-offset-void'
              )}
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
              {execution.status === 'error' ? 'Pipeline failed' : 'No preview available'}
            </p>
          </div>
        )}
      </div>

      {/* Step status text */}
      {activeStep && (
        <div className="px-1 text-xs text-text-muted">
          {activeStep.status === 'complete' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} complete`}
          {activeStep.status === 'running' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} processing...`}
          {activeStep.status === 'pending' && `Step ${stepIndex !== null ? stepIndex + 1 : ''} pending`}
          {activeStep.status === 'error' && activeStep.error && (
            <span className="text-status-error">Error: {activeStep.error}</span>
          )}
        </div>
      )}
    </div>
  );
});
