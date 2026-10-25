import { forwardRef } from 'react';
import { Arrow, Ellipse, Line, Rect } from 'react-konva';
import type Konva from 'konva';

import type { ShapeLayerData } from '@/types/editor';

/** Konva node props shared by every shape kind (selection, drag, transform). */
type NodeProps = Omit<Konva.ShapeConfig, 'x' | 'y' | 'points' | 'fill' | 'stroke'> & {
  id?: string;
  onClick?: () => void;
  onTap?: () => void;
  onDragEnd?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (event: Konva.KonvaEventObject<Event>) => void;
};

interface ShapeNodeProps extends NodeProps {
  data: ShapeLayerData;
}

/** One shape or path layer as its Konva node. */
export const ShapeNode = forwardRef<Konva.Shape, ShapeNodeProps>(function ShapeNode({ data, ...props }, ref) {
  const common = {
    ...props,
    x: data.x,
    y: data.y,
    rotation: data.rotation,
    scaleX: data.scaleX,
    scaleY: data.scaleY,
    stroke: data.strokeWidth > 0 ? data.stroke : undefined,
    strokeWidth: data.strokeWidth,
    fill: data.fillEnabled ? data.fill : undefined,
    // Keep the outline width constant when the transformer scales the node.
    strokeScaleEnabled: false,
    // Thin outlines stay easy to click.
    hitStrokeWidth: Math.max(data.strokeWidth, 12),
  };

  switch (data.kind) {
    case 'rectangle':
      return <Rect ref={ref as React.Ref<Konva.Rect>} {...common} width={data.width} height={data.height} />;
    case 'ellipse':
      return (
        <Ellipse
          ref={ref as React.Ref<Konva.Ellipse>}
          {...common}
          radiusX={data.width / 2}
          radiusY={data.height / 2}
        />
      );
    case 'arrow':
      return (
        <Arrow
          ref={ref as React.Ref<Konva.Arrow>}
          {...common}
          points={data.points}
          pointerLength={Math.max(10, data.strokeWidth * 3)}
          pointerWidth={Math.max(10, data.strokeWidth * 3)}
          // The arrow head is drawn with the fill: give it the outline colour
          // unless a fill was chosen.
          fill={data.fillEnabled ? data.fill : data.stroke}
          lineCap="round"
          lineJoin="round"
        />
      );
    case 'line':
    case 'path':
      return (
        <Line
          ref={ref as React.Ref<Konva.Line>}
          {...common}
          points={data.points}
          closed={data.kind === 'path' && data.closed}
          tension={data.kind === 'path' ? data.tension : 0}
          lineCap="round"
          lineJoin="round"
        />
      );
    default:
      return null;
  }
});
