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

  const updateValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      // Round to avoid floating point issues
      const decimals = step.toString().split('.')[1]?.length || 0;
      onChange(Number(clamped.toFixed(decimals)));
    },
    [min, max, step, onChange]
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-label text-text-body">{label}</label>
        {showValue && (
          <span className="font-mono text-sm text-red-primary">{valueFormatter(value)}</span>
        )}
      </div>

      {/* Custom track */}
      <div
        ref={trackRef}
        className="relative h-5 flex items-center cursor-pointer select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background track */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-void border border-border" />

        {/* Filled portion */}
        <div
          className="absolute left-0 h-1 rounded-full"
          style={{
            width: `${percent}%`,
            background: 'linear-gradient(90deg, #c1121f, #e63946)',
            boxShadow: '0 0 6px rgba(230, 57, 70, 0.3)',
          }}
        />

        {/* Thumb */}
        <div
          className={cn(
            'absolute w-4 h-4 rounded-full bg-red-primary border-2 border-surface -translate-x-1/2 transition-shadow',
            isDragging
              ? 'scale-110 shadow-[0_0_10px_rgba(230,57,70,0.5)]'
              : 'hover:scale-110 hover:shadow-[0_0_8px_rgba(230,57,70,0.4)]'
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
