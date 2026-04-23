import { memo } from 'react';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

import { ComparisonPanel } from './ComparisonPanel';
import { IterationNodeDetail } from './IterationNodeDetail';

interface IterationInspectorPanelProps {
  className?: string;
  emptyLabel?: string;
}

export const IterationInspectorPanel = memo(function IterationInspectorPanel({
  className,
  emptyLabel = 'Select an iteration to inspect or compare.',
}: IterationInspectorPanelProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const comparisonIds = useAppStore((s) => s.comparisonIds);

  const activeNode = activeIterationId ? iterationNodes.get(activeIterationId) : null;
  const comparisonPair = comparisonIds && comparisonIds.length === 2 ? comparisonIds : null;

  if (comparisonPair) {
    const [leftId, rightId] = comparisonPair;

    return (
      <ComparisonPanel
        leftId={leftId}
        rightId={rightId}
        className={cn('h-full min-h-0 overflow-auto p-3', className)}
      />
    );
  }

  if (activeNode) {
    return (
      <IterationNodeDetail
        node={activeNode}
        className={cn('h-full min-h-0 overflow-auto', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 items-center justify-center px-4 text-center type-body-sm text-text-muted',
        className,
      )}
    >
      {emptyLabel}
    </div>
  );
});
