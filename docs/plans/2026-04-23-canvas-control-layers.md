# Canvas Control Layers Implementation Plan

> **For Codex:** Execute this plan milestone-by-milestone. Keep the scope image-only for this first pass.

**Goal:** Add image-first canvas-native control layers for ControlNet, reference images, and inpaint masks.

**Architecture:** Introduce a dedicated `CanvasControlLayer` scene model, a small set of durable store actions, a canvas-side layer rail, inspector editing for the active layer, and an adapter that resolves visible layers into the current image-generation request format.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron IPC, existing Vision Studio image-generation pipeline

---

### Task 1: Add Canvas Control Layer Domain And Store Actions

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/projectSlice.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Add durable scene-scoped control-layer state without breaking existing region or reference flows.

**Required behavior:**

- add `CanvasControlLayer`
- add `canvasControlLayers` to scenes
- add `activeCanvasControlLayerId`
- add CRUD and reorder actions
- preserve layer order and selection through persistence

**Implementation notes:**

- Keep control layers separate from `RegionLock`.
- Reuse existing mask geometry types where possible.
- Keep the new state additive and adapter-safe.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/project.ts src/store/appStore.types.ts src/store/slices/projectSlice.ts src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(canvas): add control layer domain state"
```

### Task 2: Add Canvas Control Layer Rail And Selection Flow

**Files:**
- Modify: `src/components/layout/Canvas.tsx`
- Modify: `src/components/edit/EditCanvas.tsx`
- Create: `src/components/canvas/CanvasControlLayerRail.tsx`
- Create: `src/components/canvas/CanvasControlLayerRail.test.tsx`
- Modify: `src/components/studio/CompositionLayerBar.tsx`

**Goal:**

Make the canvas the primary interaction surface for control layers.

**Required behavior:**

- add a compact control-layer rail
- create `controlnet`, `reference-image`, and `inpaint-mask` layers
- select the active layer
- toggle visibility
- duplicate and delete layers
- show ordering and active-layer state clearly

**Implementation notes:**

- Keep the rail compact and desktop-friendly.
- Do not build a full compositing stack UI in this milestone.
- Reuse existing canvas toolbar and layer-visibility patterns where it helps.

**Verification:**

```powershell
npm run test -- src/components/canvas/CanvasControlLayerRail.test.tsx src/components/layout/Canvas.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/layout/Canvas.tsx src/components/edit/EditCanvas.tsx src/components/canvas/CanvasControlLayerRail.tsx src/components/canvas/CanvasControlLayerRail.test.tsx src/components/studio/CompositionLayerBar.tsx
git commit -m "feat(canvas): add control layer rail"
```

### Task 3: Wire Mask Editing And Inspector Controls

**Files:**
- Modify: `src/components/edit/EditPropertiesPanel.tsx`
- Modify: `src/components/edit/RegionLockToolbar.tsx`
- Modify: `src/components/edit/RegionLockProperties.tsx`
- Create: `src/components/canvas/CanvasControlLayerProperties.tsx`
- Create: `src/components/canvas/CanvasControlLayerProperties.test.tsx`

**Goal:**

Let the active control layer be edited with the current canvas-mask and inspector workflow.

**Required behavior:**

- draw and edit control-layer masks
- switch between control-layer and other inspector states cleanly
- edit name, type, source media, preprocessor, weight, step range, and prompt fields
- expose validation state for incomplete layers

**Implementation notes:**

- Reuse existing region-mask editing primitives instead of creating a second geometry editor.
- Keep the inspector clear about which layer is active and whether it is generation-ready.

**Verification:**

```powershell
npm run test -- src/components/canvas/CanvasControlLayerProperties.test.tsx src/components/edit/EditCanvas.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/edit/EditPropertiesPanel.tsx src/components/edit/RegionLockToolbar.tsx src/components/edit/RegionLockProperties.tsx src/components/canvas/CanvasControlLayerProperties.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx
git commit -m "feat(canvas): add control layer inspector"
```

### Task 4: Resolve Visible Control Layers Into Image Generation Requests

**Files:**
- Create: `src/features/generation/resolveCanvasControlLayers.ts`
- Create: `src/features/generation/resolveCanvasControlLayers.test.ts`
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/types/generation.ts`
- Modify: `src/features/timeline/runTimelineClipGeneration.ts`

**Goal:**

Map visible canvas control layers into the existing image-generation flow without rewriting the transport contracts.

**Required behavior:**

- visible `controlnet` layers become ControlNet request entries
- visible `reference-image` layers feed reference routing
- visible `inpaint-mask` layers define masked generation context
- invalid visible layers block generation with explicit UI errors

**Implementation notes:**

- Keep this as an adapter layer, not a pipeline rewrite.
- Prefer scene and canvas truth over duplicated transient panel state.
- Restrict this milestone to image workflows only.

**Verification:**

```powershell
npm run test -- src/features/generation/resolveCanvasControlLayers.test.ts src/pages/GeneratePanel.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/features/generation/resolveCanvasControlLayers.ts src/features/generation/resolveCanvasControlLayers.test.ts src/pages/GeneratePanel.tsx src/types/generation.ts src/features/timeline/runTimelineClipGeneration.ts
git commit -m "feat(generate): resolve canvas control layers"
```

### Task 5: Final Validation And Integration Cleanup

**Files:**
- Modify as needed based on verification

**Goal:**

Run the focused validation gate, fix any integration drift, and leave the tree clean.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts src/components/canvas/CanvasControlLayerRail.test.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx src/features/generation/resolveCanvasControlLayers.test.ts src/pages/GeneratePanel.test.tsx
npm run typecheck
npm run build
```

After `npm run build`, restore generated Electron bundles if they are not part of the intended diff:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Commit:**

```powershell
git add -A
git commit -m "feat(canvas): add image-first control layers"
```

## Rollout Guidance

Execute in order:

1. domain and store
2. canvas rail
3. mask editing and inspector
4. generation adapter
5. final validation

Do not expand this milestone into video-aware layers, advanced compositing, or broader generation-contract rewrites until the image-first canvas control-layer workflow is real and stable.
