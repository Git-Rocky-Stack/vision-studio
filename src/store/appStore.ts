import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AppState } from './appStore.types';
import type { ProjectTemplate } from '@/types/template';
import {
  DEFAULT_CANVAS_CONTROL_LAYER_MASK,
  DEFAULT_REGION_MASK,
  type CanvasControlLayer,
  type Element,
  type ImportDraft,
  type ImportDraftElementCandidate,
  type ImportDraftIssue,
  type ImportDraftScene,
  type Project,
  type RegionMask,
  type SceneShotBeat,
  type Scene,
} from '@/types/project';
import type {
  TimelineBeatMarker,
  TimelineClip,
} from '@/types/timeline';
import {
  LEFT_DOCK_MAX_WIDTH,
  LEFT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_MAX_WIDTH,
  RIGHT_DOCK_MIN_WIDTH,
  clampDockWidth,
  createDefaultLayoutPreferences,
  normalizeCollapsedGenerateSections,
  normalizeReviewDensity,
} from './layoutPreferences';

// Slice imports
import { uiInitialState, createUIActions } from './slices/uiSlice';
import { editInitialState, createEditActions } from './slices/editSlice';
import { generationInitialState, createGenerationActions } from './slices/generationSlice';
import { projectInitialState, createProjectActions } from './slices/projectSlice';
import { workflowInitialState, createWorkflowActions } from './slices/workflowSlice';
import { promptStudioInitialState, createPromptStudioActions } from './slices/promptStudioSlice';
import { generationPreviewInitialState, createGenerationPreviewActions } from './slices/generationPreviewSlice';
import { iterationInitialState, createIterationActions } from './slices/iterationSlice';
import { collectionsInitialState, createCollectionsActions } from './slices/collectionsSlice';
import { mediaTimelineInitialState, createMediaTimelineActions } from './slices/mediaTimelineSlice';
import { timelineInitialState, createTimelineActions } from './slices/timelineSlice';
import { pipelineInitialState, createPipelineActions } from './slices/pipelineSlice';

// Re-exports: local types
export type {
  RecentProject,
  GenerationJobParams,
  GenerationJobResult,
  GenerationJob,
  BatchJob,
} from './appStore.types';

// Re-exports: external types (backward compat for consumers importing from this module)
export type {
  WorkflowStepState,
  WorkflowStepRecord,
  WorkflowRunRecord,
  WorkflowRunInput,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphInput,
  WorkflowGraphEdge,
  WorkflowRecord,
} from '@/types/workflow';

export type { ProjectTemplate } from '@/types/template';
export type { ModelInfo, ModelStatus } from '@/types/model';

// Re-exports: constants now owned by slices
export { DEFAULT_WORKFLOWS } from './slices/workflowSlice';

function createMemoryStorage(): StateStorage {
  const storage = new Map<string, string>();

  return {
    getItem: (name) => storage.get(name) ?? null,
    setItem: (name, value) => {
      storage.set(name, value);
    },
    removeItem: (name) => {
      storage.delete(name);
    },
  };
}

const nodeTestStorage = createMemoryStorage();

function normalizeRegionMask(mask: Partial<RegionMask> | undefined): RegionMask {
  const source = mask ?? DEFAULT_REGION_MASK;

  return {
    type: source.type ?? DEFAULT_REGION_MASK.type,
    points: Array.isArray(source.points)
      ? source.points.map((point) => ({
          x: typeof point?.x === 'number' ? point.x : 0,
          y: typeof point?.y === 'number' ? point.y : 0,
        }))
      : [],
    bounds: {
      x: typeof source.bounds?.x === 'number' ? source.bounds.x : DEFAULT_REGION_MASK.bounds.x,
      y: typeof source.bounds?.y === 'number' ? source.bounds.y : DEFAULT_REGION_MASK.bounds.y,
      width:
        typeof source.bounds?.width === 'number'
          ? source.bounds.width
          : DEFAULT_REGION_MASK.bounds.width,
      height:
        typeof source.bounds?.height === 'number'
          ? source.bounds.height
          : DEFAULT_REGION_MASK.bounds.height,
    },
    featherRadius:
      typeof source.featherRadius === 'number'
        ? source.featherRadius
        : DEFAULT_REGION_MASK.featherRadius,
    blendEdges:
      typeof source.blendEdges === 'boolean'
        ? source.blendEdges
        : DEFAULT_REGION_MASK.blendEdges,
  };
}

function normalizeCanvasControlLayer(
  layer: Partial<CanvasControlLayer> | undefined,
  sceneId: string,
): CanvasControlLayer | null {
  if (!layer || typeof layer.id !== 'string' || layer.id.length === 0) {
    return null;
  }

  return {
    id: layer.id,
    sceneId,
    name: typeof layer.name === 'string' && layer.name.length > 0 ? layer.name : 'Control Layer',
    type:
      layer.type === 'reference-image' || layer.type === 'inpaint-mask' || layer.type === 'controlnet'
        ? layer.type
        : 'controlnet',
    mask: normalizeRegionMask(layer.mask ?? DEFAULT_CANVAS_CONTROL_LAYER_MASK),
    visible: typeof layer.visible === 'boolean' ? layer.visible : true,
    opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
    previewTint:
      typeof layer.previewTint === 'string' && layer.previewTint.length > 0
        ? layer.previewTint
        : '#d1d5db',
    sourceMediaAssetId:
      typeof layer.sourceMediaAssetId === 'string' ? layer.sourceMediaAssetId : undefined,
    sourcePath: typeof layer.sourcePath === 'string' ? layer.sourcePath : undefined,
    referenceSetId: typeof layer.referenceSetId === 'string' ? layer.referenceSetId : undefined,
    preprocessor: typeof layer.preprocessor === 'string' ? layer.preprocessor : undefined,
    weight: typeof layer.weight === 'number' ? layer.weight : undefined,
    startStep: typeof layer.startStep === 'number' ? layer.startStep : undefined,
    endStep: typeof layer.endStep === 'number' ? layer.endStep : undefined,
    controlMode: typeof layer.controlMode === 'string' ? layer.controlMode : undefined,
    prompt: typeof layer.prompt === 'string' ? layer.prompt : undefined,
    negativePrompt:
      typeof layer.negativePrompt === 'string' ? layer.negativePrompt : undefined,
    metadata:
      layer.metadata && typeof layer.metadata === 'object'
        ? { ...(layer.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeElement(
  element: Partial<Element> | undefined,
  projectId: string,
): Element | null {
  if (!element || typeof element.id !== 'string' || element.id.length === 0) {
    return null;
  }

  return {
    id: element.id,
    projectId,
    type:
      element.type === 'character' ||
      element.type === 'object' ||
      element.type === 'location' ||
      element.type === 'style'
        ? element.type
        : 'character',
    name: typeof element.name === 'string' && element.name.length > 0 ? element.name : 'Untitled Element',
    aliases: Array.isArray(element.aliases)
      ? element.aliases.filter((value): value is string => typeof value === 'string')
      : [],
    description: typeof element.description === 'string' ? element.description : '',
    tags: Array.isArray(element.tags)
      ? element.tags.filter((value): value is string => typeof value === 'string')
      : [],
    continuityNotes: typeof element.continuityNotes === 'string' ? element.continuityNotes : '',
    referenceSetIds: Array.isArray(element.referenceSetIds)
      ? element.referenceSetIds.filter((value): value is string => typeof value === 'string')
      : [],
    heroMediaAssetId:
      typeof element.heroMediaAssetId === 'string' ? element.heroMediaAssetId : null,
    status:
      element.status === 'approved' || element.status === 'archived' || element.status === 'draft'
        ? element.status
        : 'draft',
    color: typeof element.color === 'string' && element.color.length > 0 ? element.color : '#9ca3af',
    metadata:
      element.metadata && typeof element.metadata === 'object'
        ? { ...(element.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeSceneShotBeat(shotBeat: Partial<SceneShotBeat> | undefined): SceneShotBeat | null {
  if (!shotBeat || typeof shotBeat.id !== 'string' || shotBeat.id.length === 0) {
    return null;
  }

  return {
    id: shotBeat.id,
    summary: typeof shotBeat.summary === 'string' ? shotBeat.summary : '',
    promptSeed: typeof shotBeat.promptSeed === 'string' ? shotBeat.promptSeed : '',
    notes: typeof shotBeat.notes === 'string' ? shotBeat.notes : '',
    orderIndex: typeof shotBeat.orderIndex === 'number' ? shotBeat.orderIndex : 0,
    durationMs: typeof shotBeat.durationMs === 'number' ? shotBeat.durationMs : null,
    elementIds: Array.isArray(shotBeat.elementIds)
      ? shotBeat.elementIds.filter((value): value is string => typeof value === 'string')
      : [],
    metadata:
      shotBeat.metadata && typeof shotBeat.metadata === 'object'
        ? { ...(shotBeat.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeTimelineBeatMarker(
  marker: Partial<TimelineBeatMarker> | undefined,
): TimelineBeatMarker | null {
  if (!marker || typeof marker.id !== 'string' || marker.id.length === 0) {
    return null;
  }

  return {
    id: marker.id,
    sourceBeatId:
      typeof marker.sourceBeatId === 'string' && marker.sourceBeatId.length > 0
        ? marker.sourceBeatId
        : marker.id,
    label: typeof marker.label === 'string' ? marker.label : '',
    promptSeed: typeof marker.promptSeed === 'string' ? marker.promptSeed : '',
    notes: typeof marker.notes === 'string' ? marker.notes : '',
    relativeStartMs:
      typeof marker.relativeStartMs === 'number' && Number.isFinite(marker.relativeStartMs)
        ? Math.max(0, Math.round(marker.relativeStartMs))
        : 0,
    durationMs:
      typeof marker.durationMs === 'number' && Number.isFinite(marker.durationMs)
        ? Math.max(0, Math.round(marker.durationMs))
        : null,
    elementIds: Array.isArray(marker.elementIds)
      ? marker.elementIds.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function normalizeTimelineClip(clip: Partial<TimelineClip> | undefined): TimelineClip | null {
  if (
    !clip ||
    typeof clip.id !== 'string' ||
    clip.id.length === 0 ||
    typeof clip.trackId !== 'string' ||
    clip.trackId.length === 0 ||
    typeof clip.mediaAssetId !== 'string' ||
    clip.mediaAssetId.length === 0
  ) {
    return null;
  }

  const storyboardBeatMarkers = Array.isArray(clip.storyboardBeatMarkers)
    ? clip.storyboardBeatMarkers
        .map((marker) => normalizeTimelineBeatMarker(marker))
        .filter((marker): marker is TimelineBeatMarker => Boolean(marker))
    : [];
  const storyboardDerived =
    typeof clip.storyboardDerived === 'boolean'
      ? (clip.storyboardDerived || storyboardBeatMarkers.length > 0)
      : storyboardBeatMarkers.length > 0;

  return {
    id: clip.id,
    trackId: clip.trackId,
    mediaAssetId: clip.mediaAssetId,
    sceneId: typeof clip.sceneId === 'string' ? clip.sceneId : null,
    startMs:
      typeof clip.startMs === 'number' && Number.isFinite(clip.startMs)
        ? Math.max(0, Math.round(clip.startMs))
        : 0,
    durationMs:
      typeof clip.durationMs === 'number' && Number.isFinite(clip.durationMs)
        ? Math.max(0, Math.round(clip.durationMs))
        : 0,
    sourceInMs:
      typeof clip.sourceInMs === 'number' && Number.isFinite(clip.sourceInMs)
        ? Math.max(0, Math.round(clip.sourceInMs))
        : 0,
    sourceOutMs:
      typeof clip.sourceOutMs === 'number' && Number.isFinite(clip.sourceOutMs)
        ? Math.max(0, Math.round(clip.sourceOutMs))
        : 0,
    transitionIn: clip.transitionIn ?? null,
    transitionOut: clip.transitionOut ?? null,
    label: typeof clip.label === 'string' ? clip.label : 'Timeline Clip',
    posterUrl: typeof clip.posterUrl === 'string' ? clip.posterUrl : null,
    referenceSetIds: Array.isArray(clip.referenceSetIds)
      ? clip.referenceSetIds.filter((value): value is string => typeof value === 'string')
      : [],
    generationBindingId:
      typeof clip.generationBindingId === 'string' ? clip.generationBindingId : null,
    storyboardDerived,
    storyboardBeatMarkers,
    storyboardDerivedAt:
      storyboardDerived
        ? (
            typeof clip.storyboardDerivedAt === 'string'
              ? clip.storyboardDerivedAt
              : (typeof clip.updatedAt === 'string' ? clip.updatedAt : null)
          )
        : null,
    createdAt: typeof clip.createdAt === 'string' ? clip.createdAt : '',
    updatedAt: typeof clip.updatedAt === 'string' ? clip.updatedAt : '',
  };
}

function normalizeTimelineClips(timelineClips: TimelineClip[] | undefined): TimelineClip[] {
  if (!Array.isArray(timelineClips)) {
    return [];
  }

  return timelineClips
    .map((clip) => normalizeTimelineClip(clip))
    .filter((clip): clip is TimelineClip => Boolean(clip));
}

function normalizeImportDraftIssue(
  issue: Partial<ImportDraftIssue> | undefined,
): ImportDraftIssue | null {
  if (!issue || typeof issue.id !== 'string' || issue.id.length === 0) {
    return null;
  }

  return {
    id: issue.id,
    severity:
      issue.severity === 'info' || issue.severity === 'warning' || issue.severity === 'error'
        ? issue.severity
        : 'warning',
    code: typeof issue.code === 'string' ? issue.code : 'import-issue',
    message: typeof issue.message === 'string' ? issue.message : '',
    targetId: typeof issue.targetId === 'string' ? issue.targetId : undefined,
  };
}

function normalizeImportDraftElementCandidate(
  candidate: Partial<ImportDraftElementCandidate> | undefined,
): ImportDraftElementCandidate | null {
  if (!candidate || typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    type:
      candidate.type === 'character' ||
      candidate.type === 'object' ||
      candidate.type === 'location' ||
      candidate.type === 'style'
        ? candidate.type
        : 'character',
    name:
      typeof candidate.name === 'string' && candidate.name.length > 0
        ? candidate.name
        : 'Untitled Element',
    aliases: Array.isArray(candidate.aliases)
      ? candidate.aliases.filter((value): value is string => typeof value === 'string')
      : [],
    description: typeof candidate.description === 'string' ? candidate.description : '',
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((value): value is string => typeof value === 'string')
      : [],
    continuityNotes:
      typeof candidate.continuityNotes === 'string' ? candidate.continuityNotes : '',
    referenceSetIds: Array.isArray(candidate.referenceSetIds)
      ? candidate.referenceSetIds.filter((value): value is string => typeof value === 'string')
      : [],
    heroMediaAssetId:
      typeof candidate.heroMediaAssetId === 'string' ? candidate.heroMediaAssetId : null,
    color:
      typeof candidate.color === 'string' && candidate.color.length > 0
        ? candidate.color
        : '#9ca3af',
    mergeTargetElementId:
      typeof candidate.mergeTargetElementId === 'string' ? candidate.mergeTargetElementId : null,
    accepted: typeof candidate.accepted === 'boolean' ? candidate.accepted : true,
    metadata:
      candidate.metadata && typeof candidate.metadata === 'object'
        ? { ...(candidate.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeImportDraftScene(
  sceneDraft: Partial<ImportDraftScene> | undefined,
): ImportDraftScene | null {
  if (!sceneDraft || typeof sceneDraft.id !== 'string' || sceneDraft.id.length === 0) {
    return null;
  }

  return {
    id: sceneDraft.id,
    name: typeof sceneDraft.name === 'string' && sceneDraft.name.length > 0 ? sceneDraft.name : 'Untitled Scene',
    summary: typeof sceneDraft.summary === 'string' ? sceneDraft.summary : '',
    promptSeed: typeof sceneDraft.promptSeed === 'string' ? sceneDraft.promptSeed : '',
    notes: typeof sceneDraft.notes === 'string' ? sceneDraft.notes : '',
    orderIndex: typeof sceneDraft.orderIndex === 'number' ? sceneDraft.orderIndex : 0,
    elementCandidateIds: Array.isArray(sceneDraft.elementCandidateIds)
      ? sceneDraft.elementCandidateIds.filter((value): value is string => typeof value === 'string')
      : [],
    shotBeats: Array.isArray(sceneDraft.shotBeats)
      ? sceneDraft.shotBeats
          .map((shotBeat) => normalizeSceneShotBeat(shotBeat))
          .filter((shotBeat): shotBeat is SceneShotBeat => Boolean(shotBeat))
      : [],
    accepted: typeof sceneDraft.accepted === 'boolean' ? sceneDraft.accepted : true,
    metadata:
      sceneDraft.metadata && typeof sceneDraft.metadata === 'object'
        ? { ...(sceneDraft.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeStoryboardImportDraft(
  draft: Partial<ImportDraft> | undefined,
): ImportDraft | null {
  if (
    !draft ||
    typeof draft.id !== 'string' ||
    draft.id.length === 0 ||
    typeof draft.projectId !== 'string' ||
    draft.projectId.length === 0
  ) {
    return null;
  }

  return {
    id: draft.id,
    projectId: draft.projectId,
    title: typeof draft.title === 'string' ? draft.title : '',
    sourceText: typeof draft.sourceText === 'string' ? draft.sourceText : '',
    sceneDrafts: Array.isArray(draft.sceneDrafts)
      ? draft.sceneDrafts
          .map((sceneDraft) => normalizeImportDraftScene(sceneDraft))
          .filter((sceneDraft): sceneDraft is ImportDraftScene => Boolean(sceneDraft))
      : [],
    elementDrafts: Array.isArray(draft.elementDrafts)
      ? draft.elementDrafts
          .map((candidate) => normalizeImportDraftElementCandidate(candidate))
          .filter((candidate): candidate is ImportDraftElementCandidate => Boolean(candidate))
      : [],
    issues: Array.isArray(draft.issues)
      ? draft.issues
          .map((issue) => normalizeImportDraftIssue(issue))
          .filter((issue): issue is ImportDraftIssue => Boolean(issue))
      : [],
    status:
      draft.status === 'reviewing' || draft.status === 'approved' || draft.status === 'draft'
        ? draft.status
        : 'draft',
    createdAt: typeof draft.createdAt === 'string' ? draft.createdAt : '',
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : '',
    metadata:
      draft.metadata && typeof draft.metadata === 'object'
        ? { ...(draft.metadata as Record<string, unknown>) }
        : {},
  };
}

function normalizeStoryboardImportDrafts(importDrafts: ImportDraft[] | undefined): ImportDraft[] {
  if (!Array.isArray(importDrafts)) {
    return [];
  }

  return importDrafts
    .map((draft) => normalizeStoryboardImportDraft(draft))
    .filter((draft): draft is ImportDraft => Boolean(draft));
}

function normalizeScene(scene: Scene): Scene {
  const canvasControlLayers = Array.isArray(scene.canvasControlLayers)
    ? scene.canvasControlLayers
        .map((layer) => normalizeCanvasControlLayer(layer, scene.id))
        .filter((layer): layer is CanvasControlLayer => Boolean(layer))
    : [];

  const activeCanvasControlLayerId =
    typeof scene.activeCanvasControlLayerId === 'string' &&
    canvasControlLayers.some((layer) => layer.id === scene.activeCanvasControlLayerId)
      ? scene.activeCanvasControlLayerId
      : (canvasControlLayers[0]?.id ?? null);

  return {
    ...scene,
    referenceSetIds: Array.isArray(scene.referenceSetIds) ? scene.referenceSetIds : [],
    elementIds: Array.isArray(scene.elementIds) ? scene.elementIds : [],
    shotBeats: Array.isArray(scene.shotBeats)
      ? scene.shotBeats
          .map((shotBeat) => normalizeSceneShotBeat(shotBeat))
          .filter((shotBeat): shotBeat is SceneShotBeat => Boolean(shotBeat))
      : [],
    timelineClipIds: Array.isArray(scene.timelineClipIds) ? scene.timelineClipIds : [],
    canvasControlLayers,
    activeCanvasControlLayerId,
  };
}

function normalizeProjects(projects: Project[] | undefined): Project[] {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects.map((project) => ({
    ...project,
    elements: Array.isArray(project.elements)
      ? project.elements
          .map((element) => normalizeElement(element, project.id))
          .filter((element): element is Element => Boolean(element))
      : [],
    referenceSetIds: Array.isArray(project.referenceSetIds) ? project.referenceSetIds : [],
    scenes: Array.isArray(project.scenes) ? project.scenes.map((scene) => normalizeScene(scene)) : [],
  }));
}

function getPersistStorage(): StateStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }

    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage;
    }
  } catch {
    // Some browser contexts expose localStorage but deny access.
  }

  return nodeTestStorage;
}

// Predefined project templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'High-impact 1280x720 thumbnail for YouTube videos',
    category: 'youtube',
    thumbnail: 'YT',
    settings: {
      width: 1280, height: 720, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'cinematic YouTube thumbnail, dramatic lighting, bold text overlay area, professional, high contrast, vibrant colors',
      negativePrompt: 'blurry, low quality, distorted, ugly'
    }
  },
  {
    id: 'tiktok-vertical',
    name: 'TikTok/Reels',
    description: '9:16 vertical format for short-form video',
    category: 'social',
    thumbnail: '9:16',
    settings: {
      width: 720, height: 1280, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'vertical mobile content, vibrant colors, eye-catching, social media style, modern aesthetic',
      negativePrompt: 'horizontal, landscape, blurry'
    }
  },
  {
    id: 'instagram-square',
    name: 'Instagram Post',
    description: '1:1 square format for Instagram feed',
    category: 'social',
    thumbnail: '1:1',
    settings: {
      width: 1080, height: 1080, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'Instagram aesthetic, cohesive color palette, lifestyle photography style, polished, engaging',
      negativePrompt: 'low resolution, blurry, distorted'
    }
  },
  {
    id: 'story-vertical',
    name: 'Stories',
    description: '9:16 format for Instagram/Facebook Stories',
    category: 'social',
    thumbnail: 'ST',
    settings: {
      width: 1080, height: 1920, model: 'flux-dev', steps: 20, cfgScale: 7.0,
      prompt: 'story format, immersive, full screen, engaging, social media story aesthetic',
      negativePrompt: 'text, watermark, logo'
    }
  },
  {
    id: 'cinematic-wide',
    name: 'Cinematic Wide',
    description: '16:9 widescreen for cinematic content',
    category: 'art',
    thumbnail: 'CIN',
    settings: {
      width: 1920, height: 1080, model: 'flux-dev', steps: 30, cfgScale: 7.5,
      prompt: 'cinematic composition, film grain, anamorphic lens, dramatic lighting, movie still, high production value',
      negativePrompt: 'amateur, low quality, distorted, fisheye'
    }
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Clean professional product photography',
    category: 'marketing',
    thumbnail: 'PRD',
    settings: {
      width: 1024, height: 1024, model: 'flux-dev', steps: 30, cfgScale: 8.0,
      prompt: 'professional product photography, clean background, studio lighting, commercial quality, sharp focus',
      negativePrompt: 'cluttered background, harsh shadows, blurry, amateur'
    }
  },
  {
    id: 'portrait-mode',
    name: 'AI Portrait',
    description: 'Optimized for AI portrait generation',
    category: 'art',
    thumbnail: 'POR',
    settings: {
      width: 896, height: 1152, model: 'flux-dev', steps: 25, cfgScale: 7.5,
      prompt: 'portrait, professional headshot, studio lighting, sharp focus, detailed skin texture, flattering angle',
      negativePrompt: 'deformed, ugly, duplicate, blurry, bad anatomy, disfigured, poorly drawn face'
    }
  },
  {
    id: 'wallpaper-4k',
    name: '4K Wallpaper',
    description: 'High-res desktop wallpaper',
    category: 'art',
    thumbnail: '4K',
    settings: {
      width: 1920, height: 1080, model: 'flux-dev', steps: 35, cfgScale: 7.5,
      prompt: 'desktop wallpaper, detailed, high resolution, crisp, clean composition, visually stunning',
      negativePrompt: 'busy, cluttered, low resolution, blurry'
    }
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...uiInitialState,
      ...createUIActions(set, get),
      ...editInitialState,
      ...createEditActions(set, get),
      ...generationInitialState,
      ...createGenerationActions(set, get),
      ...projectInitialState,
      ...createProjectActions(set, get),
      ...workflowInitialState,
      ...createWorkflowActions(set, get),
      ...promptStudioInitialState,
      ...createPromptStudioActions(set, get),
      ...generationPreviewInitialState,
      ...createGenerationPreviewActions(set, get),
      ...iterationInitialState,
      ...createIterationActions(set, get),
      ...collectionsInitialState,
      ...createCollectionsActions(set, get),
      ...mediaTimelineInitialState,
      ...createMediaTimelineActions(set, get),
      ...timelineInitialState,
      ...createTimelineActions(set, get),
      ...pipelineInitialState,
      ...createPipelineActions(set),
    }),
    {
      name: 'vision-studio-storage',
      storage: createJSONStorage(getPersistStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Record<string, unknown>;
        // Reconstruct Maps from serialized arrays
        if (Array.isArray(persisted.iterationNodes)) {
          (persisted as Record<string, unknown>).iterationNodes = new Map(
            persisted.iterationNodes as [string, unknown][]
          );
        }
        if (Array.isArray(persisted.assetMetadata)) {
          (persisted as Record<string, unknown>).assetMetadata = new Map(
            persisted.assetMetadata as [string, unknown][]
          );
        }
        if (persisted.layoutPreferences && typeof persisted.layoutPreferences === 'object') {
          const persistedLayout = persisted.layoutPreferences as Record<string, unknown>;
          const currentLayout = createDefaultLayoutPreferences();
          (persisted as Record<string, unknown>).layoutPreferences = {
            ...currentLayout,
            ...persistedLayout,
            leftDockWidth: clampDockWidth(
              typeof persistedLayout.leftDockWidth === 'number'
                ? persistedLayout.leftDockWidth
                : currentLayout.leftDockWidth,
              LEFT_DOCK_MIN_WIDTH,
              LEFT_DOCK_MAX_WIDTH,
            ),
            rightDockWidth: clampDockWidth(
              typeof persistedLayout.rightDockWidth === 'number'
                ? persistedLayout.rightDockWidth
                : currentLayout.rightDockWidth,
              RIGHT_DOCK_MIN_WIDTH,
              RIGHT_DOCK_MAX_WIDTH,
            ),
            reviewDensity: normalizeReviewDensity(
              typeof persistedLayout.reviewDensity === 'string'
                ? persistedLayout.reviewDensity
                : undefined,
            ),
            collapsedGenerateSections: normalizeCollapsedGenerateSections(
              Array.isArray(persistedLayout.collapsedGenerateSections)
                ? persistedLayout.collapsedGenerateSections.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : undefined,
            ),
          };
        }
        return {
          ...currentState,
          ...(persisted as Partial<AppState>),
          projects: normalizeProjects(
            Array.isArray((persisted as Partial<AppState>).projects)
              ? ((persisted as Partial<AppState>).projects as Project[])
              : currentState.projects,
          ),
          storyboardImportDrafts: normalizeStoryboardImportDrafts(
            Array.isArray((persisted as Partial<AppState>).storyboardImportDrafts)
              ? ((persisted as Partial<AppState>).storyboardImportDrafts as ImportDraft[])
              : currentState.storyboardImportDrafts,
          ),
          timelineClips: normalizeTimelineClips(
            Array.isArray((persisted as Partial<AppState>).timelineClips)
              ? ((persisted as Partial<AppState>).timelineClips as TimelineClip[])
              : currentState.timelineClips,
          ),
          activeStoryboardImportDraftId:
            typeof (persisted as Partial<AppState>).activeStoryboardImportDraftId === 'string' &&
            normalizeStoryboardImportDrafts(
              Array.isArray((persisted as Partial<AppState>).storyboardImportDrafts)
                ? ((persisted as Partial<AppState>).storyboardImportDrafts as ImportDraft[])
                : currentState.storyboardImportDrafts,
            ).some(
              (draft) =>
                draft.id === (persisted as Partial<AppState>).activeStoryboardImportDraftId,
            )
              ? ((persisted as Partial<AppState>).activeStoryboardImportDraftId as string)
              : null,
        };
      },
      partialize: (state) => ({
        activeTab: state.activeTab,
        activeSubMode: state.activeSubMode,
        centerView: state.centerView,
        layoutPreferences: state.layoutPreferences,
        aspectRatio: state.aspectRatio,
        resolutionTier: state.resolutionTier,
        customWidth: state.customWidth,
        customHeight: state.customHeight,
        generationMode: state.generationMode,
        darkMode: state.darkMode,
        recentProjects: state.recentProjects,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeSceneId: state.activeSceneId,
        storyboardImportDrafts: state.storyboardImportDrafts,
        activeStoryboardImportDraftId: state.activeStoryboardImportDraftId,
        migrationStatus: state.migrationStatus,
        promptHistory: state.promptHistory.slice(0, 50),
        favoritePrompts: state.favoritePrompts,
        customStylePresets: state.customStylePresets,
        userTemplates: state.userTemplates,
        batchResults: state.batchResults.slice(0, 200),
        assetLibrary: state.assetLibrary.slice(0, 500),
        promptTemplates: state.promptTemplates,
        compositionLayers: state.compositionLayers,
        iterationBranches: state.iterationBranches,
        iterationNodes: Array.from(state.iterationNodes.entries()),
        activeIterationId: state.activeIterationId,
        iterationView: state.iterationView,
        iterationComparisonMode: state.iterationComparisonMode,
        collections: state.collections,
        availableTags: state.availableTags,
        taggingMode: state.taggingMode,
        assetMetadata: Array.from(state.assetMetadata.entries()),
        mediaAssets: state.mediaAssets,
        referenceSets: state.referenceSets,
        timelineSequences: state.timelineSequences,
        timelineTracks: state.timelineTracks,
        timelineClips: state.timelineClips,
        clipGenerationBindings: state.clipGenerationBindings,
        activeTimelineSequenceId: state.activeTimelineSequenceId,
        activeTimelineClipId: state.activeTimelineClipId,
      }),
    }
  )
);

// Expose the store on window for E2E test seeding and debugging.
// Safe in an Electron renderer context - no external web exposure.
if (typeof window !== 'undefined') {
  (window as unknown as { __VISION_STUDIO_STORE__: typeof useAppStore }).__VISION_STUDIO_STORE__ = useAppStore;
}
