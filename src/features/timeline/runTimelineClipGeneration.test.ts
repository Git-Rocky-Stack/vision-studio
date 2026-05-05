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

  it('generates a candidate retake take for the selected clip range without replacing the clip', async () => {
    const { clip } = seedAiBoundVideoClip();
    const range = useAppStore.getState().createTimelineClipRetakeRange(clip.id, {
      startMs: 500,
      endMs: 1750,
    })!;
    const electron = makeElectronGenerationMock({
      submitVideo: { success: true, jobId: 'timeline-retake-job-1' },
      statuses: [
        {
          job_id: 'timeline-retake-job-1',
          status: 'processing',
          type: 'video',
          created_at: '2026-04-23T08:25:00.000Z',
          progress: 35,
        },
        {
          job_id: 'timeline-retake-job-1',
          status: 'completed',
          type: 'video',
          created_at: '2026-04-23T08:25:00.000Z',
          completed_at: '2026-04-23T08:25:05.000Z',
          progress: 100,
          result: {
            video: '/outputs/timeline-retake-job-1/retake.mp4',
            duration: 1.25,
          },
        },
      ],
    });

    const result = await runTimelineClipGeneration({
      operation: 'retake',
      clipId: clip.id,
      retakeRangeId: range.id,
      input: {
        prompt: 'make the hand motion cleaner',
      },
      electron,
      pollIntervalMs: 0,
    });

    const state = useAppStore.getState();
    const unchangedClip = state.timelineClips.find((item) => item.id === clip.id)!;
    const take = state.clipRetakeTakes.find((item) => item.id === result.retakeTakeId)!;
    const takeMediaAsset = state.mediaAssets.find((asset) => asset.id === take.mediaAssetId)!;
    const updatedRange = unchangedClip.retakeRanges.find((item) => item.id === range.id)!;

    expect(electron.generation.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make the hand motion cleaner',
        image_path: 'C:/vision-studio-output/source/frame.png',
        duration: 1.25,
      }),
    );
    expect(result.cancelled).toBe(false);
    expect(result.clipId).toBe(clip.id);
    expect(state.timelineClips).toHaveLength(2);
    expect(unchangedClip.mediaAssetId).toBe('media-generated-video');
    expect(take.status).toBe('candidate');
    expect(take.prompt).toBe('make the hand motion cleaner');
    expect(take.model).toBe('svd');
    expect(take.settings).toEqual(
      expect.objectContaining({
        sourceClipId: clip.id,
        operation: 'retake',
        retakeRangeStartMs: 500,
        retakeRangeEndMs: 1750,
        retakeRangeDurationMs: 1250,
        jobId: 'timeline-retake-job-1',
      }),
    );
    expect(takeMediaAsset.type).toBe('video');
    expect(updatedRange.candidateTakeIds).toContain(take.id);
    expect(updatedRange.status).toBe('candidate');
  });

  it('resolves visible canvas control layers into image timeline generation requests', async () => {
    const { sequence, clip, scene } = seedImageTimelineClip();
    const state = useAppStore.getState();

    state.createCanvasControlLayer(scene.id, {
      name: 'Pose Guide',
      type: 'controlnet',
      sourceMediaAssetId: 'media-source-image',
      preprocessor: 'openpose',
      mask: {
        type: 'rectangle',
        points: [
          { x: 20, y: 30 },
          { x: 180, y: 30 },
          { x: 180, y: 180 },
          { x: 20, y: 180 },
        ],
        bounds: { x: 20, y: 30, width: 160, height: 150 },
        featherRadius: 2,
        blendEdges: true,
      },
    });
    state.createCanvasControlLayer(scene.id, {
      name: 'Repair Mask',
      type: 'inpaint-mask',
      prompt: 'repair the jacket seam',
      mask: {
        type: 'rectangle',
        points: [
          { x: 260, y: 120 },
          { x: 380, y: 120 },
          { x: 380, y: 280 },
          { x: 260, y: 280 },
        ],
        bounds: { x: 260, y: 120, width: 120, height: 160 },
        featherRadius: 2,
        blendEdges: true,
      },
    });

    const electron = makeElectronGenerationMock({
      submitImage: { success: true, jobId: 'timeline-image-job-1' },
      statuses: [
        {
          job_id: 'timeline-image-job-1',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-23T08:30:00.000Z',
          completed_at: '2026-04-23T08:30:03.000Z',
          progress: 100,
          result: {
            images: ['/outputs/timeline-image-job-1/frame.png'],
          },
        },
      ],
    });

    await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'hero portrait cleanup',
        negativePrompt: 'artifacting',
        generationType: 'image',
        model: 'flux-dev',
        width: 1280,
        height: 720,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 9,
      },
      electron,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        controlnet: [
          expect.objectContaining({
            layer_name: 'Pose Guide',
            source_path: 'C:/vision-studio-output/source/frame.png',
            preprocessor: 'openpose',
          }),
        ],
        image_path: 'C:/vision-studio-output/source/frame.png',
        inpaint: expect.objectContaining({
          layer_name: 'Repair Mask',
        }),
      }),
    );
  });

  it('polls beyond 120 attempts when on the OpenRouter still-image route', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const { sequence, clip } = seedImageTimelineClip();

    const processingStatuses: Array<Record<string, unknown>> = Array.from({ length: 130 }, () => ({
      job_id: 'timeline-image-job-openrouter-slow',
      status: 'processing',
      type: 'image',
      created_at: '2026-04-24T08:30:00.000Z',
      progress: 50,
    }));
    const completedStatus: Record<string, unknown> = {
      job_id: 'timeline-image-job-openrouter-slow',
      status: 'completed',
      type: 'image',
      created_at: '2026-04-24T08:30:00.000Z',
      completed_at: '2026-04-24T08:32:30.000Z',
      progress: 100,
      result: {
        images: ['/outputs/timeline-image-job-openrouter-slow/frame.png'],
      },
    };

    const electron = makeElectronGenerationMock({
      openRouterImageEnabled: true,
      submitImage: { success: true, jobId: 'timeline-image-job-openrouter-slow' },
      statuses: [...processingStatuses, completedStatus],
    });

    const result = await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'slow hosted render',
        generationType: 'image',
        model: 'flux-dev',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 11,
      },
      electron,
      pollIntervalMs: 0,
    });

    expect(result.cancelled).toBe(false);
    expect(electron.generation.getStatus).toHaveBeenCalledTimes(131);
  });

  it('allows hosted still-image timeline generations while the backend is offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));

    const { sequence, clip } = seedImageTimelineClip();
    const electron = makeElectronGenerationMock({
      openRouterImageEnabled: true,
      submitImage: { success: true, jobId: 'timeline-image-job-openrouter' },
      statuses: [
        {
          job_id: 'timeline-image-job-openrouter',
          status: 'completed',
          type: 'image',
          created_at: '2026-04-24T08:30:00.000Z',
          completed_at: '2026-04-24T08:30:03.000Z',
          progress: 100,
          result: {
            images: ['/outputs/timeline-image-job-openrouter/frame.png'],
          },
        },
      ],
    });

    await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'hero portrait cleanup',
        negativePrompt: 'artifacting',
        generationType: 'image',
        model: 'flux-dev',
        width: 1280,
        height: 720,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 9,
      },
      electron,
      pollIntervalMs: 0,
    });

    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash-image',
      }),
    );
  });

  it('bails before submitting any HTTP call when the signal is pre-aborted', async () => {
    const { sequence, clip } = seedImageTimelineClip();
    const electron = makeElectronGenerationMock({
      submitImage: { success: true, jobId: 'never-submitted' },
      statuses: [],
    });
    const controller = new AbortController();
    controller.abort();

    const result = await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'pre-aborted',
        generationType: 'image',
        model: 'flux-dev',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 11,
      },
      electron,
      pollIntervalMs: 0,
      signal: controller.signal,
    });

    expect(electron.generation.generateImage).not.toHaveBeenCalled();
    expect(electron.generation.getStatus).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
  });

  it('stops polling when the signal aborts mid-flight', async () => {
    const { sequence, clip } = seedImageTimelineClip();
    const processingStatuses: Array<Record<string, unknown>> = Array.from({ length: 200 }, () => ({
      job_id: 'timeline-aborted',
      status: 'processing',
      type: 'image',
      created_at: '2026-04-24T08:30:00.000Z',
      progress: 50,
    }));

    const controller = new AbortController();
    let getStatusCalls = 0;
    const electron = makeElectronGenerationMock({
      submitImage: { success: true, jobId: 'timeline-aborted' },
      statuses: processingStatuses,
    });
    const baseGetStatus = electron.generation.getStatus;
    electron.generation.getStatus = vi.fn().mockImplementation(async (jobId: string) => {
      getStatusCalls += 1;
      if (getStatusCalls === 3) {
        controller.abort();
      }
      return baseGetStatus(jobId);
    });

    const result = await runTimelineClipGeneration({
      operation: 'generate',
      clipId: clip.id,
      sequenceId: sequence.id,
      input: {
        prompt: 'mid-flight abort',
        generationType: 'image',
        model: 'flux-dev',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7.5,
        scheduler: 'Euler a',
        seed: 11,
      },
      electron,
      pollIntervalMs: 0,
      signal: controller.signal,
    }).catch((error) => {
      // signal-abort path may either throw or return cancelled - accept either,
      // and assert via call count rather than result shape
      expect(error).toBeInstanceOf(Error);
      return { cancelled: true } as const;
    });

    expect(electron.generation.getStatus.mock.calls.length).toBeLessThan(10);
    expect(result.cancelled).toBe(true);
  });
});

function seedImageTimelineClip() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Variant');
  const scene = state.addScene(project.id, { name: 'Timeline Shot' });
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  state.setActiveProject(project.id);
  state.setActiveScene(scene.id);

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
    sceneId: scene.id,
    startMs: 0,
    durationMs: 2000,
    label: 'Opening Frame',
  })!;

  return { project, scene, sequence, track, clip };
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
  openRouterImageEnabled?: boolean;
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
    accounts: {
      list: vi.fn().mockResolvedValue({
        activeAccountId: 'account-primary',
        accounts: [
          {
            id: 'account-primary',
            name: 'Primary',
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
            preferences: {
              promptEnhancementProvider: 'local',
              openRouterModel: '',
              imageGenerationProvider: options.openRouterImageEnabled ? 'openrouter' : 'local',
              openRouterImageModel: options.openRouterImageEnabled ? 'google/gemini-2.5-flash-image' : '',
            },
            openRouter: {
              apiKeyStored: options.openRouterImageEnabled ?? false,
              keyLabel: options.openRouterImageEnabled ? 'Primary Key' : null,
              lastValidatedAt: options.openRouterImageEnabled ? '2026-04-24T00:00:00.000Z' : null,
            },
          },
        ],
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
