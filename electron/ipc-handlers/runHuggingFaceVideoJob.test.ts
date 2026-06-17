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
