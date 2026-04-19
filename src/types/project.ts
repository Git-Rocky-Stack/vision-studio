/**
 * Vision Studio - Phase 1 Data Model
 * Project / Scene / Frame / CharacterRef / RegionLock types
 * Based on: 2026-04-13 Storyboard & Surgical AI Design Spec
 */

import type { LoRAConfig, ControlNetConfig } from './generation';
import type { Layer } from './editor';

// ─── Generation Config ──────────────────────────────────────────────────────

export interface GenerationConfig {
  model: string;
  steps: number;          // 1-100, default 25
  cfgScale: number;       // 1-30, default 7.5
  scheduler: string;
  seed: number;           // -1 for random
  width: number;
  height: number;
  clipSkip: number;
  lora: LoRAConfig[];
  controlNet: ControlNetConfig[];
  // Video fields
  videoDuration?: number;       // seconds, 1-10, default 3
  videoFps?: number;            // 8|12|16|24, default 24
  motionStrength?: number;      // 0.1-1.0, default 0.5
  loopVideo?: boolean;          // default false
}

// ─── Project ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  created: string;        // ISO 8601
  modified: string;        // ISO 8601
  dimensions: { width: number; height: number };
  fps: number;            // default 24
  characters: CharacterRef[];
  scenes: Scene[];
  metadata: Record<string, unknown>;
}

// ─── Scene ──────────────────────────────────────────────────────────────────

export type SceneStatus = 'draft' | 'queued' | 'generating' | 'complete' | 'error';

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'zoom';

export interface SceneTransition {
  type: TransitionType;
  duration: number;      // ms
}

export interface Scene {
  id: string;
  orderIndex: number;
  name: string;
  prompt: string;
  negativePrompt: string;
  generationConfig: GenerationConfig;
  referenceImages: ReferenceImage[];
  frames: Frame[];
  regionLocks: RegionLock[];
  transitions: SceneTransition;
  camera: CameraKeyframe[]; // Phase 2 placeholder
  metadata: {
    created: string;      // ISO 8601
    modified: string;      // ISO 8601
    duration: number;      // ms, for video
    fps: number;
    notes: string;
  };
  status: SceneStatus;
  characterRefs: string[];  // CharacterRef IDs assigned to this scene
  thumbnail?: string;        // file path or data URL
}

// ─── Frame ──────────────────────────────────────────────────────────────────

export interface Frame {
  id: string;
  sceneId: string;
  layers: Layer[];
  dimensions: { width: number; height: number };
  duration: number;       // ms, for video frames
  renderOutput: {
    path: string;
    format: string;
    dimensions: { width: number; height: number };
  } | null;
}

// ─── Character Reference ────────────────────────────────────────────────────

export type LockedFeature = 'face' | 'body' | 'style' | 'pose';

export interface CharacterRef {
  id: string;
  projectId: string;
  name: string;
  description: string;
  faceImages: string[];          // file paths, 1-5 required
  bodyImages: string[];          // optional
  styleImages: string[];         // optional
  lockedFeatures: LockedFeature[];
  consistencyStrength: number;   // 0.0-1.0, default 0.85
  color: string;                 // hex, for UI identification
}

// ─── Region Lock ────────────────────────────────────────────────────────────

export type MaskType = 'rectangle' | 'polygon' | 'brush' | 'erase';
export type AITool = 'generative-fill' | 'style-transfer' | 'upscale' | 'remove';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionMask {
  type: MaskType;
  points: Point[];
  bounds: BoundingBox;
  featherRadius: number;   // 0-20px, default 2
  blendEdges: boolean;     // default true
}

export interface RegionLock {
  id: string;
  sceneId: string;
  frameId: string;
  name: string;
  mask: RegionMask;
  targetLayers: string[];       // layer IDs to modify
  protectedLayers: string[];    // layer IDs to preserve
  generationConfig: Partial<GenerationConfig>;
  aiTool: AITool;
  prompt: string;               // for generative-fill and style-transfer
  strength: number;             // 0.0-1.0, default 0.85
  invertMask: boolean;          // default false
}

// ─── Reference Image ────────────────────────────────────────────────────────

export interface ReferenceImage {
  id: string;
  path: string;           // file path or data URL
  type: 'face' | 'body' | 'style' | 'pose' | 'composition';
  label?: string;
}

// ─── Camera Keyframe (Phase 2 placeholder) ──────────────────────────────────

export interface CameraKeyframe {
  id: string;
  time: number;           // ms
  pan: { x: number; y: number };
  zoom: number;
  rotation: number;
}

// ─── Default Values ──────────────────────────────────────────────────────────

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  model: 'stable-diffusion-xl',
  steps: 25,
  cfgScale: 7.5,
  scheduler: 'euler_a',
  seed: -1,
  width: 1024,
  height: 1024,
  clipSkip: 1,
  lora: [],
  controlNet: [],
};

export const DEFAULT_SCENE_TRANSITION: SceneTransition = {
  type: 'cut',
  duration: 0,
};

export const DEFAULT_SCENE_METADATA: Scene['metadata'] = {
  created: '',
  modified: '',
  duration: 0,
  fps: 24,
  notes: '',
};

export const DEFAULT_REGION_MASK: RegionMask = {
  type: 'rectangle',
  points: [],
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  featherRadius: 2,
  blendEdges: true,
};

// Re-exported for convenience - already imported above
export type { LoRAConfig, ControlNetConfig } from './generation';
export type { Layer } from './editor';