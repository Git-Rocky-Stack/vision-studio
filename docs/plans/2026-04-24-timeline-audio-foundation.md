# Timeline Audio Foundation Implementation Plan

> **For Codex:** Execute this plan in compact verified slices. Keep playback and export aligned through one shared resolver, and keep the first milestone editorial rather than mixer-heavy.

**Goal:** Add managed audio import, real audio track editing, synchronized playback, and MP4 export with audio for Vision Studio's AI-native timeline.

**Architecture:** Extend the existing timeline and media domain to support `audio` assets and tracks, expand the shared sequence resolver to emit audio mix layers, keep renderer playback authoritative, and use the backend for final audio mix and MP4 muxing so preview and export follow the same timeline truth.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron IPC, FastAPI, Python audio/video tooling

---

### Task 1: Add Audio Media Domain And Import Foundations

**Files:**
- Modify: `src/types/media.ts`
- Modify: `src/features/assets/assetRecords.ts`
- Modify: `src/features/assets/assetRecords.test.ts`
- Modify: `src/pages/AssetsPanel.tsx`
- Modify: `src/pages/AssetsPanel.import.test.tsx`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Add first-class managed audio media so local sound files can enter the project through the existing import flow.

**Required behavior:**

- support audio `MediaAsset` records
- detect common audio file extensions
- preserve duration metadata where available
- show audio assets distinctly in the asset library
- keep existing image and video import behavior intact

**Implementation notes:**

- Keep the first waveform story additive; a placeholder waveform summary is acceptable here if full extraction lands later in the plan.
- Do not fork the asset system into separate code paths per media family.

**Verification:**

```powershell
npm run test -- src/features/assets/assetRecords.test.ts src/pages/AssetsPanel.import.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/media.ts src/features/assets/assetRecords.ts src/features/assets/assetRecords.test.ts src/pages/AssetsPanel.tsx src/pages/AssetsPanel.import.test.tsx src/store/appStore.test.ts
git commit -m "feat(audio): add managed audio asset import"
```

### Task 2: Add Audio Track And Clip Editing Primitives

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/components/layout/Timeline.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.tsx`
- Modify: `src/components/layout/Timeline.integration.test.tsx`
- Modify: `src/components/timeline/TimelineClipInspector.test.tsx`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Turn `audio` from a nominal track kind into a real editable timeline surface.

**Required behavior:**

- create dedicated audio tracks
- place imported audio clips on audio tracks
- support trim in/out using existing clip timing fields
- add clip `gain`, `fadeInMs`, and `fadeOutMs`
- add track `solo`
- surface audio clip controls in the existing inspector

**Implementation notes:**

- Keep audio clips in the same core clip model.
- Keep the timeline visually lighter than a DAW; basic waveform representation is enough for this milestone.
- Preserve existing video and image editorial behavior.

**Verification:**

```powershell
npm run test -- src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/timeline.ts src/store/appStore.types.ts src/store/slices/mediaTimelineSlice.ts src/components/layout/Timeline.tsx src/components/timeline/TimelineClipInspector.tsx src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/store/appStore.test.ts
git commit -m "feat(audio): add timeline audio editing primitives"
```

### Task 3: Extend The Sequence Resolver For Audio Playback

**Files:**
- Modify: `src/features/timeline/sequenceComposition.ts`
- Modify: `src/features/timeline/sequenceComposition.test.ts`
- Modify: `src/components/timeline/TimelinePlaybackPreview.tsx`
- Create: `src/components/timeline/TimelinePlaybackPreview.audio.test.tsx`

**Goal:**

Expand the shared timeline resolver and playback host so audio playback follows the same playhead truth as the video preview.

**Required behavior:**

- resolve active audio layers at any `timeMs`
- apply trim, gain, fade, mute, and solo rules
- keep playback synchronized during play, pause, scrub, stop, and loop
- preserve existing video preview behavior

**Implementation notes:**

- Use managed `HTMLAudioElement` pooling keyed by active clip or layer identity.
- Keep the playhead authoritative; do not let browser audio drift drive timeline state.

**Verification:**

```powershell
npm run test -- src/features/timeline/sequenceComposition.test.ts src/components/timeline/TimelinePlaybackPreview.test.tsx src/components/timeline/TimelinePlaybackPreview.audio.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/features/timeline/sequenceComposition.ts src/features/timeline/sequenceComposition.test.ts src/components/timeline/TimelinePlaybackPreview.tsx src/components/timeline/TimelinePlaybackPreview.audio.test.tsx
git commit -m "feat(audio): add synchronized timeline audio playback"
```

### Task 4: Add Audio-Aware MP4 Export

**Files:**
- Modify: `src/features/timeline/exportTimelineSequence.ts`
- Modify: `src/features/timeline/exportTimelineSequence.test.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `electron/ipc-handlers/generation.ts`
- Modify: `electron/preload.ts`
- Modify: `backend/main.py`

**Goal:**

Extend the current timeline export path so MP4 output includes the resolved audio mix.

**Required behavior:**

- submit resolved audio layers alongside video frames
- mix audible audio layers with trim, gain, and fades applied
- mux audio into the final MP4
- preserve existing export progress and failure handling
- fail explicitly when audio decode or muxing is unsupported

**Implementation notes:**

- Keep export request scope narrow and local.
- Reuse existing Python media tooling where possible.
- Do not sync exported MP4s back into the managed asset library by default.

**Verification:**

```powershell
npm run test -- src/features/timeline/exportTimelineSequence.test.ts
npm run typecheck
python -m py_compile backend\\main.py
```

**Commit:**

```powershell
git add src/features/timeline/exportTimelineSequence.ts src/features/timeline/exportTimelineSequence.test.ts src/types/electron.d.ts electron/ipc-handlers/generation.ts electron/preload.ts backend/main.py
git commit -m "feat(export): add timeline audio mux pipeline"
```

### Task 5: Final Audio Verification And Cleanup

**Files:**
- Modify as needed based on verification

**Goal:**

Leave the first audio milestone stable, playback-synchronized, and export-verified.

**Required behavior:**

- audio imports without regressing existing media workflows
- audio track editing behaves predictably
- playback honors gain, fades, mute, and solo
- MP4 export includes the expected audio mix
- older saved projects still load without audio fields

**Verification:**

```powershell
npm run test -- src/features/assets/assetRecords.test.ts src/pages/AssetsPanel.import.test.tsx src/features/timeline/sequenceComposition.test.ts src/components/layout/Timeline.integration.test.tsx src/components/timeline/TimelineClipInspector.test.tsx src/components/timeline/TimelinePlaybackPreview.test.tsx src/components/timeline/TimelinePlaybackPreview.audio.test.tsx src/features/timeline/exportTimelineSequence.test.ts src/store/appStore.test.ts
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
git commit -m "feat(audio): add timeline audio foundation"
```

## Rollout Guidance

Execute in order:

1. audio asset import
2. audio track and clip editing
3. synchronized playback
4. MP4 export with audio
5. final verification

Do not jump to voice generation, music generation, effects routing, or a full mixer before the editorial audio foundation is stable.
