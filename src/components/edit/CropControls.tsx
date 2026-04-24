import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import {
  Crop,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Ruler,
  Check,
  X,
} from 'lucide-react';

interface CropAspect {
  id: string;
  label: string;
  ratio: number | null; // null = free
}

const CROP_ASPECTS: CropAspect[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: 'custom', label: 'Custom', ratio: null },
];

interface CropControlsProps {
  cropAspect: string;
  onCropAspectChange: (aspect: string) => void;
  rotation: number;
  onRotationChange: (degrees: number) => void;
  flipH: boolean;
  onFlipHChange: (flipped: boolean) => void;
  flipV: boolean;
  onFlipVChange: (flipped: boolean) => void;
  cropDimensions: { width: number; height: number } | null;
  customWidth: number;
  onCustomWidthChange: (w: number) => void;
  customHeight: number;
  onCustomHeightChange: (h: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function CropControls({
  cropAspect,
  onCropAspectChange,
  rotation,
  onRotationChange,
  flipH,
  onFlipHChange,
  flipV,
  onFlipVChange,
  cropDimensions,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  onApply,
  onCancel,
}: CropControlsProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Crop className="w-3.5 h-3.5 text-red-primary" />
        <span className="text-label text-text-primary">Crop & Transform</span>
      </div>

      {/* Aspect Ratio Presets */}
      <div className="space-y-2">
        <label className="text-label text-text-body">Aspect Ratio</label>
        <div className="grid grid-cols-2 gap-2">
          {CROP_ASPECTS.map((aspect) => (
            <button
              key={aspect.id}
              onClick={() => onCropAspectChange(aspect.id)}
              className={cn(
                'py-2 px-3 rounded-lg text-xs font-display font-medium transition-all text-center',
                cropAspect === aspect.id
                  ? 'bg-red-primary text-text-primary'
                  : 'bg-elevated text-text-body border border-border hover:border-border-hover'
              )}
            >
              {aspect.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Dimensions */}
      {cropAspect === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-label text-text-body mb-1 block">Width</label>
            <input
              type="number"
              value={customWidth}
              onChange={(e) => onCustomWidthChange(Number(e.target.value))}
              className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
            />
          </div>
          <div>
            <label className="text-label text-text-body mb-1 block">Height</label>
            <input
              type="number"
              value={customHeight}
              onChange={(e) => onCustomHeightChange(Number(e.target.value))}
              className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
            />
          </div>
        </div>
      )}

      {/* Rotation */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <RotateCw className="w-3.5 h-3.5 text-text-muted" />
          <label className="text-label text-text-body">Rotation</label>
        </div>
        <Slider
          label=""
          value={rotation}
          min={-45}
          max={45}
          step={0.5}
          onChange={onRotationChange}
          valueFormatter={(v) => `${v}°`}
        />
      </div>

      {/* Flip Buttons */}
      <div className="space-y-2">
        <label className="text-label text-text-body">Flip</label>
        <div className="flex gap-2">
          <button
            onClick={() => onFlipHChange(!flipH)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-display font-medium transition-all',
              flipH
                ? 'bg-red-primary text-text-primary'
                : 'bg-elevated text-text-body border border-border hover:border-border-hover'
            )}
          >
            <FlipHorizontal className="w-4 h-4" />
            Horizontal
          </button>
          <button
            onClick={() => onFlipVChange(!flipV)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-display font-medium transition-all',
              flipV
                ? 'bg-red-primary text-text-primary'
                : 'bg-elevated text-text-body border border-border hover:border-border-hover'
            )}
          >
            <FlipVertical className="w-4 h-4" />
            Vertical
          </button>
        </div>
      </div>

      {/* Crop Dimensions Display */}
      {cropDimensions && (
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <div className="flex items-center gap-2">
            <Ruler className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-label text-text-body">Crop Area</span>
          </div>
          <p className="font-mono text-sm text-text-primary mt-1">
            {cropDimensions.width} x {cropDimensions.height}px
          </p>
        </div>
      )}

      {/* Apply / Cancel */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" icon={Check} fullWidth onClick={onApply}>
          Apply Crop
        </Button>
      </div>
    </div>
  );
}
