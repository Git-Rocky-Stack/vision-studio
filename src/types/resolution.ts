export type AspectRatio =
  | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  | '21:9' | '3:2' | '2:3' | 'custom';

export type ResolutionTier = 'standard' | 'high' | 'ultra';

export interface AspectRatioOption {
  id: AspectRatio;
  label: string;
  /** Ratio as width/height (e.g., 16/9) */
  ratio: number;
  /** Short description for tooltip */
  description: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '1:1', label: '1:1', ratio: 1, description: 'Square' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, description: 'Landscape Widescreen' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, description: 'Portrait' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, description: 'Classic Landscape' },
  { id: '3:4', label: '3:4', ratio: 3 / 4, description: 'Classic Portrait' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, description: 'Ultrawide' },
  { id: '3:2', label: '3:2', ratio: 3 / 2, description: 'Photo Landscape' },
  { id: '2:3', label: '2:3', ratio: 2 / 3, description: 'Photo Portrait' },
];

export const TIER_LONG_EDGE: Record<ResolutionTier, number> = {
  standard: 512,
  high: 768,
  ultra: 1024,
};

/** Compute pixel dimensions from aspect ratio + tier */
export function computeDimensions(
  aspectRatio: AspectRatio,
  tier: ResolutionTier,
  customWidth?: number,
  customHeight?: number
): { width: number; height: number } {
  if (aspectRatio === 'custom') {
    return {
      width: clamp(customWidth ?? 1024, 256, 2048),
      height: clamp(customHeight ?? 1024, 256, 2048),
    };
  }

  const option = ASPECT_RATIOS.find((r) => r.id === aspectRatio);
  if (!option) return { width: 1024, height: 1024 };

  const longEdge = TIER_LONG_EDGE[tier];
  const isLandscape = option.ratio >= 1;

  if (isLandscape) {
    const width = longEdge;
    const height = Math.round(width / option.ratio);
    return { width, height: clamp(height, 256, 2048) };
  } else {
    const height = longEdge;
    const width = Math.round(height * option.ratio);
    return { width: clamp(width, 256, 2048), height };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
