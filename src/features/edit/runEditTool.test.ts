import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import {
  EDIT_BACKEND_DOWN_MESSAGE,
  NO_FACES_NOTICE,
  runEditTool,
} from './runEditTool';

function makeElectron(overrides: Record<string, unknown> = {}) {
  return {
    app: { getPath: vi.fn().mockResolvedValue('C:/users/u/AppData/Roaming/vision-studio') },
    settings: { get: vi.fn().mockResolvedValue({ defaultOutputPath: '' }) },
    generation: {
      editImage: vi.fn().mockResolvedValue({ success: true, jobId: 'job-1' }),
      getStatus: vi.fn().mockResolvedValue({
        job_id: 'job-1', status: 'completed', progress: 100, type: 'edit',
        created_at: '2026-07-05T00:00:00Z',
        result: { images: ['/outputs/job-1/edit_upscale.png'] },
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    ...overrides,
  } as any;
}

describe('runEditTool', () => {
  beforeEach(() => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: true },
      activeJobs: [],
      completedJobs: [],
      assetLibrary: [],
      currentImage: null,
      currentImageAssetPath: null,
    });
  });

  it('submits, polls to completion, and hands the result to the canvas', async () => {
    const electron = makeElectron();
    const result = await runEditTool('upscale', { source_path: 'C:/img.png', scale: 2 }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(electron.generation.editImage).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'upscale', source_path: 'C:/img.png', scale: 2 }),
    );
    const state = useAppStore.getState();
    expect(state.currentImage).toContain('/outputs/job-1/edit_upscale.png');
    // Terminal jobs move from activeJobs to completedJobs (store behavior).
    expect(state.completedJobs.find((job) => job.id === 'job-1')?.status).toBe('completed');
    expect(state.assetLibrary.length).toBeGreaterThan(0);
    expect(state.assetLibrary[0].type).toBe('image'); // edit outputs are image assets
  });

  it('refuses when the backend is down', async () => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: false },
    });
    const electron = makeElectron();
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result).toEqual({ ok: false, error: EDIT_BACKEND_DOWN_MESSAGE });
    expect(electron.generation.editImage).not.toHaveBeenCalled();
  });

  it('surfaces a failed job error verbatim (Foundry pointer preserved)', async () => {
    const message =
      "The AI upscale weights are not installed - install 'edit-realesrgan-x4plus' from the Foundry first.";
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'failed', progress: 0, type: 'edit', error: message,
      created_at: '2026-07-05T00:00:00Z',
    });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(message);
  });

  it('reports the zero-faces notice on restore-faces', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'completed', progress: 100, type: 'edit',
      created_at: '2026-07-05T00:00:00Z',
      result: { images: ['/outputs/job-1/edit_restore-faces.png'], faces_detected: 0 },
    });
    const result = await runEditTool('restore-faces', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.notice).toBe(NO_FACES_NOTICE);
  });

  it('does not raise the notice when faces were found', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'completed', progress: 100, type: 'edit',
      created_at: '2026-07-05T00:00:00Z',
      result: { images: ['/outputs/job-1/edit_restore-faces.png'], faces_detected: 2 },
    });
    const result = await runEditTool('restore-faces', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.notice).toBeUndefined();
  });

  it('cancelled jobs resolve silently without an error', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'cancelled', progress: 10, type: 'edit',
      created_at: '2026-07-05T00:00:00Z',
    });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('reports poll progress while processing', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        job_id: 'job-1', status: 'processing', progress: 40, type: 'edit',
        created_at: '2026-07-05T00:00:00Z',
      })
      .mockResolvedValue({
        job_id: 'job-1', status: 'completed', progress: 100, type: 'edit',
        created_at: '2026-07-05T00:00:00Z',
        result: { images: ['/outputs/job-1/edit_upscale.png'] },
      });
    const seen: number[] = [];
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0, onProgress: (progress) => seen.push(progress),
    });
    expect(result.ok).toBe(true);
    expect(seen).toContain(40);
  });

  it('submit failure surfaces the IPC error without polling', async () => {
    const electron = makeElectron();
    electron.generation.editImage = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'Edit operation failed' });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result).toEqual({ ok: false, error: 'Edit operation failed' });
    expect(electron.generation.getStatus).not.toHaveBeenCalled();
  });
});
