import { describe, expect, it, vi } from 'vitest';
import { FINISHED_JOB_RETENTION_MS, pruneFinishedJobs } from './hostedJobRetention';
import { createOpenRouterImageJobStore } from './openRouterImageJobs';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { createHuggingFaceVideoJobStore } from './huggingfaceVideoJobs';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('pruneFinishedJobs', () => {
  it('drops finished jobs older than the retention window and keeps the rest', () => {
    const jobs = new Map([
      ['old-done', { status: 'completed' as const, created_at: iso(NOW - 30 * HOUR), completed_at: iso(NOW - 25 * HOUR) }],
      ['old-failed', { status: 'failed' as const, created_at: iso(NOW - 48 * HOUR) }],
      ['recent-done', { status: 'cancelled' as const, created_at: iso(NOW - 30 * HOUR), completed_at: iso(NOW - 2 * HOUR) }],
      ['old-running', { status: 'processing' as const, created_at: iso(NOW - 72 * HOUR) }],
    ]);

    pruneFinishedJobs(jobs, { now: () => NOW });

    expect([...jobs.keys()].sort()).toEqual(['old-running', 'recent-done']);
  });

  it('defaults to a 24h window', () => {
    expect(FINISHED_JOB_RETENTION_MS).toBe(24 * HOUR);
  });
});

describe.each([
  ['OpenRouter image', () => createOpenRouterImageJobStore({ emit: vi.fn(), retention: { now: () => NOW } }), 'image'],
  ['HuggingFace image', () => createHuggingFaceImageJobStore({ emit: vi.fn(), retention: { now: () => NOW } }), 'image'],
  ['HuggingFace video', () => createHuggingFaceVideoJobStore({ emit: vi.fn(), retention: { now: () => NOW } }), 'video'],
] as const)('%s job store retention', (_label, createStore, type) => {
  function seed() {
    const store = createStore() as ReturnType<typeof createOpenRouterImageJobStore>;
    const base = { progress: 100, type: type as 'image' };
    store.set({ ...base, job_id: 'stale', status: 'completed', created_at: iso(NOW - 40 * HOUR), completed_at: iso(NOW - 26 * HOUR) });
    store.set({ ...base, job_id: 'fresh', status: 'failed', created_at: iso(NOW - HOUR), completed_at: iso(NOW - HOUR) });
    store.set({ ...base, progress: 40, job_id: 'running', status: 'processing', created_at: iso(NOW - 40 * HOUR) });
    return store;
  }

  it('prunes stale finished jobs on insert', () => {
    const store = seed();
    expect(store.get('stale')).toBeNull();
    expect(store.get('fresh')).not.toBeNull();
    expect(store.get('running')).not.toBeNull();
  });

  it('never lists a stale finished job', () => {
    const store = seed();
    expect(store.values().map((job) => job.job_id).sort()).toEqual(['fresh', 'running']);
  });
});
