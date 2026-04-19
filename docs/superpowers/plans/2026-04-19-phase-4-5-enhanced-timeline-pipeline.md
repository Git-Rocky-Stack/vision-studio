# Enhanced Timeline, Video Inputs, Resolution Picker & Refinement Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build four features sequentially: Aspect Ratio + Resolution Picker, Video Generation Inputs, Enhanced Timeline (3 modes with keyframes/playback/onion-skin/CameraKeyframe wiring), and Refinement Pipeline (presets + visual builder). Clean up all known TODOs and placeholders.

**Architecture:** Feature-by-feature (Approach A). Each feature is a complete, testable, committable unit. Store slices are additive — new keys alongside existing keys. Components are new files that compose existing primitives. Timeline infrastructure (engine, keyframe store, onion-skin compositor) is shared across all three timeline modes. Pipeline builder reuses the Workflows tab's DockviewSettingsPanel slot.

**Tech Stack:** React 19, TypeScript, Zustand 5, Tailwind CSS v4, Framer Motion, react-konva, Vitest 3.2.4, @testing-library/react 16.3.2

**Design Spec:** `docs/superpowers/specs/2026-04-19-phase-4-5-enhanced-timeline-pipeline-design.md`

---

## Feature 1: Aspect Ratio + Resolution Picker

### Task 1: Add Aspect Ratio & Resolution Types

**Files:**
- Create: `src/types/resolution.ts`
- Modify: `src/types/generation.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/uiSlice.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: Create resolution types**

Create `src/types/resolution.ts`:

```ts
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
```

- [ ] **Step 2: Write failing tests for resolution types**

Create `src/types/resolution.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeDimensions, ASPECT_RATIOS, TIER_LONG_EDGE } from './resolution';

describe('computeDimensions', () => {
  it('computes 1:1 square at ultra tier', () => {
    const { width, height } = computeDimensions('1:1', 'ultra');
    expect(width).toBe(1024);
    expect(height).toBe(1024);
  });

  it('computes 16:9 landscape at ultra tier', () => {
    const { width, height } = computeDimensions('16:9', 'ultra');
    expect(width).toBe(1024);
    expect(height).toBe(576);
  });

  it('computes 9:16 portrait at high tier', () => {
    const { width, height } = computeDimensions('9:16', 'high');
    expect(height).toBe(768);
    expect(width).toBe(432);
  });

  it('computes 21:9 ultrawide at standard tier', () => {
    const { width, height } = computeDimensions('21:9', 'standard');
    expect(width).toBe(512);
    expect(height).toBe(219);
  });

  it('uses custom dimensions when aspect ratio is custom', () => {
    const { width, height } = computeDimensions('custom', 'ultra', 800, 600);
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  it('clamps custom dimensions to 256-2048', () => {
    const { width, height } = computeDimensions('custom', 'ultra', 100, 9999);
    expect(width).toBe(256);
    expect(height).toBe(2048);
  });

  it('every built-in ratio produces valid dimensions at every tier', () => {
    const tiers: Array<keyof typeof TIER_LONG_EDGE> = ['standard', 'high', 'ultra'];
    for (const ratio of ASPECT_RATIOS) {
      for (const tier of tiers) {
        const { width, height } = computeDimensions(ratio.id, tier);
        expect(width).toBeGreaterThanOrEqual(256);
        expect(height).toBeGreaterThanOrEqual(256);
        expect(width).toBeLessThanOrEqual(2048);
        expect(height).toBeLessThanOrEqual(2048);
      }
    }
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/types/resolution.test.ts --project unit
```

Expected: All 7 tests PASS

- [ ] **Step 4: Add resolution fields to store**

In `src/store/appStore.types.ts`, add import:

```ts
import type { AspectRatio, ResolutionTier } from '@/types/resolution';
```

Add to `AppState`:

```ts
  aspectRatio: AspectRatio;
  resolutionTier: ResolutionTier;
  customWidth: number;
  customHeight: number;
```

Add to Actions:

```ts
  setAspectRatio: (ratio: AspectRatio) => void;
  setResolutionTier: (tier: ResolutionTier) => void;
  setCustomWidth: (width: number) => void;
  setCustomHeight: (height: number) => void;
```

In `src/store/slices/uiSlice.ts`, add to `uiInitialState`:

```ts
  aspectRatio: '1:1' as const,
  resolutionTier: 'ultra' as const,
  customWidth: 1024,
  customHeight: 1024,
```

Add to `createUIActions`:

```ts
    setAspectRatio: (ratio: AppState['aspectRatio']) => set({ aspectRatio: ratio }),
    setResolutionTier: (tier: AppState['resolutionTier']) => set({ resolutionTier: tier }),
    setCustomWidth: (width: number) => set({ customWidth: width }),
    setCustomHeight: (height: number) => set({ customHeight: height }),
```

- [ ] **Step 5: Write failing store tests**

Add to `src/store/appStore.test.ts`:

```ts
describe('resolution picker', () => {
  it('defaults aspect ratio to 1:1', () => {
    expect(useAppStore.getState().aspectRatio).toBe('1:1');
  });

  it('defaults resolution tier to ultra', () => {
    expect(useAppStore.getState().resolutionTier).toBe('ultra');
  });

  it('setAspectRatio changes the ratio', () => {
    useAppStore.getState().setAspectRatio('16:9');
    expect(useAppStore.getState().aspectRatio).toBe('16:9');
  });

  it('setResolutionTier changes the tier', () => {
    useAppStore.getState().setResolutionTier('standard');
    expect(useAppStore.getState().resolutionTier).toBe('standard');
  });
});
```

- [ ] **Step 6: Run all store tests**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: All pass including new resolution tests

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/types/resolution.ts src/types/resolution.test.ts src/store/appStore.types.ts src/store/slices/uiSlice.ts src/store/appStore.test.ts
git commit -m "feat(resolution): add aspect ratio and resolution tier types and store"
```

---

### Task 2: Create AspectRatioPicker Component

**Files:**
- Create: `src/components/generate/AspectRatioPicker.tsx`
- Create: `src/components/generate/AspectRatioPicker.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/generate/AspectRatioPicker.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AspectRatioPicker } from './AspectRatioPicker';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('AspectRatioPicker', () => {
  beforeEach(resetStore);

  it('renders all 8 aspect ratio options', () => {
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('1:1')).toBeInTheDocument();
    expect(screen.getByLabelText('16:9')).toBeInTheDocument();
    expect(screen.getByLabelText('9:16')).toBeInTheDocument();
    expect(screen.getByLabelText('4:3')).toBeInTheDocument();
    expect(screen.getByLabelText('3:4')).toBeInTheDocument();
    expect(screen.getByLabelText('21:9')).toBeInTheDocument();
    expect(screen.getByLabelText('3:2')).toBeInTheDocument();
    expect(screen.getByLabelText('2:3')).toBeInTheDocument();
  });

  it('renders 3 resolution tier buttons', () => {
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('Standard 512px')).toBeInTheDocument();
    expect(screen.getByLabelText('High 768px')).toBeInTheDocument();
    expect(screen.getByLabelText('Ultra 1024px')).toBeInTheDocument();
  });

  it('highlights the active ratio', () => {
    useAppStore.setState({ aspectRatio: '16:9' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('16:9')).toHaveAttribute('data-active', 'true');
  });

  it('highlights the active tier', () => {
    useAppStore.setState({ resolutionTier: 'high' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('High 768px')).toHaveAttribute('data-active', 'true');
  });

  it('changes ratio on click', async () => {
    const user = userEvent.setup();
    render(<AspectRatioPicker />);
    await user.click(screen.getByLabelText('16:9'));
    expect(useAppStore.getState().aspectRatio).toBe('16:9');
  });

  it('changes tier on click', async () => {
    const user = userEvent.setup();
    render(<AspectRatioPicker />);
    await user.click(screen.getByLabelText('Standard 512px'));
    expect(useAppStore.getState().resolutionTier).toBe('standard');
  });

  it('shows computed dimensions for current selection', () => {
    useAppStore.setState({ aspectRatio: '16:9', resolutionTier: 'ultra' });
    render(<AspectRatioPicker />);
    expect(screen.getByText('1024 × 576')).toBeInTheDocument();
  });

  it('shows custom inputs when custom ratio selected', async () => {
    useAppStore.setState({ aspectRatio: 'custom' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('Custom width')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom height')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/AspectRatioPicker.test.tsx --project component
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement AspectRatioPicker**

Create `src/components/generate/AspectRatioPicker.tsx`:

```tsx
import { memo, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { ASPECT_RATIOS, computeDimensions, type AspectRatio, type ResolutionTier } from '@/types/resolution';

const TIERS: { id: ResolutionTier; label: string; px: number }[] = [
  { id: 'standard', label: 'Standard', px: 512 },
  { id: 'high', label: 'High', px: 768 },
  { id: 'ultra', label: 'Ultra', px: 1024 },
];

export const AspectRatioPicker = memo(function AspectRatioPicker() {
  const { aspectRatio, resolutionTier, customWidth, customHeight,
    setAspectRatio, setResolutionTier, setCustomWidth, setCustomHeight } = useAppStore();

  const dimensions = useMemo(
    () => computeDimensions(aspectRatio, resolutionTier, customWidth, customHeight),
    [aspectRatio, resolutionTier, customWidth, customHeight]
  );

  return (
    <div className="space-y-3">
      <label className="text-label text-text-body">Aspect Ratio</label>

      {/* Ratio grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {ASPECT_RATIOS.map((opt) => {
          const isActive = aspectRatio === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-label={opt.id}
              data-active={isActive}
              title={opt.description}
              onClick={() => setAspectRatio(opt.id)}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-all',
                isActive
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
              )}
            >
              {/* Proportional preview rectangle */}
              <div
                className={cn(
                  'rounded-sm mb-1',
                  isActive ? 'bg-accent-primary' : 'bg-text-muted/30'
                )}
                style={{
                  width: `${Math.min(24, 24 * (opt.ratio >= 1 ? 1 : opt.ratio))}px`,
                  height: `${Math.min(24, 24 * (opt.ratio >= 1 ? 1 / opt.ratio : 1))}px`,
                }}
              />
              <span className="font-mono text-micro leading-none">{opt.label}</span>
            </button>
          );
        })}

        {/* Custom button */}
        <button
          type="button"
          aria-label="custom"
          data-active={aspectRatio === 'custom'}
          onClick={() => setAspectRatio('custom')}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-all',
            aspectRatio === 'custom'
              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
              : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
          )}
        >
          <span className="text-xs mb-1">⟷</span>
          <span className="font-mono text-micro leading-none">Custom</span>
        </button>
      </div>

      {/* Resolution tier */}
      <div className="flex gap-1.5">
        {TIERS.map((tier) => {
          const isActive = resolutionTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              aria-label={`${tier.label} ${tier.px}px`}
              data-active={isActive}
              onClick={() => setResolutionTier(tier.id)}
              className={cn(
                'flex-1 rounded-lg border py-1.5 text-center transition-all',
                isActive
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
              )}
            >
              <div className="type-ui font-medium">{tier.label}</div>
              <div className="font-mono text-micro text-text-muted">{tier.px}px</div>
            </button>
          );
        })}
      </div>

      {/* Dimensions display */}
      <div className="flex items-center justify-between rounded-lg bg-elevated/50 px-3 py-2 border border-border">
        <span className="text-label text-text-body">Output</span>
        <span className="font-mono type-ui text-text-primary">{dimensions.width} × {dimensions.height}</span>
      </div>

      {/* Custom inputs (visible only in custom mode) */}
      {aspectRatio === 'custom' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-label text-text-body mb-1 block">Width</label>
            <input
              type="number"
              aria-label="Custom width"
              value={customWidth}
              onChange={(e) => setCustomWidth(Math.max(256, Math.min(2048, Number(e.target.value))))}
              min={256}
              max={2048}
              step={64}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 type-ui text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-label text-text-body mb-1 block">Height</label>
            <input
              type="number"
              aria-label="Custom height"
              value={customHeight}
              onChange={(e) => setCustomHeight(Math.max(256, Math.min(2048, Number(e.target.value))))}
              min={256}
              max={2048}
              step={64}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 type-ui text-text-primary focus:border-accent-primary focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/AspectRatioPicker.test.tsx --project component
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/generate/AspectRatioPicker.tsx src/components/generate/AspectRatioPicker.test.tsx
git commit -m "feat(resolution): create AspectRatioPicker component with visual ratio grid"
```

---

### Task 3: Wire AspectRatioPicker into GeneratePanel

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/store/slices/uiSlice.ts` (update partialize)

- [ ] **Step 1: Add AspectRatioPicker to GeneratePanel**

In `src/pages/GeneratePanel.tsx`, add import:

```ts
import { AspectRatioPicker } from '@/components/generate/AspectRatioPicker';
```

Add the `<AspectRatioPicker />` component in the left dock content, after the Model Selector section and before the Style Presets section.

- [ ] **Step 2: Wire computed dimensions into generation config**

When a generation is submitted, read `aspectRatio`, `resolutionTier`, `customWidth`, `customHeight` from store, call `computeDimensions()`, and set `width`/`height` on the `GenerationConfig`.

Find where the generation config is constructed for submission and ensure `width`/`height` are derived from the resolution picker state rather than hardcoded.

- [ ] **Step 3: Persist resolution fields**

In `src/store/appStore.ts`, add to the `partialize` function:

```ts
        aspectRatio: state.aspectRatio,
        resolutionTier: state.resolutionTier,
        customWidth: state.customWidth,
        customHeight: state.customHeight,
```

- [ ] **Step 4: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/pages/GeneratePanel.tsx src/store/appStore.ts
git commit -m "feat(resolution): wire AspectRatioPicker into GeneratePanel with computed dimensions"
```

---

## Feature 2: Video Generation Inputs

### Task 4: Add Video Types & Store Slice

**Files:**
- Modify: `src/types/generation.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/uiSlice.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: Extend GenerationConfig with video fields**

In `src/types/generation.ts`, add to `GenerationConfig`:

```ts
  videoDuration?: number;       // seconds, 1-10, default 3
  videoFps?: number;            // 8|12|16|24, default 24
  motionStrength?: number;      // 0.1-1.0, default 0.5
  loopVideo?: boolean;          // default false
```

Add new type:

```ts
export type GenerationMode = 'image' | 'video';

export interface VideoFrameInput {
  id: string;
  imageData: string;   // data URL or file path
  label: string;       // 'Start Frame' | 'End Frame'
}
```

- [ ] **Step 2: Add video state to store types**

In `src/store/appStore.types.ts`, add import:

```ts
import type { GenerationMode, VideoFrameInput } from '@/types/generation';
```

Add to `AppState`:

```ts
  generationMode: GenerationMode;
  startFrameImage: string | null;
  endFrameImage: string | null;
```

Add to Actions:

```ts
  setGenerationMode: (mode: GenerationMode) => void;
  setStartFrameImage: (image: string | null) => void;
  setEndFrameImage: (image: string | null) => void;
```

- [ ] **Step 3: Add initial state and actions to uiSlice**

In `src/store/slices/uiSlice.ts`, add to `uiInitialState`:

```ts
  generationMode: 'image' as const,
  startFrameImage: null as string | null,
  endFrameImage: null as string | null,
```

Add to `createUIActions`:

```ts
    setGenerationMode: (mode: AppState['generationMode']) => set({ generationMode: mode }),
    setStartFrameImage: (image: string | null) => set({ startFrameImage: image }),
    setEndFrameImage: (image: string | null) => set({ endFrameImage: image }),
```

- [ ] **Step 4: Write failing tests**

Add to `src/store/appStore.test.ts`:

```ts
describe('video generation', () => {
  it('defaults generationMode to image', () => {
    expect(useAppStore.getState().generationMode).toBe('image');
  });

  it('defaults start/end frame to null', () => {
    expect(useAppStore.getState().startFrameImage).toBeNull();
    expect(useAppStore.getState().endFrameImage).toBeNull();
  });

  it('setGenerationMode switches mode', () => {
    useAppStore.getState().setGenerationMode('video');
    expect(useAppStore.getState().generationMode).toBe('video');
  });

  it('setStartFrameImage stores the image', () => {
    useAppStore.getState().setStartFrameImage('data:image/png;base64,test');
    expect(useAppStore.getState().startFrameImage).toBe('data:image/png;base64,test');
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/types/generation.ts src/store/appStore.types.ts src/store/slices/uiSlice.ts src/store/appStore.test.ts
git commit -m "feat(video): add video generation mode types and store slice"
```

---

### Task 5: Create CompactImageDropZone Component

**Files:**
- Create: `src/components/generate/CompactImageDropZone.tsx`
- Create: `src/components/generate/CompactImageDropZone.test.tsx`

Simplified version of the existing `ImageDropZone` — no mode selector, no denoising slider. Just drag/drop, file picker, preview, remove.

- [ ] **Step 1: Write failing tests**

Create `src/components/generate/CompactImageDropZone.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactImageDropZone } from './CompactImageDropZone';

describe('CompactImageDropZone', () => {
  it('renders the label', () => {
    render(<CompactImageDropZone label="Start Frame" image={null} onImageChange={() => {}} />);
    expect(screen.getByText('Start Frame')).toBeInTheDocument();
  });

  it('shows upload prompt when no image', () => {
    render(<CompactImageDropZone label="Start Frame" image={null} onImageChange={() => {}} />);
    expect(screen.getByText('Drop image or click')).toBeInTheDocument();
  });

  it('shows preview when image is provided', () => {
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={() => {}} />);
    expect(screen.getByAltText('Start Frame')).toBeInTheDocument();
  });

  it('shows remove button when image is present', () => {
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={() => {}} />);
    expect(screen.getByLabelText('Remove Start Frame')).toBeInTheDocument();
  });

  it('calls onImageChange with null when remove is clicked', async () => {
    const onChange = vi.fn();
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={onChange} />);
    await userEvent.setup().click(screen.getByLabelText('Remove Start Frame'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/CompactImageDropZone.test.tsx --project component
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement CompactImageDropZone**

Create `src/components/generate/CompactImageDropZone.tsx`:

```tsx
import { memo, useRef, useState, useCallback } from 'react';
import { readFileAsDataUrl } from '@/utils/readFileAsDataUrl';
import { cn } from '@/utils/cn';
import { Upload, X } from 'lucide-react';

interface CompactImageDropZoneProps {
  label: string;
  image: string | null;
  onImageChange: (image: string | null) => void;
}

export const CompactImageDropZone = memo(function CompactImageDropZone({
  label,
  image,
  onImageChange,
}: CompactImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const dataUrl = await readFileAsDataUrl(file);
      onImageChange(dataUrl);
    },
    [onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    onImageChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onImageChange]);

  return (
    <div>
      <label className="text-label text-text-body mb-1.5 block">{label}</label>

      {image ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-void">
          <img src={image} alt={label} className="w-full h-full object-contain" />
          <button
            onClick={handleRemove}
            aria-label={`Remove ${label}`}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-void/80 text-text-primary hover:bg-red-primary transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-4 cursor-pointer transition-all',
            isDragOver
              ? 'border-accent-primary bg-accent-primary-muted/20'
              : 'border-border hover:border-border-hover hover:bg-elevated/30'
          )}
        >
          <Upload className="w-4 h-4 text-text-muted" />
          <span className="font-display text-xs text-text-body">Drop image or click</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/CompactImageDropZone.test.tsx --project component
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/generate/CompactImageDropZone.tsx src/components/generate/CompactImageDropZone.test.tsx
git commit -m "feat(video): create CompactImageDropZone for start/end frame inputs"
```

---

### Task 6: Create VideoControls Component

**Files:**
- Create: `src/components/generate/VideoControls.tsx`
- Create: `src/components/generate/VideoControls.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/generate/VideoControls.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoControls } from './VideoControls';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('VideoControls', () => {
  beforeEach(resetStore);

  it('renders duration slider', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
  });

  it('renders FPS selector', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Frames per second')).toBeInTheDocument();
  });

  it('renders motion strength slider', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Motion strength')).toBeInTheDocument();
  });

  it('renders loop toggle', () => {
    render(<VideoControls />);
    expect(screen.getByLabelText('Loop video')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/VideoControls.test.tsx --project component
```

Expected: FAIL

- [ ] **Step 3: Implement VideoControls**

Create `src/components/generate/VideoControls.tsx`:

```tsx
import { memo } from 'react';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';

const FPS_OPTIONS = [8, 12, 16, 24];

export const VideoControls = memo(function VideoControls() {
  // These will be wired to store or local state in GeneratePanel
  // For now, render the controls with local defaults
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-label text-text-body">Duration</span>
        <span className="font-mono text-micro text-text-muted">3s</span>
      </div>
      <Slider
        label="Duration"
        value={[3]}
        min={1}
        max={10}
        step={1}
        hideLabel
      />

      <div>
        <label className="text-label text-text-body mb-1.5 block">Frames per second</label>
        <div className="flex gap-1">
          {FPS_OPTIONS.map((fps) => (
            <button
              key={fps}
              type="button"
              data-active={fps === 24}
              className="flex-1 rounded-md border border-border py-1 type-ui text-text-body hover:border-border-hover hover:bg-elevated transition-all data-[active=true]:border-accent-primary-border data-[active=true]:bg-accent-primary-muted data-[active=true]:text-accent-primary"
            >
              {fps}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Motion strength"
        value={[0.5]}
        min={0.1}
        max={1}
        step={0.05}
      />

      <div className="flex items-center justify-between">
        <span className="text-label text-text-body">Loop video</span>
        <Switch checked={false} onCheckedChange={() => {}} aria-label="Loop video" />
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/components/generate/VideoControls.test.tsx --project component
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/generate/VideoControls.tsx src/components/generate/VideoControls.test.tsx
git commit -m "feat(video): create VideoControls component with duration, fps, motion, loop"
```

---

### Task 7: Wire Video Inputs into GeneratePanel

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`

- [ ] **Step 1: Add Image/Video toggle and video inputs to GeneratePanel**

In `src/pages/GeneratePanel.tsx`:

1. Add imports for `CompactImageDropZone`, `VideoControls`
2. Read `generationMode`, `startFrameImage`, `endFrameImage` from store
3. Add Image/Video toggle switch at the top of the panel (above prompt area)
4. When `generationMode === 'video'`, render:
   - `<CompactImageDropZone label="Start Frame" />` after reference image
   - `<CompactImageDropZone label="End Frame" />` after start frame
   - Collapsible `<VideoControls />` section

- [ ] **Step 2: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/pages/GeneratePanel.tsx
git commit -m "feat(video): wire video generation toggle, start/end frame inputs, and video controls"
```

---

## Feature 3: Enhanced Timeline

### Task 8: Create TimelineEngine Store Slice

**Files:**
- Create: `src/types/timeline.ts`
- Create: `src/store/slices/timelineSlice.ts`
- Create: `src/store/slices/timelineSlice.test.ts`
- Modify: `src/store/appStore.ts` (wire slice)
- Modify: `src/store/appStore.types.ts` (add types)

- [ ] **Step 1: Create timeline types**

Create `src/types/timeline.ts`:

```ts
export type TimelineMode = 'storyboard' | 'animation' | 'canvas';

export type PlayState = 'playing' | 'paused' | 'stopped';

export type KeyframeInterpolation = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface Keyframe {
  id: string;
  entityId: string;
  entityType: 'scene' | 'frame' | 'layer';
  property: string;
  time: number;                              // ms
  value: number | { x: number; y: number };
  interpolation: KeyframeInterpolation;
  easingStrength: number;                    // 0.1-1.0
}

export interface TimelineEngineState {
  mode: TimelineMode;
  playState: PlayState;
  currentTime: number;                       // ms
  fps: number;
  loop: boolean;
  speed: number;                             // 0.25, 0.5, 1, 2
  onionSkinEnabled: boolean;
  onionSkinFrameCount: number;               // 1-5
  onionSkinOpacity: number;                  // 0.1-0.5
  onionSkinDirection: 'prev' | 'next' | 'both';
}

export interface KeyframeStoreState {
  keyframes: Keyframe[];
  activeKeyframeId: string | null;
}
```

- [ ] **Step 2: Write failing tests for timeline engine**

Create `src/store/slices/timelineSlice.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('TimelineEngine', () => {
  beforeEach(resetStore);

  it('defaults to canvas mode', () => {
    expect(useAppStore.getState().timelineMode).toBe('canvas');
  });

  it('defaults to stopped play state', () => {
    expect(useAppStore.getState().playState).toBe('stopped');
  });

  it('defaults currentTime to 0', () => {
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('setTimelineMode changes the mode', () => {
    useAppStore.getState().setTimelineMode('animation');
    expect(useAppStore.getState().timelineMode).toBe('animation');
  });

  it('play sets playState to playing', () => {
    useAppStore.getState().timelinePlay();
    expect(useAppStore.getState().playState).toBe('playing');
  });

  it('pause sets playState to paused', () => {
    useAppStore.getState().timelinePlay();
    useAppStore.getState().timelinePause();
    expect(useAppStore.getState().playState).toBe('paused');
  });

  it('stop resets playState and currentTime', () => {
    useAppStore.getState().timelinePlay();
    useAppStore.getState().seekTo(5000);
    useAppStore.getState().timelineStop();
    expect(useAppStore.getState().playState).toBe('stopped');
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('seekTo sets currentTime', () => {
    useAppStore.getState().seekTo(3000);
    expect(useAppStore.getState().currentTime).toBe(3000);
  });

  it('setSpeed changes playback speed', () => {
    useAppStore.getState().setTimelineSpeed(2);
    expect(useAppStore.getState().timelineSpeed).toBe(2);
  });

  it('toggleLoop toggles loop', () => {
    expect(useAppStore.getState().timelineLoop).toBe(false);
    useAppStore.getState().toggleTimelineLoop();
    expect(useAppStore.getState().timelineLoop).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/store/slices/timelineSlice.test.ts --project unit
```

Expected: FAIL

- [ ] **Step 4: Create timeline slice**

Create `src/store/slices/timelineSlice.ts`:

```ts
import type { AppState, AppSet } from '../appStore.types';
import type { TimelineMode, Keyframe } from '@/types/timeline';

export const timelineInitialState = {
  // Engine
  timelineMode: 'canvas' as TimelineMode,
  playState: 'stopped' as const,
  currentTime: 0,
  timelineFps: 24,
  timelineLoop: false,
  timelineSpeed: 1,
  // Onion skin
  onionSkinEnabled: false,
  onionSkinFrameCount: 2,
  onionSkinOpacity: 0.3,
  onionSkinDirection: 'both' as const,
  // Keyframes
  keyframes: [] as Keyframe[],
  activeKeyframeId: null as string | null,
};

export function createTimelineActions(set: AppSet) {
  return {
    setTimelineMode: (mode: TimelineMode) => set({ timelineMode: mode }),
    timelinePlay: () => set({ playState: 'playing' }),
    timelinePause: () => set({ playState: 'paused' }),
    timelineStop: () => set({ playState: 'stopped', currentTime: 0 }),
    seekTo: (time: number) => set({ currentTime: Math.max(0, time) }),
    setTimelineFps: (fps: number) => set({ timelineFps: fps }),
    setTimelineSpeed: (speed: number) => set({ timelineSpeed: speed }),
    toggleTimelineLoop: () => set((s) => ({ timelineLoop: !s.timelineLoop })),
    // Onion skin
    setOnionSkinEnabled: (enabled: boolean) => set({ onionSkinEnabled: enabled }),
    setOnionSkinFrameCount: (count: number) => set({ onionSkinFrameCount: count }),
    setOnionSkinOpacity: (opacity: number) => set({ onionSkinOpacity: opacity }),
    setOnionSkinDirection: (dir: 'prev' | 'next' | 'both') => set({ onionSkinDirection: dir }),
    // Keyframes
    addKeyframe: (kf: Keyframe) => set((s) => ({ keyframes: [...s.keyframes, kf] })),
    updateKeyframe: (id: string, updates: Partial<Keyframe>) =>
      set((s) => ({
        keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, ...updates } : k)),
      })),
    deleteKeyframe: (id: string) =>
      set((s) => ({ keyframes: s.keyframes.filter((k) => k.id !== id) })),
    setActiveKeyframeId: (id: string | null) => set({ activeKeyframeId: id }),
  };
}
```

- [ ] **Step 5: Wire into appStore.types.ts and appStore.ts**

Add the timeline state fields and actions to `AppState` and `AppActions` in `appStore.types.ts`.

Spread `timelineInitialState` and `createTimelineActions` into the store creation in `appStore.ts`.

- [ ] **Step 6: Run tests**

```bash
cd /c/vision-studio && npx vitest run src/store/slices/timelineSlice.test.ts --project unit
```

Expected: All 10 tests PASS

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/types/timeline.ts src/store/slices/timelineSlice.ts src/store/slices/timelineSlice.test.ts src/store/appStore.types.ts src/store/appStore.ts
git commit -m "feat(timeline): add TimelineEngine and KeyframeStore with play/pause/seek/keyframe CRUD"
```

---

### Task 9: Wire CameraKeyframe — Remove Placeholders

**Files:**
- Modify: `src/types/project.ts` (add interpolation fields, remove "Phase 2 placeholder" comments)
- Create: `src/components/timeline/CameraKeyframeEditor.tsx`
- Create: `src/components/timeline/CameraKeyframeEditor.test.tsx`

- [ ] **Step 1: Extend CameraKeyframe type**

In `src/types/project.ts`, update the `CameraKeyframe` interface:

```ts
export interface CameraKeyframe {
  id: string;
  time: number;           // ms
  pan: { x: number; y: number };
  zoom: number;
  rotation: number;
  interpolation: KeyframeInterpolation;  // NEW
  easingStrength: number;                 // NEW
}
```

Add import:

```ts
import type { KeyframeInterpolation } from '@/types/timeline';
```

Remove the "Phase 2 placeholder" comments from lines 61 and 155.

- [ ] **Step 2: Write failing tests for CameraKeyframeEditor**

Create `src/components/timeline/CameraKeyframeEditor.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CameraKeyframeEditor } from './CameraKeyframeEditor';

describe('CameraKeyframeEditor', () => {
  it('renders pan, zoom, rotation, and interpolation controls', () => {
    render(
      <CameraKeyframeEditor
        keyframe={{ id: '1', time: 0, pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, interpolation: 'linear', easingStrength: 0.5 }}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText('Pan X')).toBeInTheDocument();
    expect(screen.getByLabelText('Pan Y')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotation')).toBeInTheDocument();
    expect(screen.getByLabelText('Interpolation')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement CameraKeyframeEditor**

Create `src/components/timeline/CameraKeyframeEditor.tsx` — a form panel with sliders for pan X/Y, zoom, rotation, and a dropdown for interpolation type.

- [ ] **Step 4: Run tests and typecheck**

```bash
cd /c/vision-studio && npx vitest run src/components/timeline/CameraKeyframeEditor.test.tsx --project component && npm run typecheck
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/types/project.ts src/components/timeline/CameraKeyframeEditor.tsx src/components/timeline/CameraKeyframeEditor.test.tsx
git commit -m "feat(timeline): wire CameraKeyframe with interpolation, remove Phase 2 placeholder comments"
```

---

### Task 10: Create Timeline Mode Switcher & OnionSkinCompositor

**Files:**
- Modify: `src/components/layout/Timeline.tsx` (add mode switcher, onion-skin controls)
- Create: `src/components/timeline/OnionSkinOverlay.tsx`
- Create: `src/components/timeline/OnionSkinOverlay.test.tsx`

- [ ] **Step 1: Add mode switcher to Timeline toolbar**

In `src/components/layout/Timeline.tsx`, add a segmented control to the toolbar area:

```
[Storyboard] [Animation] [Canvas]
```

Wired to `setTimelineMode` from the store. Auto-defaults based on `activeTab` but user can override.

- [ ] **Step 2: Create OnionSkinOverlay**

A react-konva layer that renders previous/next frames at reduced opacity. Reads `onionSkinEnabled`, `onionSkinFrameCount`, `onionSkinOpacity`, `onionSkinDirection` from store.

- [ ] **Step 3: Write tests for OnionSkinOverlay**

Test that it renders when enabled, hides when disabled, respects frame count and direction settings.

- [ ] **Step 4: Run tests and typecheck**

```bash
cd /c/vision-studio && npm run test && npm run typecheck
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Timeline.tsx src/components/timeline/OnionSkinOverlay.tsx src/components/timeline/OnionSkinOverlay.test.tsx
git commit -m "feat(timeline): add mode switcher and OnionSkinOverlay compositor"
```

---

### Task 11: Implement Storyboard Mode Playback

**Files:**
- Modify: `src/components/layout/Timeline.tsx` (storyboard mode rendering)
- Create: `src/components/timeline/StoryboardPlayback.tsx`

- [ ] **Step 1: Implement StoryboardPlayback component**

Uses `TimelineEngine` to play through scenes sequentially. Plays transitions between scenes (fade, dissolve, wipe). Supports play/pause/step/loop/speed. Camera keyframes interpolate during playback.

- [ ] **Step 2: Wire into Timeline when mode is 'storyboard'**

When `timelineMode === 'storyboard'`, render the StoryboardPlayback component in the timeline body area instead of the default track view.

- [ ] **Step 3: Run tests and typecheck**

```bash
cd /c/vision-studio && npm run test && npm run typecheck
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Timeline.tsx src/components/timeline/StoryboardPlayback.tsx
git commit -m "feat(timeline): implement Storyboard mode with scene playback and transitions"
```

---

### Task 12: Implement Animation Mode (Frames + Keyframes)

**Files:**
- Create: `src/components/timeline/AnimationTrackEditor.tsx`
- Create: `src/components/timeline/KeyframeDiamond.tsx`
- Create: `src/components/timeline/FrameFilmstrip.tsx`

- [ ] **Step 1: Create FrameFilmstrip**

Horizontal filmstrip of frame thumbnails. Add frame button at end. Drag to reorder. Click to select active frame.

- [ ] **Step 2: Create KeyframeDiamond**

Diamond marker component for keyframes on timeline tracks. Draggable in time. Click to select. Right-click context menu for delete/interpolation.

- [ ] **Step 3: Create AnimationTrackEditor**

Layer-based track editor. Each layer gets a track row. Keyframes appear as diamonds on tracks. Frame filmstrip at the top.

- [ ] **Step 4: Wire into Timeline when mode is 'animation'**

When `timelineMode === 'animation'`, render AnimationTrackEditor.

- [ ] **Step 5: Run tests and typecheck**

```bash
cd /c/vision-studio && npm run test && npm run typecheck
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/components/timeline/AnimationTrackEditor.tsx src/components/timeline/KeyframeDiamond.tsx src/components/timeline/FrameFilmstrip.tsx
git commit -m "feat(timeline): implement Animation mode with frame filmstrip and keyframe diamonds"
```

---

### Task 13: Enhance Canvas Mode + Timeline Integration Tests

**Files:**
- Modify: `src/components/layout/Timeline.tsx` (canvas mode keyframe support)
- Create: `src/components/layout/Timeline.integration.test.tsx`

- [ ] **Step 1: Add keyframe markers to Canvas mode tracks**

In Canvas mode, allow adding keyframes to the active layer. Render diamonds on generation tracks.

- [ ] **Step 2: Write integration tests**

Test full flows:
- Switch between all 3 modes
- Play/pause/stop/seek in each mode
- Onion-skin toggle
- Keyframe add/delete in animation mode

- [ ] **Step 3: Run full test suite**

```bash
cd /c/vision-studio && npm run test && npm run typecheck
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Timeline.tsx src/components/layout/Timeline.integration.test.tsx
git commit -m "feat(timeline): enhance Canvas mode with keyframes and add integration tests"
```

---

## Feature 4: Refinement Pipeline

### Task 14: Add Pipeline Types & Store Slice

**Files:**
- Create: `src/types/pipeline.ts`
- Create: `src/store/slices/pipelineSlice.ts`
- Create: `src/store/slices/pipelineSlice.test.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.ts`

- [ ] **Step 1: Create pipeline types**

Create `src/types/pipeline.ts`:

```ts
export type PipelineStepType =
  | 'upscale' | 'denoise' | 'sharpen' | 'face-restore'
  | 'color-correct' | 'background-remove' | 'style-transfer'
  | 'blur' | 'crop-resize' | 'custom';

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  label: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  isBuiltIn: boolean;
  created: string;
  modified: string;
}

export type StepExecutionStatus = 'pending' | 'running' | 'complete' | 'error';

export interface StepExecutionResult {
  stepId: string;
  status: StepExecutionStatus;
  output?: string;
  error?: string;
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  sourceImageId: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  currentStepIndex: number;
  stepResults: StepExecutionResult[];
  finalOutput?: string;
  created: string;
}
```

- [ ] **Step 2: Create pipeline slice with built-in presets**

Create `src/store/slices/pipelineSlice.ts` with:
- Initial state: `pipelines`, `activePipelineId`, `executions`, `isBuilderOpen`
- Actions: createPipeline, updatePipeline, deletePipeline, duplicatePipeline, runPipeline, cancelExecution
- Built-in presets (Upscale 4x, Face Restore, Denoise Clean, Background Remove, Style Transfer, HDR Enhance) seeded on first load

- [ ] **Step 3: Write failing tests**

Create `src/store/slices/pipelineSlice.test.ts`:

```ts
describe('PipelineStore', () => {
  it('seeds 6 built-in presets on init', () => { ... });
  it('createPipeline adds a user pipeline', () => { ... });
  it('duplicatePipeline copies a built-in as user pipeline', () => { ... });
  it('deletePipeline removes a user pipeline', () => { ... });
  it('runPipeline creates an execution', () => { ... });
});
```

- [ ] **Step 4: Wire into store**

Add pipeline state/actions to `appStore.types.ts` and `appStore.ts`.

- [ ] **Step 5: Run tests and typecheck**

```bash
cd /c/vision-studio && npx vitest run src/store/slices/pipelineSlice.test.ts --project unit && npm run typecheck
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/types/pipeline.ts src/store/slices/pipelineSlice.ts src/store/slices/pipelineSlice.test.ts src/store/appStore.types.ts src/store/appStore.ts
git commit -m "feat(pipeline): add pipeline types, store slice, and 6 built-in presets"
```

---

### Task 15: Create Pipeline Builder UI

**Files:**
- Create: `src/components/pipeline/PipelineBuilder.tsx`
- Create: `src/components/pipeline/PipelineNode.tsx`
- Create: `src/components/pipeline/PipelineNodePalette.tsx`
- Create: `src/components/pipeline/PipelineNodeConfig.tsx`
- Create: `src/components/pipeline/PipelinePreview.tsx`

- [ ] **Step 1: Create PipelineNodePalette**

Sidebar listing all step types (Upscale, Denoise, Sharpen, etc.). Draggable items. Click to add to active pipeline.

- [ ] **Step 2: Create PipelineNode**

Node component: icon, label, input port, output port, enable/disable toggle, config collapse. Renders in the pipeline canvas.

- [ ] **Step 3: Create PipelineBuilder**

Canvas area with linear chain of nodes connected by lines. Add/remove/reorder nodes. Click node to select and show config.

- [ ] **Step 4: Create PipelineNodeConfig**

Right panel config for selected node. Type-specific sliders, dropdowns, toggles.

- [ ] **Step 5: Create PipelinePreview**

Shows preview of image at selected pipeline step. Placeholder until backend integration.

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/
git commit -m "feat(pipeline): create visual pipeline builder with node palette, config, and preview"
```

---

### Task 16: Create Refinement Context Menu + Pipeline Tab

**Files:**
- Modify: `src/components/canvas/CanvasContextMenu.tsx` (add "Refine" submenu)
- Modify: `src/components/layout/DockviewSettingsPanel.tsx` (add Pipelines sub-mode to Workflows)
- Modify: `src/types/navigation.ts` (extend WorkflowsSubMode)

- [ ] **Step 1: Add "Refine" to CanvasContextMenu**

In the context menu, add a "Refine" submenu item that lists all pipeline presets. Clicking a preset calls `runPipeline()`.

- [ ] **Step 2: Add Pipelines sub-mode to Workflows tab**

Extend `ActiveSubMode` to include Workflows sub-modes:

```ts
export type WorkflowsSubMode = 'workflows' | 'pipelines';
```

Update `setActiveTab` defaults so Workflows defaults to `'workflows'`.

In `DockviewSettingsPanel.tsx`, add segmented control for Workflows: `[Workflows | Pipelines]`.

When `Pipelines` is active, render `PipelineBuilder` in the center area.

- [ ] **Step 3: Replace DockviewSettingsPanel placeholder**

In `DockviewSettingsPanel.tsx:121`, replace:

```ts
// Placeholder - will become a workflow inspector panel later
return <StoryboardPanel />;
```

with proper Workflows sub-mode rendering:

```tsx
case 'workflows':
  if (activeSubMode === 'pipelines') return <PipelineNodePalette />;
  return <WorkflowWorkbench />;
```

- [ ] **Step 4: Wire EditPropertiesPanel TODO**

In `src/components/edit/EditPropertiesPanel.tsx:486`, replace:

```ts
// TODO: Wire to generation pipeline
```

with a button that calls `runPipeline()` with a selected preset on the active image.

- [ ] **Step 5: Run full test suite**

```bash
cd /c/vision-studio && npm run test && npm run typecheck
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/CanvasContextMenu.tsx src/components/layout/DockviewSettingsPanel.tsx src/types/navigation.ts src/store/slices/uiSlice.ts src/components/edit/EditPropertiesPanel.tsx
git commit -m "feat(pipeline): add Refine context menu, Pipelines sub-mode, wire EditPropertiesPanel TODO"
```

---

## Task 17: Final Validation & Cleanup

- [ ] **Step 1: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

- [ ] **Step 2: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

- [ ] **Step 3: Run production build**

```bash
cd /c/vision-studio && npm run build
```

- [ ] **Step 4: Verify no remaining TODOs in source**

```bash
grep -rn 'TODO\|FIXME\|placeholder\|Phase 2 placeholder' --include='*.ts' --include='*.tsx' src/ | grep -v '.test.' | grep -v 'placeholder:'
```

Expected: Clean (no actionable TODOs). Only HTML `placeholder=` attributes remain.

- [ ] **Step 5: Update MEMORY.md**

Update the project memory with: Phase 4-5 complete, timeline modes, pipeline builder, video inputs, resolution picker.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final validation and cleanup for Phase 4-5"
```

---

## Self-Review Checklist

| Design Spec Requirement | Task |
|------------------------|------|
| Aspect ratio visual grid | Task 2 |
| Resolution tier selector (Standard/High/Ultra) | Task 2 |
| Custom override inputs | Task 2 |
| Computed dimensions in GenerationConfig | Task 3 |
| Image/Video toggle | Task 7 |
| Start Frame image input | Tasks 5, 7 |
| End Frame image input | Tasks 5, 7 |
| Video controls (duration, fps, motion, loop) | Tasks 6, 7 |
| TimelineEngine (play/pause/stop/seek) | Task 8 |
| KeyframeStore (CRUD, interpolation) | Task 8 |
| Three timeline modes (user-selectable) | Task 10 |
| Storyboard mode playback | Task 11 |
| Animation mode (filmstrip, keyframe diamonds) | Task 12 |
| Canvas mode enhanced | Task 13 |
| Onion-skinning | Task 10 |
| CameraKeyframe wiring | Task 9 |
| 6 built-in pipeline presets | Task 14 |
| Visual pipeline builder | Task 15 |
| Refine context menu | Task 16 |
| Pipeline tab in Workflows | Task 16 |
| EditPropertiesPanel TODO wired | Task 16 |
| DockviewSettingsPanel placeholder replaced | Task 16 |
| CameraKeyframe placeholder removed | Task 9 |
