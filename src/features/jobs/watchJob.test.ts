import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchJob, type JobWatchUpdate } from './watchJob';
import type { JobProgressListener, JobProgressSubscribe } from './progressBus';

function status(value: string, progress = 0, extra: Record<string, unknown> = {}) {
  return { job_id: 'job-1', status: value, progress, type: 'image', created_at: '2026-01-01T00:00:00Z', ...extra };
}

function pushChannel() {
  const listeners = new Set<JobProgressListener>();
  const subscribe: JobProgressSubscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    subscribe,
    emit: (event: Parameters<JobProgressListener>[0]) => listeners.forEach((listener) => listener(event)),
    size: () => listeners.size,
  };
}

describe('watchJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the terminal status and reports live updates once per change', async () => {
    const statuses = [status('pending'), status('processing', 10), status('processing', 10), status('completed', 100)];
    const getStatus = vi.fn(async () => statuses.shift());
    const updates: JobWatchUpdate[] = [];

    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: null, pollIntervalMs: 100, onUpdate: (u) => updates.push(u) });
    await vi.advanceTimersByTimeAsync(5000);
    const outcome = await done;

    expect(outcome.kind).toBe('completed');
    expect(updates.map((u) => [u.status, u.progress])).toEqual([
      ['pending', 0],
      ['processing', 10],
    ]);
  });

  it('has no wall-clock ceiling: a job processing for an hour still completes', async () => {
    let progress = 0;
    const getStatus = vi.fn(async () => {
      progress += 0.01;
      return progress >= 30 ? status('completed', 100) : status('processing', progress);
    });
    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: null, pollIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect((await done).kind).toBe('completed');
  });

  it('backs off while nothing changes and resets when progress moves', async () => {
    let progress = 0;
    const getStatus = vi.fn(async () => status('pending', progress));
    const controller = new AbortController();
    const done = watchJob({
      jobId: 'job-1',
      getStatus,
      progressEvents: null,
      pollIntervalMs: 1000,
      maxPollIntervalMs: 4000,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(20_000);
    // 0, 1000, 2500, 4750, 8750, 12750, 16750 -> far fewer than one per second
    const idleCalls = getStatus.mock.calls.length;
    expect(idleCalls).toBeLessThanOrEqual(8);
    expect(idleCalls).toBeGreaterThanOrEqual(5);

    // A change resets the cadence to the base interval.
    progress = 5;
    await vi.advanceTimersByTimeAsync(4000);
    const afterChange = getStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStatus.mock.calls.length).toBe(afterChange + 1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect((await done).kind).toBe('aborted');
  });

  it('wakes immediately on a terminal push instead of waiting out the interval', async () => {
    const channel = pushChannel();
    let completed = false;
    const getStatus = vi.fn(async () => (completed ? status('completed', 100) : status('processing', 5)));
    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: channel.subscribe, pollIntervalMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(getStatus).toHaveBeenCalledTimes(1);

    completed = true;
    channel.emit({ jobId: 'job-1', status: 'completed', progress: 100 });
    await vi.advanceTimersByTimeAsync(0);

    expect((await done).kind).toBe('completed');
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(channel.size()).toBe(0);
  });

  it('applies progress pushes for its own job only', async () => {
    const channel = pushChannel();
    const updates: JobWatchUpdate[] = [];
    const controller = new AbortController();
    const done = watchJob({
      jobId: 'job-1',
      getStatus: async () => status('processing', 1),
      progressEvents: channel.subscribe,
      pollIntervalMs: 60_000,
      signal: controller.signal,
      onUpdate: (u) => updates.push(u),
    });
    await vi.advanceTimersByTimeAsync(0);
    channel.emit({ jobId: 'other-job', progress: 90 });
    channel.emit({ jobId: 'job-1', progress: 42 });
    controller.abort();
    await done;

    expect(updates.map((u) => [u.source, u.progress])).toEqual([
      ['poll', 1],
      ['push', 42],
    ]);
  });

  it('ends as lost after the error budget of consecutive failed reads', async () => {
    const getStatus = vi.fn(async () => {
      throw new Error('backend down');
    });
    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: null, retryIntervalMs: 100, errorCap: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    const outcome = await done;
    expect(outcome.kind).toBe('lost');
    expect(getStatus).toHaveBeenCalledTimes(3);
  });

  it('treats an error envelope as a failed read and recovers when reads succeed again', async () => {
    const responses: unknown[] = [{ success: false, error: 'busy' }, null, status('completed', 100)];
    const getStatus = vi.fn(async () => responses.shift());
    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: null, retryIntervalMs: 10, errorCap: 3 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await done).kind).toBe('completed');
  });

  it('ends as stalled when a processing job stops changing for the stall window', async () => {
    const getStatus = vi.fn(async () => status('processing', 50));
    const done = watchJob({
      jobId: 'job-1',
      getStatus,
      progressEvents: null,
      pollIntervalMs: 1000,
      maxPollIntervalMs: 1000,
      stallTimeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const outcome = await done;
    expect(outcome.kind).toBe('stalled');
  });

  it('never stalls a job that is still queued (pending)', async () => {
    const getStatus = vi.fn(async () => status('pending'));
    const controller = new AbortController();
    const done = watchJob({
      jobId: 'job-1',
      getStatus,
      progressEvents: null,
      pollIntervalMs: 1000,
      maxPollIntervalMs: 1000,
      stallTimeoutMs: 5_000,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    controller.abort();
    expect((await done).kind).toBe('aborted');
  });

  it('returns aborted promptly when the signal fires mid-wait', async () => {
    const controller = new AbortController();
    const getStatus = vi.fn(async () => status('processing', 1));
    const done = watchJob({ jobId: 'job-1', getStatus, progressEvents: null, pollIntervalMs: 60_000, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect((await done).kind).toBe('aborted');
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('does not read status at all for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const getStatus = vi.fn();
    expect((await watchJob({ jobId: 'job-1', getStatus, progressEvents: null, signal: controller.signal })).kind).toBe('aborted');
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('coerces an unknown future status to processing', async () => {
    const responses = [status('warming_up', 3), status('completed', 100)];
    const updates: JobWatchUpdate[] = [];
    const done = watchJob({
      jobId: 'job-1',
      getStatus: async () => responses.shift(),
      progressEvents: null,
      pollIntervalMs: 10,
      onUpdate: (u) => updates.push(u),
    });
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(updates[0].status).toBe('processing');
  });
});
