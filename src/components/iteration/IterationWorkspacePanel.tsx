import { memo } from 'react';

import { useAppStore } from '@/store/appStore';

import { IterationInspectorPanel } from './IterationInspectorPanel';
import { IterationTimelinePanel } from './IterationTimelinePanel';
import { IterationTreePanel } from './IterationTreePanel';

const IterationOverlayPanel = memo(function IterationOverlayPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col bg-surface" aria-label="Canvas overlay">
      <div className="border-b border-border px-3 py-2">
        <h2 className="type-ui text-text-primary">Canvas overlay</h2>
        <p className="mt-1 type-caption text-text-muted">
          Browse the active selection and compare iterations while the overlay is visible on canvas.
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <IterationInspectorPanel className="scroll-shadow-y" />
      </div>
    </section>
  );
});

export const IterationWorkspacePanel = memo(function IterationWorkspacePanel() {
  const iterationView = useAppStore((s) => s.iterationView);

  if (iterationView === 'timeline') {
    return <IterationTimelinePanel />;
  }

  if (iterationView === 'overlay') {
    return <IterationOverlayPanel />;
  }

  return <IterationTreePanel />;
});
