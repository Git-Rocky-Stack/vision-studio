import { forwardRef, useImperativeHandle, useState } from 'react';
import { Circle, Group, Line } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/store/appStore';
import type { ShapeLayerData } from '@/types/editor';

import { ShapeNode } from './ShapeNode';

/**
 * Tool feedback drawn over the image: the brush footprint, the Clone Stamp /
 * Heal sampling point, the stroke being painted, and Shape / Pen drafts.
 * Pointer moves land here through the imperative handle, so following the
 * mouse re-renders this overlay and not the whole editor. Never exported:
 * EditCanvas hides it while flattening.
 */

export interface ToolOverlayHandle {
  setPointer: (point: { x: number; y: number } | null) => void;
  setRetouchDraft: (points: number[] | null) => void;
  setShapeDraft: (data: ShapeLayerData | null) => void;
}

interface ToolOverlayProps {
  stageScale: number;
  accentColor: string;
  contrastColor: string;
}

const CROSSHAIR_SCREEN_PX = 8;

export const ToolOverlay = forwardRef<ToolOverlayHandle, ToolOverlayProps>(function ToolOverlay(
  { stageScale, accentColor, contrastColor },
  ref,
) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [retouchDraft, setRetouchDraft] = useState<number[] | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeLayerData | null>(null);

  useImperativeHandle(ref, () => ({ setPointer, setRetouchDraft, setShapeDraft }), []);

  const { tool, brushSize, cloneSource, cloneOffset, penDraft, penSmooth, shapeStyle } = useAppStore(
    useShallow((s) => ({
      tool: s.activeEditTool,
      brushSize: s.editBrushSize,
      cloneSource: s.editCloneSource,
      cloneOffset: s.editCloneOffset,
      penDraft: s.editPenDraft,
      penSmooth: s.editPenSmooth,
      shapeStyle: s.editShapeStyle,
    })),
  );

  // One screen pixel, in image pixels: outlines stay hairline at any zoom.
  const hairline = 1 / Math.max(stageScale, 1e-6);
  const isRetouch = tool === 'clone' || tool === 'heal';
  const showsFootprint = isRetouch || tool === 'brush' || tool === 'eraser';
  const eraserScale = tool === 'eraser' ? 2 : 1;

  // While painting with a fixed offset, the sampling point follows the brush.
  const samplePoint =
    isRetouch && cloneSource
      ? cloneOffset && pointer
        ? { x: pointer.x + cloneOffset.x, y: pointer.y + cloneOffset.y }
        : cloneSource
      : null;
  const crosshair = CROSSHAIR_SCREEN_PX * hairline;

  return (
    <>
      {retouchDraft && retouchDraft.length >= 2 && (
        <Line
          points={retouchDraft.length === 2 ? [...retouchDraft, ...retouchDraft] : retouchDraft}
          stroke={accentColor}
          opacity={0.35}
          strokeWidth={brushSize}
          lineCap="round"
          lineJoin="round"
        />
      )}

      {samplePoint && (
        <Group x={samplePoint.x} y={samplePoint.y}>
          <Circle radius={brushSize / 2} stroke={contrastColor} strokeWidth={hairline * 3} opacity={0.6} />
          <Circle radius={brushSize / 2} stroke={accentColor} strokeWidth={hairline} />
          <Line points={[-crosshair, 0, crosshair, 0]} stroke={accentColor} strokeWidth={hairline} />
          <Line points={[0, -crosshair, 0, crosshair]} stroke={accentColor} strokeWidth={hairline} />
        </Group>
      )}

      {showsFootprint && pointer && (
        <Group x={pointer.x} y={pointer.y}>
          <Circle radius={(brushSize * eraserScale) / 2} stroke={contrastColor} strokeWidth={hairline * 3} opacity={0.6} />
          <Circle radius={(brushSize * eraserScale) / 2} stroke={accentColor} strokeWidth={hairline} />
        </Group>
      )}

      {shapeDraft && <ShapeNode data={shapeDraft} opacity={0.8} dash={[6 * hairline, 4 * hairline]} />}

      {tool === 'pen' && penDraft && penDraft.length >= 2 && (
        <>
          <Line
            points={pointer ? [...penDraft, pointer.x, pointer.y] : penDraft}
            stroke={shapeStyle.stroke}
            strokeWidth={Math.max(shapeStyle.strokeWidth, hairline)}
            tension={penSmooth ? 0.4 : 0}
            lineCap="round"
            lineJoin="round"
            opacity={0.8}
          />
          {Array.from({ length: penDraft.length / 2 }, (_, index) => (
            <Circle
              key={index}
              x={penDraft[index * 2]}
              y={penDraft[index * 2 + 1]}
              radius={(index === 0 ? 5 : 3.5) * hairline}
              fill={index === 0 ? accentColor : contrastColor}
              stroke={accentColor}
              strokeWidth={hairline}
            />
          ))}
        </>
      )}
    </>
  );
});
