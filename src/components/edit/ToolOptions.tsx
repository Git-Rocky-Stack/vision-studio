import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowUpRight, Circle, Minus, Square } from 'lucide-react';

import { ColorPicker } from '@/components/edit/ColorPicker';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { cancelPenPath, finishPenPath } from '@/features/edit/penPath';
import { SHAPE_KIND_LABELS, isShapeLayer } from '@/features/edit/shapeLayers';
import { useAppStore } from '@/store/appStore';
import type { ShapeKind, ShapeStyle } from '@/types/editor';
import { cn } from '@/utils/cn';

/**
 * Options for the active canvas tool, under the tool strip: brush size and
 * colour, Clone Stamp / Heal sampling, Shape kind and style, and the Pen's
 * path controls. Tools without options render nothing.
 */

const SHAPE_KIND_ICONS: Record<Exclude<ShapeKind, 'path'>, React.ElementType> = {
  rectangle: Square,
  ellipse: Circle,
  line: Minus,
  arrow: ArrowUpRight,
};

const NO_RECENT_COLORS: string[] = [];

const percent = (value: number) => `${Math.round(value)}%`;

function OptionsHint({ children }: { children: React.ReactNode }) {
  return <p className="type-caption text-text-body">{children}</p>;
}

export const ToolOptions = memo(function ToolOptions() {
  const {
    tool,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    strokeCount,
    clearStrokes,
    hardness,
    setHardness,
    opacity,
    setOpacity,
    cloneSource,
    setCloneSource,
    retouchCount,
    clearRetouch,
    shapeKind,
    setShapeKind,
    shapeStyle,
    setShapeStyle,
    penSmooth,
    setPenSmooth,
    penDraft,
    selectedLayer,
    updateEditLayer,
  } = useAppStore(
    useShallow((s) => ({
      tool: s.activeEditTool,
      brushSize: s.editBrushSize,
      setBrushSize: s.setEditBrushSize,
      brushColor: s.editBrushColor,
      setBrushColor: s.setEditBrushColor,
      strokeCount: s.editStrokes.length,
      clearStrokes: s.clearEditStrokes,
      hardness: s.editRetouchHardness,
      setHardness: s.setEditRetouchHardness,
      opacity: s.editRetouchOpacity,
      setOpacity: s.setEditRetouchOpacity,
      cloneSource: s.editCloneSource,
      setCloneSource: s.setEditCloneSource,
      retouchCount: s.editRetouchStrokes.length,
      clearRetouch: s.clearRetouchStrokes,
      shapeKind: s.editShapeKind,
      setShapeKind: s.setEditShapeKind,
      shapeStyle: s.editShapeStyle,
      setShapeStyle: s.setEditShapeStyle,
      penSmooth: s.editPenSmooth,
      setPenSmooth: s.setEditPenSmooth,
      penDraft: s.editPenDraft,
      selectedLayer: s.editLayers.find((layer) => layer.id === s.selectedEditLayerId) ?? null,
      updateEditLayer: s.updateEditLayer,
    })),
  );

  const isRetouch = tool === 'clone' || tool === 'heal';
  const isVector = tool === 'shape' || tool === 'pen';
  if (tool !== 'brush' && tool !== 'eraser' && !isRetouch && !isVector) return null;

  // With a shape or path selected, the style controls restyle it as well as
  // setting the style of the next one.
  const selectedShape = selectedLayer && isShapeLayer(selectedLayer) ? selectedLayer : null;
  const applyShapeStyle = (style: Partial<ShapeStyle>) => {
    setShapeStyle(style);
    if (selectedShape && !selectedShape.locked) {
      const data = { ...selectedShape.data, ...style };
      // Only closed paths and closed shapes have an inside to fill.
      if (data.kind === 'line' || (data.kind === 'path' && !data.closed)) data.fillEnabled = false;
      updateEditLayer(selectedShape.id, { data }, `Restyle ${selectedShape.name.toLowerCase()}`);
    }
  };
  const style = selectedShape ? selectedShape.data : shapeStyle;
  const anchorCount = penDraft ? penDraft.length / 2 : 0;

  return (
    <section
      aria-label="Tool options"
      className="flex-shrink-0 space-y-3 border-b border-border px-3 py-3"
    >
      <p className="mono-label text-text-muted">
        {tool === 'clone'
          ? 'Clone Stamp'
          : tool === 'heal'
            ? 'Heal'
            : tool === 'shape'
              ? 'Shape'
              : tool === 'pen'
                ? 'Pen'
                : tool === 'eraser'
                  ? 'Eraser'
                  : 'Brush'}
      </p>

      {(tool === 'brush' || tool === 'eraser' || isRetouch) && (
        <Slider
          label="Size"
          value={brushSize}
          min={1}
          max={400}
          onChange={setBrushSize}
          valueFormatter={(value) => `${value}px`}
        />
      )}

      {tool === 'brush' && (
        <div className="flex items-center justify-between gap-2">
          <span className="type-caption text-text-muted">Colour</span>
          <ColorPicker value={brushColor} onChange={setBrushColor} recentColors={NO_RECENT_COLORS} />
        </div>
      )}

      {(tool === 'brush' || tool === 'eraser') && (
        <div className="flex items-center justify-between gap-2">
          <OptionsHint>
            {tool === 'eraser'
              ? 'Erases brush strokes. [ and ] change the size.'
              : '[ and ] change the size. I picks a colour from the image.'}
          </OptionsHint>
          <Button variant="ghost" size="sm" onClick={clearStrokes} disabled={strokeCount === 0}>
            Clear strokes
          </Button>
        </div>
      )}

      {isRetouch && (
        <>
          <Slider
            label="Hardness"
            value={Math.round(hardness * 100)}
            min={0}
            max={100}
            onChange={(value) => setHardness(value / 100)}
            valueFormatter={percent}
          />
          <Slider
            label="Opacity"
            value={Math.round(opacity * 100)}
            min={1}
            max={100}
            onChange={(value) => setOpacity(value / 100)}
            valueFormatter={percent}
          />
          <div className="recessed-well space-y-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="type-caption text-text-muted">Source</span>
              <span className="data-mono text-text-primary" data-testid="clone-source-status">
                {cloneSource
                  ? `${Math.round(cloneSource.x)}, ${Math.round(cloneSource.y)}`
                  : tool === 'heal'
                    ? 'Automatic'
                    : 'Not set'}
              </span>
            </div>
            <OptionsHint>
              {tool === 'clone'
                ? cloneSource
                  ? 'Paint to copy from the source. The source follows the brush; Alt+click sets a new one.'
                  : 'Alt+click the image to pick where to copy from, then paint.'
                : cloneSource
                  ? 'Heals from the source you set: its texture, blended into the colour and light around each stroke.'
                  : 'Paint over a blemish: Heal finds matching texture nearby and blends it in. Alt+click to heal from a source of your choice.'}
            </OptionsHint>
            {cloneSource && (
              <Button variant="ghost" size="sm" onClick={() => setCloneSource(null)}>
                Clear source
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <OptionsHint>[ and ] change the size.</OptionsHint>
            <Button variant="ghost" size="sm" onClick={clearRetouch} disabled={retouchCount === 0}>
              Clear retouching
            </Button>
          </div>
        </>
      )}

      {tool === 'shape' && (
        <div role="radiogroup" aria-label="Shape" className="grid grid-cols-4 gap-1">
          {(Object.keys(SHAPE_KIND_LABELS) as Exclude<ShapeKind, 'path'>[]).map((kind) => {
            const Icon = SHAPE_KIND_ICONS[kind];
            const active = shapeKind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setShapeKind(kind)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md py-2 type-caption transition-colors',
                  active
                    ? 'bg-accent-primary-muted text-accent-primary'
                    : 'text-text-body hover:bg-elevated hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {SHAPE_KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
      )}

      {isVector && (
        <>
          {selectedShape && (
            <OptionsHint>Editing the selected {selectedShape.name.toLowerCase()}.</OptionsHint>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-text-muted">Outline</span>
            <ColorPicker
              value={style.stroke}
              onChange={(stroke) => applyShapeStyle({ stroke })}
              recentColors={NO_RECENT_COLORS}
            />
          </div>
          <Slider
            label="Outline width"
            value={style.strokeWidth}
            min={0}
            max={100}
            onChange={(strokeWidth) => applyShapeStyle({ strokeWidth })}
            valueFormatter={(value) => `${value}px`}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-text-muted">Fill</span>
            <div className="flex items-center gap-2">
              {style.fillEnabled && (
                <ColorPicker
                  value={style.fill}
                  onChange={(fill) => applyShapeStyle({ fill })}
                  recentColors={NO_RECENT_COLORS}
                />
              )}
              <Switch
                label="Fill"
                checked={style.fillEnabled}
                onChange={(fillEnabled) => applyShapeStyle({ fillEnabled })}
              />
            </div>
          </div>
        </>
      )}

      {tool === 'shape' && (
        <OptionsHint>Drag on the image to draw. Hold Shift for a square, a circle or 45-degree lines.</OptionsHint>
      )}

      {tool === 'pen' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-text-muted">Smooth curves</span>
            <Switch label="Smooth curves" checked={penSmooth} onChange={setPenSmooth} />
          </div>
          <OptionsHint>
            {anchorCount === 0
              ? 'Click to place anchor points. Click the first point to close the shape; double-click or press Enter to finish an open path.'
              : `${anchorCount} ${anchorCount === 1 ? 'point' : 'points'}. Enter finishes, Backspace removes the last point, Esc cancels.`}
          </OptionsHint>
          {anchorCount > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => finishPenPath(false)} disabled={anchorCount < 2}>
                Finish path
              </Button>
              <Button variant="secondary" size="sm" onClick={() => finishPenPath(true)} disabled={anchorCount < 3}>
                Close shape
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelPenPath}>
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
});
