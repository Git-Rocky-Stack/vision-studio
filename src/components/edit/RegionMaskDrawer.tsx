import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { RegionLock, BoundingBox, Point, MaskType } from '@/types/project';

export type MaskTool = MaskType | 'select';

interface RegionMaskDrawerProps {
  activeRegion: RegionLock;
  canvasWidth: number;
  canvasHeight: number;
  tool: MaskTool;
  brushSize: number;
  onMaskCommit: (update: {
    type: MaskType;
    points: Point[];
    bounds: BoundingBox;
  }) => void;
}

interface Draft {
  tool: MaskTool;
  points: Point[];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function computeBounds(points: Point[]): BoundingBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Interactive drawing surface for region masks. Captures pointer events
 * over the artboard and commits mask data to the active region lock.
 *
 * - rectangle: drag to define bounding box
 * - brush / polygon: freehand path of points; bounds derived from extents
 * - erase: freehand subtraction stroke (dashed preview, cyan color)
 * - select: component renders nothing interactive (parent hides it)
 */
export const RegionMaskDrawer = memo(function RegionMaskDrawer({
  activeRegion,
  canvasWidth,
  canvasHeight,
  tool,
  brushSize,
  onMaskCommit,
}: RegionMaskDrawerProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const getLocalPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const surface = surfaceRef.current;
      if (!surface) return null;
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // Convert client-space coordinates into intrinsic image pixel coords.
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;
      return {
        x: clamp((clientX - rect.left) * scaleX, 0, canvasWidth),
        y: clamp((clientY - rect.top) * scaleY, 0, canvasHeight),
      };
    },
    [canvasWidth, canvasHeight]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (tool === 'select') return;
      if (e.button !== 0) return;
      const p = getLocalPoint(e.clientX, e.clientY);
      if (!p) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      const d: Draft = {
        tool,
        points: [p],
        startX: p.x,
        startY: p.y,
        currentX: p.x,
        currentY: p.y,
      };
      setDraft(d);
      draftRef.current = d;
    },
    [tool, getLocalPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const current = draftRef.current;
      if (!current) return;
      const p = getLocalPoint(e.clientX, e.clientY);
      if (!p) return;
      const next: Draft = {
        ...current,
        currentX: p.x,
        currentY: p.y,
        points:
          current.tool === 'rectangle'
            ? current.points
            : [...current.points, p],
      };
      draftRef.current = next;
      setDraft(next);
    },
    [getLocalPoint]
  );

  const commitDraft = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;

    if (current.tool === 'rectangle') {
      const x1 = Math.min(current.startX, current.currentX);
      const y1 = Math.min(current.startY, current.currentY);
      const x2 = Math.max(current.startX, current.currentX);
      const y2 = Math.max(current.startY, current.currentY);
      const width = x2 - x1;
      const height = y2 - y1;
      if (width < 2 && height < 2) {
        // Treat as a click; ignore.
      } else {
        onMaskCommit({
          type: 'rectangle',
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ],
          bounds: { x: x1, y: y1, width, height },
        });
      }
    } else if (current.tool === 'brush' || current.tool === 'polygon' || current.tool === 'erase') {
      if (current.points.length >= 2) {
        onMaskCommit({
          type: current.tool,
          points: current.points,
          bounds: computeBounds(current.points),
        });
      }
    }

    draftRef.current = null;
    setDraft(null);
  }, [onMaskCommit]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      commitDraft();
    },
    [commitDraft]
  );

  const handlePointerCancel = useCallback(() => {
    draftRef.current = null;
    setDraft(null);
  }, []);

  // Build an SVG preview of the in-progress draft.
  const preview = (() => {
    if (!draft) return null;

    if (draft.tool === 'rectangle') {
      const x = Math.min(draft.startX, draft.currentX);
      const y = Math.min(draft.startY, draft.currentY);
      const w = Math.abs(draft.currentX - draft.startX);
      const h = Math.abs(draft.currentY - draft.startY);
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="rgba(239, 68, 68, 0.20)"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="6 4"
          data-testid="mask-draft-rect"
        />
      );
    }

    if (draft.tool === 'brush' || draft.tool === 'polygon' || draft.tool === 'erase') {
      const d = draft.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ');
      const isErase = draft.tool === 'erase';
      return (
        <path
          d={d}
          fill={draft.tool === 'polygon' ? 'rgba(239, 68, 68, 0.15)' : 'none'}
          stroke={isErase ? '#38bdf8' : '#ef4444'}
          strokeWidth={draft.tool !== 'polygon' ? brushSize : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isErase ? '8 6' : undefined}
          data-testid={isErase ? 'mask-draft-erase-path' : 'mask-draft-path'}
        />
      );
    }

    return null;
  })();

  // 'select' tool: render nothing — parent uses pointer-events on overlay to select regions.
  if (tool === 'select') return null;

  const cursor = tool === 'erase' ? 'cell' : 'crosshair';

  return (
    <div
      ref={surfaceRef}
      data-testid="region-mask-drawer"
      data-active-region={activeRegion.id}
      data-active-tool={tool}
      className="absolute inset-0"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <svg
        className="absolute inset-0 pointer-events-none"
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="none"
      >
        {preview}
      </svg>
    </div>
  );
});
