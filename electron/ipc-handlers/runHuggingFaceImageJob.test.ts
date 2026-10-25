import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { runHuggingFaceImageJob } from './runHuggingFaceImageJob';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`;

function makeAccount() {
  return {
    id: 'account-1',
    preferences: { huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell' },
    huggingFace: { tokenStored: true },
  };
}

function setup({ tempRoot = '' } = {}) {
  const emit = vi.fn();
  const store = createHuggingFaceImageJobStore({ emit });
  const userAccounts = {
    getAccount: vi.fn(() => makeAccount()),
    getHuggingFaceToken: vi.fn(() => 'hf_token' as string | null),
  };
  const imageResult = { model: 'm', images: [{ dataUrl: PNG_DATA_URL, mimeType: 'image/png' }], usage: null };
  const huggingFace = {
    generateImage: vi.fn(async () => imageResult),
  };
  const outputRoots = {
    getResolvedOutputDirectory: vi.fn(() => tempRoot),
    rememberOutputRoot: vi.fn(),
    getManagedOutputRoots: vi.fn(() => ['/srv/vision/output']),
  };
  return {
    emit,
    store,
    userAccounts,
    huggingFace,
    deps: { store, userAccounts, huggingFace, outputRoots },
  };
}

describe('runHuggingFaceImageJob', () => {
  it('fails the job with a sanitized error when no token is configured', async () => {
    const h = setup();
    h.userAccounts.getHuggingFaceToken = vi.fn(() => null);
    h.store.set({ job_id: 'huggingface-image-1', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-1',
      { prompt: 'a tree', width: 512, height: 512, __huggingFaceAccountId: 'account-1' },
      h.deps,
    );
    const job = h.store.get('huggingface-image-1');
    expect(job?.status).toBe('failed');
    expect(job?.error).toBeTruthy();
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });

  it('runs the lifecycle to completed and never persists the token', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-2', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-2',
      { prompt: 'a tree', width: 512, height: 512, seed: 7, __huggingFaceAccountId: 'account-1' },
      h.deps,
    );
    const job = h.store.get('huggingface-image-2');
    expect(job?.status).toBe('completed');
    expect(job?.progress).toBe(100);
    expect(job?.result?.provider).toBe('huggingface');
    expect(h.huggingFace.generateImage).toHaveBeenCalledOnce();
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });

  it('rejects a ControlNet pass: HuggingFace has no documented hosted ControlNet contract', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-cn', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-cn',
      {
        prompt: 'a city',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        controlnet: [{ source_path: '/srv/vision/output/edge.png', preprocessor: 'canny' }],
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-cn');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/ControlNet or inpaint/i);
    expect(job?.error).toMatch(/back to Local/i);
    // The guides were not silently dropped into a plain prompt run.
    expect(h.huggingFace.generateImage).not.toHaveBeenCalled();
  });

  it('forwards a valid single weight-1.0 LoRA as the adapter repo id (#42)', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-lora', status: 'pending', progress: 0, type: 'image', created_at: '2026-07-12T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-lora',
      {
        prompt: 'a tree',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        loras: [{ id: 'flux-realism', weight: 1 }],
        __huggingFaceLoraAdapter: 'XLabs-AI/flux-RealismLora',
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-lora');
    expect(job?.status).toBe('completed');
    expect(h.huggingFace.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ adapterRepoId: 'XLabs-AI/flux-RealismLora' }),
    );
  });

  it('rejects a LoRA weight other than 1.0 instead of silently running it at default (#42)', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-lora-w', status: 'pending', progress: 0, type: 'image', created_at: '2026-07-12T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-lora-w',
      {
        prompt: 'a tree',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        loras: [{ id: 'flux-realism', weight: 0.8 }],
        __huggingFaceLoraAdapter: 'XLabs-AI/flux-RealismLora',
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-lora-w');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/weight 1\.0/);
    expect(h.huggingFace.generateImage).not.toHaveBeenCalled();
  });

  it('rejects a LoRA-bearing job with no resolved adapter instead of dropping the LoRA (#42)', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-lora-na', status: 'pending', progress: 0, type: 'image', created_at: '2026-07-12T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-lora-na',
      {
        prompt: 'a tree',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        loras: [{ id: 'flux-ink', weight: 1 }],
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-lora-na');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/back to Local/i);
    expect(h.huggingFace.generateImage).not.toHaveBeenCalled();
  });

  it('rejects a multi-LoRA job: the adapter contract carries exactly one (#42)', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-lora-m', status: 'pending', progress: 0, type: 'image', created_at: '2026-07-12T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-lora-m',
      {
        prompt: 'a tree',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        loras: [
          { id: 'flux-realism', weight: 1 },
          { id: 'flux-ink', weight: 1 },
        ],
        __huggingFaceLoraAdapter: 'XLabs-AI/flux-RealismLora',
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-lora-m');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/exactly one LoRA/);
    expect(h.huggingFace.generateImage).not.toHaveBeenCalled();
  });

  it('rejects an inpaint pass: HuggingFace has no documented hosted mask contract', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-ip', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-ip',
      {
        prompt: 'a dog',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        image_path: '/srv/vision/output/base.png',
        inpaint: {
          image_path: '/srv/vision/output/base.png',
          mask: { type: 'rectangle', points: [], bounds: { x: 0, y: 0, width: 100, height: 100 } },
        },
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-ip');
    expect(job?.status).toBe('failed');
    expect(job?.error).toMatch(/ControlNet or inpaint/i);
    expect(h.huggingFace.generateImage).not.toHaveBeenCalled();
  });
});

describe('runHuggingFaceImageJob cancellation', () => {
  const jobId = 'huggingface-image-cancel';
  const params = { prompt: 'a tree', width: 512, height: 512, __huggingFaceAccountId: 'account-1' };

  function cancel(store: ReturnType<typeof createHuggingFaceImageJobStore>) {
    store.patch(jobId, { status: 'cancelled', completed_at: new Date().toISOString() });
  }

  it('keeps a job cancelled while the request was in flight cancelled, not completed', async () => {
    const h = setup();
    h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'image', created_at: new Date().toISOString() });
    h.huggingFace.generateImage = vi.fn(async () => {
      cancel(h.store);
      return { model: 'm', images: [{ dataUrl: PNG_DATA_URL, mimeType: 'image/png' }], usage: null };
    });

    await runHuggingFaceImageJob(jobId, params, h.deps);

    expect(h.store.get(jobId)?.status).toBe('cancelled');
  });

  it('keeps a cancelled job cancelled when the aborted request rejects', async () => {
    const h = setup();
    h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'image', created_at: new Date().toISOString() });
    h.huggingFace.generateImage = vi.fn(async () => {
      cancel(h.store);
      throw new DOMException('HuggingFace request was cancelled.', 'AbortError');
    });

    await runHuggingFaceImageJob(jobId, params, h.deps);

    const job = h.store.get(jobId);
    expect(job?.status).toBe('cancelled');
    expect(job?.error).toBeUndefined();
  });

  it('deletes the written files when the cancel lands during the write', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'hf-cancel-'));
    try {
      const h = setup({ tempRoot });
      h.store.set({ job_id: jobId, status: 'pending', progress: 0, type: 'image', created_at: new Date().toISOString() });
      const deleteOrphans = vi.fn(async () => undefined);
      const patch = h.store.patch;
      h.store.patch = (id, next) => {
        const result = patch(id, next);
        // The cancel arrives right after the runner reports the write stage.
        if (next.progress === 72) cancel(h.store);
        return result;
      };

      await runHuggingFaceImageJob(jobId, params, { ...h.deps, deleteOrphans });

      expect(h.store.get(jobId)?.status).toBe('cancelled');
      expect(deleteOrphans).toHaveBeenCalledWith([expect.stringContaining(jobId)], expect.anything());
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
