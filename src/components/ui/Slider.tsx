import { cn } from '@/utils/cn';

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
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-light-grey">{label}</label>
        {showValue && (
          <span className="text-sm font-mono text-red">{valueFormatter(value)}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-silver">
        <span>{valueFormatter(min)}</span>
        <span>{valueFormatter(max)}</span>
      </div>
    </div>
  );
}
