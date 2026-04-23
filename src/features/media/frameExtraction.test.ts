import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import {
  extractFrameToEdit,
  promoteFrameToClip,
  promoteFrameToReference,
} from './frameExtraction';

const extractVideoFrameMock = vi.fn();

function installElectronMock() {
  return {
    generation: {
      extractVideoFrame: extractVideoFrameMock,
    },
  };
}

function seedExtractedFrameAsset(assetPath: string, imagePath: string) {
  useAppStore.getState().upsertDerivedAsset(
    {
      image: imagePath,
      output_path: assetPath,
      width: 1280,
      height: 720,
    },
    {
      prompt: 'hero shot',
      model: 'ltx-video',
      params: {
        source: 'derived',
        reference_ready: true,
      },
    },
  );
}

describe('frameExtraction', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    extractVideoFrameMock.mockReset();
  });

  it('extracts a managed frame and routes it into Canvas editing', async () => {
    extractVideoFrameMock.mockResolvedValue({
      image: '/outputs/frame-001/hero-frame.png',
      output_path: 'C:/vision-studio-output/frame-001/hero-frame.png',
      width: 1280,
      height: 720,
      time_ms: 500,
      frame_index: 12,
    });

    const result = await extractFrameToEdit({
      sourcePath: 'C:/vision-studio-output/clips/hero.mp4',
      timeMs: 500,
      prompt: 'hero shot',
      model: 'ltx-video',
      electron: installElectronMock(),
    });

    expect(extractVideoFrameMock).toHaveBeenCalledWith({
      source_path: 'C:/vision-studio-output/clips/hero.mp4',
      time_ms: 500,
    });
    expect(result.assetRecord.id).toBe('derived::C:/vision-studio-output/frame-001/hero-frame.png');
    expect(result.mediaAsset.path).toBe('C:/vision-studio-output/frame-001/hero-frame.png');
    expect(result.imageUrl).toBe('http://localhost:8000/outputs/frame-001/hero-frame.png');

    const state = useAppStore.getState();
    expect(state.currentImage).toBe('http://localhost:8000/outputs/frame-001/hero-frame.png');
    expect(state.currentImageAssetPath).toBe('C:/vision-studio-output/frame-001/hero-frame.png');
    expect(state.activeTab).toBe('canvas');
    expect(state.centerView).toBe('canvas');
    expect(state.mediaAssets.find((asset) => asset.path === result.assetPath)?.metadata).toMatchObject({
      extractedFromVideo: 'C:/vision-studio-output/clips/hero.mp4',
      extractedTimeMs: 500,
      frameIndex: 12,
    });
  });

  it('promotes a derived frame into a scoped reusable reference set', () => {
    const project = useAppStore.getState().createProject('Timeline Film');
    const scene = useAppStore.getState().addScene(project.id, { name: 'Scene 1' });
    seedExtractedFrameAsset(
      'C:/vision-studio-output/frame-002/scene-frame.png',
      '/outputs/frame-002/scene-frame.png',
    );

    const promotion = promoteFrameToReference({
      assetPath: 'C:/vision-studio-output/frame-002/scene-frame.png',
      slot: 'motion',
      projectId: project.id,
      sceneId: scene.id,
    });

    const state = useAppStore.getState();
    expect(promotion.mediaAsset.path).toBe('C:/vision-studio-output/frame-002/scene-frame.png');
    expect(state.referenceSets).toHaveLength(1);
    expect(state.referenceSets[0]).toMatchObject({
      scope: 'scene',
      sceneId: scene.id,
    });
    expect(state.referenceSets[0].items[0]).toMatchObject({
      slot: 'motion',
      mediaAssetId: promotion.mediaAsset.id,
    });
    expect(state.projects[0].scenes[0].referenceSetIds).toContain(promotion.referenceSetId);
  });

  it('promotes an edited frame back to the selected clip poster and binding source', () => {
    const state = useAppStore.getState();
    const project = state.createProject('Timeline Film');
    const scene = state.addScene(project.id, { name: 'Scene 1' });
    const sequence = state.ensureTimelineSequenceForProject(project.id)!;
    const track = useAppStore.getState().timelineTracks.find((item) => item.id === sequence.trackIds[0])!;

    state.upsertMediaAsset({
      id: 'media::clip-video',
      legacyAssetId: 'import::clip-video',
      jobId: null,
      name: 'Hero clip',
      type: 'video',
      source: 'imported',
      path: 'C:/vision-studio-output/clips/hero.mp4',
      previewUrl: 'file:///C:/vision-studio-output/clips/hero.mp4',
      thumbnailUrl: 'file:///C:/vision-studio-output/clips/hero-poster.png',
      posterUrl: 'file:///C:/vision-studio-output/clips/hero-poster.png',
      metadata: {},
      createdAt: '2026-04-23T09:00:00.000Z',
    });
    const clip = state.createTimelineClip({
      trackId: track.id,
      mediaAssetId: 'media::clip-video',
      sceneId: scene.id,
      startMs: 0,
      durationMs: 4000,
      sourceInMs: 0,
      sourceOutMs: 4000,
      label: 'Hero shot',
      posterUrl: 'file:///C:/vision-studio-output/clips/hero-poster.png',
    })!;
    state.upsertClipGenerationBinding({
      id: 'binding-1',
      clipId: clip.id,
      prompt: 'hero shot',
      negativePrompt: '',
      model: 'ltx-video',
      generationType: 'video',
      settings: {
        posterUrl: 'file:///C:/vision-studio-output/clips/hero-poster.png',
      },
      referenceSetIds: [],
      variantIds: [],
      lastRunSummary: null,
    });
    seedExtractedFrameAsset(
      'C:/vision-studio-output/frame-003/hero-poster-frame.png',
      '/outputs/frame-003/hero-poster-frame.png',
    );

    const promotion = promoteFrameToClip({
      assetPath: 'C:/vision-studio-output/frame-003/hero-poster-frame.png',
      clipId: clip.id,
    });

    const nextState = useAppStore.getState();
    expect(promotion.posterUrl).toBe('http://localhost:8000/outputs/frame-003/hero-poster-frame.png');
    expect(nextState.timelineClips.find((item) => item.id === clip.id)?.posterUrl).toBe(
      'http://localhost:8000/outputs/frame-003/hero-poster-frame.png',
    );
    expect(nextState.clipGenerationBindings.find((item) => item.id === 'binding-1')?.settings).toMatchObject({
      posterUrl: 'http://localhost:8000/outputs/frame-003/hero-poster-frame.png',
      sourceMediaAssetId: promotion.mediaAsset.id,
    });
  });
});
