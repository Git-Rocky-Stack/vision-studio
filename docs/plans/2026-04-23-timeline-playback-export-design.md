# Timeline Playback And Export Design

## Goal

Add real silent sequence playback and local MP4 export to Vision Studio's AI-native timeline without replacing the existing timeline/editor model that just landed.

This phase should make the timeline feel like an actual finishing surface instead of a clip organizer. The first milestone is intentionally narrow:

- silent playback only
- local MP4 export only
- no GIF export
- no image-sequence export
- no audio yet

## Chosen Approach

Use renderer-authoritative playback with backend MP4 encoding.

The renderer remains the source of truth for timeline state, playhead movement, and what is visible at a given time. A shared sequence composition resolver decides which clip is active and how transitions behave. Playback uses that resolver live in the UI. Export walks the same resolver across the requested range and sends deterministic frames to the backend for MP4 encoding.

This keeps preview truth and export truth aligned.

## Alternatives Considered

### 1. Renderer playback plus backend export

- Keeps composition logic close to the existing timeline UI and store.
- Avoids duplicating timeline rules in multiple runtimes.
- Gives a clean path to later audio and higher-fidelity export.
- Recommended.

### 2. Pure renderer capture with MediaRecorder

- Fastest to ship.
- Too fragile for deterministic export.
- DOM timing, video seek timing, and transition correctness would drift.

### 3. Headless backend or Electron composition engine

- Strong long-term architecture for industrial rendering.
- Too large for the first playback/export milestone.
- Would duplicate timeline composition rules before the product even stabilizes.

## Core Architecture

### Shared sequence composition resolver

Add one resolver that answers:

- which clips are active at `timeMs`
- which clip is the visible program output
- what source time should be used for a trimmed video clip
- whether a transition blend is active
- what export range should be rendered

The resolver should be deterministic and pure enough to test directly.

Expected first-pass inputs:

- `TimelineSequence`
- `TimelineTrack[]`
- `TimelineClip[]`
- `MediaAsset[]`
- `timeMs`

Expected first-pass outputs:

- visible clip record
- source media path
- source media time or held-frame state
- transition blend metadata
- unsupported-state flags

### Renderer playback

Playback should use the current store timeline state:

- `playState`
- `currentTime`
- `timelineFps`
- `timelineLoop`
- active sequence
- play range

The renderer should advance the playhead, clamp to play range, and render a single silent program output for the center preview.

### Backend MP4 export

Export should remain local and use the existing Python/video toolchain already present in the backend.

The renderer should:

- resolve the export range
- walk playback time frame-by-frame
- capture or render the resolved frame output
- submit that ordered frame sequence plus FPS and output path to the backend

The backend should:

- validate the export request
- encode the received frame sequence to MP4
- report progress and failures back through Electron

## Scope For Milestone One

### Included

- real sequence playback in the app
- silent program preview
- play/pause/stop transport
- jump to play-range start/end
- frame-step forward/back
- local MP4 export
- support for image clips and video clips
- support for trims and play range
- support for `cut`, `fade`, and `dissolve`

### Excluded

- audio tracks and audio export
- GIF export
- image-sequence export
- overlay compositing tracks
- multi-layer scene compositing
- transitions beyond the supported first set
- headless server-side timeline composition

## Surface Changes

### Timeline

Add real transport controls:

- play/pause
- stop
- jump to range start
- jump to range end
- step backward one frame
- step forward one frame
- export MP4

The timeline should clearly reflect when playback or export is active.

### Center preview

Add a sequence preview mode that renders the active sequence output at the current playhead time.

This preview is not a generic asset viewer. It is the resolved program output of the timeline.

### Export flow

The first export UX should:

- choose a destination file
- export the active play range when present, otherwise the whole sequence
- show progress
- show explicit failure messages
- reveal the exported file on success

## Rendering Rules

### Image clips

- behave as held frames across clip duration
- respect `sourceInMs` and `sourceOutMs` as clip-local timing metadata only

### Video clips

- seek against trimmed source time
- respect `sourceInMs` and `sourceOutMs`
- fail visibly if local media is missing or cannot be decoded

### Transitions

For milestone one:

- `cut` switches directly
- `fade` blends to black and back through the cut window
- `dissolve` crossfades between adjacent clips

Unsupported transitions should not silently export wrong output. They should be rejected or downgraded explicitly.

## Error Handling

The first milestone must be explicit about:

- missing source files
- unsupported media or transition types
- invalid export range
- backend encoder failure
- cancelled export
- preview decode failure

No silent fallback to a still image if video playback/export is expected.

## Testing Strategy

Add test coverage for:

- composition resolver at key playhead times
- trimmed video time mapping
- play-range clamping and loop behavior
- transition decisions at boundaries
- playback transport state changes
- export request assembly
- export error propagation

## Risks

Main risks:

- playback logic diverges from export logic
- video seek timing feels inconsistent in preview
- export path becomes coupled to DOM quirks instead of deterministic state
- unsupported transitions get partially rendered instead of rejected cleanly

## Acceptance Bar

This phase is complete when:

- timeline playback renders real sequence output
- playhead and transport controls behave predictably
- image and video clips both preview correctly
- local MP4 export works for the supported subset
- preview and export use the same composition resolver
