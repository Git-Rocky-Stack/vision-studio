# Canvas Control Layers Design

## Goal

Add canvas-native control layers for image workflows so ControlNet, reference images, and inpaint masks can be placed, edited, and reviewed directly on the canvas instead of living primarily in panel-only state.

This phase should make Vision Studio feel closer to a serious AI image workstation without replacing the current scene, region, or generation model.

The first milestone is intentionally narrow:

- image workflows only
- canvas-native placement and masking
- scene-persisted control layers
- adapter-based generation wiring
- no video-aware control layers yet

## Chosen Approach

Use a dedicated `CanvasControlLayer` domain model layered on top of the existing canvas and region-mask system.

The existing `RegionLock` model is edit-oriented and should remain that way. Control layers are generation-oriented objects with their own lifecycle, visibility, source media, mask geometry, and request-mapping behavior. The canvas becomes the primary interaction surface, while the inspector owns the detailed settings for the active control layer.

This keeps the current generation pipeline intact and adds one resolver layer between scene state and generation request assembly.

## Alternatives Considered

### 1. Dedicated canvas control-layer model beside RegionLock

- Keeps generation intent separate from edit-only region logic.
- Fits the current project and scene architecture cleanly.
- Supports canvas-native UI without forcing a generation rewrite.
- Recommended.

### 2. Extend RegionLock into a hybrid edit-plus-generation object

- Would reuse some existing geometry and inspector patterns.
- Mixes two concerns that already behave differently.
- Likely to make region editing and generation control harder to reason about.

### 3. Keep panel-first state and only mirror it visually on canvas

- Lowest implementation effort.
- Does not really solve the product gap.
- Leaves the canvas secondary instead of becoming the first-class control surface.

## Core Architecture

### New CanvasControlLayer domain model

Add a dedicated `CanvasControlLayer` type to the project domain and attach it directly to scenes.

Expected first-pass fields:

- `id`
- `sceneId`
- `name`
- `type: 'controlnet' | 'reference-image' | 'inpaint-mask'`
- `mask: RegionMask`
- `visible`
- `opacity`
- `previewTint`
- `sourceMediaAssetId?`
- `sourcePath?`
- `referenceSetId?`
- `preprocessor?`
- `weight?`
- `startStep?`
- `endStep?`
- `controlMode?`
- `prompt?`
- `negativePrompt?`
- `metadata`

Each scene should gain:

- `canvasControlLayers: CanvasControlLayer[]`
- `activeCanvasControlLayerId?`

This keeps control-layer persistence scene-scoped instead of buried in transient panel state.

### Store behavior

Add store CRUD for control layers:

- `createCanvasControlLayer`
- `updateCanvasControlLayer`
- `deleteCanvasControlLayer`
- `duplicateCanvasControlLayer`
- `reorderCanvasControlLayers`
- `setActiveCanvasControlLayerId`

The store should preserve layer order, selection, visibility, and scene durability. Geometry editing should reuse the current region-mask editing primitives instead of creating a second mask system.

### Adapter-based generation resolution

Keep `GeneratePanel`, Electron IPC, and backend request contracts intact for milestone one.

Add a resolver that collects visible `CanvasControlLayer`s from the active scene and maps them into the current image-generation request shape:

- visible `controlnet` layers become ControlNet request entries
- visible `reference-image` layers feed the current reference-media routing
- visible `inpaint-mask` layers define the masked generation region

This keeps generation changes localized and avoids a broad transport rewrite.

## Interaction Model

### Canvas

Canvas becomes the primary placement and spatial-edit surface for control layers.

Required first-pass behaviors:

- create a new control layer from canvas UI
- select the active control layer
- draw or edit a control-layer mask
- drag and drop a media asset to create a `controlnet` or `reference-image` layer
- toggle visibility
- adjust preview opacity and tint
- duplicate, invert mask, and delete the active layer

Add a compact `Canvas Control Layers` rail on the left side of the canvas. It should stay separate from the existing zoom and view tooling so the UI remains readable.

### Inspector

The inspector owns detailed settings for the active layer:

- layer name
- layer type
- source media or reference target
- ControlNet preprocessor or mode
- weight
- start and end step
- prompt and negative prompt where relevant
- visibility and preview controls
- generation eligibility and validation messages

This should extend the current inspector model instead of creating a second detached settings panel.

## Surface Changes

### Canvas rail

Add a compact control-layer rail with:

- `Add Control Layer`
- `Add Reference Layer`
- `Add Inpaint Mask`
- ordered layer list
- active-layer highlighting
- quick visibility toggle
- quick duplicate and delete actions

This rail should be strong enough for daily use, but not a full Photoshop-style layer stack in milestone one.

### Edit and properties panel

The existing inspector should switch cleanly between:

- region editing
- clip editing
- control-layer editing

It should be obvious when a control layer is selected and what kind of generation behavior it will affect.

### Generate flow

Generate should show or respect control-layer-derived state without forcing the user back into a panel-only workflow.

The first milestone should prefer canvas and scene truth over duplicated per-run transient state.

## Validation And Error Handling

Be explicit about invalid layer states before backend submission.

Examples:

- visible `controlnet` layer with no source image should block generation
- visible `reference-image` layer with no media or reference target should block generation
- `inpaint-mask` with no usable base image should fail explicitly
- unsupported combinations should fail in UI rather than silently degrade in the backend

Do not silently ignore visible layers that the user would expect to affect generation.

## Scope For Milestone One

### Included

- image-only canvas control layers
- scene-persisted `CanvasControlLayer` model
- canvas rail
- active-layer selection and mask editing
- inspector editing for control-layer settings
- adapter-based generation request resolution
- validation for invalid layer states

### Excluded

- video-aware control layers
- frame-derived video controls
- advanced compositing or blending
- nested layer groups
- collaborative canvas state
- audio
- retake or timeline-specific generation controls

## Testing Strategy

Add coverage for:

- scene persistence of `CanvasControlLayer`
- create, update, select, reorder, duplicate, and delete flows
- control-layer mask editing behavior
- visible-layer-to-generation-request resolution
- invalid state blocking and explicit error surfacing
- canvas rail rendering and inspector switching

## Risks

Main risks:

- control-layer state drifts from existing generate-panel state
- RegionLock and control-layer editing become conceptually tangled
- canvas UI becomes visually heavy too early
- invalid visible layers get ignored instead of blocking generation cleanly

## Acceptance Bar

This phase is complete when:

- scenes can persist reusable canvas control layers
- users can place and edit control layers from the canvas
- inspector settings are layer-specific and readable
- visible control layers affect real image-generation requests
- invalid control-layer state fails explicitly before backend submission
