import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { CompositionLayerBar } from '@/components/studio/CompositionLayerBar';
import { AspectRatioFrame } from '@/components/studio/AspectRatioFrame';
import { ReferenceOverlay } from '@/components/studio/ReferenceOverlay';
import { ControlNetVisualization } from '@/components/studio/ControlNetVisualization';
import { RegionMaskPreview } from '@/components/studio/RegionMaskPreview';
import { ProgressivePreview } from '@/components/studio/ProgressivePreview';
import { ImagePlus } from 'lucide-react';
import { MediaPreview, isLikelyVideoPath } from '@/components/ui/MediaPreview';
import { extractFrameToEdit } from '@/features/media/frameExtraction';

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
  const currentImageAssetPath = useAppStore((s) => s.currentImageAssetPath);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);
  const [frameStatus, setFrameStatus] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFrameStatus(null);
    setIsExtractingFrame(false);
  }, [currentImage, currentImageAssetPath]);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  const handleGenerate = useCallback(() => {
    // TODO: Wire to full generation action - this will trigger the generation
    // and stream step images via the generationPreviewSlice
    useAppStore.getState().setPreviewActive(true);
  }, []);

  // When preview is active (generation in progress), show the progressive preview
  if (isPreviewActive) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-void')}>
        <ProgressivePreview />
      </div>
    );
  }

  const hasReferenceImage = Boolean(currentImage || currentImageAssetPath);
  const isVideoSource = isLikelyVideoPath(currentImageAssetPath ?? currentImage);
  const handleExtractFrame = useCallback(async () => {
    const sourcePath = currentImageAssetPath ?? currentImage;
    if (!sourcePath) {
      setFrameStatus('No managed video source is loaded.');
      return;
    }

    const previewVideo = videoPreviewRef.current?.querySelector('video');
    const timeMs =
      previewVideo && Number.isFinite(previewVideo.currentTime) && previewVideo.currentTime > 0
        ? Math.round(previewVideo.currentTime * 1000)
        : 0;

    setIsExtractingFrame(true);
    setFrameStatus(null);

    try {
      const extracted = await extractFrameToEdit({
        sourcePath,
        timeMs,
      });
      setFrameStatus(`Frame extracted at ${(extracted.timeMs / 1000).toFixed(1)}s and opened in Canvas.`);
    } catch (error) {
      setFrameStatus(error instanceof Error ? error.message : 'Video frame extraction failed.');
    } finally {
      setIsExtractingFrame(false);
    }
  }, [currentImage, currentImageAssetPath]);

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
          {hasReferenceImage && !isVideoSource ? (
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
          ) : hasReferenceImage && isVideoSource ? (
            <div className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-border bg-surface/50 px-6 py-6 text-center">
              <div
                ref={(node) => {
                  videoPreviewRef.current = node;
                }}
                className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-void"
              >
                <MediaPreview
                  kind="video"
                  src={currentImageAssetPath ?? currentImage}
                  poster={currentImage}
                  alt="Composition video source"
                  className="h-full w-full"
                  mediaClassName="h-full w-full object-contain"
                  fallbackClassName="h-full w-full"
                  showPlayBadge
                />
              </div>
              <div className="space-y-2">
                <p className={cn('text-sm font-medium text-text-primary')}>
                  Video source loaded
                </p>
                <p className={cn('text-sm text-text-muted')}>
                  Composition overlays still apply to frames and still references. Extract a frame to continue in Canvas and use the same still in reference workflows.
                </p>
                {frameStatus ? <p className={cn('text-xs text-text-primary')}>{frameStatus}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void handleExtractFrame()}
                disabled={isExtractingFrame}
                className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExtractingFrame ? 'Extracting...' : 'Extract frame to Edit'}
              </button>
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg',
                'border-2 border-dashed border-border bg-surface/50',
                'px-8 py-16 text-center',
              )}
            >
              <ImagePlus className={cn('h-10 w-10 text-text-muted')} aria-hidden="true" />
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
