import { describe, expect, it, vi } from 'vitest';

import {
  type OpenRouterImageJob,
  createOpenRouterImageJobStore,
} from './openRouterImageJobs';

// Background: the OpenRouter still-image path keeps an in-process Map of
// jobs (separate from the Python backend's job store) so the IPC layer
// can resolve get-status, cancel, and list-jobs immediately without a
// network round-trip. Every mutation also broadcasts a renderer progress
// event so the UI can stream a job's lifecycle without polling.
//
// The store is constructed with an `emit` dependency injected so tests
// can observe progress events without standing up a BrowserWindow.

function makeJob(overrides: Partial<OpenRouterImageJob> = {}): OpenRouterImageJob {
  return {
    job_id: 'openrouter-image-test-1',
    status: 'pending',
    progress: 0,
    type: 'image',
    created_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('createOpenRouterImageJobStore', () => {
  it('returns a fresh, isolated store on each call (no shared module state)', () => {
    const a = createOpenRouterImageJobStore({ emit: vi.fn() });
    const b = createOpenRouterImageJobStore({ emit: vi.fn() });
    a.set(makeJob({ job_id: 'openrouter-image-shared-1' }));
    expect(a.get('openrouter-image-shared-1')).toBeTruthy();
    expect(b.get('openrouter-image-shared-1')).toBeNull();
  });

  describe('set / get', () => {
    it('stores a job and returns it from get', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      const job = makeJob();
      store.set(job);
      expect(store.get(job.job_id)).toEqual(job);
    });

    it('returns null when the job id is unknown', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      expect(store.get('does-not-exist')).toBeNull();
    });

    it('emits a generation:progress payload on set with the job snapshot', () => {
      const emit = vi.fn();
      const store = createOpenRouterImageJobStore({ emit });
      const job = makeJob({ status: 'pending', progress: 0 });
      store.set(job);
      expect(emit).toHaveBeenCalledWith('generation:progress', {
        type: 'job_update',
        job_id: job.job_id,
        status: 'pending',
        progress: 0,
      });
    });
  });

  describe('getStatus', () => {
    it('returns the job snapshot but strips the abortController to keep IPC serializable', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      const abortController = new AbortController();
      const job = makeJob({ abortController });
      store.set(job);

      const status = store.getStatus(job.job_id);
      expect(status).not.toBeNull();
      expect(status).not.toHaveProperty('abortController');
      expect(status?.job_id).toBe(job.job_id);
    });

    it('returns null when the job does not exist', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      expect(store.getStatus('missing')).toBeNull();
    });
  });

  describe('patch', () => {
    it('shallow-merges top-level fields into the existing job', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      store.set(makeJob({ status: 'pending', progress: 0 }));
      const updated = store.patch('openrouter-image-test-1', { status: 'processing', progress: 12 });
      expect(updated?.status).toBe('processing');
      expect(updated?.progress).toBe(12);
      // Untouched fields remain.
      expect(updated?.type).toBe('image');
    });

    it('shallow-merges the result subobject when both sides have one', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      store.set(
        makeJob({
          result: { provider: 'openrouter', seed: 42 },
        }),
      );
      const updated = store.patch('openrouter-image-test-1', {
        result: { images: ['/out/img-1.png'] },
      });
      expect(updated?.result).toEqual({
        provider: 'openrouter',
        seed: 42,
        images: ['/out/img-1.png'],
      });
    });

    it('keeps the old result when the patch does not include one', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      store.set(makeJob({ result: { seed: 7 } }));
      const updated = store.patch('openrouter-image-test-1', { progress: 50 });
      expect(updated?.result).toEqual({ seed: 7 });
    });

    it('returns null and does not emit when the job id is unknown', () => {
      const emit = vi.fn();
      const store = createOpenRouterImageJobStore({ emit });
      expect(store.patch('missing', { status: 'failed' })).toBeNull();
      expect(emit).not.toHaveBeenCalled();
    });

    it('emits a generation:progress payload after a successful patch', () => {
      const emit = vi.fn();
      const store = createOpenRouterImageJobStore({ emit });
      store.set(makeJob({ status: 'pending', progress: 0 }));
      emit.mockClear();
      store.patch('openrouter-image-test-1', { status: 'processing', progress: 25 });
      expect(emit).toHaveBeenCalledWith('generation:progress', {
        type: 'job_update',
        job_id: 'openrouter-image-test-1',
        status: 'processing',
        progress: 25,
      });
    });
  });

  describe('values', () => {
    it('returns every stored job as an array of snapshots without abortController', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      const a = makeJob({ job_id: 'openrouter-image-a', abortController: new AbortController() });
      const b = makeJob({ job_id: 'openrouter-image-b' });
      store.set(a);
      store.set(b);

      const all = store.values();
      expect(all).toHaveLength(2);
      for (const snapshot of all) {
        expect(snapshot).not.toHaveProperty('abortController');
      }
      expect(all.map((j) => j.job_id).sort()).toEqual(['openrouter-image-a', 'openrouter-image-b']);
    });

    it('returns an empty array on a fresh store', () => {
      const store = createOpenRouterImageJobStore({ emit: vi.fn() });
      expect(store.values()).toEqual([]);
    });
  });
});
