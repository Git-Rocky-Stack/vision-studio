import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { DownloadJob, ModelRecord } from '@/types/model';
import { startModelReadyNotifications } from './modelReadyNotifications';

function job(modelId: string, status: DownloadJob['status']): DownloadJob {
  return {
    model_id: modelId,
    status,
    progress: status === 'ready' ? 1 : 0.5,
    speed: 0,
    eta: 0,
    total_bytes: 100,
    error: null,
    gate_url: null,
  } as DownloadJob;
}

describe('startModelReadyNotifications (#J11)', () => {
  let notify: ReturnType<typeof vi.fn<(type: string, payload: { title: string; body: string }) => Promise<{ success: boolean }>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(useAppStore.getInitialState());
    notify = vi.fn().mockResolvedValue({ success: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function start() {
    const loadModels = vi.fn(async () => {
      useAppStore.setState({
        availableModels: [{ id: 'sdxl-base', name: 'SDXL Base' } as ModelRecord],
      });
    });
    const refreshDownloads = vi.fn(async () => undefined);
    useAppStore.setState({ loadModels, refreshDownloads });
    const stop = startModelReadyNotifications({
      store: useAppStore,
      electron: () => ({ notifications: { notify } }),
      pollIntervalMs: 1000,
    });
    return { stop, loadModels, refreshDownloads };
  }

  it('notifies once when a download finishes, wherever the user is', async () => {
    useAppStore.setState({ downloads: { 'sdxl-base': job('sdxl-base', 'downloading') } });
    const { stop, loadModels } = start();

    useAppStore.setState({ downloads: { 'sdxl-base': job('sdxl-base', 'ready') } });
    await vi.advanceTimersByTimeAsync(0);
    // A later unrelated write must not repeat it.
    useAppStore.setState({ downloads: { 'sdxl-base': job('sdxl-base', 'ready') } });
    await vi.advanceTimersByTimeAsync(0);

    expect(loadModels).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('model_download', {
      title: 'Model Ready',
      body: 'SDXL Base is installed and ready to use.',
    });
    stop();
  });

  it('does not announce a download that was already ready when first seen', async () => {
    useAppStore.setState({ downloads: { 'sdxl-base': job('sdxl-base', 'ready') } });
    const { stop } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).not.toHaveBeenCalled();
    stop();
  });

  it('polls the queue only while a download is in flight', async () => {
    useAppStore.setState({ downloads: { a: job('a', 'downloading') } });
    const { stop, refreshDownloads } = start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(refreshDownloads).toHaveBeenCalledTimes(3);

    useAppStore.setState({ downloads: { a: job('a', 'error') } });
    const calls = refreshDownloads.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(refreshDownloads.mock.calls.length).toBeLessThanOrEqual(calls + 1);
    stop();
  });

  it('stops polling and notifying after teardown', async () => {
    useAppStore.setState({ downloads: { a: job('a', 'downloading') } });
    const { stop, refreshDownloads } = start();
    stop();
    useAppStore.setState({ downloads: { a: job('a', 'ready') } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(refreshDownloads).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
