# Timeline Audio Foundation Design

## Goal

Add first-class timeline audio to Vision Studio so imported sound becomes part of the same editing, playback, and export flow as image and video clips.

This phase should make the AI-native timeline feel like a real editorial surface instead of a silent picture editor. The first milestone is intentionally practical:

- import audio into managed assets
- edit audio on real timeline tracks
- hear synchronized playback in the preview flow
- export MP4 with audio included
- no full mixer or DAW behavior yet

## Chosen Approach

Use renderer-authoritative audio editing with backend mux export.

The renderer remains the source of truth for the playhead, active sequence state, trims, fades, mute and solo rules, and what should be audible at a given time. A shared sequence resolver should expand from visual composition into paired visual and audio outputs. Playback uses that resolver live in the app. Export walks the same resolver across the requested range and sends deterministic video frames plus resolved audio layers to the backend for final MP4 encoding.

This keeps preview truth and export truth aligned.

## Alternatives Considered

### 1. Renderer editing and playback with backend audio mux export

- Fits the current timeline architecture.
- Avoids duplicating edit rules in a second runtime.
- Gives a clean path to later automation, audio generation, and richer export.
- Recommended.

### 2. Backend-owned audio engine and composition model

- Strong long-term option for heavier post-production.
- Too large for the first milestone because it duplicates timeline truth outside the editor.
- Would slow delivery without unlocking enough immediate value.

### 3. Loose HTML audio playback now and export support later

- Fastest short-term implementation.
- Creates drift between what the user hears and what the export produces.
- Likely to become rework once export and solo/mute logic mature.

## Core Architecture

### Extend the existing timeline domain

Audio should live in the same timeline domain rather than a parallel subsystem.

#### Media assets

Add real audio asset support to the managed media flow. Audio assets should carry:

- type `audio`
- duration
- source path
- preview metadata
- optional low-resolution waveform summary

Expected first-pass import formats:

- `wav`
- `mp3`
- `m4a`
- `flac`

#### Timeline tracks

The existing `kind: 'audio'` path should become canonical.

Track behavior should include:

- `muted`
- `solo`
- `hidden` for UI only
- ordered clips alongside other timeline lanes

`muted` and `solo` must affect both playback and export.

#### Timeline clips

Keep one clip model and extend it with audio-specific editorial fields:

- `gain`
- `fadeInMs`
- `fadeOutMs`

Existing `sourceInMs` and `sourceOutMs` already fit audio trimming and should remain the canonical trim fields.

### Shared audio-aware resolver

The sequence resolver should produce two synchronized outputs:

- visual frame plan
- audio mix plan

At any `timeMs`, the audio mix plan should resolve:

- active audio clips
- source path
- source time offset
- fade-adjusted gain
- mute and solo state already applied
- explicit unsupported-state issues when needed

Playback and export must both consume this resolver output rather than re-implementing timing rules separately.

### Renderer playback

Renderer playback should keep the playhead authoritative and use a small managed pool of `HTMLAudioElement` instances keyed by active clip or layer identity.

That playback layer should:

- synchronize to the current playhead
- seek on scrub
- stop or pause with transport
- clamp or loop with the active play range
- honor track mute and solo rules

This mirrors the existing video-oriented preview host instead of inventing a separate transport model.

### Backend MP4 export with audio

The current local MP4 export pipeline should be extended rather than replaced.

The renderer should:

- resolve export range
- emit deterministic video frames as it does now
- emit ordered audio layers and mix metadata from the shared resolver

The backend should:

- validate the audio-enabled export request
- decode and trim audio sources
- apply gain and fades
- mix audible layers
- mux mixed audio with the encoded video output into one MP4

## Surface Changes

### Assets

Imported audio files should appear as first-class managed media with:

- clear audio badge
- duration
- waveform or audio placeholder preview

### Timeline

The timeline should support:

- explicit audio track creation
- visually distinct audio clips
- lightweight waveform previews
- clip-level mute and solo context via track controls
- visible fade and gain state when changed from defaults

This should remain an editorial surface, not a standalone mixer panel.

### Clip inspector

When the selected clip is audio, the existing inspector should expose:

- source in/out
- gain
- fade in
- fade out
- move playhead to clip boundaries

This should reuse the current inspector rather than branching into a separate audio settings pane.

### Playback preview

The center preview should stay video-first, but it should surface compact audio state:

- active audio clip count
- mute or solo summary
- lightweight level or activity readout

This milestone does not need a full mixer.

### Export

The existing export flow should remain local and explicit, but when audible audio is present it should export `MP4 with audio` instead of silent-only video.

Progress, save destination, and success or failure behavior should remain consistent with the current export UX.

## Waveforms

Waveforms should use generated low-resolution summaries cached on the media asset for milestone one.

This gives the timeline enough visual editing feedback without overbuilding a full sample-accurate analysis or rendering pipeline.

## Failure Handling

The first audio milestone must be explicit about:

- missing audio files
- unsupported decode formats
- export mux failure
- sequence with audio present but nothing audible because of mute or solo rules
- playback seek or decode failure

No silent downgrade that implies audio exported correctly when it did not.

## Scope For Milestone One

### Included

- managed audio asset import
- audio timeline tracks
- audio clip placement and trimming
- gain and basic fades
- track mute and solo
- synchronized renderer playback
- MP4 export with mixed audio

### Excluded

- keyframed automation
- buses or submix routing
- effects rack or plugin chain
- voice generation or music generation
- live recording
- standalone mixer workspace

## Risks

Main risks:

- preview audio drifts from export audio
- scrub and seek behavior feels unstable
- solo and mute rules diverge across UI, playback, and export
- backend mux path becomes fragile with mixed local media formats

## Acceptance Bar

This phase is complete when:

- audio imports cleanly into the asset flow
- users can place and edit audio clips on dedicated tracks
- playback stays synchronized with the timeline playhead
- gain, fades, mute, and solo are respected
- MP4 export includes the expected audio mix
- preview and export rely on the same audio-aware resolver
