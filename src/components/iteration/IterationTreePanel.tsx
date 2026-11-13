import { memo, useCallback, useMemo, useState } from 'react';
import { GitBranch, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { MonoLabel } from '@/components/hardware';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IterationInspectorPanel } from './IterationInspectorPanel';
import { IterationNode } from './IterationNode';
import { IterationViewSelector } from './IterationViewSelector';
import { buildTree } from '@/utils/iterationTreeUtils';
import { planBranchDeletion, type BranchDeletionPlan } from './branchDeletion';

interface IterationTreePanelProps {
  className?: string;
}

export const IterationTreePanel = memo(function IterationTreePanel({ className }: IterationTreePanelProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const comparisonIds = useAppStore((s) => s.comparisonIds);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);
  const pinIteration = useAppStore((s) => s.pinIteration);
  const deleteIterationBranch = useAppStore((s) => s.deleteIterationBranch);
  const [pendingDelete, setPendingDelete] = useState<
    { branchName: string; plan: BranchDeletionPlan } | null
  >(null);

  const tree = useMemo(
    () => buildTree(iterationNodes, iterationBranches),
    [iterationNodes, iterationBranches],
  );

  const activeNode = activeIterationId ? iterationNodes.get(activeIterationId) : undefined;
  const activeBranch = activeNode
    ? iterationBranches.find((branch) => branch.id === activeNode.branchId)
    : undefined;

  const requestDeleteActiveBranch = useCallback(() => {
    if (!activeBranch) return;
    setPendingDelete({
      branchName: activeBranch.name,
      plan: planBranchDeletion(activeBranch.id, iterationNodes, iterationBranches),
    });
  }, [activeBranch, iterationNodes, iterationBranches]);

  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    for (const branchId of pendingDelete.plan.branchIds) deleteIterationBranch(branchId);
    // The slice leaves activeIterationId alone; move it to a surviving branch
    // so the inspector never points at a deleted iteration.
    const state = useAppStore.getState();
    if (state.activeIterationId && !state.iterationNodes.has(state.activeIterationId)) {
      state.setActiveIteration(state.iterationBranches[0]?.activeNodeId ?? null);
    }
    setPendingDelete(null);
  }, [pendingDelete, deleteIterationBranch]);

  const deleteMessage = pendingDelete
    ? `${pendingDelete.plan.nodeCount} ${pendingDelete.plan.nodeCount === 1 ? 'iteration' : 'iterations'} will be removed from history` +
      (pendingDelete.plan.branchIds.length > 1
        ? `, including ${pendingDelete.plan.branchIds.length - 1} ${pendingDelete.plan.branchIds.length - 1 === 1 ? 'branch' : 'branches'} forked from it.`
        : '.') +
      ' Saved assets in the library are not affected.'
    : '';

  if (tree.roots.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="faceplate-stripe flex h-9 flex-shrink-0 items-center px-3">
          <MonoLabel as="h2" tone="chrome">History</MonoLabel>
        </div>
        <EmptyState className="flex-1" icon={GitBranch} title="No iterations yet" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="faceplate-stripe flex h-9 flex-shrink-0 items-center gap-2 px-3">
        <MonoLabel as="h2" tone="chrome" className="flex-1">History</MonoLabel>
        <IterationViewSelector />
      </div>

      {/* Branch tabs */}
      {iterationBranches.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Iteration branches">
          {iterationBranches.map((branch) => {
            const isActive = activeNode?.branchId === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(
                  'rounded-md px-2 py-0.5 type-micro transition-colors',
                  isActive
                    ? 'bg-elevated text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-body hover:bg-elevated',
                )}
                onClick={() => setActiveIteration(branch.activeNodeId)}
              >
                {branch.name}
              </button>
            );
          })}
        </div>
          <button
            type="button"
            onClick={requestDeleteActiveBranch}
            disabled={!activeBranch}
            aria-label={activeBranch ? `Delete branch ${activeBranch.name}` : 'Delete branch'}
            title={activeBranch ? `Delete ${activeBranch.name}` : 'Select an iteration to delete its branch'}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-status-error-muted hover:text-status-error disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="scroll-shadow-y flex-1 overflow-y-auto p-2 space-y-1">
        {tree.roots.map((root) => (
          <TreeNode
            key={root.id}
            nodeId={root.id}
            iterationNodes={iterationNodes}
            activeIterationId={activeIterationId}
            onSelect={setActiveIteration}
            onPin={pinIteration}
            depth={0}
          />
        ))}
      </div>

      {/* Detail panel */}
      {(activeNode || comparisonIds) && (
        <div className="scroll-shadow-y border-t border-border max-h-[40%] overflow-y-auto">
          <IterationInspectorPanel />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.branchName}?` : 'Delete branch?'}
        message={deleteMessage}
        confirmLabel="Delete branch"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
});

interface TreeNodeProps {
  nodeId: string;
  iterationNodes: Map<string, import('@/types/iteration').IterationNode>;
  activeIterationId: string | null;
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  depth: number;
}

const MAX_TREE_DEPTH = 20;

function TreeNode({ nodeId, iterationNodes, activeIterationId, onSelect, onPin, depth }: TreeNodeProps) {
  if (depth > MAX_TREE_DEPTH) return null;

  const node = iterationNodes.get(nodeId);
  if (!node) return null;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <IterationNode
        node={node}
        isActive={activeIterationId === nodeId}
        onClick={onSelect}
        onPin={onPin}
      />
      {node.childrenIds.map((childId) => (
        <TreeNode
          key={childId}
          nodeId={childId}
          iterationNodes={iterationNodes}
          activeIterationId={activeIterationId}
          onSelect={onSelect}
          onPin={onPin}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
