import { memo, useId, useState } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import { ChevronDown, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Video timing for the next run (#J8). Both controls are the single source of
 * the matching backend VideoGenerationRequest fields:
 * - `duration` (seconds, backend range 1-10);
 * - `fps` (backend range 12-60; the generator plans fps x duration frames and
 *   caps the count per model family).
 * There is no backend motion-strength or loop parameter, so those controls
 * were removed rather than left inert.
 */

export const VIDEO_DURATION_MIN_SECONDS = 1;
export const VIDEO_DURATION_MAX_SECONDS = 10;
/** Presets inside the backend's accepted 12-60 fps range. */
export const VIDEO_FPS_OPTIONS = [12, 16, 24, 30] as const;

interface VideoControlsProps {
  duration: number;
  fps: number;
  onDurationChange: (value: number) => void;
  onFpsChange: (value: number) => void;
}

export const VideoControls = memo(function VideoControls({
  duration,
  fps,
  onDurationChange,
  onFpsChange,
}: VideoControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const bodyId = useId();
  const fpsLabelId = useId();
  const fpsIsPreset = (VIDEO_FPS_OPTIONS as readonly number[]).includes(fps);

  return (
    <div className="recessed-well overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-3 py-3 text-left"
      >
        <Video className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
        <span className="mono-label text-text-primary">Video Settings</span>
        <span className="flex-1" />
        <span className="data-mono text-text-muted">
          {duration}s / {fps} fps
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isExpanded && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3">
              <Slider
                label="Duration (seconds)"
                value={duration}
                min={VIDEO_DURATION_MIN_SECONDS}
                max={VIDEO_DURATION_MAX_SECONDS}
                step={1}
                onChange={onDurationChange}
                valueFormatter={(v) => `${v}s`}
              />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span id={fpsLabelId} className="mono-label text-text-body">
                    Frames per second
                  </span>
                  {!fpsIsPreset ? (
                    <span className="data-mono text-text-muted">{fps} fps</span>
                  ) : null}
                </div>
                <div role="group" aria-labelledby={fpsLabelId} className="flex gap-1">
                  {VIDEO_FPS_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-label={`${option} FPS`}
                      aria-pressed={option === fps}
                      data-active={option === fps}
                      onClick={() => onFpsChange(option)}
                      className={cn(
                        'raised-control flex-1 py-1 type-ui transition',
                        option === fps
                          ? 'selected-cap text-accent-primary'
                          : 'text-text-body hover:text-text-primary',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
