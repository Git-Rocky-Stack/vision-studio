# AI-Native Timeline Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan milestone-by-milestone.

**Goal:** Add first-class imported media, reusable reference media, real timeline editing, and timeline-native AI clip operations to Vision Studio without discarding the current scene and board model.

**Architecture:** Use gradual side-by-side evolution. Keep the existing `Project -> Scene` model working while introducing a parallel media/timeline domain with adapters. Ship foundations first, then playback and review, then true editing, then AI integration on top of stable editorial primitives.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron IPC, Vite

---

### Task 1: Add Media, Reference, And Timeline Domain Foundations

**Files:**
- Create: `src/types/media.ts`
- Modify: `src/types/timeline.ts`
- Modify: `src/types/project.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.ts`
- Create: `src/store/slices/mediaTimelineSlice.ts`
- Create: `src/store/slices/mediaTimelineSlice.test.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Introduce durable types and store state for:

- `MediaAsset`
- `ReferenceSet`
- `TimelineSequence`
- `TimelineTrack`
- `TimelineClip`
- `ClipGenerationBinding`

Keep the new model additive. Do not break existing scene rendering while this lands.

**Implementation notes:**

- Preserve existing `assetLibrary` behavior while introducing a richer domain layer.
- Add adapter-friendly links such as `sceneId` on clips and `sequenceId` on projects or project metadata.
- Keep the initial slice store-driven and test-heavy before any large UI changes.

**Verification:**

```powershell
npm run test -- src/store/slices/mediaTimelineSlice.test.ts src/store/appStore.test.ts
```

**Commit:**

```powershell
git add src/types/media.ts src/types/timeline.ts src/types/project.ts src/store/appStore.types.ts src/store/appStore.ts src/store/slices/mediaTimelineSlice.ts src/store/slices/mediaTimelineSlice.test.ts src/store/appStore.test.ts
git commit -m "feat(timeline): add media and timeline domain state"
```

### Task 2: Build Real Media Import And Ingest

**Files:**
- Modify: `electron/services/mainIpc.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `src/pages/AssetsPanel.tsx`
- Create: `src/pages/AssetsPanel.import.test.tsx`
- Modify: `src/features/assets/assetRecords.ts`
- Modify: `src/features/assets/assetRecords.test.ts`

**Goal:**

Turn Assets into a real ingest layer for imported image and video.

Required user actions:

- import image
- import video
- create managed asset records from imports
- reveal, export, and delete imported assets
- mark imported media as reference-ready

**Implementation notes:**

- Add a renderer-accessible file-picking path for multiple media imports.
- Normalize imported assets into the same domain as generated assets.
- Store poster/thumbnail metadata for video assets at import time or via a follow-up derivation step.

**Verification:**

```powershell
npm run test -- src/pages/AssetsPanel.import.test.tsx src/features/assets/assetRecords.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add electron/services/mainIpc.ts electron/preload.ts src/types/electron.d.ts src/pages/AssetsPanel.tsx src/pages/AssetsPanel.import.test.tsx src/features/assets/assetRecords.ts src/features/assets/assetRecords.test.ts
git commit -m "feat(assets): add media import ingest flow"
```

### Task 3: Add First-Class Reference Media Workflows

**Files:**
- Create: `src/components/reference/ReferenceMediaPanel.tsx`
- Create: `src/components/reference/ReferenceMediaPanel.test.tsx`
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/pages/StoryboardPanel.tsx`
- Modify: `src/components/layout/WorkbenchBoardsDock.tsx`
- Modify: `src/store/slices/projectSlice.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`

**Goal:**

Replace temporary single-image reference handling with durable reusable reference sets.

Required behavior:

- attach references at project scope
- attach references at scene/clip scope
- promote imported assets or extracted frames into references
- support typed reference slots such as `style`, `composition`, `character`, `pose`, and `motion`

**Implementation notes:**

- Keep current Generate behavior working during migration.
- Move toward reference-set ids in store state instead of raw local `data:` fields.
- Provide adapters so existing `Scene.referenceImages` still render while the new panel lands.

**Verification:**

```powershell
npm run test -- src/components/reference/ReferenceMediaPanel.test.tsx src/pages/GeneratePanel.test.tsx src/store/appStore.test.ts
```

**Commit:**

```powershell
git add src/components/reference/ReferenceMediaPanel.tsx src/components/reference/ReferenceMediaPanel.test.tsx src/pages/GeneratePanel.tsx src/pages/StoryboardPanel.tsx src/components/layout/WorkbenchBoardsDock.tsx src/store/slices/projectSlice.ts src/store/slices/mediaTimelineSlice.ts
git commit -m "feat(reference): add reusable reference media workflows"
```

### Task 4: Upgrade Review Surfaces For Real Video Playback

**Files:**
- Create: `src/components/ui/MediaPreview.tsx`
- Create: `src/components/ui/MediaPreview.test.tsx`
- Modify: `src/components/layout/WorkbenchViewer.tsx`
- Modify: `src/components/layout/WorkbenchGalleryDock.tsx`
- Modify: `src/pages/AssetsPanel.tsx`
- Modify: `src/components/layout/Canvas.tsx`
- Modify: `src/components/studio/CompositionPreview.tsx`

**Goal:**

Make video a first-class review object instead of treating it like a still image.

Required behavior:

- render playable video in Viewer
- render video-aware thumbnails/posters in Gallery and Assets
- support frame extraction entry points
- avoid silent fallback to still-image rendering for video assets

**Implementation notes:**

- Use one shared preview component for image/video switching.
- Keep Canvas image-centric for editing, but make it explicitly aware when the selected source is video and offer frame extraction or send-frame-to-edit actions.

**Verification:**

```powershell
npm run test -- src/components/ui/MediaPreview.test.tsx src/components/layout/WorkbenchViewer.test.tsx src/components/layout/WorkbenchGalleryDock.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/ui/MediaPreview.tsx src/components/ui/MediaPreview.test.tsx src/components/layout/WorkbenchViewer.tsx src/components/layout/WorkbenchGalleryDock.tsx src/pages/AssetsPanel.tsx src/components/layout/Canvas.tsx src/components/studio/CompositionPreview.tsx
git commit -m "feat(review): add first-class video playback surfaces"
```

### Task 5: Implement True Timeline Editing Primitives

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/store/slices/timelineSlice.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/components/layout/Timeline.tsx`
- Create: `src/components/timeline/TimelineClipInspector.tsx`
- Create: `src/components/timeline/TimelineClipInspector.test.tsx`
- Modify: `src/components/layout/Timeline.integration.test.tsx`

**Goal:**

Ship real editing behavior, not a cosmetic strip.

Required behavior:

- multiple tracks
- clip selection
- move clips on tracks
- trim in/out
- split clips
- duplicate/delete clips
- transitions
- playhead and range interaction
- snapping and ripple-safe edits where appropriate

**Implementation notes:**

- Land clip and track state changes in the store before chasing visual polish.
- Keep sequence duration and track occupancy derived or consistently updated.
- Add a real clip inspector instead of overloading existing scene-only panels.

**Verification:**

```powershell
npm run test -- src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/timeline.ts src/store/slices/timelineSlice.ts src/store/slices/mediaTimelineSlice.ts src/components/layout/Timeline.tsx src/components/timeline/TimelineClipInspector.tsx src/components/timeline/TimelineClipInspector.test.tsx src/components/layout/Timeline.integration.test.tsx
git commit -m "feat(timeline): add real clip editing primitives"
```

### Task 6: Attach AI Generation And Regeneration To Timeline Clips

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/features/workflow/runWorkflowExecution.ts`
- Modify: `src/store/slices/generationSlice.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Create: `src/features/timeline/runTimelineClipGeneration.ts`
- Create: `src/features/timeline/runTimelineClipGeneration.test.ts`

**Goal:**

Make AI generation operate on timeline-native clips.

Required behavior:

- generate into a selected sequence or clip target
- image-to-video from selected media or reference sets
- regenerate-in-place for AI clips
- create clip variants
- extend shot from an existing clip

**Implementation notes:**

- Reuse the current Electron generation pipeline where possible.
- Attach `ClipGenerationBinding` data to eligible clips instead of keeping this state local to panels.
- Keep imported clips and AI clips in the same timeline while only exposing generation actions on supported clip types.

**Verification:**

```powershell
npm run test -- src/features/timeline/runTimelineClipGeneration.test.ts src/pages/GeneratePanel.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/pages/GeneratePanel.tsx src/features/workflow/runWorkflowExecution.ts src/store/slices/generationSlice.ts src/store/slices/mediaTimelineSlice.ts src/components/timeline/TimelineClipInspector.tsx src/features/timeline/runTimelineClipGeneration.ts src/features/timeline/runTimelineClipGeneration.test.ts
git commit -m "feat(timeline): connect AI generation to timeline clips"
```

### Task 7: Add Frame Extraction, Edit Round-Trip, And Final Polish

**Files:**
- Modify: `src/components/layout/WorkbenchViewer.tsx`
- Modify: `src/components/layout/Canvas.tsx`
- Modify: `src/components/edit/EditPropertiesPanel.tsx`
- Modify: `src/components/studio/CompositionPreview.tsx`
- Modify: `src/pages/AssetsPanel.tsx`
- Create: `src/features/media/frameExtraction.ts`
- Create: `src/features/media/frameExtraction.test.ts`

**Goal:**

Close the loop between video and image editing.

Required behavior:

- extract frame from video asset or timeline clip
- send extracted frame to Edit
- promote edited frame back to asset/reference/clip workflows
- promote frames into reusable reference sets

**Implementation notes:**

- Keep the first pass focused on frame-level round-trip, not full clip compositing.
- Make round-trip outcomes explicit so users can choose whether the edited frame becomes a new asset, a new reference, or a clip poster/variant input.

**Verification:**

```powershell
npm run test -- src/features/media/frameExtraction.test.ts src/components/layout/Canvas.test.tsx src/components/edit/EditCanvas.test.tsx
npm run typecheck
npm run build
```

After `npm run build`, restore generated Electron bundles if they are not intentional:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Commit:**

```powershell
git add src/components/layout/WorkbenchViewer.tsx src/components/layout/Canvas.tsx src/components/edit/EditPropertiesPanel.tsx src/components/studio/CompositionPreview.tsx src/pages/AssetsPanel.tsx src/features/media/frameExtraction.ts src/features/media/frameExtraction.test.ts
git commit -m "feat(edit): add frame extraction and edit round-trip"
```

---

## Final Verification

Run the focused and full validation gates that matter for this initiative:

```powershell
npm run test -- src/store/appStore.test.ts src/components/layout/Timeline.integration.test.tsx src/pages/GeneratePanel.test.tsx src/pages/AssetsPanel.import.test.tsx src/components/ui/MediaPreview.test.tsx src/components/reference/ReferenceMediaPanel.test.tsx
npm run typecheck
npm run build
```

If build rewrites generated Electron bundles and those files are not part of the intended diff:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

## Rollout Guidance

Execute this plan in milestone order. Do not jump to AI clip regeneration before media ingest, playback, and timeline editing primitives are real. The product will stay coherent only if each layer is built on a stable lower layer.
