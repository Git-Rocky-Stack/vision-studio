# AI-Native Timeline Design

## Goal

Evolve Vision Studio from an image-first generator with partial video support into an AI-native editor where imported media, generated media, reusable references, and timeline editing all operate inside one coherent workflow.

The target product is not a generic NLE clone and not a disconnected set of prompt panels. It should behave like a real editor while keeping prompts, references, variants, and regenerate-in-place actions as first-class timeline operations.

## Chosen Approach

Use a hybrid scene timeline with gradual side-by-side evolution.

Keep the existing `Project -> Scene` model alive, but introduce a new media and timeline domain beside it:

- imported and generated media become first-class assets
- references become durable reusable objects
- boards gain real sequences, tracks, and clips
- AI-generated clips retain prompt/model/reference bindings
- existing scenes and storyboards bridge into the new domain through adapters instead of a full rewrite

This approach preserves the app's current AI-native structure while enabling true editing behavior.

## Alternatives Considered

### 1. Hybrid scene timeline

- Preserves the current board, scene, prompt, and workflow model.
- Adds real editorial primitives without discarding the current app architecture.
- Recommended.

### 2. NLE-first rewrite

- Promotes bins, tracks, and clips to the top-level model immediately.
- Produces the most conventional editor architecture.
- Forces a much larger rewrite and weakens the product's AI-native differentiation.

### 3. Surface-only timeline expansion

- Adds timeline affordances on top of the current scene model with minimal data changes.
- Fastest short-term.
- Breaks down once imported media, trims, transitions, ripple edits, and clip-level AI actions become real.

## Core Product Principles

The app should follow these rules:

- timeline editing is real, not cosmetic
- imported image and video are first-class assets
- references are durable project resources, not temporary panel state
- AI actions operate on timeline-native clips, not detached side-state
- review, edit, and generation use the same underlying media objects

## Domain Model

Introduce a new domain beside the current scene model.

### MediaAsset

Represents any imported or generated media item.

Expected fields:

- `id`
- `type: 'image' | 'video'`
- `source: 'generated' | 'imported' | 'derived'`
- `path`
- `previewUrl`
- `posterUrl`
- `thumbnailUrl`
- `width`
- `height`
- `durationMs`
- `fps`
- `metadata`
- `createdAt`

### ReferenceSet

Represents a reusable bundle of reference media that can attach at multiple scopes.

Expected fields:

- `id`
- `name`
- `items`
- `scope: 'project' | 'scene' | 'clip' | 'adhoc'`
- typed slots such as `style`, `composition`, `character`, `pose`, `motion`
- optional notes/tags

### TimelineSequence

Represents the editable board timeline.

Expected fields:

- `id`
- `projectId`
- `name`
- `trackIds`
- `durationMs`
- `fps`
- `playRange`

### TimelineTrack

Represents one ordered editorial lane.

Expected fields:

- `id`
- `sequenceId`
- `kind: 'video' | 'image' | 'audio' | 'overlay'`
- `name`
- `clipIds`
- `locked`
- `muted`
- `hidden`

### TimelineClip

Represents one placement of media on the timeline.

Expected fields:

- `id`
- `trackId`
- `mediaAssetId`
- `sceneId | null`
- `startMs`
- `durationMs`
- `sourceInMs`
- `sourceOutMs`
- `transitionIn`
- `transitionOut`
- `label`
- `posterUrl`
- `referenceSetIds`
- `generationBindingId | null`

### ClipGenerationBinding

Represents the AI-native data attached to eligible clips.

Expected fields:

- `id`
- `clipId`
- `prompt`
- `negativePrompt`
- `model`
- `generationType`
- `settings`
- `referenceSetIds`
- `variantIds`
- `lastRunSummary`

## Surface Architecture

The main product surfaces should reorganize around shared media primitives.

### Reference Media

Add a shared reference-media panel that works across still generation, motion generation, and timeline clips.

Requirements:

- support multiple reference items
- support typed slots like `style`, `composition`, `character`, `pose`, and `motion`
- attach references at project, scene, clip, and one-off generation scope
- support promotion from imported assets or extracted frames

### Assets

Assets becomes a real ingest layer, not only a browser for generated outputs.

Required actions:

- import image
- import video
- reveal and export
- mark media as reference
- extract poster
- extract frame
- send media to board
- send frame to edit

### Generate

Generate should become explicitly dual-mode:

- `Still`
- `Motion`

Still mode focuses on image generation, img2img, inpaint, ControlNet, and reusable reference sets.

Motion mode focuses on text-to-video, image-to-video, start/end conditioning, motion references, and output targeted to a board or clip.

### Timeline

Timeline becomes the center of video authoring.

Required behavior:

- multiple tracks
- imported and AI-generated clips in the same sequence
- trim in/out
- move, split, duplicate, and delete clips
- snapping and playhead interaction
- transitions
- range selection
- real playback state
- clip inspector on selection

### Inspector

Inspector becomes context-aware.

When a clip is selected, it should expose:

- media metadata
- trim and transition controls
- attached reference sets
- AI prompt/model settings when the clip is generated
- actions such as `Regenerate In Place`, `Create Variant`, `Extend Shot`, and `Convert Frame To Reference`

## Migration Strategy

Use gradual side-by-side evolution, not an in-place rewrite.

That means:

- keep current project and scene structures working
- introduce the new media/timeline domain additively
- bridge scenes into sequences and clips through adapters
- migrate surfaces one at a time
- collapse older scene-only assumptions only after the new model is proven

Expected adapter paths:

- existing generated outputs map into `MediaAsset`
- existing scene thumbnails map into clip posters
- existing prompt/model metadata maps into `ClipGenerationBinding`
- existing boards/projects map into `TimelineSequence`

## Rollout

### 1. Foundation pass

Add durable media ingest, reference-media entities, and timeline clip primitives.

### 2. Review and playback pass

Upgrade Viewer, Canvas, and Assets so video is actually playable and usable in the main workflow.

### 3. Timeline editing pass

Implement real track and clip editing behavior.

### 4. AI timeline integration pass

Attach prompts, references, regenerate-in-place, image-to-video, extend-shot, and variants to timeline clips.

### 5. Edit-depth pass

Add frame extraction, frame-to-edit round-trip, and richer clip-level editing workflows.

## Risks

The main failure modes are:

- duplicating truth between scene state and clip state
- shipping fake video support that is only metadata
- scattering references back into temporary local component state
- coupling AI actions to unstable editorial primitives too early

## Acceptance Bar

The initiative is only complete when all of these are true:

- imported image and video are first-class assets
- references are reusable and attachable at board, clip, and generation scope
- video is playable and editable in the main review/edit workflow
- timeline operations are real, not cosmetic
- AI generation and regeneration target timeline-native clips

## Out Of Scope For The First Rollout

- full audio workstation features
- collaborative multi-user editing
- cloud render orchestration
- a full replacement of the existing project/scene model on day one
