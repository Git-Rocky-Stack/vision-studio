import { memo, useMemo } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { buildTree } from '@/utils/iterationTreeUtils';

interface IterationTimelineProps {
  className?: string;
}

export const IterationTimeline = memo(function IterationTimeline({ className }: IterationTimelineProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);

  const tree = useMemo(
    () => buildTree(iterationNodes, iterationBranches),
    [iterationNodes, iterationBranches],
  );

  // Flatten nodes into a linear timeline sequence for the current branch
  const currentBranch = iterationBranches.length > 0
    ? iterationBranches.find(b => activeIterationId ? iterationNodes.get(activeIterationId)?.branchId === b.id : iterationBranches[0])
    : undefined;

  const timelineNodes = useMemo(() => {
    if (!currentBranch) return [];
    const nodes: import('@/types/iteration').IterationNode[] = [];
    let currentId: string | null = currentBranch.activeNodeId;
    while (currentId) {
      const node = iterationNodes.get(currentId);
      if (!node) break;
      nodes.unshift(node);
      currentId = node.parentId;
    }
    return nodes;
  }, [currentBranch, iterationNodes]);

  if (timelineNodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-text-muted type-body-sm', className)}>
        No iterations
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto px-2 py-1', className)}>
      {timelineNodes.map((node, i) => (
        <div key={node.id} className="flex items-center gap-1 flex-shrink-0">
          {i > 0 && (
            <div className="w-4 h-px bg-border" />
          )}
          <button
            type="button"
            onClick={() => setActiveIteration(node.id)}
            className={cn(
              'w-10 h-10 rounded-md border overflow-hidden flex-shrink-0 transition-colors',
              activeIterationId === node.id
                ? 'border-accent-primary ring-2 ring-accent-primary/30'
                : 'border-border hover:border-border-hover',
            )}
            title={node.generationJob.params?.prompt?.slice(0, 50) || node.id}
          >
            {node.thumbnail ? (
              <img src={node.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-void" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
});