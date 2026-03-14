import { cn } from '@/utils/cn';
import { useRef, useCallback, useState } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  showValue = true,
  valueFormatter = (v) => v.toString(),
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = ((value - min) / (max - min)) * 100;

  const clampAndStep = useCallback(
    (raw: number) => {
      const stepped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      const decimals = step.toString().split('.')[1]?.length || 0;
      return Number(clamped.toFixed(decimals));
    },
    [min, max, step]
  );

  const updateValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      onChange(clampAndStep(raw));
    },
    [min, max, onChange, clampAndStep]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateValue(e.clientX);
    },
    [updateValue]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateValue(e.clientX);
    },
    [isDragging, updateValue]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newValue: number | null = null;
      const bigStep = (max - min) / 10;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          newValue = clampAndStep(value + step);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          newValue = clampAndStep(value - step);
          break;
        case 'PageUp':
          newValue = clampAndStep(value + bigStep);
          break;
        case 'PageDown':
          newValue = clampAndStep(value - bigStep);
          break;
        case 'Home':
          newValue = min;
          break;
        case 'End':
          newValue = max;
          break;
        default:
          return;
      }
      e.preventDefault();
      if (newValue !== null) onChange(newValue);
    },
    [value, min, max, step, onChange, clampAndStep]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label id={`slider-label-${label}`} className="text-label text-text-body">
          {label}
        </label>
        {showValue && (
          <span className="font-mono text-sm text-red-primary">{valueFormatter(value)}</span>
        )}
      </div>

      {/* Custom track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueFormatter(value)}
        className="relative h-5 flex items-center cursor-pointer select-none touch-none focus-visible:outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        {/* Focus ring */}
        <div className="absolute -inset-1 rounded-lg ring-0 peer-focus-visible:ring-2 ring-red-primary pointer-events-none" />

        {/* Background track */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-void border border-border" />

        {/* Filled portion */}
        <div
          className="absolute left-0 h-1 rounded-full"
          style={{
            width: `${percent}%`,
            background: 'linear-gradient(90deg, var(--color-gradient-progress-start), var(--color-gradient-progress-end))',
            boxShadow: '0 0 6px var(--color-red-glow)',
          }}
        />

        {/* Thumb */}
        <div
          className={cn(
            'absolute w-4 h-4 rounded-full bg-red-primary border-2 border-surface -translate-x-1/2 transition-shadow',
            isDragging
              ? 'scale-110 shadow-[0_0_10px_var(--color-red-glow)]'
              : 'hover:scale-110 hover:shadow-[0_0_8px_var(--color-red-glow)]'
          )}
          style={{ left: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-text-muted">
        <span>{valueFormatter(min)}</span>
        <span>{valueFormatter(max)}</span>
      </div>
    </div>
  );
}
