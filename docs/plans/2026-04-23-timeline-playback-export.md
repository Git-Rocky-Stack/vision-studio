# Timeline Playback And Export Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan milestone-by-milestone.

**Goal:** Add real silent sequence playback and local MP4 export for the AI-native timeline.

**Architecture:** Keep the renderer as the timeline truth source. Introduce a shared sequence composition resolver used by both live preview and export. Use the backend for final MP4 encoding so preview/export behavior stays aligned without depending on fragile DOM recording.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron IPC, FastAPI, Python video encoding

---

### Task 1: Add Shared Sequence Composition Resolver

**Files:**
- Create: `src/features/timeline/sequenceComposition.ts`
- Create: `src/features/timeline/sequenceComposition.test.ts`
- Modify: `src/types/timeline.ts`

**Goal:**

Create one deterministic resolver that computes the visible program output for a sequence at any `timeMs`.

**Required behavior:**

- resolve the active clip at a given playhead time
- map trimmed video clips to source media time
- hold image clips across clip duration
- honor play range boundaries
- return transition metadata for `cut`, `fade`, and `dissolve`
- reject or flag unsupported states explicitly

**Implementation notes:**

- Keep the resolver pure and test-heavy.
- Do not depend on React or DOM APIs.
- The resolver output should be reusable by both playback and export.

**Verification:**

```powershell
npm run test -- src/features/timeline/sequenceComposition.test.ts
```

**Commit:**

```powershell
git add src/features/timeline/sequenceComposition.ts src/features/timeline/sequenceComposition.test.ts src/types/timeline.ts
git commit -m "feat(timeline): add sequence composition resolver"
```

### Task 2: Add Real Timeline Playback Host

**Files:**
- Create: `src/components/timeline/TimelinePlaybackPreview.tsx`
- Create: `src/components/timeline/TimelinePlaybackPreview.test.tsx`
- Modify: `src/components/layout/DockviewLayout.tsx`
- Modify: `src/components/layout/Timeline.tsx`
- Modify: `src/store/slices/timelineSlice.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Turn the center preview into a real sequence playback surface driven by the shared resolver.

**Required behavior:**

- play/pause/stop
- frame-step forward/back
- jump to play-range start/end
- live preview of the active sequence output
- playhead advancement at the selected FPS
- clamping or looping inside the active play range

**Implementation notes:**

- Keep playback silent in this milestone.
- Use the resolver instead of ad hoc clip lookup in UI code.
- The preview should render image or video according to the resolved frame plan.

**Verification:**

```powershell
npm run test -- src/components/timeline/TimelinePlaybackPreview.test.tsx src/components/layout/Timeline.integration.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/components/timeline/TimelinePlaybackPreview.tsx src/components/timeline/TimelinePlaybackPreview.test.tsx src/components/layout/DockviewLayout.tsx src/components/layout/Timeline.tsx src/store/slices/timelineSlice.ts src/store/appStore.test.ts
git commit -m "feat(timeline): add sequence playback preview"
```

### Task 3: Add Export Contract Through Electron And Backend

**Files:**
- Modify: `backend/main.py`
- Modify: `electron/ipc-handlers/generation.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Create: `src/features/timeline/exportTimelineSequence.ts`
- Create: `src/features/timeline/exportTimelineSequence.test.ts`

**Goal:**

Add a local MP4 export path that accepts a resolved frame stream and encodes it in the backend.

**Required behavior:**

- local save destination selection
- export active play range or full sequence
- backend request for silent MP4 encoding
- progress reporting
- explicit failure handling

**Implementation notes:**

- Reuse existing backend video libraries where possible.
- Keep the first request format narrow and silent.
- The renderer should assemble export input from the same resolver used for playback.

**Verification:**

```powershell
npm run test -- src/features/timeline/exportTimelineSequence.test.ts
npm run typecheck
python -m py_compile backend\\main.py
```

**Commit:**

```powershell
git add backend/main.py electron/ipc-handlers/generation.ts electron/preload.ts src/types/electron.d.ts src/features/timeline/exportTimelineSequence.ts src/features/timeline/exportTimelineSequence.test.ts
git commit -m "feat(export): add timeline mp4 export pipeline"
```

### Task 4: Wire Export UX Into Timeline

**Files:**
- Modify: `src/components/layout/Timeline.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Modify: `src/components/layout/Canvas.tsx`
- Create: `src/components/timeline/TimelineExportDialog.tsx`
- Create: `src/components/timeline/TimelineExportDialog.test.tsx`

**Goal:**

Expose export as a real user workflow inside the timeline/editor shell.

**Required behavior:**

- `Export MP4` action
- render active play range if present
- show progress and disabled state while exporting
- show success/failure state
- reveal/open exported file affordance

**Implementation notes:**

- Keep the UX local and explicit.
- Do not add additional export formats in this milestone.
- Avoid hidden background exports.

**Verification:**

```powershell
npm run test -- src/components/timeline/TimelineExportDialog.test.tsx src/components/layout/Timeline.integration.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/layout/Timeline.tsx src/components/timeline/TimelineClipInspector.tsx src/components/layout/Canvas.tsx src/components/timeline/TimelineExportDialog.tsx src/components/timeline/TimelineExportDialog.test.tsx
git commit -m "feat(timeline): wire playback export controls"
```

### Task 5: Final Playback And Export Verification

**Files:**
- Modify as needed based on verification

**Goal:**

Run the final focused validation gates for playback and export and clean generated artifacts.

**Verification:**

```powershell
npm run test -- src/features/timeline/sequenceComposition.test.ts src/components/timeline/TimelinePlaybackPreview.test.tsx src/features/timeline/exportTimelineSequence.test.ts src/components/timeline/TimelineExportDialog.test.tsx src/components/layout/Timeline.integration.test.tsx src/store/appStore.test.ts
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
git commit -m "feat(timeline): add silent playback and mp4 export"
```

## Rollout Guidance

Execute in order:

1. resolver
2. playback host
3. export contract
4. export UX
5. final verification

Do not jump to audio, GIF export, or overlay compositing until silent MP4 playback/export is real and stable.
