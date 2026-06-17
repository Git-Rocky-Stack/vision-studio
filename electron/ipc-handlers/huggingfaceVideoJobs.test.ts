import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceVideoJobStore } from './huggingfaceVideoJobs';

describe('createHuggingFaceVideoJobStore', () => {
  it('broadcasts progress on set and patch, and strips the AbortController from snapshots', () => {
    const emit = vi.fn();
    const store = createHuggingFaceVideoJobStore({ emit });

    store.set({
      job_id: 'huggingface-video-1',
      status: 'pending',
      progress: 0,
      type: 'video',
      created_at: '2026-06-17T00:00:00.000Z',
      abortController: new AbortController(),
    });
    expect(emit).toHaveBeenCalledWith('generation:progress', expect.objectContaining({ job_id: 'huggingface-video-1' }));

    store.patch('huggingface-video-1', { status: 'completed', progress: 100, result: { video: '/out/clip.mp4' } });
    const snapshot = store.getStatus('huggingface-video-1');
    expect(snapshot?.status).toBe('completed');
    expect(snapshot?.result?.video).toBe('/out/clip.mp4');
    expect((snapshot as Record<string, unknown>).abortController).toBeUndefined();
  });

  it('merges result patches without dropping existing fields', () => {
    const emit = vi.fn();
    const store = createHuggingFaceVideoJobStore({ emit });
    store.set({ job_id: 'v', status: 'processing', progress: 50, type: 'video', created_at: '2026-06-17T00:00:00.000Z' });
    store.patch('v', { result: { provider: 'huggingface', model: 'Lightricks/LTX-Video' } });
    store.patch('v', { result: { video: '/out/v.mp4' } });
    const snapshot = store.getStatus('v');
    expect(snapshot?.result).toMatchObject({ provider: 'huggingface', model: 'Lightricks/LTX-Video', video: '/out/v.mp4' });
  });
});
