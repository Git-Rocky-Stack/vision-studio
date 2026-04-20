# Prompt Studio + Live Preview — Design Spec

**Date:** 2026-04-18
**Phase:** 2 of 5 (Prompt Studio + Live Preview)
**Status:** Approved
**Approach:** Sub-mode Extension (Approach A)

## Overview

Add a Prompt Studio sub-mode to the Generate tab with token-weighted prompt editing, a template library, and prompt enhancement tools. Replace the center workspace with a composition preview canvas showing aspect ratio framing, reference overlays, ControlNet visualizations, and region masks — all user-toggleable. During generation (all sub-modes), show progressive step-by-step preview images streamed from the backend.

**Goal:** Transform the prompt editing experience from a basic textarea into a visual, token-aware workspace, and give users real-time composition and generation preview.

## Scope

- Prompt Studio as a 4th Generate sub-mode (Generate/Quick/Batch/Studio)
- Token-weighted prompt editor with A1111 syntax parsing and visual editing
- Built-in + user-created prompt template library
- Prompt enhancement toolkit (AI enhance, style transfer, semantic expansion, negative suggest)
- Composition preview with toggleable layers (aspect ratio, reference, ControlNet, region masks)
- Progressive generation preview with step-by-step image streaming
- Electron IPC layer for intermediate step previews

**Out of scope (future phases):**
- Community template sharing (architecture supports it, not implemented)
- Prompt Studio for non-Generate tabs
- Region mask creation (viewing only; creation stays in existing tools)
- Iteration History (Phase 3)
- Smart Collections (Phase 3)
- Enhanced Timeline (Phase 4)
- Refinement Pipeline (Phase 5)

---

## 1. Navigation & Layout Model

### Sub-mode extension

```ts
// Existing
type GenerateSubMode = 'generate' | 'quick' | 'batch';
// New
type GenerateSubMode = 'generate' | 'quick' | 'batch' | 'studio';
```

### Layout behavior per sub-mode

| Sub-mode | Left Dock | Center Workspace | Right Dock |
|----------|-----------|------------------|------------|
| Generate | PromptArea + controls | Canvas/Viewer/Workflow/Launchpad tabs | Gallery + Boards |
| Quick | Quick Generate form | Canvas/Viewer tabs | Gallery + Boards |
| Batch | Batch queue + results | Canvas/Viewer tabs | Gallery + Boards |
| **Studio** | Prompt Studio workspace | **Composition Preview** | Gallery + Boards |

When `activeSubMode === 'studio'`, the center workspace is entirely replaced by the composition preview canvas. No Canvas/Viewer/Workflow/Launchpad tabs. Switching away from Studio restores the normal workspace tabs.

NavBar: No visual change. Generate tab still shows the single Generate icon. The segmented control in the left dock adds the "Studio" option.

---

## 2. Prompt Studio Workspace (Left Dock)

Three collapsible sections stacked vertically:

### 2a. Token-Weighted Prompt Editor

- Rich textarea parsing A1111 syntax: `(word:1.5)`, `(word)`, `[word]`
- **Visual highlighting:** weighted tokens get colored intensity (higher weight = warmer color, lower = cooler). `(word:2.0)` glows red-orange, `[word]` tints blue
- **Inline weight controls:** click a highlighted token to reveal a slider (0.5–2.0 range). Adjusting the slider rewrites the syntax in-place
- **Token count tracker:** live count of tokens (approximate, CLIP tokenization rules) with soft warning at 75+ tokens
- **Negative prompt** with same token-weighted editing

### 2b. Prompt Template Library

- **Built-in templates:** curated set (cinematic portrait, product shot, landscape, abstract art, etc.) with prompt text + suggested settings
- **User-created templates:** "Save as Template" button saves current prompt + settings as a reusable template
- **Template cards:** show name, preview (generated from first use or reference image), category tag
- **Apply template:** replaces prompt text and optionally sets model/aspect ratio/settings. "Merge" option appends template modifiers to existing prompt
- **Search + filter** by category, keyword, favorites

### 2c. Prompt Enhancement Toolkit

- **AI Enhance** (existing, elevated): calls `window.electron.generation.enhancePrompt`
- **Style Transfer:** applies a style preset's modifier syntax directly into the prompt with proper weight syntax
- **Semantic Expansion:** AI call that expands a short prompt into a detailed one (separate from Enhance — this is "make it longer/richer")
- **Negative Prompt Suggest:** AI-generated negative prompt suggestions based on the positive prompt

All three sections are independently collapsible. Template library and enhancement toolkit feed output into the token-weighted editor.

---

## 3. Composition Preview (Center Workspace)

When in Studio sub-mode, the center workspace becomes a composition preview canvas with selectable layers:

### 3a. Aspect Ratio Frame
- Renders the selected aspect ratio as a bordered crop frame centered in the workspace
- If a reference image is loaded, the frame overlays on it showing exactly what's included
- Resize handles on frame corners for manual adjustment (syncs back to aspect ratio selector)

### 3b. Reference Image Overlay
- Shows the uploaded reference/control image as the base layer
- Opacity slider (0–100%) in a floating toolbar
- Blend mode selector (normal, overlay, multiply) for previewing how reference influences generation

### 3c. ControlNet Visualization
- When ControlNet is enabled, renders the preprocessed edge/depth/pose map as a colored overlay
- Toggle visibility per ControlNet layer
- Opacity control per layer
- Color-coded: canny = green edges, depth = blue gradient, openpose = red keypoints, etc.

### 3d. Region Mask Preview
- Shows any region masks as semi-transparent colored overlays
- Toggle visibility per mask region
- Opacity control per region

### 3e. Floating Toolbar
A sticky toolbar at the top of the composition canvas with:
- **Layer toggles:** eye icons for each layer (aspect frame, reference, ControlNet, region masks)
- **Opacity slider** for the active layer
- **Zoom controls:** fit / 100% / zoom in / zoom out
- **Reset view** button
- **"Generate from here"** button — triggers generation with current composition settings

All layers are independently toggleable and adjustable. The composition preview is purely visual — it does not modify generation parameters directly (those stay in the left dock). The "Generate from here" button reads all current settings and triggers generation, switching the center to progressive preview.

---

## 4. Progressive Generation Preview

When generation starts (from any sub-mode, not just Studio), the center workspace transitions to show progressive rendering:

### 4a. Streaming Architecture
- **Electron IPC addition:** New `onStepPreview` event on `window.electron.generation` that fires after each sampling step
- **Payload per step:** `{ jobId, step, totalSteps, imageData (base64), timestamp }`
- **Fallback:** If backend doesn't stream intermediates, show animated progress bar with step counter (current behavior, no broken UX)

### 4b. Progressive Preview UI
- **Step-by-step image updates:** Each intermediate image replaces the previous one with a crossfade (150ms)
- **Step counter overlay:** "Step 12 / 30" in the bottom-right corner
- **Quality ramp indicator:** subtle progress ring around the step counter showing completion percentage
- **Cancel button:** floating "Cancel Generation" button in the top-right, always accessible during generation

### 4c. Preview Controls
- **Zoom/pan:** pinch-to-zoom and drag-to-pan on the preview image (constrained within workspace bounds)
- **Compare slider:** after generation completes, a before/after compare slider appears — drag to see first step vs. final result
- **Save intermediate:** right-click or button to save any intermediate step as an image
- **Auto-dismiss:** after generation completes, preview holds for 3 seconds showing the final result, then transitions to normal workspace view (or stays if user interacts)

### 4d. State Management
- New Zustand slice: `generationPreview` with `stepImages: Map<stepNumber, base64>`, `currentStep`, `totalSteps`, `isPreviewActive`
- Cleared when new generation starts, persisted until user navigates away or starts a new generation
- Progressive preview works in **all sub-modes**, not just Studio — it replaces the center workspace during generation regardless of which sub-mode initiated it

---

## 5. Data Flow & Store Changes

### 5a. Navigation Model Extension

```ts
// Existing
type GenerateSubMode = 'generate' | 'quick' | 'batch';
// New
type GenerateSubMode = 'generate' | 'quick' | 'batch' | 'studio';
```

No other navigation type changes. `activeTab` and `activeSubMode` work as-is.

### 5b. New Zustand Slice: `promptStudioSlice`

| Key | Type | Description |
|-----|------|-------------|
| `promptTemplates` | `PromptTemplate[]` | Built-in + user-created templates |
| `favoriteTemplateIds` | `Set<string>` | Favorited template IDs |
| `promptTokens` | `{ positive: number; negative: number }` | Live token counts |
| `compositionLayers` | `CompositionLayerState` | Visibility + opacity per layer |

**Actions:**
- `addUserTemplate(template)` / `deleteUserTemplate(id)` / `toggleFavoriteTemplate(id)`
- `setCompositionLayerVisibility(layer, visible)` / `setCompositionLayerOpacity(layer, opacity)`
- `applyTemplate(id, mode: 'replace' | 'merge')` — applies template to prompt, optionally merging

### 5c. New Zustand Slice: `generationPreviewSlice`

| Key | Type | Description |
|-----|------|-------------|
| `stepImages` | `Map<number, string>` | Step number → base64 image data |
| `currentStep` | `number` | Current sampling step |
| `totalSteps` | `number` | Total steps for current job |
| `isPreviewActive` | `boolean` | Whether progressive preview is showing |

**Actions:**
- `addStepImage(step, imageData)` — called by IPC listener
- `clearPreview()` — reset on new generation or navigation
- `setPreviewActive(active)` — show/hide preview overlay

### 5d. Electron IPC Additions

| Channel | Direction | Payload |
|---------|-----------|---------|
| `generation.onStepPreview` | Electron → Renderer | `{ jobId, step, totalSteps, imageData }` |
| `generation.getControlNetPreview` | Renderer → Electron | `{ imageId, preprocessor }` → returns processed image |
| `generation.getRegionMaskPreview` | Renderer → Electron | `{ maskId }` → returns mask overlay image |

### 5e. Template Data Model

```ts
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'portrait' | 'landscape' | 'product' | 'abstract' | 'cinematic' | 'artistic' | 'custom';
  promptText: string;
  negativePrompt?: string;
  suggestedSettings?: {
    model?: string;
    aspectRatio?: string;
    steps?: number;
    cfgScale?: number;
    scheduler?: string;
  };
  referenceImage?: string; // base64 or URL
  isBuiltIn: boolean;
  isFavorite: boolean;
  createdAt: number;
  lastUsedAt?: number;
}
```

### 5f. Token Parser Output Model

```ts
interface PromptToken {
  text: string;
  weight: number;       // 1.0 = default, 0.5–2.0 range
  syntaxType: 'normal' | 'weighted' | 'emphasis' | 'deemphasis';
  startIndex: number;
  endIndex: number;
}

interface ParsedPrompt {
  rawText: string;
  tokens: PromptToken[];
  tokenCount: number;   // approximate CLIP token count
  exceedsLimit: boolean; // true if >75 tokens
}
```

---

## 6. Component Architecture & File Structure

### 6a. New Files

| File | Responsibility |
|------|---------------|
| `src/components/studio/PromptStudioPanel.tsx` | Left dock workspace — token editor + template library + enhancement toolkit |
| `src/components/studio/TokenWeightedEditor.tsx` | Rich prompt textarea with syntax highlighting, weight sliders, token count |
| `src/components/studio/TokenHighlighter.tsx` | Overlay rendering of colored highlights on weighted tokens |
| `src/components/studio/PromptTemplateLibrary.tsx` | Template grid with search/filter/apply/save |
| `src/components/studio/PromptTemplateCard.tsx` | Single template card with preview, apply, favorite |
| `src/components/studio/PromptEnhancementToolkit.tsx` | AI enhance, style transfer, semantic expansion, negative suggest |
| `src/components/studio/CompositionPreview.tsx` | Center workspace — layered composition canvas |
| `src/components/studio/CompositionLayerBar.tsx` | Floating toolbar with layer toggles, opacity, zoom |
| `src/components/studio/AspectRatioFrame.tsx` | Crop frame overlay matching selected aspect ratio |
| `src/components/studio/ReferenceOverlay.tsx` | Reference image layer with opacity/blend controls |
| `src/components/studio/ControlNetVisualization.tsx` | Color-coded ControlNet preprocessing overlays |
| `src/components/studio/RegionMaskPreview.tsx` | Semi-transparent region mask overlays |
| `src/components/studio/ProgressivePreview.tsx` | Step-by-step generation preview with controls |
| `src/components/studio/ProgressiveStepOverlay.tsx` | Step counter, progress ring, cancel button |
| `src/utils/promptTokenizer.ts` | A1111 syntax parser — `(word:1.5)`, `(word)`, `[word]` → PromptToken[] |
| `src/utils/promptTokenizer.test.ts` | Token parser unit tests |
| `src/store/slices/promptStudioSlice.ts` | Template library, composition layers, prompt token state |
| `src/store/slices/generationPreviewSlice.ts` | Progressive preview state, step images |
| `src/types/promptStudio.ts` | PromptTemplate, PromptToken, ParsedPrompt, CompositionLayerState types |
| `src/data/builtInTemplates.ts` | Curated built-in prompt templates |

### 6b. Modified Files

| File | Change |
|------|--------|
| `src/types/navigation.ts` | Extend `GenerateSubMode` to include `'studio'` |
| `src/store/slices/uiSlice.ts` | Add `'studio'` to sub-mode defaults |
| `src/components/layout/layoutPresets.ts` | Add `studio` sub-mode to generate preset |
| `src/components/layout/DockviewSettingsPanel.tsx` | Add Studio to segmented control, render `PromptStudioPanel` |
| `src/components/layout/DockviewLayout.tsx` | Render `CompositionPreview` in center when sub-mode is `studio` |
| `src/pages/GeneratePanel.tsx` | Integrate progressive preview into Generate sub-mode center view |
| `src/components/generate/PromptArea.tsx` | Optional: wire token count display |
| `src/store/appStore.ts` | Register new slices, update partialize |
| `src/store/appStore.types.ts` | Add new slice types |

### 6c. Removed Files

None — purely additive. All existing components preserved.

### 6d. Component Hierarchy

```
DockviewSettingsPanel
  └─ PromptStudioPanel (when activeSubMode === 'studio')
       ├─ TokenWeightedEditor
       │    ├─ TokenHighlighter (overlay)
       │    └─ Weight slider popover (per token)
       ├─ PromptTemplateLibrary
       │    └─ PromptTemplateCard[]
       └─ PromptEnhancementToolkit

DockviewLayout (center workspace, when activeSubMode === 'studio')
  └─ CompositionPreview
       ├─ CompositionLayerBar (floating toolbar)
       ├─ AspectRatioFrame
       ├─ ReferenceOverlay
       ├─ ControlNetVisualization
       ├─ RegionMaskPreview
       └─ ProgressivePreview (during generation)
            └─ ProgressiveStepOverlay
```

---

## 7. Error Handling & Testing

### 7a. Error Handling

| Scenario | Handling |
|----------|----------|
| Token parser encounters malformed syntax | Highlight malformed tokens in red, show tooltip with syntax hint. Never crash — parser is forgiving, treats unrecognized syntax as plain text |
| AI Enhance / Semantic Expansion call fails | Show error toast with retry button. Prompt text reverts to pre-enhancement state |
| Template library fails to load from persistence | Fall back to built-in templates only. Show subtle "Local templates unavailable" notice |
| ControlNet preview image unavailable | Show placeholder with "Preprocessor not available" label. Layer toggle still works but preview is blank |
| Progressive preview IPC not supported (older backend) | Graceful fallback to current progress bar behavior. No broken UI — just no step images |
| Intermediate step image decode failure | Skip the failed step, continue showing last successful step image. Log error silently |
| Composition preview zoom/pan bounds exceeded | Constrain pan within image bounds with rubber-band snap-back. Zoom capped at 0.25x–8x |

### 7b. Testing Strategy

| Layer | Tests | Count Target |
|-------|-------|-------------|
| `promptTokenizer` | A1111 syntax parsing: `(word:1.5)`, `(word)`, `[word]`, nested weights, malformed input, token counting | ~25 tests |
| `PromptTemplateLibrary` | Render templates, search/filter, apply replace/merge, save/delete, favorite toggle | ~12 tests |
| `TokenWeightedEditor` | Highlight rendering, weight slider interaction, token count updates, negative prompt | ~10 tests |
| `PromptEnhancementToolkit` | AI enhance call, style transfer, semantic expansion, negative suggest | ~8 tests |
| `CompositionPreview` | Layer rendering, toggle visibility, opacity controls, aspect ratio frame | ~10 tests |
| `ProgressivePreview` | Step image display, cancel, compare slider, auto-dismiss | ~10 tests |
| `promptStudioSlice` | Template CRUD, composition layer state, apply/merge | ~12 tests |
| `generationPreviewSlice` | Step images, clear, active state | ~8 tests |
| Store integration | Studio sub-mode switching, template application flows, preview state lifecycle | ~10 tests |
| **Total new tests** | | **~105** |

### 7c. Performance Considerations

- **Token parsing:** Debounced at 150ms — don't re-parse on every keystroke
- **Progressive preview images:** Store as base64 in memory, cap at last 10 steps to avoid memory pressure on long generations
- **Composition layer rendering:** Use CSS transforms for zoom/pan (GPU-accelerated), not canvas re-renders
- **Template library:** Virtualized grid for 100+ templates using `@tanstack/react-virtual` (already in the project)

---

## Future Phases (out of scope)

| Phase | Scope |
|-------|-------|
| **3** | Iteration History + Smart Collections |
| **4** | Enhanced Timeline (keyframes, scrubbing, playback, onion-skinning) |
| **5** | Refinement Pipeline (one-click image enhancement chains) |