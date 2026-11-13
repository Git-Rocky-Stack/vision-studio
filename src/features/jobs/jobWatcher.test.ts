import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { createJobWatcher, JOB_LOST_MESSAGE, type JobWatcherElectronApi, type TrackJobSpec } from './jobWatcher';
import type { JobStatus } from '@/types/electron';

function completed(jobId: string, extra: Partial<JobStatus['result']> = {}): JobStatus {
  return {
    job_id: jobId,
    status: 'completed',
    progress: 100,
    type: 'image',
    created_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:00:05Z',
    result: { images: [`/outputs/${jobId}/image.png`], seed: 7, ...extra },
  };
}

function makeElectron(getStatus: (jobId: string) => Promise<unknown>) {
  return {
    generation: {
      getStatus: vi.fn(getStatus) as unknown as JobWatcherElectronApi['generation']['getStatus'],
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: { notify: vi.fn().mockResolvedValue({ success: true }) },
  } satisfies JobWatcherElectronApi;
}

function addActiveJob(id: string, params: Record<string, unknown> = {}) {
  useAppStore.getState().addJob({
    id,
    type: 'image',
    status: 'pending',
    progress: 0,
    params: { prompt: 'a lighthouse', output_root: 'D:/Outputs', origin: 'generate', ...params },
    createdAt: new Date(),
  });
}

const spec = (overrides: Partial<TrackJobSpec> = {}): TrackJobSpec => ({
  jobId: 'job-1',
  kind: 'image',
  origin: 'generate',
  prompt: 'a lighthouse',
  outputRoot: 'D:/Outputs',
  ...overrides,
});

describe('createJobWatcher (#J1/#J2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function watcherFor(electron: ReturnType<typeof makeElectron>) {
    return createJobWatcher({
      store: useAppStore,
      electron: () => electron,
      progressEvents: null,
      watchOptions: { pollIntervalMs: 100, maxPollIntervalMs: 100, retryIntervalMs: 100 },
    });
  }

  it('settles a job with no panel mounted: record, asset sync, acceleration and one notification', async () => {
    const statuses: JobStatus[] = [
      { ...completed('job-1'), status: 'processing', progress: 40 },
      completed('job-1', { acceleration: { applied: ['sdpa'], skipped: [], fell_back: [] } }),
    ];
    const electron = makeElectron(async () => statuses.shift());
    addActiveJob('job-1');
    const watcher = watcherFor(electron);

    const done = watcher.track(spec());
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    const state = useAppStore.getState();
    expect(state.activeJobs).toHaveLength(0);
    expect(state.completedJobs[0]).toMatchObject({ id: 'job-1', status: 'completed' });
    expect(state.completedJobs[0].result?.images).toEqual(['/outputs/job-1/image.png']);
    expect(state.assetLibrary.map((asset) => asset.id)).toEqual(['job-1::/outputs/job-1/image.png']);
    expect(state.assetLibrary[0].path).toBe('D:/Outputs/job-1/image.png');
    expect(state.lastAppliedAcceleration?.applied).toEqual(['sdpa']);
    expect(electron.notifications.notify).toHaveBeenCalledTimes(1);
    expect(electron.notifications.notify).toHaveBeenCalledWith('generation_complete', {
      title: 'Image Ready',
      body: 'a lighthouse',
    });
    expect(watcher.isTracking('job-1')).toBe(false);
  });

  it('feeds the Canvas generation strip: queued on submit, thumbnail on completion', async () => {
    const statuses: JobStatus[] = [{ ...completed('job-1'), status: 'processing', progress: 10 }, completed('job-1')];
    const electron = makeElectron(async () => statuses.shift());
    addActiveJob('job-1');
    const watcher = watcherFor(electron);

    const done = watcher.track(spec());
    expect(useAppStore.getState().generationQueue).toEqual([
      expect.objectContaining({ id: 'job-1', status: 'pending', prompt: 'a lighthouse' }),
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    const [item] = useAppStore.getState().generationQueue;
    expect(item.status).toBe('completed');
    expect(item.thumbnail).toBe('http://localhost:8000/outputs/job-1/image.png');
    // The library path travels with the tile, so loading it keeps it editable.
    expect(item.assetPath).toBe('D:/Outputs/job-1/image.png');
  });

  it('honours a superseded output: no asset sync, the replacement on the strip and the iteration node', async () => {
    const electron = makeElectron(async () => completed('job-1'));
    addActiveJob('job-1', { suppressAssetSync: true, replacedByAssetPath: 'D:/Edits/job-1-region.png' });
    const watcher = watcherFor(electron);
    await watcher.track(spec());

    const state = useAppStore.getState();
    expect(state.assetLibrary).toHaveLength(0);
    const [item] = state.generationQueue;
    expect(item).toMatchObject({
      status: 'completed',
      thumbnail: 'file:///D:/Edits/job-1-region.png',
      assetPath: 'D:/Edits/job-1-region.png',
    });
    expect(state.iterationNodes.get('job-1')?.thumbnail).toBe('file:///D:/Edits/job-1-region.png');
  });

  it('removes a failed job from the strip and reports the failure once', async () => {
    const electron = makeElectron(async () => ({ ...completed('job-1'), status: 'failed', error: 'CUDA OOM' }));
    addActiveJob('job-1');
    const watcher = watcherFor(electron);
    await watcher.track(spec());

    expect(useAppStore.getState().generationQueue).toHaveLength(0);
    expect(useAppStore.getState().completedJobs[0]).toMatchObject({ status: 'failed', error: 'CUDA OOM' });
    expect(electron.notifications.notify).toHaveBeenCalledWith('generation_failed', {
      title: 'Image Failed',
      body: 'CUDA OOM',
    });
  });

  it('still syncs the asset when the notification throws, and never twice', async () => {
    const electron = makeElectron(async () => completed('job-1'));
    electron.notifications.notify.mockRejectedValue(new Error('notify exploded'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    addActiveJob('job-1');
    const sync = vi.spyOn(useAppStore.getState(), 'syncAssetsFromJobStatus');
    const watcher = watcherFor(electron);

    await watcher.track(spec());
    // A second track of the same id (a remount, a duplicate submit) is ignored.
    await watcher.track(spec());

    expect(useAppStore.getState().assetLibrary).toHaveLength(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(electron.generation.getStatus).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('marks the job failed with a clear message when the backend is lost', async () => {
    const electron = makeElectron(async () => {
      throw new Error('ECONNREFUSED');
    });
    addActiveJob('job-1');
    const watcher = watcherFor(electron);

    const done = watcher.track(spec());
    await vi.advanceTimersByTimeAsync(5000);
    await done;

    expect(useAppStore.getState().completedJobs[0]).toMatchObject({ status: 'failed', error: JOB_LOST_MESSAGE });
    expect(useAppStore.getState().activeJobs).toHaveLength(0);
  });

  it('cancel stops the watch, cancels the backend job and records it cancelled', async () => {
    const electron = makeElectron(async () => ({ ...completed('job-1'), status: 'processing', progress: 20 }));
    addActiveJob('job-1');
    const watcher = watcherFor(electron);
    void watcher.track(spec());
    await vi.advanceTimersByTimeAsync(0);

    const result = await watcher.cancel('job-1');
    const callsAtCancel = (electron.generation.getStatus as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    expect(result).toEqual({ success: true });
    expect(electron.generation.cancel).toHaveBeenCalledWith('job-1');
    expect(useAppStore.getState().completedJobs[0]).toMatchObject({ status: 'cancelled' });
    expect((electron.generation.getStatus as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(callsAtCancel);
    expect(electron.notifications.notify).not.toHaveBeenCalled();
  });

  it('records batch results, updates the queue card and notifies once per batch', async () => {
    const electron = makeElectron(async (jobId) =>
      jobId === 'job-b' ? { ...completed(jobId), status: 'failed', error: 'bad prompt' } : completed(jobId),
    );
    useAppStore.setState({
      batchQueue: [
        { id: 'card-a', prompt: 'first', status: 'generating', jobId: 'job-a' },
        { id: 'card-b', prompt: 'second', status: 'generating', jobId: 'job-b' },
      ],
      activeBatchId: 'batch-1',
    });
    useAppStore.getState().addBatchJob({
      id: 'batch-1',
      name: 'Batch',
      prompts: ['first', 'second'],
      jobIds: ['job-a', 'job-b'],
      currentIndex: 0,
      completedJobs: [],
      failedJobs: [],
      status: 'running',
      createdAt: new Date(),
    });
    const watcher = watcherFor(electron);
    const settings = { width: 512, height: 512, steps: 20, cfgScale: 7, model: 'flux-dev' };

    await Promise.all([
      watcher.track(spec({ jobId: 'job-a', origin: 'batch', prompt: 'first', params: { prompt: 'first' }, batch: { batchId: 'batch-1', promptIndex: 0, settings } })),
      watcher.track(spec({ jobId: 'job-b', origin: 'batch', prompt: 'second', params: { prompt: 'second' }, batch: { batchId: 'batch-1', promptIndex: 1, settings } })),
    ]);

    const state = useAppStore.getState();
    expect(state.batchResults.map((result) => [result.id, result.seed, result.assetPath])).toEqual([
      ['job-a', 7, 'D:/Outputs/job-a/image.png'],
    ]);
    expect(state.batchQueue.map((card) => card.status)).toEqual(['completed', 'failed']);
    expect(state.batchQueue[0].seed).toBe(7);
    expect(state.batchNotice).toEqual({ tone: 'error', message: 'bad prompt' });
    expect(state.batchJobs[0]).toMatchObject({ status: 'completed', completedJobs: ['job-a'], failedJobs: ['job-b'] });
    expect(state.activeBatchId).toBeNull();
    // Batch jobs never enter the Canvas strip, and the batch notifies once.
    expect(state.generationQueue).toHaveLength(0);
    expect(electron.notifications.notify).toHaveBeenCalledTimes(1);
    expect(electron.notifications.notify).toHaveBeenCalledWith('generation_complete', {
      title: 'Batch Complete',
      body: '1 of 2 images generated.',
    });
  });

  it('reset forgets every watch without applying their outcomes', async () => {
    const electron = makeElectron(async () => ({ ...completed('job-1'), status: 'processing', progress: 1 }));
    addActiveJob('job-1');
    const watcher = watcherFor(electron);
    void watcher.track(spec());
    await vi.advanceTimersByTimeAsync(0);
    watcher.reset();
    await vi.advanceTimersByTimeAsync(1000);

    expect(watcher.trackedJobIds()).toEqual([]);
    expect(useAppStore.getState().activeJobs.map((job) => job.id)).toEqual(['job-1']);
  });
});
