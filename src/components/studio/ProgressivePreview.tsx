import { memo, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProgressiveStepOverlay } from './ProgressiveStepOverlay';

/** Minimum and maximum zoom levels (multiples) */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
/** Zoom step per scroll-notch */
const ZOOM_STEP = 0.25;
/** Opacity transition duration for image appearance (ms) */
const OPACITY_TRANSITION_MS = 150;

/**
 * ProgressivePreview renders a step-by-step preview image during generation.
 *
 * Features:
 * - Displays the latest step image with a smooth opacity transition
 * - Shows ProgressiveStepOverlay with cancel and step counter
 * - Ctrl+scroll to zoom (0.25x to 8x) with percentage display
 * - Spinner state while waiting for the first step image
 */
export const ProgressivePreview = memo(function ProgressivePreview() {
  const stepImages = useAppStore((s) => s.stepImages);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);
  const clearPreview = useAppStore((s) => s.clearPreview);

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive the latest step image URL
  const latestStepImage = currentStep > 0 ? stepImages.get(currentStep) : undefined;

  // --- Zoom handler (Ctrl+scroll) ---
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const next = Math.round((prev + delta) * 100) / 100; // avoid float drift
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    },
    [],
  );

  // --- Cancel handler ---
  const handleCancel = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  // --- Zoom percentage label ---
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas"
    >
      {/* Overlay always rendered when generation is active */}
      <ProgressiveStepOverlay
        currentStep={currentStep}
        totalSteps={totalSteps}
        onCancel={handleCancel}
      />

      {latestStepImage ? (
        /* ---- Step image ---- */
        <img
          src={latestStepImage}
          alt={`Generation step ${currentStep}`}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: `opacity ${OPACITY_TRANSITION_MS}ms ease-out, transform 150ms ease-out`,
          }}
        />
      ) : (
        /* ---- Initializing spinner ---- */
        <div className="flex flex-col items-center gap-3">
          <div
            className="
              h-10 w-10 animate-spin rounded-full
              border-3 border-border border-t-accent-primary
            "
            aria-hidden="true"
          />
          <span className="text-sm text-text-body" role="status">
            Initializing generation...
          </span>
        </div>
      )}

      {/* Zoom percentage badge */}
      {zoom !== 1 && (
        <div
          className="
            pointer-events-none absolute bottom-3 left-3
            rounded-md bg-surface/80 px-2 py-0.5
            text-xs font-medium text-text-body
            backdrop-blur-sm
          "
          aria-hidden="true"
        >
          {zoomPercent}%
        </div>
      )}
    </div>
  );
});