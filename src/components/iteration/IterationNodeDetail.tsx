import { memo } from 'react';
import { GitBranch, GitCompare, Pin, Repeat2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { SettingsDiffPanel } from './SettingsDiffPanel';
import type { IterationNode as IterationNodeType } from '@/types/iteration';

interface IterationNodeDetailProps {
  node: IterationNodeType;
  className?: string;
}

export const IterationNodeDetail = memo(function IterationNodeDetail({
  node,
  className,
}: IterationNodeDetailProps) {
  const pinIteration = useAppStore((s) => s.pinIteration);
  const setIterationNote = useAppStore((s) => s.setIterationNote);
  const forkIteration = useAppStore((s) => s.forkIteration);
  const comparisonIds = useAppStore((s) => s.comparisonIds);
  const toggleIterationComparison = useAppStore((s) => s.toggleIterationComparison);
  const isCompared = comparisonIds?.includes(node.id) ?? false;

  return (
    <div className={cn('flex flex-col gap-3 p-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="type-body-sm font-semibold text-text-primary flex-1 truncate">
          {node.generationJob.params?.prompt?.slice(0, 60) || node.id}
        </h3>
        <button
          type="button"
          onClick={() => pinIteration(node.id)}
          className={cn(
            'p-1 rounded-md transition-colors',
            node.isPinned
              ? 'text-accent-primary bg-accent-primary-muted'
              : 'text-text-muted hover:text-text-primary hover:bg-elevated',
          )}
          aria-label={node.isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-4 h-4" />
        </button>
      </div>

      {/* Thumbnail */}
      {node.thumbnail && (
        <div className="rounded-md overflow-hidden border border-border">
          <img src={node.thumbnail} alt="Iteration preview" className="w-full" />
        </div>
      )}

      {/* Settings diff */}
      {node.settingsDiff && (
        <SettingsDiffPanel diff={node.settingsDiff} />
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggleIterationComparison(node.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 type-body-sm transition-colors',
            isCompared
              ? 'bg-accent-primary-muted text-accent-primary'
              : 'text-text-muted hover:bg-elevated hover:text-text-primary',
          )}
          aria-label={isCompared ? 'Remove from comparison' : 'Compare this iteration'}
        >
          <GitCompare className="w-3.5 h-3.5" />
          {isCompared ? 'Compared' : 'Compare'}
        </button>
        <button
          type="button"
          onClick={() => forkIteration({ job: node.generationJob, parentId: node.id, thumbnail: node.thumbnail })}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md type-body-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          aria-label="Fork from this iteration"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Fork
        </button>
        <button
          type="button"
          onClick={() => forkIteration({ job: { ...node.generationJob, id: crypto.randomUUID() }, parentId: node.id, thumbnail: node.thumbnail })}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md type-body-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          aria-label="Re-roll from this iteration"
        >
          <Repeat2 className="w-3.5 h-3.5" />
          Re-roll
        </button>
      </div>

      {/* Note */}
      <div>
        <label className="type-micro text-text-muted mb-1 block">Note</label>
        <textarea
          value={node.note}
          onChange={(e) => setIterationNote(node.id, e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="w-full rounded-md border border-border bg-void px-2 py-1.5 type-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary resize-none"
        />
      </div>
    </div>
  );
});
