import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceVideoJobStore } from './huggingfaceVideoJobs';
import { runHuggingFaceVideoJob } from './runHuggingFaceVideoJob';

const MP4_DATA_URL = `data:video/mp4;base64,${Buffer.from('ftypmp42').toString('base64')}`;

function makeAccount() {
  return {
    id: 'account-1',
    preferences: { huggingFaceVideoModel: 'Lightricks/LTX-Video' },
    huggingFace: { tokenStored: true },
  };
}

function setup({ tempRoot = '' } = {}) {
  const emit = vi.fn();
  const store = createHuggingFaceVideoJobStore({ emit });
  const userAccounts = {
    getAccount: vi.fn(() => makeAccount()),
    getHuggingFaceToken: vi.fn(() => 'hf_token' as string | null),
  };
  const huggingFace = {
    generateVideo: vi.fn(async () => ({ model: 'Lightricks/LTX-Video', dataUrl: MP4_DATA_URL, mimeType: 'video/mp4' })),
  };
  const outputRoots = { getResolvedOutputDirectory: vi.fn(() => tempRoot), rememberOutputRoot: vi.fn() };
  return { emit, store, userAccounts, huggingFace, deps: { store, userAccounts, huggingFace, outputRoots } };
}

describe('runHuggingFaceVideoJob', () => {
  it('fails the job with a sanitized error when no token is configured', async () => {
    const h = setup();
    h.userAccounts.getHuggingFaceToken = vi.fn(() => null);
    h.store.set({ job_id: 'huggingface-video-1', status: 'pending', progress: 0, type: 'video', created_at: '2026-06-17T00:00:00.000Z' });
    await runHuggingFaceVideoJob(
      'huggingface-video-1',
      { prompt: 'a wave', duration: 5, __huggingFaceAccountId: 'account-1' },
      h.deps,
    );
    const job = h.store.get('huggingface-video-1');
    expect(job?.status).toBe('failed');
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });

  it('runs the lifecycle to completed with a video result and never persists the token', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-video-2', status: 'pending', progress: 0, type: 'video', created_at: '2026-06-17T00:00:00.000Z' });
    await runHuggingFaceVideoJob(
      'huggingface-video-2',
      { prompt: 'a wave', duration: 5, __huggingFaceAccountId: 'account-1' },
      h.deps,
    );
    const job = h.store.get('huggingface-video-2');
    expect(job?.status).toBe('completed');
    expect(job?.progress).toBe(100);
    expect(job?.result?.provider).toBe('huggingface');
    expect(job?.result?.video).toBe(MP4_DATA_URL);
    expect(h.huggingFace.generateVideo).toHaveBeenCalledOnce();
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });
});

describe('runHuggingFaceVideoJob cancellation', () => {
  const jobId = 'huggingface-video-cancel';
  const params = { prompt: 'a wave', duration: 5, __huggingFaceAccountId: 'account-1' };

  function cancel(store: ReturnType<typeof createHuggingFaceVideoJobStore>) {
    store.patch(jobId, { status: 'cancelled', completed_at: new Date().toISOString() });
  }

  it('keeps a job cancelled while the request was in flight cancelled, not completed', async () => {
    const h = setup();
    h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'video', created_at: new Date().toISOString() });
    h.huggingFace.generateVideo = vi.fn(async () => {
      cancel(h.store);
      return { model: 'Lightricks/LTX-Video', dataUrl: MP4_DATA_URL, mimeType: 'video/mp4' };
    });

    await runHuggingFaceVideoJob(jobId, params, h.deps);

    expect(h.store.get(jobId)?.status).toBe('cancelled');
  });

  it('keeps a cancelled job cancelled when the aborted request rejects', async () => {
    const h = setup();
    h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'video', created_at: new Date().toISOString() });
    h.huggingFace.generateVideo = vi.fn(async () => {
      cancel(h.store);
      throw new DOMException('HuggingFace request was cancelled.', 'AbortError');
    });

    await runHuggingFaceVideoJob(jobId, params, h.deps);

    const job = h.store.get(jobId);
    expect(job?.status).toBe('cancelled');
    expect(job?.error).toBeUndefined();
  });

  it('deletes the written clip when the cancel lands during the write', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'hf-video-cancel-'));
    try {
      const h = setup({ tempRoot });
      h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'video', created_at: new Date().toISOString() });
      const deleteOrphans = vi.fn(async () => undefined);
      const patch = h.store.patch;
      h.store.patch = (id, next) => {
        const result = patch(id, next);
        // The cancel arrives right after the runner reports the write stage.
        if (next.progress === 72) cancel(h.store);
        return result;
      };

      await runHuggingFaceVideoJob(jobId, params, { ...h.deps, deleteOrphans });

      expect(h.store.get(jobId)?.status).toBe('cancelled');
      expect(deleteOrphans).toHaveBeenCalledWith([expect.stringContaining(jobId)], expect.anything());
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
