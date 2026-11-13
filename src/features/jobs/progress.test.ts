import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { parseJobProgressEvent, toLiveJobPatch } from './progressEvent';
import { createJobProgressBus, type JobProgressListener } from './progressBus';
import { startJobProgressBridge } from './progressBridge';

describe('parseJobProgressEvent (#J15)', () => {
  it('accepts the backend job_update frame', () => {
    expect(parseJobProgressEvent({ type: 'job_update', job_id: 'j1', status: 'processing', progress: 45.5 })).toEqual({
      jobId: 'j1',
      status: 'processing',
      progress: 45.5,
    });
  });

  it('clamps progress into 0-100', () => {
    expect(parseJobProgressEvent({ job_id: 'j1', progress: 140 })?.progress).toBe(100);
    expect(parseJobProgressEvent({ job_id: 'j1', progress: -3 })?.progress).toBe(0);
  });

  it.each([
    ['no job id', { status: 'processing', progress: 1 }],
    ['an unknown status', { job_id: 'j1', status: 'exploded', progress: 1 }],
    ['a non-numeric progress', { job_id: 'j1', progress: 'half' }],
    ['a NaN progress', { job_id: 'j1', progress: Number.NaN }],
    ['another message type', { type: 'step_image', job_id: 'j1', progress: 1 }],
    ['no update at all', { job_id: 'j1' }],
    ['a non-object', 'job_update'],
  ])('drops a payload with %s', (_label, raw) => {
    expect(parseJobProgressEvent(raw)).toBeNull();
  });

  it('never turns a terminal push into a store patch: the watcher fetches the result', () => {
    expect(toLiveJobPatch({ jobId: 'j1', status: 'completed', progress: 100 })).toBeNull();
    expect(toLiveJobPatch({ jobId: 'j1', status: 'processing', progress: 10, step: 3 })).toEqual({
      status: 'processing',
      progress: 10,
      step: 3,
    });
  });
});

describe('createJobProgressBus', () => {
  it('holds one IPC listener for any number of subscribers and detaches after the last', () => {
    let ipc: ((data: unknown) => void) | null = null;
    const detach = vi.fn();
    const source = vi.fn((callback: (data: unknown) => void) => {
      ipc = callback;
      return detach;
    });
    const bus = createJobProgressBus(() => source);
    const a: JobProgressListener = vi.fn();
    const b: JobProgressListener = vi.fn();

    const offA = bus.subscribe(a);
    const offB = bus.subscribe(b);
    expect(source).toHaveBeenCalledTimes(1);

    ipc!({ job_id: 'j1', progress: 5 });
    ipc!({ bogus: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith({ jobId: 'j1', progress: 5 });

    offA();
    expect(detach).not.toHaveBeenCalled();
    offB();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount()).toBe(0);
  });

  it('keeps delivering when one listener throws', () => {
    let ipc: ((data: unknown) => void) | null = null;
    const bus = createJobProgressBus(() => (callback) => {
      ipc = callback;
      return () => undefined;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const good = vi.fn();
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(good);
    ipc!({ job_id: 'j1', progress: 1 });
    expect(good).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('startJobProgressBridge (#J15)', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().addJob({
      id: 'j1',
      type: 'image',
      status: 'pending',
      progress: 0,
      params: {},
      createdAt: new Date(),
    });
  });

  function bridgeWith() {
    let emit: ((data: unknown) => void) | null = null;
    const bus = createJobProgressBus(() => (callback) => {
      emit = callback;
      return () => undefined;
    });
    const stop = startJobProgressBridge({ store: useAppStore, subscribe: bus.subscribe });
    return { emit: (data: unknown) => emit!(data), stop };
  }

  it('applies validated live progress to the job', () => {
    const { emit, stop } = bridgeWith();
    emit({ type: 'job_update', job_id: 'j1', status: 'processing', progress: 40 });
    expect(useAppStore.getState().activeJobs[0]).toMatchObject({ status: 'processing', progress: 40 });
    stop();
  });

  it('ignores malformed frames instead of writing them into the store', () => {
    const { emit, stop } = bridgeWith();
    emit({ job_id: 'j1', status: 'banana', progress: 40 });
    expect(useAppStore.getState().activeJobs[0]).toMatchObject({ status: 'pending', progress: 0 });
    stop();
  });

  it('leaves a terminal push to the watcher, so the job keeps its slot for the result', () => {
    const { emit, stop } = bridgeWith();
    emit({ type: 'job_update', job_id: 'j1', status: 'completed', progress: 100 });
    expect(useAppStore.getState().activeJobs.map((job) => job.id)).toEqual(['j1']);
    expect(useAppStore.getState().completedJobs).toHaveLength(0);
    stop();
  });
});
