import { memo, useMemo, useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { buildTree } from '@/utils/iterationTreeUtils';
import type { IterationNode as IterationNodeType } from '@/types/iteration';

interface IterationCanvasOverlayProps {
  className?: string;
}

interface NodePosition {
  x: number;
  y: number;
  node: IterationNodeType;
}

export const IterationCanvasOverlay = memo(function IterationCanvasOverlay({ className }: IterationCanvasOverlayProps) {
  const iterationNodes = useAppStore((s) => s.iterationNodes);
  const iterationBranches = useAppStore((s) => s.iterationBranches);
  const activeIterationId = useAppStore((s) => s.activeIterationId);
  const setActiveIteration = useAppStore((s) => s.setActiveIteration);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const tree = useMemo(
    () => buildTree(iterationNodes, iterationBranches),
    [iterationNodes, iterationBranches],
  );

  // Position nodes in a tree layout
  const positions = useMemo(() => {
    const pos: NodePosition[] = [];
    const NODE_H_SPACING = 160;
    const NODE_V_SPACING = 80;

    function layoutNode(nodeId: string, x: number, depth: number) {
      const node = iterationNodes.get(nodeId);
      if (!node) return;
      pos.push({ x, y: depth * NODE_V_SPACING, node });

      const childXStart = x - ((node.childrenIds.length - 1) * NODE_H_SPACING) / 2;
      node.childrenIds.forEach((childId, i) => {
        layoutNode(childId, childXStart + i * NODE_H_SPACING, depth + 1);
      });
    }

    tree.roots.forEach((root, i) => {
      layoutNode(root.id, i * 300, 0);
    });

    return pos;
  }, [tree, iterationNodes]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setScale((s) => Math.max(0.25, Math.min(3, s - e.deltaY * 0.001)));
    } else {
      setOffset((o) => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }));
    }
  }, []);

  if (positions.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-text-muted type-body-sm', className)}>
        No iterations to display
      </div>
    );
  }

  return (
    <div
      className={cn('relative overflow-hidden bg-void', className)}
      onWheel={handleWheel}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          className="rounded-md border border-border bg-surface px-2 py-1 type-micro text-text-muted hover:text-text-primary"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.25, s / 1.2))}
          className="rounded-md border border-border bg-surface px-2 py-1 type-micro text-text-muted hover:text-text-primary"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
          className="rounded-md border border-border bg-surface px-2 py-1 type-micro text-text-muted hover:text-text-primary"
        >
          Reset
        </button>
      </div>

      <svg
        className="w-full h-full"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0' }}
      >
        {/* Connection lines */}
        {positions.map(({ node }) =>
          node.childrenIds.map((childId) => {
            const child = positions.find((p) => p.node.id === childId);
            if (!child) return null;
            return (
              <line
                key={`${node.id}-${childId}`}
                x1={node.x + 40}
                y1={node.y + 20}
                x2={child.x + 40}
                y2={child.y}
                className="stroke-border"
                strokeWidth={1.5}
              />
            );
          })
        )}

        {/* Nodes */}
        {positions.map(({ x, y, node }) => (
          <g
            key={node.id}
            transform={`translate(${x}, ${y})`}
            onClick={() => setActiveIteration(node.id)}
            className="cursor-pointer"
          >
            <rect
              width={80}
              height={40}
              rx={6}
              className={cn(
                'transition-colors',
                activeIterationId === node.id
                  ? 'fill-accent-primary-muted stroke-accent-primary'
                  : 'fill-surface stroke-border hover:stroke-border-hover',
              )}
              strokeWidth={1.5}
            />
            {node.thumbnail ? (
              <image href={node.thumbnail} x={2} y={2} width={76} height={36} preserveAspectRatio="xMidYMid slice" clipPath="url(#rounded)" />
            ) : (
              <text x={40} y={24} textAnchor="middle" className="fill-text-muted text-[8px]">
                {node.id.slice(0, 6)}
              </text>
            )}
            {node.isPinned && (
              <circle cx={72} cy={8} r={4} className="fill-accent-primary" />
            )}
          </g>
        ))}
      </svg>
    </div>
  );
});