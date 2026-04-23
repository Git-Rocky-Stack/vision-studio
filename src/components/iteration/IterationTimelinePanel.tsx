import { memo } from 'react';

import { IterationInspectorPanel } from './IterationInspectorPanel';
import { IterationTimeline } from './IterationTimeline';

export const IterationTimelinePanel = memo(function IterationTimelinePanel() {
  return (
    <section
      aria-label="Expanded iteration timeline"
      className="flex h-full min-h-0 flex-col bg-surface"
    >
      <div className="border-b border-border px-3 py-2">
        <h2 className="type-ui text-text-primary">Expanded iteration timeline</h2>
        <p className="mt-1 type-caption text-text-muted">
          Review the active branch, inspect changes, and compare selected iterations.
        </p>
      </div>

      <div className="flex-shrink-0 border-b border-border">
        <IterationTimeline className="h-20" />
      </div>

      <div className="min-h-0 flex-1">
        <IterationInspectorPanel className="scroll-shadow-y" />
      </div>
    </section>
  );
});
