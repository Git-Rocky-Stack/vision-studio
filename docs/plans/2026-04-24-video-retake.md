# Video Retake Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clip-local, range-scoped video retake with candidate takes, approval flow, and playback/export resolution for accepted retakes.

**Architecture:** Keep `TimelineClip` as the editorial anchor and add additive retake-domain records for ranges and candidate takes. Reuse the existing timeline video generation path for retake execution, then extend playback/export resolution so accepted retakes transparently win only for their approved segment.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron IPC, FastAPI, Python video tooling

---

### Task 1: Add Retake Domain Foundations

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Add persistence-safe retake ranges and retake take records without disturbing existing clip editing behavior.

**Required behavior:**

- `TimelineClip` can own `retakeRanges`
- add `ClipRetakeTake` records in store state
- add create/update/delete/select/accept/reject actions
- normalize older persisted timeline state safely
- keep non-retake clips loading exactly as before

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/timeline.ts src/store/appStore.types.ts src/store/appStore.ts src/store/slices/mediaTimelineSlice.ts src/store/appStore.test.ts
git commit -m "feat(retake): add clip retake domain state"
```

### Task 2: Add Timeline And Inspector Retake Authoring

**Files:**
- Modify: `src/components/layout/Timeline.tsx`
- Modify: `src/components/layout/Timeline.integration.test.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.test.tsx`

**Goal:**

Let users mark retake ranges on selected video clips and manage candidate state from the inspector.

**Required behavior:**

- `Mark Retake In`
- `Mark Retake Out`
- `Create Retake`
- `Clear Range`
- retake range overlays/badges inside clip UI
- inspector controls for selected retake range
- candidate list shell for the selected range
- explicit blocked state for non-video or unselected clips

**Verification:**

```powershell
npm run test -- src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/layout/Timeline.tsx src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.tsx src/components/timeline/TimelineClipInspector.test.tsx
git commit -m "feat(retake): add retake range authoring flow"
```

### Task 3: Wire Retake Execution Through Timeline Video Generation

**Files:**
- Modify: `src/features/timeline/runTimelineClipGeneration.ts`
- Modify: `src/features/timeline/runTimelineClipGeneration.test.ts`
- Modify: `src/store/slices/generationSlice.ts` if needed for retake-specific job metadata

**Goal:**

Generate candidate retake takes for a selected clip range using inherited clip binding/settings by default.

**Required behavior:**

- retake uses the existing video generation path
- target clip and retake range are required
- inherited prompt/model/settings by default
- optional prompt override from inspector
- output stores as candidate retake take, not immediate replacement
- generation status attaches to the retake candidate/range cleanly

**Verification:**

```powershell
npm run test -- src/features/timeline/runTimelineClipGeneration.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/features/timeline/runTimelineClipGeneration.ts src/features/timeline/runTimelineClipGeneration.test.ts src/store/slices/generationSlice.ts
git commit -m "feat(retake): generate candidate segment takes"
```

### Task 4: Add Compare And Approval Flow

**Files:**
- Modify: `src/components/timeline/TimelinePlaybackPreview.tsx`
- Create: `src/components/timeline/TimelineRetakeCompare.tsx`
- Create: `src/components/timeline/TimelineRetakeCompare.test.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.test.tsx`

**Goal:**

Let users review candidate retakes against the current editorial result and explicitly accept, reject, or revert.

**Required behavior:**

- compare original/current vs candidate take
- range-scoped preview playback
- accept candidate
- reject candidate
- revert to original
- only one accepted candidate per range at a time

**Verification:**

```powershell
npm run test -- src/components/timeline/TimelineRetakeCompare.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/components/timeline/TimelinePlaybackPreview.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/timeline/TimelinePlaybackPreview.tsx src/components/timeline/TimelineRetakeCompare.tsx src/components/timeline/TimelineRetakeCompare.test.tsx src/components/timeline/TimelineClipInspector.tsx src/components/timeline/TimelineClipInspector.test.tsx
git commit -m "feat(retake): add compare and approval flow"
```

### Task 5: Resolve Accepted Retakes In Playback And Export

**Files:**
- Modify: `src/features/timeline/sequenceComposition.ts`
- Modify: `src/features/timeline/sequenceComposition.test.ts`
- Modify: `src/features/timeline/exportTimelineSequence.ts`
- Modify: `src/features/timeline/exportTimelineSequence.test.ts`
- Modify: `backend/main.py` only if export contract needs additive metadata

**Goal:**

Make accepted retakes become real editorial truth inside playback and export for only their approved range.

**Required behavior:**

- accepted retake segment overrides original clip segment
- unresolved ranges still use the original clip
- compare/review-only candidates do not affect playback/export
- export honors accepted retake resolution the same way preview does
- explicit failure when accepted retake media is missing

**Verification:**

```powershell
npm run test -- src/features/timeline/sequenceComposition.test.ts src/features/timeline/exportTimelineSequence.test.ts
npm run typecheck
python -m py_compile backend\\main.py
```

**Commit:**

```powershell
git add src/features/timeline/sequenceComposition.ts src/features/timeline/sequenceComposition.test.ts src/features/timeline/exportTimelineSequence.ts src/features/timeline/exportTimelineSequence.test.ts backend/main.py
git commit -m "feat(retake): resolve accepted retakes in playback and export"
```

### Task 6: Final Verification And Cleanup

**Files:**
- Modify as needed based on verification

**Goal:**

Leave the first retake milestone stable, reviewable, and export-correct.

**Required behavior:**

- retake authoring works on AI-bound video clips
- candidate retakes are non-destructive until accepted
- compare and approval flow is reliable
- accepted retakes resolve in playback and export
- older saved projects still load without retake fields

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/components/timeline/TimelineRetakeCompare.test.tsx src/components/timeline/TimelinePlaybackPreview.test.tsx src/features/timeline/runTimelineClipGeneration.test.ts src/features/timeline/sequenceComposition.test.ts src/features/timeline/exportTimelineSequence.test.ts
npm run typecheck
npm run build
python -m py_compile backend\\main.py
```

After `npm run build`, restore generated Electron bundles if they are not part of the intended diff:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Commit:**

```powershell
git add -A
git commit -m "feat(retake): add video retake workflow"
```

## Rollout Guidance

Execute in order:

1. retake domain state
2. authoring flow
3. retake generation
4. compare and approval
5. playback/export resolution
6. final verification

Keep the first milestone clip-local and non-destructive. Do not jump to multi-clip retake orchestration, full clip explosion, or automatic destructive replacement before the approval flow is stable.
