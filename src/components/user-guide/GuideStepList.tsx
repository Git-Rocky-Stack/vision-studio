import type { ReactNode } from 'react';

interface GuideStep {
  title: string;
  description: ReactNode;
}

interface GuideStepListProps {
  steps: GuideStep[];
}

export function GuideStepList({ steps }: GuideStepListProps) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-elevated px-4 py-4">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-accent-primary-border bg-accent-primary-muted type-ui text-accent-primary">
            {index + 1}
          </div>
          <div className="min-w-0">
            <p className="type-ui text-text-primary">{step.title}</p>
            <div className="mt-1 text-sm text-text-body">{step.description}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
