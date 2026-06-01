import { memo, useState } from 'react';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { ChevronDown, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FPS_OPTIONS = [8, 12, 16, 24];

interface VideoControlsProps {
  duration?: number;
  fps?: number;
  motionStrength?: number;
  loop?: boolean;
  onDurationChange?: (value: number) => void;
  onFpsChange?: (value: number) => void;
  onMotionStrengthChange?: (value: number) => void;
  onLoopChange?: (value: boolean) => void;
}

export const VideoControls = memo(function VideoControls({
  duration = 3,
  fps = 24,
  motionStrength = 0.5,
  loop = false,
  onDurationChange,
  onFpsChange,
  onMotionStrengthChange,
  onLoopChange,
}: VideoControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-md border border-border bg-elevated/50 overflow-hidden">
      <div
        onPointerDown={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="flex items-center gap-2 w-full px-3 py-3 cursor-pointer"
      >
        <Video className="w-3.5 h-3.5 text-accent-primary" />
        <span className="text-label text-text-primary">Video Settings</span>
        <div className="flex-1" />
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              <Slider
                label="Duration (seconds)"
                value={duration}
                min={1}
                max={10}
                step={1}
                onChange={(v) => onDurationChange?.(v)}
              />

              <div>
                <label id="fps-selector-label" className="text-label text-text-body mb-1.5 block">Frames per second</label>
                <div role="group" aria-labelledby="fps-selector-label" className="flex gap-1">
                  {FPS_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-label={`${opt} FPS`}
                      data-active={opt === fps}
                      onClick={() => onFpsChange?.(opt)}
                      className={cn(
                        'flex-1 rounded-md border py-1 type-ui transition-all',
                        opt === fps
                          ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                          : 'border-border text-text-body hover:border-border-hover hover:bg-elevated'
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <Slider
                label="Motion strength"
                value={motionStrength}
                min={0.1}
                max={1}
                step={0.05}
                onChange={(v) => onMotionStrengthChange?.(v)}
              />

              <div className="flex items-center justify-between">
                <span className="text-label text-text-body">Loop video</span>
                <Switch
                  checked={loop}
                  onChange={(v) => onLoopChange?.(v)}
                  label="Loop video"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
