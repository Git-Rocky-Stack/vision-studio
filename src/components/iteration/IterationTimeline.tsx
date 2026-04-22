import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Pin } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';

interface IterationTimelineProps {
  className?: string;
}

function formatChangeCount(count: number): string {
  return `${count} change${count === 1 ? '' : 's'}`;
}

export const IterationTimeline = memo(function IterationTimeline({ className }: IterationTimelineProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);

  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [scrollCueState, setScrollCueState] = useState({ left: false, right: false });

  const currentBranch = useMemo(() => {
    if (iterationBranches.length === 0) {
      return undefined;
    }

    if (!activeIterationId) {
      return iterationBranches[0];
    }

    const activeNode = iterationNodes.get(activeIterationId);
    return iterationBranches.find((branch) => branch.id === activeNode?.branchId) ?? iterationBranches[0];
  }, [activeIterationId, iterationBranches, iterationNodes]);

  const timelineNodes = useMemo(() => {
    if (!currentBranch) {
      return [];
    }

    const nodes: import('@/types/iteration').IterationNode[] = [];
    let currentId: string | null = currentBranch.activeNodeId;
    while (currentId) {
      const node = iterationNodes.get(currentId);
      if (!node) {
        break;
      }
      nodes.unshift(node);
      currentId = node.parentId;
    }
    return nodes;
  }, [currentBranch, iterationNodes]);

  const activeNodeId = activeIterationId ?? currentBranch?.activeNodeId ?? null;
  const activeIndex = timelineNodes.findIndex((node) => node.id === activeNodeId);
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : Math.max(0, timelineNodes.length - 1);
  const activeNode = activeNodeId ? iterationNodes.get(activeNodeId) : timelineNodes[resolvedActiveIndex];
  const pinnedCount = timelineNodes.filter((node) => node.isPinned).length;
  const activeChangeCount = activeNode?.settingsDiff ? Object.keys(activeNode.settingsDiff).length : 0;
  const activeStatus = activeNode?.generationJob.status === 'completed' ? 'Ready' : activeNode?.generationJob.status ?? 'Pending';

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const updateScrollCues = () => {
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      setScrollCueState({
        left: viewport.scrollLeft > 2,
        right: viewport.scrollLeft < maxScrollLeft - 2,
      });
    };

    updateScrollCues();
    viewport.addEventListener('scroll', updateScrollCues);
    window.addEventListener('resize', updateScrollCues);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScrollCues);
      resizeObserver.observe(viewport);
      const firstNode = viewport.firstElementChild;
      if (firstNode instanceof HTMLElement) {
        resizeObserver.observe(firstNode);
      }
    }

    return () => {
      viewport.removeEventListener('scroll', updateScrollCues);
      window.removeEventListener('resize', updateScrollCues);
      resizeObserver?.disconnect();
    };
  }, [timelineNodes.length]);

  useEffect(() => {
    if (!activeNodeId) {
      return;
    }

    const node = nodeRefs.current.get(activeNodeId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }, [activeNodeId]);

  const focusNode = useCallback((id: string) => {
    requestAnimationFrame(() => {
      nodeRefs.current.get(id)?.focus();
    });
  }, []);

  const handleTimelineKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = Math.max(0, index - 1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = Math.min(timelineNodes.length - 1, index + 1);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = timelineNodes.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextNode = timelineNodes[nextIndex];
    if (!nextNode) {
      return;
    }

    setActiveIteration(nextNode.id);
    focusNode(nextNode.id);
  }, [focusNode, setActiveIteration, timelineNodes]);

  if (timelineNodes.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center gap-2 px-3 text-text-muted type-body-sm',
          className,
        )}
      >
        <GitBranch className="h-4 w-4 opacity-50" />
        Iterations appear here as you branch results
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-canvas/40', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/80 px-2 py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-text-muted" />
            <span className="truncate type-ui text-text-primary">
              {currentBranch?.name ?? 'Branch'}
            </span>
            <span className="rounded-full border border-border bg-elevated px-1.5 py-0.5 type-badge text-text-muted">
              {timelineNodes.length} {timelineNodes.length === 1 ? 'step' : 'steps'}
            </span>
          </div>
          <div
            data-testid="iteration-timeline-summary"
            className="mt-0.5 flex items-center gap-2 type-micro text-text-muted"
          >
            <span>
              Step {resolvedActiveIndex + 1}/{timelineNodes.length}
            </span>
            {pinnedCount > 0 && <span>{pinnedCount} pinned</span>}
            {activeChangeCount > 0 && <span>{formatChangeCount(activeChangeCount)}</span>}
          </div>
        </div>

        <div className="hidden items-center gap-1 rounded-md border border-border bg-void/70 px-2 py-1 sm:flex">
          <span className="type-badge text-text-body">
            {activeNode?.generationJob.type ?? 'image'}
          </span>
          <span className="type-badge text-text-muted">
            {activeStatus}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          className="h-full overflow-x-auto overflow-y-hidden px-2 py-1.5"
        >
          <div className="flex min-w-max items-center gap-1.5">
            {timelineNodes.map((node, index) => {
              const isActive = activeNodeId === node.id;
              const diffCount = node.settingsDiff ? Object.keys(node.settingsDiff).length : 0;

              return (
                <div key={node.id} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <div className="relative flex items-center">
                      <div className="h-px w-6 bg-border" />
                      <div className="absolute right-0 h-1.5 w-1.5 rounded-full bg-border-hover" />
                    </div>
                  )}

                  <button
                    ref={(element) => {
                      if (element) {
                        nodeRefs.current.set(node.id, element);
                      } else {
                        nodeRefs.current.delete(node.id);
                      }
                    }}
                    type="button"
                    data-testid={`iteration-timeline-node-${node.id}`}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`Iteration step ${index + 1} of ${timelineNodes.length}${node.isPinned ? ', pinned' : ''}`}
                    title={node.generationJob.params?.prompt?.slice(0, 80) || node.id}
                    onClick={() => setActiveIteration(node.id)}
                    onFocus={() => {
                      if (!isActive) {
                        setActiveIteration(node.id);
                      }
                    }}
                    onKeyDown={(event) => handleTimelineKeyDown(event, index)}
                    className={cn(
                      'group relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
                      isActive
                        ? 'border-accent-primary bg-elevated shadow-accent-subtle -translate-y-px'
                        : 'border-border bg-surface hover:border-border-hover hover:bg-elevated/70 hover:-translate-y-px',
                    )}
                  >
                    {node.thumbnail ? (
                      <img src={node.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-void type-badge text-text-muted">
                        {index + 1}
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-void/85 via-void/20 to-transparent" />

                    <span
                      className={cn(
                        'pointer-events-none absolute left-1 top-1 rounded-sm px-1 py-0.5 type-badge',
                        isActive ? 'bg-accent-primary text-void' : 'bg-void/80 text-text-body',
                      )}
                    >
                      {index + 1}
                    </span>

                    {node.isPinned && (
                      <span className="pointer-events-none absolute right-1 top-1 rounded-sm border border-border bg-void/85 p-0.5 text-text-body">
                        <Pin className="h-2.5 w-2.5" />
                      </span>
                    )}

                    {diffCount > 0 && (
                      <span className="pointer-events-none absolute bottom-1 right-1 rounded-sm border border-border bg-void/85 px-1 py-0.5 type-badge text-text-muted">
                        {diffCount}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {scrollCueState.left && (
          <div
            data-testid="iteration-timeline-left-cue"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface via-surface/72 to-transparent"
          />
        )}

        {scrollCueState.right && (
          <div
            data-testid="iteration-timeline-right-cue"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface via-surface/72 to-transparent"
          />
        )}
      </div>
    </div>
  );
});
