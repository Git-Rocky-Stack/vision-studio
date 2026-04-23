import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { runTimelineClipGeneration } from './runTimelineClipGeneration';

describe('runTimelineClipGeneration', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: true,
      },
    }));
  });

  it('creates a timeline video variant from the selected image clip source', async () => {
    const { sequence, clip } = seedImageTimelineClip();
    const electron = makeElectronGenerationMock({
      submitVideo: { success: true, jobId: 'timeline-job-1' },
      statuses: [
        {
          job_id: 'timeline-job-1',
          status: 'processing',
          type: 'video',
          created_at: '2026-04-23T08:00:00.000Z',
          progress: 55,
        },
        {
          job_id: 'timeline-job-1',
          status: 'completed',
          type: 'video',
          created_at: '2026-04-23T08:00:00.000Z',
          completed_at: '2026-04-23T08:00:08.000Z',
          progress: 100,
          result: {
            video: '/outputs/timeline-job-1/shot.mp4',
            duration: 4,
          },
        },
      ],
    });

    const result = await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'extend the launch reveal into a slow cinematic move',
        negativePrompt: 'glitch',
        generationType: 'video',
        model: 'svd',
        width: 1280,
        height: 720,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 7,
        duration: 4,
        fps: 24,
      },
      electron,
      pollIntervalMs: 0,
    });

    const state = useAppStore.getState();
    expect(electron.generation.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        image_path: 'C:/vision-studio-output/source/frame.png',
        model: 'svd',
      }),
    );
    expect(result.cancelled).toBe(false);
    expect(state.timelineClips).toHaveLength(2);
    const createdClip = state.timelineClips.find((item) => item.id === result.clipId)!;
    expect(createdClip.startMs).toBeGreaterThanOrEqual(clip.startMs + clip.durationMs);
    expect(createdClip.generationBindingId).toBeTruthy();
    expect(state.mediaAssets.find((asset) => asset.id === createdClip.mediaAssetId)?.type).toBe('video');
  });

  it('regenerates an AI-bound clip in place and refreshes its binding summary', async () => {
    const { clip, bindingId } = seedAiBoundVideoClip();
    const electron = makeElectronGenerationMock({
      submitVideo: { success: true, jobId: 'timeline-job-2' },
      statuses: [
        {
          job_id: 'timeline-job-2',
          status: 'completed',
          type: 'video',
          created_at: '2026-04-23T08:10:00.000Z',
          completed_at: '2026-04-23T08:10:05.000Z',
          progress: 100,
          result: {
            video: '/outputs/timeline-job-2/refreshed.mp4',
            duration: 5,
          },
        },
      ],
    });

    const result = await runTimelineClipGeneration({
      operation: 'regenerate',
      clipId: clip.id,
      electron,
      pollIntervalMs: 0,
    });

    const state = useAppStore.getState();
    const refreshedClip = state.timelineClips.find((item) => item.id === clip.id)!;
    const refreshedBinding = state.clipGenerationBindings.find((binding) => binding.id === bindingId)!;
    const refreshedMediaAsset = state.mediaAssets.find((asset) => asset.id === refreshedClip.mediaAssetId)!;

    expect(result.cancelled).toBe(false);
    expect(refreshedClip.mediaAssetId).not.toBe('media-generated-video');
    expect(refreshedBinding.lastRunSummary?.status).toBe('complete');
    expect(refreshedBinding.lastRunSummary?.outputMediaAssetId).toBe(refreshedMediaAsset.id);
  });

  it('extends an AI-bound motion clip and records the new continuation as a variant', async () => {
    const { clip, bindingId } = seedAiBoundVideoClip();
    const electron = makeElectronGenerationMock({
      submitVideo: { success: true, jobId: 'timeline-job-3' },
      statuses: [
        {
          job_id: 'timeline-job-3',
          status: 'completed',
          type: 'video',
          created_at: '2026-04-23T08:20:00.000Z',
          completed_at: '2026-04-23T08:20:04.000Z',
          progress: 100,
          result: {
            video: '/outputs/timeline-job-3/extend.mp4',
            duration: 4,
          },
        },
      ],
    });

    const result = await runTimelineClipGeneration({
      operation: 'extend',
      clipId: clip.id,
      electron,
      pollIntervalMs: 0,
    });

    const state = useAppStore.getState();
    const sourceBinding = state.clipGenerationBindings.find((binding) => binding.id === bindingId)!;
    const continuationClip = state.timelineClips.find((item) => item.id === result.clipId)!;

    expect(continuationClip.id).not.toBe(clip.id);
    expect(continuationClip.startMs).toBeGreaterThanOrEqual(clip.startMs + clip.durationMs);
    expect(sourceBinding.variantIds).toContain(continuationClip.id);
  });
});

function seedImageTimelineClip() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Variant');
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  state.upsertMediaAsset({
    id: 'media-source-image',
    legacyAssetId: null,
    jobId: null,
    name: 'Source Frame',
    type: 'image',
    source: 'generated',
    path: 'C:/vision-studio-output/source/frame.png',
    previewUrl: 'file:///C:/vision-studio-output/source/frame.png',
    thumbnailUrl: 'file:///C:/vision-studio-output/source/frame.png',
    posterUrl: null,
    width: 1280,
    height: 720,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: track.id,
    mediaAssetId: 'media-source-image',
    startMs: 0,
    durationMs: 2000,
    label: 'Opening Frame',
  })!;

  return { project, sequence, track, clip };
}

function seedAiBoundVideoClip() {
  const state = useAppStore.getState();
  const { sequence } = seedImageTimelineClip();
  const imageTrack = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;
  const videoTrack = state.createTimelineTrack(sequence.id, { kind: 'video', name: 'AI Motion' })!;

  state.upsertMediaAsset({
    id: 'media-generated-video',
    legacyAssetId: null,
    jobId: 'job-video-source',
    name: 'Generated Shot',
    type: 'video',
    source: 'generated',
    path: 'C:/vision-studio-output/generated/source.mp4',
    previewUrl: 'C:/vision-studio-output/generated/source.mp4',
    thumbnailUrl: 'data:image/svg+xml;base64,video',
    posterUrl: 'C:/vision-studio-output/source/frame.png',
    durationMs: 4000,
    fps: 24,
    metadata: {},
    createdAt: '2026-04-23T00:10:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: videoTrack.id,
    mediaAssetId: 'media-generated-video',
    startMs: 2000,
    durationMs: 4000,
    label: 'Generated Shot',
  })!;

  state.setActiveTimelineClip(clip.id);

  const bindingId = 'binding-generated-shot';
  state.upsertClipGenerationBinding({
    id: bindingId,
    clipId: clip.id,
    prompt: 'hero walks through volumetric light',
    negativePrompt: 'artifacting',
    model: 'svd',
    generationType: 'video',
    settings: {
      width: 1280,
      height: 720,
      steps: 20,
      cfgScale: 7,
      scheduler: 'Euler a',
      seed: 42,
      duration: 4,
      fps: 24,
      sourceMediaAssetId: 'media-source-image',
    },
    referenceSetIds: [],
    variantIds: [],
    lastRunSummary: {
      status: 'complete',
      outputMediaAssetId: 'media-generated-video',
      completedAt: '2026-04-23T00:10:10.000Z',
      errorMessage: null,
    },
  });

  expect(imageTrack).toBeTruthy();
  return { clip, bindingId };
}

function makeElectronGenerationMock(options: {
  submitImage?: { success: boolean; jobId?: string; error?: string };
  submitVideo?: { success: boolean; jobId?: string; error?: string };
  statuses?: Array<Record<string, unknown>>;
}) {
  const statuses = [...(options.statuses ?? [])];

  return {
    app: {
      getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        defaultOutputPath: '',
      }),
    },
    generation: {
      generateImage: vi.fn().mockResolvedValue(options.submitImage ?? { success: true, jobId: 'timeline-image-job' }),
      generateVideo: vi.fn().mockResolvedValue(options.submitVideo ?? { success: true, jobId: 'timeline-video-job' }),
      getStatus: vi.fn().mockImplementation(async () => statuses.shift()),
    },
    notifications: {
      notify: vi.fn().mockResolvedValue({ success: true }),
    },
  };
}
