import { memo, useState, useCallback, useMemo, useRef } from 'react';
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
 * - Displays the newest decoded step frame with a smooth opacity transition
 * - Shows ProgressiveStepOverlay with cancel and step counter
 * - Ctrl+scroll to zoom (0.25x to 8x) with percentage display
 * - Spinner before the first step; an honest counter-only state when steps
 *   tick without any decoded frames (decoder-less / hosted runs)
 */
export const ProgressivePreview = memo(function ProgressivePreview() {
  const stepImages = useAppStore((s) => s.stepImages);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);
  const clearPreview = useAppStore((s) => s.clearPreview);

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // #33: show the newest decoded frame. The poll-driven counter legitimately
  // runs ahead of the 0.5s-throttled decoder, so an exact-key lookup would
  // blank the image back to the spinner between frames.
  const latestFrame = useMemo(() => {
    let latest: { step: number; image: string } | null = null;
    for (const [step, image] of stepImages) {
      if (!latest || step > latest.step) {
        latest = { step, image };
      }
    }
    return latest;
  }, [stepImages]);

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
    // #33: actually stop the backend job the preview is tracking, then tear
    // the preview down. Cancel errors are non-fatal - the poll loop settles
    // the job record either way.
    const jobId = useAppStore.getState().previewJobId;
    if (jobId) {
      void window.electron?.generation?.cancel(jobId)?.catch?.(() => undefined);
    }
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

      {latestFrame ? (
        /* ---- Step image ---- */
        <img
          src={latestFrame.image}
          alt={`Generation step ${latestFrame.step}`}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: `opacity ${OPACITY_TRANSITION_MS}ms ease-out, transform 150ms ease-out`,
          }}
        />
      ) : currentStep >= 2 ? (
        /* ---- Decoder-less / hosted run: honest counter-only state ---- */
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-text-body" role="status">
            Rendering - step preview unavailable on this run.
          </span>
        </div>
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
