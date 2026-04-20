import { memo, useCallback } from 'react';
import type { CameraKeyframe } from '@/types/project';
import type { KeyframeInterpolation } from '@/types/timeline';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CameraKeyframeEditorProps {
  keyframe: CameraKeyframe;
  onChange: (updates: Partial<CameraKeyframe>) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERPOLATION_OPTIONS: { value: KeyframeInterpolation; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
];

const SHOW_EASING_STRENGTH = new Set<string>(['ease-in', 'ease-out', 'ease-in-out']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CameraKeyframeEditor = memo(function CameraKeyframeEditor({
  keyframe,
  onChange,
  className,
}: CameraKeyframeEditorProps) {
  const handlePanX = useCallback(
    (value: number) => onChange({ pan: { ...keyframe.pan, x: value } }),
    [keyframe.pan, onChange],
  );

  const handlePanY = useCallback(
    (value: number) => onChange({ pan: { ...keyframe.pan, y: value } }),
    [keyframe.pan, onChange],
  );

  const handleZoom = useCallback(
    (value: number) => onChange({ zoom: value }),
    [onChange],
  );

  const handleRotation = useCallback(
    (value: number) => onChange({ rotation: value }),
    [onChange],
  );

  const handleInterpolation = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ interpolation: e.target.value as KeyframeInterpolation });
    },
    [onChange],
  );

  const handleEasingStrength = useCallback(
    (value: number) => onChange({ easingStrength: value }),
    [onChange],
  );

  const showEasingStrength = SHOW_EASING_STRENGTH.has(keyframe.interpolation);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Pan X */}
      <Slider
        label="Pan X"
        value={keyframe.pan.x}
        min={-100}
        max={100}
        step={1}
        onChange={handlePanX}
        valueFormatter={(v) => `${v}px`}
      />

      {/* Pan Y */}
      <Slider
        label="Pan Y"
        value={keyframe.pan.y}
        min={-100}
        max={100}
        step={1}
        onChange={handlePanY}
        valueFormatter={(v) => `${v}px`}
      />

      {/* Zoom */}
      <Slider
        label="Zoom"
        value={keyframe.zoom}
        min={0.1}
        max={5}
        step={0.1}
        onChange={handleZoom}
        valueFormatter={(v) => `${Number(v).toFixed(1)}x`}
      />

      {/* Rotation */}
      <Slider
        label="Rotation"
        value={keyframe.rotation}
        min={-180}
        max={180}
        step={1}
        onChange={handleRotation}
        valueFormatter={(v) => `${v}deg`}
      />

      {/* Interpolation */}
      <div className="space-y-2">
        <label htmlFor="interpolation-select" className="text-label text-text-body">
          Interpolation
        </label>
        <select
          id="interpolation-select"
          aria-label="Interpolation"
          value={keyframe.interpolation}
          onChange={handleInterpolation}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-void"
        >
          {INTERPOLATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Easing Strength - only shown for non-linear interpolation */}
      {showEasingStrength && (
        <Slider
          label="Easing Strength"
          value={keyframe.easingStrength}
          min={0.1}
          max={1.0}
          step={0.05}
          onChange={handleEasingStrength}
          valueFormatter={(v) => `${Math.round(v * 100)}%`}
        />
      )}
    </div>
  );
});
