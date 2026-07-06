import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { JobStatus } from '@/types/electron';

import {
  BACKEND_DOWN_MESSAGE,
  EMPTY_PROMPT_MESSAGE,
  runStudioGeneration,
} from './runStudioGeneration';

const DRAFT = {
  generationType: 'image' as const,
  prompt: 'a chrome rack unit',
  negativePrompt: 'blurry',
  width: 512,
  height: 512,
  steps: 8,
  cfgScale: 7.5,
  model: 'sd-1-5',
  scheduler: 'Euler a',
  seed: 42,
};

function makeElectronMock({
  submit = { success: true as boolean, jobId: 'job-1' as string | undefined, error: undefined as string | undefined },
  statuses = [] as Array<Partial<JobStatus>>,
} = {}) {
  const statusQueue = [...statuses];
  return {
    app: { getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/vision-studio') },
    settings: { get: vi.fn().mockResolvedValue({ defaultOutputPath: '' }) },
    generation: {
      generateImage: vi.fn().mockResolvedValue(submit),
      getStatus: vi.fn().mockImplementation(() =>
        Promise.resolve(statusQueue.length > 1 ? statusQueue.shift() : statusQueue[0]),
      ),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: { notify: vi.fn().mockResolvedValue({ success: true }) },
  };
}

function seedReadyStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState((state) => ({
    systemInfo: { ...state.systemInfo, backendConnected: true },
    generationDraft: { ...DRAFT },
  }));
}

describe('runStudioGeneration', () => {
  beforeEach(seedReadyStore);

  it('refuses an empty prompt with the honest message and no submit', async () => {
    useAppStore.setState((state) => ({
      generationDraft: { ...state.generationDraft!, prompt: '   ' },
    }));
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false, error: EMPTY_PROMPT_MESSAGE });
    expect(useAppStore.getState().previewError).toBe(EMPTY_PROMPT_MESSAGE);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('refuses when the backend is down', async () => {
    useAppStore.setState((state) => ({
      systemInfo: { ...state.systemInfo, backendConnected: false },
    }));
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.error).toBe(BACKEND_DOWN_MESSAGE);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('is a silent no-op while a preview run is already active', async () => {
    useAppStore.getState().beginPreview('running-job', 8);
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false });
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('submits the draft config, arms the preview, and hands off on completion', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 50 },
        {
          job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
          completed_at: '2026-07-05T10:00:00.000Z', progress: 100,
          result: { images: ['/outputs/job-1/generated.png'], seed: 42 },
        },
      ],
    });

    const armed: Array<{ jobId: string | null; active: boolean }> = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      armed.push({ jobId: state.previewJobId, active: state.isPreviewActive });
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });
    unsubscribe();

    expect(result).toEqual({ ok: true, jobId: 'job-1' });
    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a chrome rack unit',
        negative_prompt: 'blurry',
        width: 512,
        height: 512,
        steps: 8,
        cfg_scale: 7.5,
        seed: 42,
        model: 'sd-1-5',
        scheduler: 'Euler a',
        acceleration_settings: expect.any(Object),
      }),
    );
    // Preview was armed for job-1 at some point...
    expect(armed.some((entry) => entry.jobId === 'job-1' && entry.active)).toBe(true);

    const state = useAppStore.getState();
    // ...and torn down after handoff.
    expect(state.isPreviewActive).toBe(false);
    expect(state.previewJobId).toBeNull();
    expect(state.previewError).toBeNull();
    // Handoff: the finished image became the composition reference.
    expect(state.currentImage).toBe('http://localhost:8000/outputs/job-1/generated.png');
    // The job landed in history and the asset library synced.
    expect(state.completedJobs.some((job) => job.id === 'job-1')).toBe(true);
    expect(state.assetLibrary.some((asset) => asset.id === 'job-1::/outputs/job-1/generated.png')).toBe(true);
    expect(electron.notifications.notify).toHaveBeenCalledWith(
      'generation_complete', expect.any(Object));
  });

  it('drives the counter from poll progress', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 50 },
        {
          job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
          progress: 100, result: { images: [] },
        },
      ],
    });

    let sawStep = 0;
    const unsubscribe = useAppStore.subscribe((state) => {
      sawStep = Math.max(sawStep, state.currentStep);
    });
    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });
    unsubscribe();

    // 50% of 8 steps -> step 4.
    expect(sawStep).toBe(4);
  });

  it('surfaces a failed job through previewError and clears the preview', async () => {
    const electron = makeElectronMock({
      statuses: [
        {
          job_id: 'job-1', status: 'failed', type: 'image', created_at: 'x',
          progress: 30, error: 'The model refused to load.',
        },
      ],
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.ok).toBe(false);
    const state = useAppStore.getState();
    expect(state.previewError).toBe('The model refused to load.');
    expect(state.isPreviewActive).toBe(false);
    expect(electron.notifications.notify).toHaveBeenCalledWith(
      'generation_failed', expect.any(Object));
  });

  it('treats a cancelled job as a silent teardown', async () => {
    const electron = makeElectronMock({
      statuses: [
        { job_id: 'job-1', status: 'cancelled', type: 'image', created_at: 'x', progress: 30 },
      ],
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().previewError).toBeNull();
    expect(electron.notifications.notify).not.toHaveBeenCalled();
  });

  it('stops touching the preview once another run took it over', async () => {
    let polls = 0;
    const electron = makeElectronMock();
    electron.generation.getStatus = vi.fn().mockImplementation(() => {
      polls += 1;
      if (polls === 1) {
        // Simulate the user cancelling + a NEW run arming the preview mid-poll.
        useAppStore.getState().clearPreview();
        useAppStore.getState().beginPreview('job-2', 8);
        return Promise.resolve({
          job_id: 'job-1', status: 'processing', type: 'image', created_at: 'x', progress: 75,
        });
      }
      return Promise.resolve({
        job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
        progress: 100, result: { images: [] },
      });
    });

    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    const state = useAppStore.getState();
    // The stale run must not clear or advance job-2's preview.
    expect(state.previewJobId).toBe('job-2');
    expect(state.isPreviewActive).toBe(true);
    expect(state.currentStep).toBe(0);
  });

  it('fails the run after five consecutive poll errors', async () => {
    const electron = makeElectronMock();
    electron.generation.getStatus = vi.fn().mockRejectedValue(new Error('socket dead'));

    const result = await runStudioGeneration({
      electron, store: useAppStore, pollIntervalMs: 0, pollRetryMs: 0,
    });

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().previewError).toMatch(/Lost connection/);
    expect(electron.generation.getStatus).toHaveBeenCalledTimes(5);
  });

  it('sets previewError when the submit itself fails', async () => {
    const electron = makeElectronMock({
      submit: { success: false, jobId: undefined, error: 'Model not installed.' },
    });

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result).toEqual({ ok: false, error: 'Model not installed.' });
    expect(useAppStore.getState().previewError).toBe('Model not installed.');
    expect(useAppStore.getState().isPreviewActive).toBe(false);
  });

  it('falls back to selectedImageModelId when the draft has no model', async () => {
    const electron = makeElectronMock({
      statuses: [{
        job_id: 'job-1', status: 'completed', type: 'image', created_at: 'x',
        progress: 100, result: { images: [] },
      }],
    });

    useAppStore.setState((state) => ({
      generationDraft: { ...state.generationDraft!, model: '  ' },
      selectedImageModelId: 'sdxl-base',
    }));
    await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(electron.generation.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'sdxl-base' }),
    );
  });

  it('refuses with the empty-prompt message when no draft exists at all', async () => {
    useAppStore.setState({ generationDraft: null });
    const electron = makeElectronMock();

    const result = await runStudioGeneration({ electron, store: useAppStore, pollIntervalMs: 0 });

    expect(result.error).toBe(EMPTY_PROMPT_MESSAGE);
    expect(electron.generation.generateImage).not.toHaveBeenCalled();
  });
});
