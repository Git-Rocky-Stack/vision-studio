import { memo, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  Frame,
  Image,
  GitBranch,
  PaintBucket,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { CompositionLayerState } from '@/types/promptStudio';
import { Slider } from '@/components/ui/Slider';

interface CompositionLayerBarProps {
  /** Callback fired when the Generate button is clicked. */
  onGenerate: () => void;
  /** Current zoom level. */
  zoom: number;
  /** Callback fired when zoom changes. */
  onZoomChange: (zoom: number) => void;
  /** Callback to reset the view to default zoom. */
  onResetView: () => void;
}

/** Layer metadata for rendering toggle buttons. */
const LAYER_CONFIG: {
  key: keyof CompositionLayerState;
  label: string;
  icon: typeof Eye;
}[] = [
  { key: 'aspectFrame', label: 'Frame', icon: Frame },
  { key: 'reference', label: 'Reference', icon: Image },
  { key: 'controlNet', label: 'ControlNet', icon: GitBranch },
  { key: 'regionMasks', label: 'Masks', icon: PaintBucket },
];

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;

/**
 * Floating toolbar at the top of the composition preview.
 * Contains layer toggles, opacity slider, zoom controls, and Generate button.
 */
export const CompositionLayerBar = memo(function CompositionLayerBar({
  onGenerate,
  zoom,
  onZoomChange,
  onResetView,
}: CompositionLayerBarProps) {
  const compositionLayers = useAppStore((s) => s.compositionLayers);
  const setCompositionLayerVisibility = useAppStore((s) => s.setCompositionLayerVisibility);
  const setCompositionLayerOpacity = useAppStore((s) => s.setCompositionLayerOpacity);

  // Find the first visible layer for the opacity slider
  const firstVisibleLayer = LAYER_CONFIG.find(
    (cfg) => compositionLayers[cfg.key].visible,
  )?.key ?? null;

  const handleZoomIn = useCallback(() => {
    onZoomChange(Math.min(zoom + ZOOM_STEP, ZOOM_MAX));
  }, [zoom, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    onZoomChange(Math.max(zoom - ZOOM_STEP, ZOOM_MIN));
  }, [zoom, onZoomChange]);

  const handleZoom1x = useCallback(() => {
    onZoomChange(1);
  }, [onZoomChange]);

  const handleOpacityChange = useCallback(
    (value: number) => {
      if (firstVisibleLayer) {
        setCompositionLayerOpacity(firstVisibleLayer, value / 100);
      }
    },
    [firstVisibleLayer, setCompositionLayerOpacity],
  );

  const opacityValue = firstVisibleLayer
    ? Math.round(compositionLayers[firstVisibleLayer].opacity * 100)
    : 100;

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border bg-elevated/95 px-2 py-1.5',
        'backdrop-blur-sm shadow-lg',
      )}
    >
      {/* Layer toggle buttons */}
      <div className={cn('flex items-center gap-0.5')}>
        {LAYER_CONFIG.map(({ key, label, icon: Icon }) => {
          const layer = compositionLayers[key];
          const isVisible = layer.visible;
          const ToggleIcon = isVisible ? Eye : EyeOff;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setCompositionLayerVisibility(key, !isVisible)}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30',
                isVisible
                  ? 'bg-accent-primary/20 text-text-primary'
                  : 'text-text-muted hover:text-text-body',
              )}
              aria-label={`${isVisible ? 'Hide' : 'Show'} ${label} layer`}
              aria-pressed={isVisible}
              title={`${isVisible ? 'Hide' : 'Show'} ${label}`}
            >
              <Icon className={cn('h-3.5 w-3.5')} />
              <ToggleIcon className={cn('h-3 w-3 opacity-60')} />
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className={cn('mx-1 h-5 w-px bg-border')} aria-hidden="true" />

      {/* Opacity slider for active layer */}
      <div className={cn('flex items-center gap-1.5')}>
        <span className={cn('text-micro text-text-muted whitespace-nowrap')}>
          {firstVisibleLayer
            ? `${LAYER_CONFIG.find((c) => c.key === firstVisibleLayer)?.label ?? 'Layer'}`
            : 'No layer'}
        </span>
        <Slider
          value={[opacityValue]}
          onValueChange={(v) => handleOpacityChange(v[0])}
          min={0}
          max={100}
          step={1}
          className={cn('w-20')}
          disabled={!firstVisibleLayer}
          aria-label={`${firstVisibleLayer ? LAYER_CONFIG.find((c) => c.key === firstVisibleLayer)?.label ?? 'Layer' : 'Layer'} opacity`}
        />
        <span className={cn('text-micro text-text-muted w-7 text-right tabular-nums')} aria-hidden="true">
          {opacityValue}%
        </span>
      </div>

      {/* Divider */}
      <div className={cn('mx-1 h-5 w-px bg-border')} aria-hidden="true" />

      {/* Zoom controls */}
      <div className={cn('flex items-center gap-0.5')}>
        <button
          type="button"
          onClick={handleZoomOut}
          className={cn(
            'rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-body',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30',
            zoom <= ZOOM_MIN && 'pointer-events-none opacity-40',
          )}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className={cn('h-3.5 w-3.5')} />
        </button>

        <span className={cn('text-micro text-text-body w-10 text-center tabular-nums')} aria-hidden="true">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          className={cn(
            'rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-body',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30',
            zoom >= ZOOM_MAX && 'pointer-events-none opacity-40',
          )}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className={cn('h-3.5 w-3.5')} />
        </button>

        <button
          type="button"
          onClick={onResetView}
          className={cn('rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30')}
          aria-label="Reset view"
          title="Reset view"
        >
          <RotateCcw className={cn('h-3.5 w-3.5')} />
        </button>

        <button
          type="button"
          onClick={handleZoom1x}
          className={cn('rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30')}
          aria-label="Zoom to 100%"
          title="Zoom to 100%"
        >
          <Maximize className={cn('h-3.5 w-3.5')} />
        </button>
      </div>

      {/* Divider */}
      <div className={cn('mx-1 h-5 w-px bg-border')} aria-hidden="true" />

      {/* Generate button */}
      <button
        type="button"
        onClick={onGenerate}
        className={cn(
          'rounded bg-accent-primary px-3 py-1 text-xs font-medium text-white',
          'transition-colors hover:bg-accent-primary-pressed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50',
        )}
      >
        Generate
      </button>
    </div>
  );
});