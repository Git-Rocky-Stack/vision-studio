import { describe, expect, it } from 'vitest';
import { upsertAssetsFromJobStatus } from './assetRecords';

describe('upsertAssetsFromJobStatus', () => {
  it('creates a persistent image asset record from a completed job', () => {
    const assets = upsertAssetsFromJobStatus([], {
      job_id: 'job-image-1',
      status: 'completed',
      type: 'image',
      created_at: '2026-03-11T12:00:00.000Z',
      result: {
        images: ['/outputs/job-image-1/image_001.png'],
        seed: 42,
      },
      params: {
        prompt: 'cinematic portrait',
        negative_prompt: 'blurry',
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 7.5,
        model: 'flux-dev',
      },
    });

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'job-image-1::/outputs/job-image-1/image_001.png',
      jobId: 'job-image-1',
      type: 'image',
      path: '/outputs/job-image-1/image_001.png',
      prompt: 'cinematic portrait',
      negativePrompt: 'blurry',
      seed: 42,
      model: 'flux-dev',
      width: 1024,
      height: 1024,
      favorite: false,
    });
  });

  it('updates an existing asset record instead of duplicating it', () => {
    const initial = upsertAssetsFromJobStatus([], {
      job_id: 'job-image-1',
      status: 'completed',
      type: 'image',
      created_at: '2026-03-11T12:00:00.000Z',
      result: {
        images: ['/outputs/job-image-1/image_001.png'],
        seed: 42,
      },
      params: {
        prompt: 'cinematic portrait',
        width: 1024,
        height: 1024,
        model: 'flux-dev',
      },
    });

    const updated = upsertAssetsFromJobStatus(initial, {
      job_id: 'job-image-1',
      status: 'completed',
      type: 'image',
      created_at: '2026-03-11T12:00:00.000Z',
      result: {
        images: ['/outputs/job-image-1/image_001.png'],
        seed: 99,
      },
      params: {
        prompt: 'refined cinematic portrait',
        width: 1024,
        height: 1024,
        model: 'flux-dev',
      },
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      prompt: 'refined cinematic portrait',
      seed: 99,
    });
  });

  it('creates a persistent video asset record from a completed job', () => {
    const assets = upsertAssetsFromJobStatus([], {
      job_id: 'job-video-1',
      status: 'completed',
      type: 'video',
      created_at: '2026-03-11T12:00:00.000Z',
      result: {
        video: '/outputs/job-video-1/video_001.mp4',
        duration: 5,
      },
      params: {
        prompt: 'product spin video',
        width: 1920,
        height: 1080,
        fps: 24,
        model: 'ltx-video',
      },
    });

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      type: 'video',
      path: '/outputs/job-video-1/video_001.mp4',
      duration: 5,
      fps: 24,
      model: 'ltx-video',
    });
  });

  it('stores an absolute file path when the output root is known', () => {
    const assets = upsertAssetsFromJobStatus([], {
      job_id: 'job-image-2',
      status: 'completed',
      type: 'image',
      created_at: '2026-03-11T12:00:00.000Z',
      result: {
        images: ['/outputs/job-image-2/image_001.png'],
      },
      params: {
        prompt: 'absolute path test',
        output_root: 'D:/VisionStudio/Outputs',
      },
    });

    expect(assets[0]).toMatchObject({
      path: 'D:/VisionStudio/Outputs/job-image-2/image_001.png',
      previewUrl: 'http://localhost:8000/outputs/job-image-2/image_001.png',
    });
  });
});
