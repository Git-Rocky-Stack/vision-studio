/**
 * Timeline engine types for Vision Studio.
 *
 * Supports three modes: storyboard, animation, and canvas.
 * Manages play state, keyframes, onion skin settings, and playback controls.
 */

// ---------------------------------------------------------------------------
// Core enums / union types
// ---------------------------------------------------------------------------

export type TimelineMode = 'storyboard' | 'animation' | 'canvas';

export type PlayState = 'playing' | 'paused' | 'stopped';

export type KeyframeInterpolation = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

export interface Keyframe {
  id: string;
  entityId: string;
  entityType: 'scene' | 'frame' | 'layer';
  property: string;
  time: number;                              // ms
  value: number | { x: number; y: number };
  interpolation: KeyframeInterpolation;
  easingStrength: number;                    // 0.1-1.0
}

// ---------------------------------------------------------------------------
// Timeline Engine State
// ---------------------------------------------------------------------------

export interface TimelineEngineState {
  mode: TimelineMode;
  playState: PlayState;
  currentTime: number;                       // ms
  fps: number;
  loop: boolean;
  speed: number;                             // 0.25, 0.5, 1, 2
  onionSkinEnabled: boolean;
  onionSkinFrameCount: number;               // 1-5
  onionSkinOpacity: number;                  // 0.1-0.5
  onionSkinDirection: 'prev' | 'next' | 'both';
}

// ---------------------------------------------------------------------------
// Keyframe Store State
// ---------------------------------------------------------------------------

export interface KeyframeStoreState {
  keyframes: Keyframe[];
  activeKeyframeId: string | null;
}

// ---------------------------------------------------------------------------
// Timeline authoring domain
// ---------------------------------------------------------------------------

export type TimelineTrackKind = 'video' | 'image' | 'audio' | 'overlay';

export type TimelineTransitionType =
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'wipe-left'
  | 'wipe-right'
  | 'zoom';

export interface TimelineTransition {
  type: TimelineTransitionType;
  durationMs: number;
}

export type TimelineTransitionEdge = 'in' | 'out';

export interface TimelinePlayRange {
  startMs: number;
  endMs: number;
}

export interface TimelineSequence {
  id: string;
  projectId: string;
  name: string;
  trackIds: string[];
  durationMs: number;
  fps: number;
  playRange: TimelinePlayRange | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineTrack {
  id: string;
  sequenceId: string;
  kind: TimelineTrackKind;
  name: string;
  clipIds: string[];
  orderIndex: number;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
}

export interface TimelineBeatMarker {
  id: string;
  sourceBeatId: string;
  label: string;
  promptSeed: string;
  notes: string;
  relativeStartMs: number;
  durationMs: number | null;
  elementIds: string[];
}

export type TimelineClipRetakeRangeStatus =
  | 'draft'
  | 'queued'
  | 'rendering'
  | 'candidate'
  | 'accepted';

export interface TimelineClipRetakeRange {
  id: string;
  clipId: string;
  startMs: number;
  endMs: number;
  status: TimelineClipRetakeRangeStatus;
  acceptedTakeId: string | null;
  candidateTakeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ClipRetakeTakeStatus =
  | 'draft'
  | 'queued'
  | 'rendering'
  | 'candidate'
  | 'accepted'
  | 'rejected'
  | 'failed';

export interface ClipRetakeTake {
  id: string;
  clipId: string;
  retakeRangeId: string;
  mediaAssetId: string | null;
  prompt: string;
  negativePrompt: string;
  model: string;
  settings: Record<string, unknown>;
  referenceSetIds: string[];
  status: ClipRetakeTakeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  mediaAssetId: string;
  sceneId: string | null;
  startMs: number;
  durationMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  transitionIn: TimelineTransition | null;
  transitionOut: TimelineTransition | null;
  gain: number;
  fadeInMs: number;
  fadeOutMs: number;
  label: string;
  posterUrl: string | null;
  referenceSetIds: string[];
  generationBindingId: string | null;
  retakeRanges: TimelineClipRetakeRange[];
  storyboardDerived: boolean;
  storyboardBeatMarkers: TimelineBeatMarker[];
  storyboardDerivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineClipMoveOptions {
  trackId?: string;
  startMs?: number;
  ripple?: boolean;
  snapToFrames?: boolean;
}

export interface TimelineClipTrimOptions {
  startMs?: number;
  endMs?: number;
  ripple?: boolean;
  snapToFrames?: boolean;
}

export interface TimelineSplitResult {
  leftClipId: string;
  rightClipId: string;
}

export interface ClipGenerationRunSummary {
  status: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
  outputMediaAssetId: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ClipGenerationBinding {
  id: string;
  clipId: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  generationType: 'image' | 'video';
  settings: Record<string, unknown>;
  referenceSetIds: string[];
  variantIds: string[];
  lastRunSummary: ClipGenerationRunSummary | null;
}

// ---------------------------------------------------------------------------
// Timeline composition resolver
// ---------------------------------------------------------------------------

export type TimelineCompositionIssueCode =
  | 'play-range-clamped'
  | 'no-active-clip'
  | 'multiple-active-tracks'
  | 'missing-media-asset'
  | 'unsupported-track-kind'
  | 'unsupported-transition'
  | 'transition-target-missing';

export interface TimelineCompositionIssue {
  code: TimelineCompositionIssueCode;
  message: string;
  clipId?: string | null;
  trackId?: string | null;
  transitionType?: TimelineTransitionType | null;
}

export interface TimelineResolvedPlayRange {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface TimelineCompositionLayer {
  clipId: string;
  mediaAssetId: string;
  trackId: string;
  mediaType: 'image' | 'video';
  sourcePath: string;
  posterUrl: string | null;
  opacity: number;
  heldFrame: boolean;
  sourceTimeMs: number;
  clipOffsetMs: number;
}

export interface TimelineCompositionAudioLayer {
  clipId: string;
  mediaAssetId: string;
  trackId: string;
  sourcePath: string;
  sourceTimeMs: number;
  clipOffsetMs: number;
  gain: number;
}

export type TimelineCompositionTransitionKind = 'cut' | 'fade' | 'dissolve' | 'unsupported';

export interface TimelineCompositionTransition {
  kind: TimelineCompositionTransitionKind;
  edge: 'none' | 'in' | 'out';
  progress: number;
  durationMs: number;
  type: TimelineTransitionType | null;
  fromClipId: string | null;
  toClipId: string | null;
}

export interface TimelineCompositionFrame {
  requestedTimeMs: number;
  resolvedTimeMs: number;
  inPlayRange: boolean;
  playRange: TimelineResolvedPlayRange;
  activeTrackId: string | null;
  primaryClipId: string | null;
  layers: TimelineCompositionLayer[];
  audioLayers: TimelineCompositionAudioLayer[];
  transition: TimelineCompositionTransition;
  issues: TimelineCompositionIssue[];
}
