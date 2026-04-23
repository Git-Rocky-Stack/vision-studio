# Storyboard To Timeline Derivation Design

## Goal

Add an explicit `Build Timeline From Storyboard` flow that turns approved storyboard scenes into real timeline clips without letting import heuristics take over the edit.

This milestone should:

- derive one timeline clip per approved scene
- preserve `shotBeats` as clip-level beat markers and metadata
- reuse or create the project timeline sequence safely
- keep derivation idempotent and append-safe
- preserve scene, Element, and reference context for later generation

The first pass is intentionally conservative:

- no automatic beat-to-clip explosion
- no destructive overwrite of manually edited clips
- no bidirectional sync from timeline edits back into storyboard

## Chosen Approach

Use a scene-first derivation flow with beat-aware metadata.

Each approved storyboard scene should map to one primary derived timeline clip in the active sequence. The clip should carry:

- `sceneId`
- source media when available
- linked reference and Element context
- ordered beat markers derived from `scene.shotBeats`

The derivation should be explicit, not automatic. Users trigger it from storyboard, review the result summary, then continue editing in timeline if they want finer granularity.

This keeps storyboard as the planning source of truth while making timeline a safe downstream consumer.

## Alternatives Considered

### 1. Scene-first derivation with beat markers

- Fits the current clip-centric timeline model.
- Keeps import heuristics advisory instead of authoritative.
- Preserves a clean path to later `Expand Scene Into Beat Clips`.
- Recommended.

### 2. One timeline clip per shot beat

- More granular immediately.
- Too brittle for imported text because beat extraction is still heuristic.
- Likely creates noisy timelines full of tiny clips the user has to clean up.

### 3. Fully automatic storyboard-to-timeline sync

- Lower interaction cost on paper.
- High risk of duplicating or moving user-edited clips.
- Makes timeline feel unstable once manual editorial work begins.

## Core Architecture

### New derived beat marker metadata

Add a lightweight beat marker model to the timeline domain so derived clips can retain storyboard beat structure without fragmenting into many clips.

Expected first-pass structure:

- `TimelineBeatMarker`
- `id`
- `sourceBeatId`
- `label`
- `promptSeed`
- `notes`
- `relativeStartMs`
- `durationMs | null`
- `elementIds`

Each derived clip should gain additive metadata for:

- `storyboardDerived: boolean`
- `storyboardBeatMarkers: TimelineBeatMarker[]`
- optional derivation bookkeeping such as `storyboardDerivedAt`

### Explicit derivation service

Create a dedicated derivation service under `src/features/timeline/` that:

- finds the active project and approved scenes
- ensures a timeline sequence exists for the project
- derives or updates one primary clip per scene for that sequence
- preserves `scene.timelineClipIds` backreferences
- returns a result summary like `added`, `updated`, `skipped`, and `placeholders`

The derivation must be idempotent. Re-running `Build Timeline` should not duplicate scenes already represented by a primary derived clip in the same sequence.

### Media source resolution

Clip source resolution order should be:

1. latest generated scene output if available
2. accepted or selected scene frame if available
3. otherwise create a valid placeholder storyboard clip with no media

Placeholder clips are allowed and should surface as placeholders in the result summary, not as failures.

### Timing rules

The first pass should use scene-level defaults, not speculative beat timing.

- image-backed scene clips use a default duration such as `2000ms` or the current project default
- video-backed scene clips use their source duration
- beat markers store relative offsets only
- beats without enough timing information become point markers, not segment clips

## Interaction Model

### Storyboard entry points

Add explicit derivation entry points:

- project-level `Build Timeline` in `StoryboardPanel`
- optional per-scene `Send To Timeline` on scene cards

The default bulk action should be `append missing scenes only`.

### Result feedback

After derivation, show a compact summary such as:

- `3 scenes added`
- `2 scenes updated`
- `1 scene skipped`
- `2 placeholders created`

That summary should make it obvious that existing timeline work was respected.

### Timeline visibility

Derived clips should be clearly visible in timeline and inspector UI.

Timeline and inspector should show:

- that the clip came from storyboard
- the source scene name
- the ordered beat markers
- any placeholder or missing-media state

The first pass should not fake later actions. If `Expand Into Beat Clips` is not implemented yet, leave it out or label it as future work elsewhere.

## Migration Strategy

Keep this additive and compatibility-safe.

- scenes remain canonical for approved storyboard structure
- timeline consumes scenes through an explicit derivation action
- `scene.shotBeats` stay canonical on the storyboard side
- derived timeline beat markers are downstream copies for edit visibility only

Timeline edits should not mutate storyboard shot beats in this milestone.

## Scope For Milestone One

### Included

- explicit storyboard-to-timeline derivation action
- one primary timeline clip per approved scene
- idempotent reuse/update behavior
- scene-linked beat markers on derived clips
- placeholder clip creation for scenes without media
- derivation summary feedback
- timeline and inspector visibility for derived metadata

### Excluded

- one clip per shot beat
- automatic continuous sync between storyboard and timeline
- overwrite of manual clip trims, moves, or transitions
- bidirectional timeline-to-storyboard updates
- automatic beat timing inference beyond marker offsets
- `Expand Scene Into Beat Clips`
