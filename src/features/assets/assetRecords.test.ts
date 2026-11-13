import { describe, expect, it } from 'vitest';
import {
  createMediaAssetFromAssetRecord,
  createImportedAssetRecords,
  createMediaAssetFromImportedFile,
  isMediaPlaceholderPreview,
  resolveAssetThumbnail,
  restoreAssetPlaceholders,
  restoreMediaAssetPlaceholders,
  stripAssetPlaceholders,
  stripMediaAssetPlaceholders,
  toPreviewUrl,
  upsertAssetsFromJobStatus,
} from './assetRecords';
import type { AssetRecord } from '@/types/assets';
import type { MediaAsset } from '@/types/media';

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

  it('creates managed imported asset records for local image and video files', () => {
    const assets = createImportedAssetRecords([], [
      {
        originalPath: 'C:/Users/User/Pictures/hero.png',
        importedPath: 'C:/vision-studio-output/imports/hero.png',
        name: 'hero',
        type: 'image',
        importedAt: '2026-04-22T12:00:00.000Z',
      },
      {
        originalPath: 'C:/Users/User/Videos/clip.mp4',
        importedPath: 'C:/vision-studio-output/imports/clip.mp4',
        name: 'clip',
        type: 'video',
        importedAt: '2026-04-22T12:01:00.000Z',
      },
      {
        originalPath: 'C:/Users/User/Music/score.wav',
        importedPath: 'C:/vision-studio-output/imports/score.wav',
        name: 'score',
        type: 'audio',
        importedAt: '2026-04-22T12:02:00.000Z',
      },
    ]);

    expect(assets).toHaveLength(3);
    expect(assets[0]).toMatchObject({
      id: 'import::C:/vision-studio-output/imports/score.wav',
      type: 'audio',
      path: 'C:/vision-studio-output/imports/score.wav',
    });
    expect(assets[0].previewUrl).toContain('data:image/svg+xml');
    expect(assets[0].params).toMatchObject({
      source: 'imported',
      original_path: 'C:/Users/User/Music/score.wav',
      reference_ready: true,
    });
    expect(assets[0]).toMatchObject({
      id: 'import::C:/vision-studio-output/imports/score.wav',
      type: 'audio',
      path: 'C:/vision-studio-output/imports/score.wav',
    });
    expect(assets[1]).toMatchObject({
      id: 'import::C:/vision-studio-output/imports/clip.mp4',
      type: 'video',
      path: 'C:/vision-studio-output/imports/clip.mp4',
    });
    expect(assets[1].previewUrl).toContain('data:image/svg+xml');
    expect(assets[1].params).toMatchObject({
      source: 'imported',
      original_path: 'C:/Users/User/Videos/clip.mp4',
      reference_ready: true,
    });
    expect(assets[2]).toMatchObject({
      id: 'import::C:/vision-studio-output/imports/hero.png',
      type: 'image',
      path: 'C:/vision-studio-output/imports/hero.png',
      previewUrl: 'file:///C:/vision-studio-output/imports/hero.png',
    });
  });

  it('creates an imported audio media asset with managed preview metadata', () => {
    const mediaAsset = createMediaAssetFromImportedFile({
      originalPath: 'C:/Users/User/Music/score.wav',
      importedPath: 'C:/vision-studio-output/imports/score.wav',
      name: 'score',
      type: 'audio',
      importedAt: '2026-04-22T12:02:00.000Z',
    });

    expect(mediaAsset).toMatchObject({
      id: 'media::C:/vision-studio-output/imports/score.wav',
      legacyAssetId: 'import::C:/vision-studio-output/imports/score.wav',
      source: 'imported',
      type: 'audio',
      path: 'C:/vision-studio-output/imports/score.wav',
      previewUrl: 'file:///C:/vision-studio-output/imports/score.wav',
      posterUrl: null,
    });
    expect(mediaAsset.thumbnailUrl).toContain('data:image/svg+xml');
    expect(mediaAsset.metadata).toMatchObject({
      originalPath: 'C:/Users/User/Music/score.wav',
      referenceReady: true,
    });
  });

  it('creates an imported media asset with adapter-friendly links', () => {
    const mediaAsset = createMediaAssetFromImportedFile({
      originalPath: 'C:/Users/User/Videos/clip.mp4',
      importedPath: 'C:/vision-studio-output/imports/clip.mp4',
      name: 'clip',
      type: 'video',
      importedAt: '2026-04-22T12:01:00.000Z',
    });

    expect(mediaAsset).toMatchObject({
      id: 'media::C:/vision-studio-output/imports/clip.mp4',
      legacyAssetId: 'import::C:/vision-studio-output/imports/clip.mp4',
      source: 'imported',
      type: 'video',
      path: 'C:/vision-studio-output/imports/clip.mp4',
      previewUrl: 'file:///C:/vision-studio-output/imports/clip.mp4',
    });
    expect(mediaAsset.thumbnailUrl).toContain('data:image/svg+xml');
    expect(mediaAsset.metadata).toMatchObject({
      originalPath: 'C:/Users/User/Videos/clip.mp4',
      referenceReady: true,
    });
  });

  it('creates a reusable media asset from an image asset record', () => {
    const mediaAsset = createMediaAssetFromAssetRecord({
      id: 'derived::C:/vision-studio-output/frames/shot-01.png',
      jobId: 'derived::C:/vision-studio-output/frames/shot-01.png',
      name: 'Shot 01 frame',
      type: 'image',
      path: 'C:/vision-studio-output/frames/shot-01.png',
      previewUrl: 'http://localhost:8000/outputs/frame-01.png',
      thumbnail: 'http://localhost:8000/outputs/frame-01.png',
      createdAt: '2026-04-23T09:00:00.000Z',
      prompt: 'hero close-up',
      negativePrompt: '',
      model: 'ltx-video',
      width: 1280,
      height: 720,
      favorite: false,
      params: {
        source: 'derived',
        reference_ready: true,
        extracted_from_video: 'C:/vision-studio-output/clips/hero.mp4',
      },
    });

    expect(mediaAsset).toMatchObject({
      id: 'media::asset::derived::C:/vision-studio-output/frames/shot-01.png',
      legacyAssetId: 'derived::C:/vision-studio-output/frames/shot-01.png',
      source: 'derived',
      type: 'image',
      path: 'C:/vision-studio-output/frames/shot-01.png',
      previewUrl: 'http://localhost:8000/outputs/frame-01.png',
      thumbnailUrl: 'http://localhost:8000/outputs/frame-01.png',
      posterUrl: 'http://localhost:8000/outputs/frame-01.png',
    });
    expect(mediaAsset.metadata).toMatchObject({
      fromAssetLibrary: true,
      prompt: 'hero close-up',
      model: 'ltx-video',
      referenceReady: true,
      extracted_from_video: 'C:/vision-studio-output/clips/hero.mp4',
    });
  });
});

describe('video/audio placeholders are rendered from the type (#J3)', () => {
  const placeholder = toPreviewUrl('D:/a.mp4', { type: 'video', label: 'Clip' });
  const record = (overrides: Partial<AssetRecord> = {}): AssetRecord => ({
    id: 'a',
    jobId: 'a',
    name: 'Clip',
    type: 'video',
    path: 'D:/a.mp4',
    previewUrl: placeholder,
    thumbnail: placeholder,
    createdAt: '2026-01-01T00:00:00Z',
    prompt: '',
    negativePrompt: '',
    favorite: false,
    params: {},
    ...overrides,
  });

  it('builds each placeholder once and shares it', () => {
    expect(toPreviewUrl('D:/b.mp4', { type: 'video', label: 'Clip' })).toBe(placeholder);
    expect(isMediaPlaceholderPreview(placeholder)).toBe(true);
    expect(isMediaPlaceholderPreview('http://localhost:8000/outputs/x.png')).toBe(false);
  });

  it('escapes the label before it enters SVG markup', () => {
    const url = toPreviewUrl('D:/c.mp4', { type: 'audio', label: '<script>&"' });
    expect(decodeURIComponent(url)).toContain('&lt;script&gt;&amp;&quot;');
  });

  it('strips placeholders for storage and restores them from the type and name', () => {
    const stripped = stripAssetPlaceholders(record());
    expect(stripped).toMatchObject({ previewUrl: '', thumbnail: '' });
    expect(restoreAssetPlaceholders(stripped)).toEqual(record());
    expect(resolveAssetThumbnail(stripped)).toBe(placeholder);
  });

  it('leaves image records and real previews untouched', () => {
    const image = record({ type: 'image', previewUrl: 'http://x/y.png', thumbnail: 'http://x/y.png' });
    expect(stripAssetPlaceholders(image)).toBe(image);
    const custom = record({ thumbnail: 'file:///poster.png', previewUrl: 'file:///a.mp4' });
    expect(stripAssetPlaceholders(custom)).toBe(custom);
  });

  it('keeps a deliberate null poster on media assets', () => {
    const media: MediaAsset = {
      id: 'm', name: 'Clip', type: 'video', source: 'generated', path: 'D:/a.mp4', previewUrl: 'D:/a.mp4',
      thumbnailUrl: placeholder, posterUrl: null, metadata: {}, createdAt: '2026-01-01T00:00:00Z',
    };
    const stripped = stripMediaAssetPlaceholders(media);
    expect(stripped).toMatchObject({ thumbnailUrl: '', posterUrl: null, previewUrl: 'D:/a.mp4' });
    expect(restoreMediaAssetPlaceholders(stripped)).toEqual(media);
  });
});

