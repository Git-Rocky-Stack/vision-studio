import type { StoreApi, UseBoundStore } from 'zustand';

import { createMediaAssetFromAssetRecord, toPreviewUrl } from '@/features/assets/assetRecords';
import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { AssetRecord, DerivedAssetResult } from '@/types/assets';
import type { MediaAsset, ReferenceSet, ReferenceSetItem, ReferenceSlotType } from '@/types/media';

type TimelineStore = UseBoundStore<StoreApi<AppState>>;

type FrameExtractionResponse = DerivedAssetResult & {
  success?: boolean;
  error?: string;
  time_ms?: number;
  frame_index?: number;
};

interface FrameExtractionElectronApi {
  generation: {
    extractVideoFrame: (params: {
      source_path: string;
      time_ms?: number;
    }) => Promise<FrameExtractionResponse>;
  };
}

export interface ExtractFrameToEditOptions {
  sourcePath: string;
  timeMs?: number;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  store?: TimelineStore;
  electron?: FrameExtractionElectronApi;
  openCanvas?: boolean;
}

export interface ExtractedFrameResult {
  assetRecord: AssetRecord;
  mediaAsset: MediaAsset;
  imageUrl: string;
  assetPath: string;
  timeMs: number;
  frameIndex: number | null;
}

export interface PromoteFrameToReferenceOptions {
  assetPath: string;
  slot?: ReferenceSlotType;
  scope?: ReferenceSet['scope'];
  projectId?: string | null;
  sceneId?: string | null;
  clipId?: string | null;
  store?: TimelineStore;
}

export interface PromoteFrameToClipOptions {
  assetPath: string;
  clipId: string;
  store?: TimelineStore;
}

const DEFAULT_REFERENCE_SET_NAMES: Record<ReferenceSet['scope'], string> = {
  project: 'Project References',
  scene: 'Scene References',
  clip: 'Clip References',
  adhoc: 'Working References',
};

function normalizePath(value: string) {
  return value.replace(/\\/g, '/');
}

function findAssetRecordByPath(assetLibrary: AssetRecord[], assetPath: string) {
  const normalizedPath = normalizePath(assetPath);
  return (
    assetLibrary.find((asset) => normalizePath(asset.path) === normalizedPath) ??
    assetLibrary.find((asset) => asset.id === `derived::${normalizedPath}`) ??
    null
  );
}

function ensureImageMediaAsset(
  state: AppState,
  assetPath: string,
  metadataPatch?: Record<string, unknown>,
) {
  const normalizedPath = normalizePath(assetPath);
  const existingMediaAsset =
    state.mediaAssets.find(
      (asset) => asset.type === 'image' && normalizePath(asset.path) === normalizedPath,
    ) ?? null;

  if (existingMediaAsset) {
    if (metadataPatch && Object.keys(metadataPatch).length > 0) {
      const nextMediaAsset = {
        ...existingMediaAsset,
        metadata: {
          ...existingMediaAsset.metadata,
          ...metadataPatch,
        },
      } satisfies MediaAsset;
      state.upsertMediaAsset(nextMediaAsset);
      return nextMediaAsset;
    }

    return existingMediaAsset;
  }

  const assetRecord = findAssetRecordByPath(state.assetLibrary, normalizedPath);
  if (!assetRecord || assetRecord.type !== 'image') {
    throw new Error('The extracted frame is not available in the asset library yet.');
  }

  const mediaAsset = createMediaAssetFromAssetRecord(assetRecord);
  const nextMediaAsset = {
    ...mediaAsset,
    metadata: {
      ...mediaAsset.metadata,
      ...(metadataPatch ?? {}),
    },
  } satisfies MediaAsset;
  state.upsertMediaAsset(nextMediaAsset);
  return nextMediaAsset;
}

function resolveReferenceScope(options: PromoteFrameToReferenceOptions) {
  if (options.scope) {
    return options.scope;
  }

  if (options.clipId) {
    return 'clip';
  }

  if (options.sceneId) {
    return 'scene';
  }

  if (options.projectId) {
    return 'project';
  }

  return 'adhoc';
}

function findScopedReferenceSet(
  referenceSets: ReferenceSet[],
  scope: ReferenceSet['scope'],
  projectId: string | null,
  sceneId: string | null,
  clipId: string | null,
) {
  return (
    referenceSets.find(
      (referenceSet) =>
        referenceSet.scope === scope &&
        referenceSet.projectId === projectId &&
        referenceSet.sceneId === sceneId &&
        referenceSet.clipId === clipId,
    ) ?? null
  );
}

export async function extractFrameToEdit({
  sourcePath,
  timeMs = 0,
  prompt = '',
  negativePrompt,
  model,
  store = useAppStore,
  electron = window.electron,
  openCanvas = true,
}: ExtractFrameToEditOptions): Promise<ExtractedFrameResult> {
  const response = await electron.generation.extractVideoFrame({
    source_path: sourcePath,
    time_ms: Math.max(0, Math.round(timeMs)),
  });

  if (response?.success === false || !response?.image || !response?.output_path) {
    throw new Error(response?.error || 'Video frame extraction failed.');
  }

  const state = store.getState();
  const assetPath = normalizePath(response.output_path);
  state.upsertDerivedAsset(response, {
    prompt,
    negativePrompt,
    model,
    params: {
      extracted_from_video: normalizePath(sourcePath),
      extracted_time_ms: response.time_ms ?? Math.max(0, Math.round(timeMs)),
      frame_index: response.frame_index ?? null,
      reference_ready: true,
      derived_kind: 'video-frame',
    },
  });

  const nextState = store.getState();
  const assetRecord = findAssetRecordByPath(nextState.assetLibrary, assetPath);
  if (!assetRecord) {
    throw new Error('Video frame extraction completed, but the frame asset could not be found.');
  }

  const mediaAsset = ensureImageMediaAsset(nextState, assetPath, {
    extractedFromVideo: normalizePath(sourcePath),
    extractedTimeMs: response.time_ms ?? Math.max(0, Math.round(timeMs)),
    frameIndex: response.frame_index ?? null,
  });
  const imageUrl = toPreviewUrl(response.image, { type: 'image' }) || response.image;

  if (openCanvas) {
    nextState.setCurrentImage(imageUrl, assetPath);
    nextState.setCenterView('canvas');
    nextState.setActiveTab('canvas');
  }

  return {
    assetRecord,
    mediaAsset,
    imageUrl,
    assetPath,
    timeMs: response.time_ms ?? Math.max(0, Math.round(timeMs)),
    frameIndex: typeof response.frame_index === 'number' ? response.frame_index : null,
  };
}

export function promoteFrameToReference({
  assetPath,
  slot = 'composition',
  scope,
  projectId = null,
  sceneId = null,
  clipId = null,
  store = useAppStore,
}: PromoteFrameToReferenceOptions) {
  const state = store.getState();
  const resolvedScope = resolveReferenceScope({ assetPath, slot, scope, projectId, sceneId, clipId });
  const mediaAsset = ensureImageMediaAsset(state, assetPath, {
    referenceReady: true,
  });

  const existingReferenceSet = findScopedReferenceSet(
    state.referenceSets,
    resolvedScope,
    projectId,
    sceneId,
    clipId,
  );

  const duplicateItem =
    existingReferenceSet?.items.find(
      (item) =>
        item.slot === slot &&
        (item.mediaAssetId === mediaAsset.id || normalizePath(item.path ?? '') === normalizePath(mediaAsset.path)),
    ) ?? null;

  if (duplicateItem && existingReferenceSet) {
    return {
      referenceSetId: existingReferenceSet.id,
      itemId: duplicateItem.id,
      mediaAsset,
    };
  }

  const nextItem: ReferenceSetItem = {
    id: crypto.randomUUID(),
    slot,
    mediaAssetId: mediaAsset.id,
    path: mediaAsset.path,
    label: mediaAsset.name,
    orderIndex: existingReferenceSet?.items.length ?? 0,
  };

  if (!existingReferenceSet) {
    const created = state.createReferenceSet({
      name: DEFAULT_REFERENCE_SET_NAMES[resolvedScope],
      scope: resolvedScope,
      projectId,
      sceneId,
      clipId,
      items: [nextItem],
      tags: ['source:frame', `scope:${resolvedScope}`],
    });

    return {
      referenceSetId: created.id,
      itemId: nextItem.id,
      mediaAsset,
    };
  }

  state.updateReferenceSet(existingReferenceSet.id, {
    items: [...existingReferenceSet.items, nextItem],
  });

  return {
    referenceSetId: existingReferenceSet.id,
    itemId: nextItem.id,
    mediaAsset,
  };
}

export function promoteFrameToClip({
  assetPath,
  clipId,
  store = useAppStore,
}: PromoteFrameToClipOptions) {
  const state = store.getState();
  const clip = state.timelineClips.find((item) => item.id === clipId) ?? null;
  if (!clip) {
    throw new Error('Select a timeline clip before promoting a frame.');
  }

  const mediaAsset = ensureImageMediaAsset(state, assetPath, {
    promotedToClipId: clipId,
  });
  const posterUrl = mediaAsset.thumbnailUrl || mediaAsset.previewUrl || mediaAsset.path;
  state.updateTimelineClip(clipId, {
    posterUrl,
  });

  if (clip.generationBindingId) {
    const binding =
      state.clipGenerationBindings.find((item) => item.id === clip.generationBindingId) ?? null;
    if (binding) {
      state.upsertClipGenerationBinding({
        ...binding,
        settings: {
          ...binding.settings,
          posterUrl,
          sourceMediaAssetId: mediaAsset.id,
        },
      });
    }
  }

  return {
    clipId,
    posterUrl,
    mediaAsset,
  };
}
