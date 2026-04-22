import { memo, useMemo } from 'react';
import { GitBranch, Pin } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { IterationNode } from './IterationNode';
import { IterationNodeDetail } from './IterationNodeDetail';
import { IterationViewSelector } from './IterationViewSelector';
import { buildTree } from '@/utils/iterationTreeUtils';

interface IterationTreePanelProps {
  className?: string;
}

export const IterationTreePanel = memo(function IterationTreePanel({ className }: IterationTreePanelProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);
  const pinIteration = useAppStore((s) => s.pinIteration);
  const deleteIterationBranch = useAppStore((s) => s.deleteIterationBranch);

  const tree = useMemo(
    () => buildTree(iterationNodes, iterationBranches),
    [iterationNodes, iterationBranches],
  );

  const activeNode = activeIterationId ? iterationNodes.get(activeIterationId) : undefined;

  if (tree.roots.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <h2 className="type-body-sm font-semibold text-text-primary flex-1">History</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted type-body-sm p-4">
          <GitBranch className="w-8 h-8 mb-2 opacity-30" />
          No iterations yet
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <h2 className="type-body-sm font-semibold text-text-primary flex-1">History</h2>
        <IterationViewSelector />
      </div>

      {/* Branch tabs */}
      {iterationBranches.length > 1 && (
        <div className="flex gap-1 px-3 py-1 border-b border-border overflow-x-auto" role="tablist" aria-label="Iteration branches">
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
      {activeNode && (
        <div className="scroll-shadow-y border-t border-border max-h-[40%] overflow-y-auto">
          <IterationNodeDetail node={activeNode} />
        </div>
      )}
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
