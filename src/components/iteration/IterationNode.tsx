import { memo } from 'react';
import { GitBranch, GitCompare, Pin } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { IterationNode as IterationNodeType } from '@/types/iteration';

interface IterationNodeProps {
  node: IterationNodeType;
  isActive?: boolean;
  onClick?: (id: string) => void;
  onPin?: (id: string) => void;
  className?: string;
}

export const IterationNode = memo(function IterationNode({
  node,
  isActive,
  onClick,
  onPin,
  className,
}: IterationNodeProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const comparisonIds = useAppStore((s) => s.comparisonIds);
  const toggleIterationComparison = useAppStore((s) => s.toggleIterationComparison);
  const isBranchStart = node.parentId === null || (node.parentId && iterationNodes.get(node.parentId)?.branchId !== node.branchId);
  const isCompared = comparisonIds?.includes(node.id) ?? false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(node.id);
        }
      }}
      className={cn(
        'group relative flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors cursor-pointer',
        'min-w-[140px]',
        isActive
          ? 'border-accent-primary bg-accent-primary-muted text-text-primary'
          : isCompared
            ? 'border-accent-primary-border bg-accent-primary-muted/70 text-text-primary'
          : 'border-border bg-surface text-text-body hover:border-border-hover hover:bg-elevated',
        className,
      )}
      aria-selected={isActive}
      data-compare-selected={isCompared ? 'true' : 'false'}
    >
      {/* Branch indicator */}
      {isBranchStart && (
        <GitBranch className="w-3 h-3 text-accent-primary flex-shrink-0" aria-label="Branch start" />
      )}

      {/* Thumbnail */}
      <div className="w-8 h-8 rounded-sm overflow-hidden bg-void flex-shrink-0">
        {node.thumbnail ? (
          <img src={node.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted type-micro">
            {node.generationJob.type === 'image' ? 'IMG' : 'VID'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="type-body-sm truncate">{node.generationJob.params?.prompt?.slice(0, 30) || node.id}</span>
        {node.settingsDiff && (
          <span className="type-micro text-text-muted truncate">
            {Object.keys(node.settingsDiff).length} change{Object.keys(node.settingsDiff).length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleIterationComparison(node.id);
          }}
          className={cn(
            'rounded p-0.5 transition-colors',
            isCompared
              ? 'text-accent-primary'
              : 'opacity-0 text-text-muted group-hover:opacity-100 hover:text-text-primary',
          )}
          aria-label={isCompared ? 'Remove from comparison' : 'Compare iteration'}
        >
          <GitCompare className="h-3 w-3" />
        </button>

        {node.isPinned ? (
          <Pin className="w-3 h-3 text-accent-primary fill-accent-primary flex-shrink-0" aria-label="Pinned" />
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPin?.(node.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
            aria-label="Pin iteration"
          >
            <Pin className="w-3 h-3 text-text-muted" />
          </button>
        )}
      </div>
    </div>
  );
});
