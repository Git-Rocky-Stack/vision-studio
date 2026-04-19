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
