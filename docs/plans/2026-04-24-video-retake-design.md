# Video Retake Design

## Goal

Add clip-local, range-scoped video retake so Vision Studio can revise part of an AI-generated shot without destructively replacing the original media during generation.

The first milestone should make retake feel like an editorially safe workflow:

- select a video clip
- mark a retake range
- generate one or more candidate segment takes
- compare candidate against the current editorial result
- explicitly accept, reject, or revert

## Chosen Approach

Use `alternate take first`, not immediate replacement.

Retake should produce a candidate segment take for a selected clip range. The original clip remains unchanged until the user explicitly promotes a candidate. Promotion should only affect the selected span, not the whole clip.

This fits Vision Studio's existing variant and compare model, preserves lineage, and avoids destructive AI edits during generation.

## Alternatives Considered

### 1. Clip-local retake candidates with explicit promotion

- Safest first milestone
- Preserves original media and generation context
- Supports compare, approval, rollback, and alt takes cleanly
- Recommended

### 2. Immediate in-place segment replacement

- Faster apparent workflow
- Too risky because failed or weak retakes would overwrite editorial truth too early
- Makes rollback and comparison harder

### 3. Retake as fully separate timeline clips only

- Strong editorial explicitness
- Too heavy for the first milestone because every retake would fragment the timeline
- Better as a later "explode accepted retakes into clips" tool if needed

## Core Model

### Editorial anchor remains the timeline clip

`TimelineClip` should stay the primary editorial unit. Retake should extend that model instead of replacing it with a new clip system.

### Retake ranges

Each video clip can own zero or more `retakeRanges`.

Recommended fields:

- `id`
- `clipId`
- `startMs`
- `endMs`
- `status`
- `acceptedTakeId`
- `candidateTakeIds`
- `createdAt`
- `updatedAt`

These ranges define where revision is allowed inside the clip.

### Retake takes

Each generated retake candidate should be stored as a `ClipRetakeTake` record.

Recommended fields:

- `id`
- `clipId`
- `retakeRangeId`
- `mediaAssetId`
- `prompt`
- `negativePrompt`
- `model`
- `settings`
- `referenceSetIds`
- `status`
- `createdAt`
- `updatedAt`

This keeps the generation output tied to the editorial parent clip and the exact retake span.

### Acceptance rule

Only one candidate take can be accepted for a range at a time.

- if a range has no accepted take, playback and export use the original clip span
- if a range has an accepted take, playback and export resolve that take for only that selected span
- rejecting or reverting should leave the original clip intact

## UX And Surface Behavior

### Timeline

The timeline should support retake-range authoring on selected video clips:

- `Mark Retake In`
- `Mark Retake Out`
- `Create Retake`
- `Clear Range`

The marked range should render visibly inside the clip, with badges or state markers for:

- draft
- rendering
- candidate
- accepted

### Clip inspector

The inspector should become the main retake control surface for a selected range:

- range start/end
- prompt inherit vs override
- reference summary
- continuity source summary
- `Generate Retake`
- candidate list for the range
- `Compare`
- `Accept`
- `Reject`
- `Revert To Original`

### Center preview

Retake quality is temporal, so preview should support range-scoped compare:

- original editorial result vs candidate take
- synchronized playback inside the selected range
- quick toggle between current result and candidate

### Generation behavior

Retake should reuse the existing timeline video generation path, but scoped by:

- target clip
- selected retake range
- inherited binding and settings by default
- optional prompt override

The result should store as a candidate retake take, not auto-promote into the clip.

### Playback and export

Playback and export should resolve accepted retakes transparently. If a range has an accepted take, that segment wins. Otherwise the original source remains active.

## Failure Handling

The first retake milestone should fail explicitly on:

- no clip selected
- non-video clip selected
- range too short
- missing AI binding or insufficient generation context
- retake generation failure
- accepted retake media missing at playback/export time

No silent fallback that implies a retake was applied when it was not.

## Scope For Milestone One

### Included

- clip-local retake ranges
- candidate retake takes
- inspector and timeline authoring flow
- retake generation through existing video pipeline
- compare, accept, reject, and revert
- playback and export honoring accepted retakes

### Excluded

- automatic destructive replacement during generation
- full timeline clip explosion for accepted retakes
- retake across multiple clips at once
- audio-aware retake continuity
- large-shot restructuring tools

## Rollout Order

1. Retake domain foundations
2. Timeline and inspector authoring flow
3. Retake execution through current video generation path
4. Compare and approval flow
5. Playback/export resolution
6. Verification and cleanup

## Acceptance Bar

This phase is complete when:

- users can mark a retake range on an AI-bound video clip
- retake generation produces candidate segment takes instead of destructive replacement
- users can compare and explicitly accept or reject a candidate
- accepted retakes resolve inside playback and export
- reverting to the original segment is immediate and reliable
