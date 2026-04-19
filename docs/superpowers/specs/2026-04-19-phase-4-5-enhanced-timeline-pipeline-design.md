# Enhanced Timeline, Video Inputs, Resolution Picker & Refinement Pipeline — Design Spec

**Date:** 2026-04-19
**Phases:** 4 (Enhanced Timeline) + 5 (Refinement Pipeline) + Deferred Features (Video, Aspect Ratio, Resolution)
**Status:** Approved
**Build Order:** Approach A — feature-by-feature, each shipped independently

## Overview

Four features built sequentially, each testable and committable before the next begins:

1. **Aspect Ratio + Resolution Picker** — Visual ratio grid and resolution tiers in the Generate tab
2. **Video Generation Inputs** — Image/Video toggle, start/end frame inputs, video-specific controls
3. **Enhanced Timeline** — Three user-selectable modes (Storyboard, Animation, Canvas) with keyframes, playback, scrubbing, onion-skinning, and CameraKeyframe wiring
4. **Refinement Pipeline** — Preset one-click enhancement chains + visual node-based pipeline builder

**Post-design audit:** Scan entire codebase for placeholders, TODOs, unwired stubs (including CameraKeyframe) and fold into the implementation plan.

---

## 1. Aspect Ratio + Resolution Picker

### Placement

Generate tab left dock, between Model Selector and Style Presets. Collapsible section.

### Aspect Ratio Picker

Visual grid of ratio buttons with highlighted preview shape:

| Ratio | Label | Ultra (1024) | High (768) | Standard (512) |
|-------|-------|-------------|-----------|----------------|
| 1:1 | Square | 1024x1024 | 768x768 | 512x512 |
| 16:9 | Landscape | 1024x576 | 768x432 | 512x288 |
| 9:16 | Portrait | 576x1024 | 432x768 | 288x512 |
| 4:3 | Classic | 1024x768 | 768x576 | 512x384 |
| 3:4 | Tall | 768x1024 | 576x768 | 384x512 |
| 21:9 | Ultrawide | 1024x439 | 768x330 | 512x219 |
| 3:2 | Photo | 1024x683 | 768x512 | 512x341 |
| 2:3 | Tall Photo | 683x1024 | 512x768 | 341x512 |

Each ratio button shows a small proportional rectangle. Active button highlighted with accent color.

### Resolution Tier Selector

Three-tier segmented control: **Standard** (512px) | **High** (768px) | **Ultra** (1024px+). The tier sets the longer edge; aspect ratio determines the other dimension.

### Custom Override

Small "Custom" toggle reveals explicit width/height number inputs (min 256, max 2048, step 64). Custom mode bypasses ratio/tier computation.

### Store Changes

Extend generation draft/config:

```ts
// New fields on GenerationDraft / GenerationConfig
aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3' | 'custom';
resolutionTier: 'standard' | 'high' | 'ultra';
```

`GenerationConfig.width`/`height` become computed values derived from ratio + tier. Custom mode sets them directly.

### Data Flow

```
User picks 16:9 + Ultra
  → aspectRatio: '16:9', resolutionTier: 'ultra'
  → computed: width=1024, height=576
  → passed to GenerationConfig for API call
```

---

## 2. Video Generation Inputs

### Placement

Generate tab left dock. Image/Video toggle at the top of the panel, above the prompt area.

### Image/Video Toggle

Switch at top of generate panel: "Image" / "Video". When Video is active:
- Video-specific parameters appear (duration, fps, motion, loop)
- Start Frame and End Frame inputs appear
- Generation queue creates video-type items instead of image-type

### Reference Image

Reuses existing `ImageDropZone` component. Same behavior for video — provides a reference for the generation model.

### Start Frame Image

New compact drop zone labeled "First Frame". Optional. When provided, video generation begins from this image.

**Compact drop zone** — simplified version of ImageDropZone:
- No mode selector (img2img/inpaint/controlnet tabs)
- No denoising strength slider
- Just: drag/drop area, file picker, preview thumbnail, remove button

### End Frame Image

New compact drop zone labeled "Last Frame". Optional. When provided, video generation interpolates toward this image. Same compact pattern as Start Frame.

### Video-Specific Controls

Collapsible section "Video Settings" visible only when Video mode is active:

| Control | Type | Range | Default |
|---------|------|-------|---------|
| Duration | Slider | 1–10 seconds | 3 |
| FPS | Dropdown | 8, 12, 16, 24 | 24 |
| Motion Strength | Slider | 0.1–1.0 | 0.5 |
| Loop | Toggle | on/off | off |

### Store Changes

```ts
// Extend GenerationConfig
videoDuration: number;       // seconds, default 3
videoFps: number;            // 8|12|16|24, default 24
motionStrength: number;      // 0.1-1.0, default 0.5
loopVideo: boolean;          // default false

// Extend GenerationDraft
startFrameImage: string | null;   // data URL or file path
endFrameImage: string | null;     // data URL or file path
generationMode: 'image' | 'video'; // default 'image'
```

Generation queue item type already supports video tracks (Timeline renders them). Video generation calls the same backend API with video-specific parameters.

### Left Dock Layout (Video Mode Active)

```
[Image ○ / Video ●]            ← toggle switch

Prompt Area
Model Selector
Aspect Ratio + Resolution      ← from Section 1

▼ Reference Image              ← existing ImageDropZone
▼ Start Frame (optional)       ← compact drop zone
▼ End Frame (optional)         ← compact drop zone
▼ Video Settings               ← duration, fps, motion, loop

ControlNet / LoRA / Style Presets — same as current
```

---

## 3. Enhanced Timeline — Three Selectable Modes

### Placement

Bottom panel below Canvas. Same position as current Timeline. Mode switcher in the timeline toolbar.

### Mode Switcher

Segmented control in the timeline toolbar: **Storyboard** | **Animation** | **Canvas**

Default mode auto-selects based on active tab (Canvas → Canvas mode, Story → Storyboard mode) but user can override. Selection persists in store.

### Mode 1: Storyboard Mode

Augments the existing Story tab scene flow with playback capabilities.

**Scene strip** (already exists) — horizontal thumbnails of all scenes in order.

**Playback controls:**
- Play/Pause — plays through scenes in sequence with transitions
- Step forward/back — jump to next/previous scene
- Loop toggle — repeat playback from beginning after last scene
- Speed control — 0.25x, 0.5x, 1x, 2x playback speed

**Scrubbing:**
- Drag playhead across the scene strip to jump to any scene
- Playhead snaps to scene boundaries

**Onion-skinning:**
- Overlay previous/next scene thumbnails at configurable opacity (10–50%)
- Toggle on/off via toolbar button
- Opacity slider in timeline settings
- Configurable: show previous only, next only, or both

**Transition preview:**
- Scene transitions (fade, dissolve, wipe, cut) play back in real-time between scenes
- Transition duration respected from `SceneTransition.duration`

**Camera keyframes:**
- The existing `CameraKeyframe` type gets full wiring
- Per-scene camera moves: pan (x/y), zoom, rotation
- Camera keyframe editor in the left dock when a scene is selected in Storyboard mode
- During playback, camera interpolates between keyframes using the selected interpolation type (linear, ease-in, ease-out)

### Mode 2: Animation Mode

Standalone frame-by-frame animation editor.

**Frame track:**
- Horizontal filmstrip of individual frames, each showing a thumbnail
- Add frame button at the end
- Drag to reorder frames
- Click to select active frame (renders on canvas)

**Keyframe editing:**
- Keyframes on properties per layer: position (x/y), opacity, transform (scale, rotation), blend mode
- Diamond markers appear on the timeline at the keyframe's time position
- Drag diamonds to reposition in time
- Click diamond to select and edit values in the left dock property panel
- Right-click diamond to delete or change interpolation type

**Layer tracks:**
- Each layer gets its own horizontal track in the timeline
- Track header shows layer name and visibility toggle
- Keyframes appear as diamonds on each layer track
- Collapsible tracks (collapse to just header row)

**Playback:**
- Play/Pause/Stop with configurable FPS (8–60)
- Scrub playhead across all frames
- Frame counter display: "Frame 12 / 48" and timecode

**Onion-skinning:**
- Previous N frames rendered at reducing opacity behind the current frame on the canvas
- Configurable N (1–5 frames)
- Configurable base opacity (10–50%), subsequent frames at decreasing opacity
- Toggle on/off via toolbar button

**Interpolation:**
- Linear and ease-in/ease-out between keyframes
- Dropdown on each keyframe diamond to set interpolation type
- Easing curves visualized as small graphs on the timeline between diamonds

### Mode 3: Canvas Mode (Current Behavior, Enhanced)

The current timeline tracks (generation jobs) remain, augmented with keyframe support.

**Existing features retained:**
- Generation job tracks (image + video)
- Time ruler with zoom
- Track headers with delete
- Scene playback strip

**New keyframe support:**
- Add keyframes to any property on the active layer (position, opacity, transform)
- Keyframes render as diamond markers on the track
- Click to edit values, drag to reposition
- Interpolation between keyframes during playback

**Enhanced playback:**
- Play through generation results as a slideshow with configurable duration per image
- Scrubbing enhanced to support keyframe interpolation

### Shared Infrastructure

**`TimelineEngine`** (new store slice):
- Manages play state: `playing | paused | stopped`
- Current time (ms), playhead position (%)
- FPS, total duration, loop mode, playback speed
- Play/pause/stop/seek/step actions
- Tick loop using `requestAnimationFrame` for smooth playback

**`KeyframeStore`** (new store slice):
- Stores keyframes per entity: `{ entityId, property, time, value, interpolation }`
- Entity can be a scene, frame, or layer
- CRUD operations: addKeyframe, updateKeyframe, deleteKeyframe
- Query: getKeyframesForEntity(entityId), getKeyframesInRange(start, end)
- Interpolation engine: compute interpolated value at any given time

**`OnionSkinCompositor`** (new utility/component):
- Renders previous/next frames at reduced opacity on the canvas
- Configurable: frame count (1–5), base opacity (10–50%), direction (prev/next/both)
- Uses Framer Motion for smooth opacity transitions
- Composits via react-konva layers

**CameraKeyframe wiring:**
- Existing `CameraKeyframe` type: `{ id, time, pan: {x,y}, zoom, rotation }`
- Add `interpolation` field: `'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'`
- Add `easingStrength` field: number 0.1–1.0
- UI: keyframe diamond on timeline, value editor in left dock for pan/zoom/rotation
- During playback: `KeyframeStore` interpolates camera values between keyframes
- Canvas viewport transforms accordingly (pan/zoom/rotate the view)

### Store Changes

```ts
// New types
type TimelineMode = 'storyboard' | 'animation' | 'canvas';

type KeyframeInterpolation = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

interface Keyframe {
  id: string;
  entityId: string;        // scene, frame, or layer ID
  entityType: 'scene' | 'frame' | 'layer';
  property: string;        // 'position.x', 'opacity', 'zoom', etc.
  time: number;            // ms
  value: number | { x: number; y: number };
  interpolation: KeyframeInterpolation;
  easingStrength: number;  // 0.1-1.0
}

// CameraKeyframe extension
interface CameraKeyframe {
  id: string;
  time: number;
  pan: { x: number; y: number };
  zoom: number;
  rotation: number;
  interpolation: KeyframeInterpolation;  // NEW
  easingStrength: number;                 // NEW
}

// TimelineEngine state
interface TimelineEngineState {
  mode: TimelineMode;
  playState: 'playing' | 'paused' | 'stopped';
  currentTime: number;        // ms
  fps: number;
  loop: boolean;
  speed: number;              // 0.25, 0.5, 1, 2
  onionSkinEnabled: boolean;
  onionSkinFrameCount: number; // 1-5
  onionSkinOpacity: number;    // 0.1-0.5
  onionSkinDirection: 'prev' | 'next' | 'both';
}

// KeyframeStore state
interface KeyframeStoreState {
  keyframes: Keyframe[];
  activeKeyframeId: string | null;
}
```

---

## 4. Refinement Pipeline

### Entry Points

1. **Quick actions** — Right-click context menu on any image (Gallery, Canvas, Assets) → "Refine" submenu with preset pipelines
2. **Pipeline tab** — Workflows tab, new sub-mode: `Workflows | Pipelines`. Segmented control in left dock switches between existing graph editor and new pipeline builder.

### Preset Pipelines

**Built-in presets (one-click run on any image):**

| Preset | Steps | Description |
|--------|-------|-------------|
| Upscale 4x | Real-ESRGAN upscale → sharpen | 4x resolution upscale with detail recovery |
| Face Restore | GFPGAN face restore → detail enhance | Fix degraded faces in AI-generated images |
| Denoise Clean | Noise reduction → color correction → sharpen | Clean up noisy or compressed images |
| Background Remove | RMBG segmentation → alpha matting | Remove background with clean edges |
| Style Transfer | Style extract → apply to target | Transfer artistic style from a reference image |
| HDR Enhance | Tone mapping → contrast boost → color vibrancy | Simulate HDR look on any image |

Each preset is a serialized `PipelineDefinition` (array of steps). Users can duplicate built-in presets and customize parameters.

**Running a preset:**
- Right-click image → "Refine" → preset list with descriptions
- Or select image → click "Refine" in toolbar → pick preset
- Progress bar shows each step completing in sequence
- Result replaces or creates a new version (user choice) in the iteration tree

### Visual Pipeline Builder

Node-based editor for constructing custom refinement chains.

**Pipeline canvas:**
- **Source node** (auto-created, locked) — The input image, auto-connected when launched from context
- **Step nodes** — Drag from a node palette sidebar:
  - Upscale (Real-ESRGAN, SwinIR, Lanczos)
  - Denoise (strength slider)
  - Sharpen (amount slider, radius)
  - Face Restore (GFPGAN, CodeFormer)
  - Color Correct (brightness, contrast, saturation, temperature sliders)
  - Background Remove (RMBG, SAM)
  - Style Transfer (requires reference image input)
  - Blur (gaussian, box, motion — radius slider)
  - Crop/Resize (dimensions, anchor point)
  - Custom (user-defined API endpoint, params as key/value)
- **Connections** — Drag from output port to input port. Linear chains only for v1 (no branching, no parallel paths).
- **Preview panel** — Click any node to see a live preview of the image at that pipeline stage. Preview renders in the right dock or a floating panel.

**Node configuration:**
- Each node has a collapsible config panel
- Parameters are type-specific: sliders (strength, scale, radius), dropdowns (model variant), toggles, file inputs (for style transfer reference)
- Config persists with the pipeline definition

**Pipeline management:**
- Save/load pipeline definitions to store with name and description
- Pipelines are versioned in the iteration tree alongside their results
- Export pipeline as JSON, import from JSON
- Duplicate built-in presets to create customizable copies

### Store Changes

```ts
// Pipeline types
interface PipelineStep {
  id: string;
  type: 'upscale' | 'denoise' | 'sharpen' | 'face-restore' | 'color-correct' |
        'background-remove' | 'style-transfer' | 'blur' | 'crop-resize' | 'custom';
  label: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];       // ordered, linear chain
  isBuiltIn: boolean;          // true for presets, false for user-created
  created: string;
  modified: string;
}

interface PipelineExecution {
  id: string;
  pipelineId: string;
  sourceImageId: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  currentStepIndex: number;
  stepResults: Array<{
    stepId: string;
    status: 'pending' | 'running' | 'complete' | 'error';
    output?: string;           // data URL or file path
    error?: string;
  }>;
  finalOutput?: string;
  created: string;
}

// Pipeline store slice
interface PipelineSlice {
  pipelines: PipelineDefinition[];
  activePipelineId: string | null;
  executions: PipelineExecution[];
  isBuilderOpen: boolean;

  // Actions
  createPipeline: (def: Omit<PipelineDefinition, 'id' | 'created' | 'modified'>) => string;
  updatePipeline: (id: string, updates: Partial<PipelineDefinition>) => void;
  deletePipeline: (id: string) => void;
  duplicatePipeline: (id: string) => string;
  runPipeline: (pipelineId: string, sourceImageId: string) => string;
  cancelExecution: (executionId: string) => void;
}
```

### Execution Flow

```
User clicks "Upscale 4x" on an image
  → Create PipelineExecution from preset PipelineDefinition
  → Enqueue as specialized GenerationQueueItem (type: 'pipeline')
  → Execute steps sequentially via backend API:
      Step 1: Send source image + params → receive intermediate result
      Step 2: Send intermediate + params → receive next result
      ... (repeat for each step)
  → Each step update: update execution.stepResults, emit progress event
  → Final result added to iteration tree as child of source image
  → Queue item marked complete
```

### Workflows Tab Layout (Pipelines Sub-mode)

```
┌──────┬──────────────────────────────────┬─────────────────┐
│ LEFT │           CENTER                 │     RIGHT       │
│      │                                  │                 │
│ [Workflows | Pipelines]  ◄─segmented   │  ┌─ Preview ───┐│
│ ┌────────────────────┐                  │  │              ││
│ │ Node Palette         │  Pipeline       │  │  Step output ││
│ │ Pipeline Settings    │  Canvas         │  │  preview     ││
│ │ Step Config          │                  │  │              ││
│ └────────────────────┘                  │  └──────────────┘│
│  min: 340px                              │   min: 280px     │
└──────┴──────────────────────────────────┴─────────────────┘
```

- Left dock: Node palette (draggable step types) + selected node config panel + pipeline-level settings
- Center: Pipeline canvas with nodes and connections
- Right dock: Preview panel showing output at selected pipeline step

---

## Build Order

| Step | Feature | Depends On |
|------|---------|-----------|
| 1 | Aspect Ratio + Resolution Picker | None (foundational) |
| 2 | Video Generation Inputs | Step 1 (resolution config) |
| 3 | Enhanced Timeline (3 modes + CameraKeyframe) | Step 1 (aspect ratios affect timeline display) |
| 4 | Refinement Pipeline (presets + builder) | None (independent) |

Each step is independently testable and committable. Content components are preserved — only mounting context and store slices change.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Video generation timeout | Progress bar with estimated time. Cancel button. Retry from queue. |
| Pipeline step failure | Mark step as error, show error message. Allow retry from failed step. Previous steps' results preserved. |
| Keyframe corruption | Catch parse error, clear keyframes for entity, log warning. Canvas renders without interpolation. |
| Onion-skin frame missing | Skip missing frames silently. Show available frames at configured opacity. |
| Aspect ratio produces invalid dimensions | Clamp to min 256 / max 2048. Show warning if clamped. |
| Pipeline builder invalid connection | Prevent non-linear connections in v1. Visual feedback: connection snaps back. |

---

## Testing Strategy

| Layer | Tests | Count Target |
|-------|-------|-------------|
| Aspect Ratio Picker | Ratio selection, tier computation, custom override, dimension clamping | ~10 |
| Video Inputs | Toggle switching, start/end frame upload, video params, mode-specific UI | ~12 |
| TimelineEngine | Play/pause/stop, seek, speed, loop, currentTime tracking | ~15 |
| KeyframeStore | CRUD, interpolation (linear, ease), query by entity, query by range | ~15 |
| OnionSkinCompositor | Frame count, opacity, direction, missing frame handling | ~8 |
| Timeline Modes | Mode switching, mode-specific rendering, auto-default per tab | ~10 |
| Pipeline Presets | Each preset produces correct step chain, execution, progress | ~8 |
| Pipeline Builder | Node add/remove/connect, config panel, preview, linear-only constraint | ~12 |
| Pipeline Execution | Sequential step execution, error recovery, retry, iteration tree integration | ~10 |
| Existing tests | All ~492+ continue passing | Unchanged |

**Total new tests: ~100. Existing tests preserved.**

---

## Future Considerations (Out of Scope)

- **Pipeline branching** — Allow parallel paths in the visual builder (fan-out/fan-in)
- **Timeline audio** — Audio track support for storyboard playback
- **Motion paths** — Bezier curve editing for animated properties
- **Video export** — Render timeline to video file (MP4, GIF)
- **Collaborative pipelines** — Share pipeline definitions between users
