import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { selectDownloadFor } from './modelsSlice';
import type { DownloadJob } from '@/types/model';

function job(over: Partial<DownloadJob>): DownloadJob {
  return {
    model_id: 'flux-dev', status: 'downloading', progress: 0.5, speed: 1000,
    eta: 30, total_bytes: 100, error: null, gate_url: null, ...over,
  };
}

describe('modelsSlice downloads', () => {
  beforeEach(() => {
    useAppStore.setState({ downloads: {} });
  });

  it('refreshDownloads loads the queue keyed by model_id', async () => {
    const list = vi.fn().mockResolvedValue([job({ model_id: 'a' }), job({ model_id: 'b' })]);
    (globalThis as any).window = { electron: { models: { downloadsList: list } } };

    await useAppStore.getState().refreshDownloads();

    expect(Object.keys(useAppStore.getState().downloads).sort()).toEqual(['a', 'b']);
    expect(selectDownloadFor(useAppStore.getState(), 'a')?.model_id).toBe('a');
  });

  it('enqueueDownload optimistically records a queued job and calls the bridge', async () => {
    const download = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'queued' }));
    (globalThis as any).window = { electron: { models: { download } } };

    await useAppStore.getState().enqueueDownload('flux-dev');

    expect(download).toHaveBeenCalledWith('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('queued');
  });

  it('a backend error during enqueue leaves existing downloads intact', async () => {
    useAppStore.getState().setDownloadJob(job({ model_id: 'keep', status: 'downloading' }));
    const download = vi.fn().mockRejectedValue(new Error('backend down'));
    (globalThis as any).window = { electron: { models: { download } } };

    await useAppStore.getState().enqueueDownload('flux-dev');

    expect(useAppStore.getState().downloads['keep'].status).toBe('downloading');
  });

  it('pause/resume/cancel call the matching bridge and merge the returned job', async () => {
    const pause = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'paused' }));
    const resume = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'queued' }));
    const cancel = vi.fn().mockResolvedValue(job({ model_id: 'flux-dev', status: 'cancelled' }));
    (globalThis as any).window = {
      electron: { models: { downloadPause: pause, downloadResume: resume, downloadCancel: cancel } },
    };

    await useAppStore.getState().pauseDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('paused');
    await useAppStore.getState().resumeDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('queued');
    await useAppStore.getState().cancelDownload('flux-dev');
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('cancelled');
  });
});
