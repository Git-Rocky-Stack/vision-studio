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
    generateControlNet: vi.fn(async () => imageResult),
    generateInpaint: vi.fn(async () => imageResult),
  };
  const outputRoots = {
    getResolvedOutputDirectory: vi.fn(() => tempRoot),
    rememberOutputRoot: vi.fn(),
    getManagedOutputRoots: vi.fn(() => ['/srv/vision/output']),
  };
  const readImageFile = vi.fn(async () => ({
    base64: 'aW1n',
    mimeType: 'image/png',
    dimensions: { width: 512, height: 512 },
  }));
  return {
    emit,
    store,
    userAccounts,
    huggingFace,
    readImageFile,
    deps: { store, userAccounts, huggingFace, outputRoots, readImageFile },
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

  it('routes a ControlNet pass through generateControlNet using the control image', async () => {
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
    expect(h.huggingFace.generateControlNet).toHaveBeenCalledOnce();
    expect(h.readImageFile).toHaveBeenCalledWith('/srv/vision/output/edge.png', ['/srv/vision/output']);
    expect(h.store.get('huggingface-image-cn')?.status).toBe('completed');
  });

  it('rejects multi-layer ControlNet instead of silently dropping the extra guides', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-cn-multi', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob(
      'huggingface-image-cn-multi',
      {
        prompt: 'a city',
        width: 512,
        height: 512,
        __huggingFaceAccountId: 'account-1',
        controlnet: [
          { source_path: '/srv/vision/output/edge.png', preprocessor: 'canny' },
          { source_path: '/srv/vision/output/depth.png', preprocessor: 'depth' },
        ],
      },
      h.deps,
    );
    const job = h.store.get('huggingface-image-cn-multi');
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('single control image');
    // No guide was used, and no control image was read off disk.
    expect(h.huggingFace.generateControlNet).not.toHaveBeenCalled();
    expect(h.readImageFile).not.toHaveBeenCalled();
  });

  it('routes an inpaint pass through generateInpaint with a rasterized mask', async () => {
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
    expect(h.huggingFace.generateInpaint).toHaveBeenCalledOnce();
    const [args] = h.huggingFace.generateInpaint.mock.calls[0] as unknown as [
      { maskImageBase64: string; initImageBase64: string },
    ];
    expect(typeof args.maskImageBase64).toBe('string');
    expect(args.maskImageBase64.length).toBeGreaterThan(0);
    expect(args.initImageBase64).toBe('aW1n');
    expect(h.store.get('huggingface-image-ip')?.status).toBe('completed');
  });
});
