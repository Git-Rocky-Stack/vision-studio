import { useState, useCallback, memo } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { CompositionLayerBar } from '@/components/studio/CompositionLayerBar';
import { AspectRatioFrame } from '@/components/studio/AspectRatioFrame';
import { ReferenceOverlay } from '@/components/studio/ReferenceOverlay';
import { ControlNetVisualization } from '@/components/studio/ControlNetVisualization';
import { RegionMaskPreview } from '@/components/studio/RegionMaskPreview';
import { ProgressivePreview } from '@/components/studio/ProgressivePreview';
import { ImagePlus } from 'lucide-react';

/** Default zoom level for the composition canvas. */
const DEFAULT_ZOOM = 1;

/**
 * Composition Preview panel that renders a layered visualization of the
 * reference image, ControlNet preprocessing, region masks, and aspect-ratio frame.
 * When a generation is in progress (isPreviewActive), renders the
 * ProgressivePreview component instead.
 */
export const CompositionPreview = memo(function CompositionPreview() {
  const compositionLayers = useAppStore((s) => s.compositionLayers);
  const isPreviewActive = useAppStore((s) => s.isPreviewActive);
  const currentImage = useAppStore((s) => s.currentImage);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  const handleGenerate = useCallback(() => {
    // Generation integration will be wired in a future task.
    // For now this is a no-op placeholder.
  }, []);

  // When preview is active (generation in progress), show the progressive preview
  if (isPreviewActive) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-void')}>
        <ProgressivePreview />
      </div>
    );
  }

  const hasReferenceImage = Boolean(currentImage);

  return (
    <div className={cn('flex h-full w-full flex-col overflow-hidden bg-void')}>
      {/* Layer bar */}
      <div className={cn('flex items-center justify-center px-3 pt-2')}>
        <CompositionLayerBar
          onGenerate={handleGenerate}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          onResetView={handleResetView}
        />
      </div>

      {/* Composition canvas area */}
      <div className={cn('relative flex-1 overflow-auto')}>
        <div
          className={cn(
            'flex h-full w-full items-center justify-center p-4',
          )}
        >
          {hasReferenceImage ? (
            <div
              className={cn('relative overflow-hidden rounded-sm')}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            >
              {/* Base reference image */}
              <img
                src={currentImage!}
                alt="Composition reference"
                className={cn('max-h-[calc(100vh-12rem)] max-w-full object-contain')}
                draggable={false}
              />

              {/* Layer overlays */}
              <ReferenceOverlay
                imageUrl={currentImage}
                layers={compositionLayers.reference}
              />
              <ControlNetVisualization
                preprocessedImageUrl={null}
                preprocessorType="canny"
                layers={compositionLayers.controlNet}
              />
              <RegionMaskPreview
                maskImageUrl={null}
                layers={compositionLayers.regionMasks}
              />
              <AspectRatioFrame
                ratio="1:1"
                visible={compositionLayers.aspectFrame.visible}
                opacity={compositionLayers.aspectFrame.opacity}
              />
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg',
                'border-2 border-dashed border-border bg-surface/50',
                'px-8 py-16 text-center',
              )}
            >
              <ImagePlus className={cn('h-10 w-10 text-text-muted')} />
              <p className={cn('text-sm text-text-muted')}>
                Drop a reference image or start generating
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});