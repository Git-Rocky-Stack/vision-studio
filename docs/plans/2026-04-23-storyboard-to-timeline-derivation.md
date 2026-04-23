# Storyboard To Timeline Derivation Implementation Plan

> **For Codex:** Execute this plan in compact verified slices. Keep derivation explicit, idempotent, and additive.

**Goal:** Add a safe `Build Timeline From Storyboard` flow that derives one primary timeline clip per approved scene, preserves shot beats as beat markers, and keeps existing manual timeline edits stable.

**Architecture:** Introduce additive derived-clip beat marker metadata in the timeline domain, implement a dedicated storyboard-to-timeline derivation service, then wire explicit storyboard actions and timeline visibility around the resulting metadata.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, existing Vision Studio storyboard, media timeline, and generation infrastructure

---

### Task 1: Add Derived Beat Marker And Clip Metadata Foundations

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Add additive timeline types and persistence-safe defaults for storyboard-derived clip metadata.

**Required behavior:**

- add `TimelineBeatMarker`
- add clip-level derived metadata such as `storyboardDerived`
- add beat marker storage on `TimelineClip`
- normalize older saved timeline clips that predate these fields
- preserve current clip editing, playback, and export behavior

**Implementation notes:**

- Keep this migration additive.
- Do not disturb existing clip timing, transition, or generation binding semantics.
- Treat beat markers as downstream metadata, not a new canonical timing model.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/timeline.ts src/store/appStore.types.ts src/store/slices/mediaTimelineSlice.ts src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(timeline): add storyboard-derived clip metadata"
```

### Task 2: Build Idempotent Storyboard-To-Timeline Derivation

**Files:**
- Create: `src/features/timeline/deriveStoryboardTimeline.ts`
- Create: `src/features/timeline/deriveStoryboardTimeline.test.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/store/slices/projectSlice.ts`
- Modify: `src/store/appStore.types.ts`

**Goal:**

Turn approved storyboard scenes into derived timeline clips without duplicating or disturbing existing manual editorial work.

**Required behavior:**

- ensure a project timeline sequence exists
- derive one primary clip per approved scene
- resolve clip media using the agreed source order
- create placeholder clips when scenes have no media
- update existing derived clips in place when only missing beat/reference metadata needs syncing
- maintain `scene.timelineClipIds` backreferences
- return a derivation summary with `added`, `updated`, `skipped`, and `placeholders`

**Implementation notes:**

- Re-running derivation must be idempotent for the same sequence.
- Do not explode shot beats into clips.
- Do not move, trim, or overwrite unrelated manual clips.

**Verification:**

```powershell
npm run test -- src/features/timeline/deriveStoryboardTimeline.test.ts src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/features/timeline/deriveStoryboardTimeline.ts src/features/timeline/deriveStoryboardTimeline.test.ts src/store/slices/mediaTimelineSlice.ts src/store/slices/projectSlice.ts src/store/appStore.types.ts
git commit -m "feat(timeline): derive clips from storyboard scenes"
```

### Task 3: Add Explicit Storyboard Build-Timeline Actions

**Files:**
- Modify: `src/pages/StoryboardPanel.tsx`
- Modify: `src/components/storyboard/SceneCard.tsx`
- Modify: `src/components/storyboard/SceneCard.test.tsx`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Expose derivation as an explicit storyboard action instead of silent background sync.

**Required behavior:**

- add project-level `Build Timeline`
- add per-scene `Send To Timeline`
- surface the derivation summary to the user
- keep the default bulk mode append-safe
- avoid offering destructive overwrite flows in this milestone

**Implementation notes:**

- Keep the feedback compact and production-oriented.
- Make placeholder creation visible in the result summary.
- Preserve current storyboard browsing and import behavior.

**Verification:**

```powershell
npm run test -- src/components/storyboard/SceneCard.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/pages/StoryboardPanel.tsx src/components/storyboard/SceneCard.tsx src/components/storyboard/SceneCard.test.tsx src/store/appStore.test.ts
git commit -m "feat(storyboard): add build timeline actions"
```

### Task 4: Surface Derived Scene And Beat Context In Timeline

**Files:**
- Modify: `src/components/layout/Timeline.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Create: `src/components/timeline/TimelineClipInspector.test.tsx`
- Modify: `src/components/layout/Timeline.integration.test.tsx`

**Goal:**

Make storyboard-derived clips readable and useful once they land in the timeline.

**Required behavior:**

- show when a clip is storyboard-derived
- show the source scene name
- render beat markers in the timeline strip or ruler context
- show the derived beat list in the inspector
- surface placeholder state when a derived clip has no media yet

**Implementation notes:**

- Keep beat visibility lightweight; this is not the beat-editing milestone.
- Do not overload the clip UI with dense metadata.
- Preserve existing clip editing and AI generation controls.

**Verification:**

```powershell
npm run test -- src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/layout/Timeline.tsx src/components/timeline/TimelineClipInspector.tsx src/components/timeline/TimelineClipInspector.test.tsx src/components/layout/Timeline.integration.test.tsx
git commit -m "feat(timeline): show storyboard-derived scene context"
```

### Task 5: Final Integration Verification And Cleanup

**Files:**
- Modify as needed based on verification

**Goal:**

Leave the storyboard-to-timeline derivation flow validated, stable, and ready for the next beat-expansion milestone.

**Required behavior:**

- derivation creates or reuses the project sequence correctly
- repeated derivation stays idempotent
- placeholder scenes derive without failure
- beat markers survive playback/export-safe timeline usage
- scene backreferences remain correct

**Verification:**

```powershell
npm run test -- src/features/timeline/deriveStoryboardTimeline.test.ts src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/store/appStore.test.ts
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
git commit -m "feat(timeline): finish storyboard timeline derivation"
```
