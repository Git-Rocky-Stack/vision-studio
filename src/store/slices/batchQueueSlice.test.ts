import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../appStore';
import { BATCH_SEED_MAX, resolveBatchSeeds } from './batchQueueSlice';

const prompts = () => useAppStore.getState().batchQueue.map((card) => card.prompt);

describe('batch prompt queue (#J14)', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.getState().clearBatchQueue();
  });

  it('starts with one blank card and never drops below one', () => {
    const [only] = useAppStore.getState().batchQueue;
    expect(prompts()).toEqual(['']);
    useAppStore.getState().removeBatchQueuePrompt(only.id);
    expect(useAppStore.getState().batchQueue).toHaveLength(1);
  });

  it('import replaces a blank queue and appends to a filled one', () => {
    expect(useAppStore.getState().appendBatchQueuePrompts(['  a  ', '', 'b'])).toBe(2);
    expect(prompts()).toEqual(['a', 'b']);
    useAppStore.getState().appendBatchQueuePrompts(['c']);
    expect(prompts()).toEqual(['a', 'b', 'c']);
  });

  it('duplicates a card directly after itself as a fresh, unsubmitted copy', () => {
    useAppStore.getState().appendBatchQueuePrompts(['a', 'b']);
    const [a] = useAppStore.getState().batchQueue;
    useAppStore.getState().updateBatchQueuePrompt(a.id, { status: 'completed', jobId: 'job-a', seed: 3 });
    useAppStore.getState().duplicateBatchQueuePrompt(a.id);

    const queue = useAppStore.getState().batchQueue;
    expect(queue.map((card) => card.prompt)).toEqual(['a', 'a', 'b']);
    expect(queue[1]).toMatchObject({ status: 'pending' });
    expect(queue[1].jobId).toBeUndefined();
    expect(queue[1].id).not.toBe(a.id);
  });

  it('moves a card into the slot of the card it is dropped on', () => {
    useAppStore.getState().appendBatchQueuePrompts(['a', 'b', 'c']);
    const [a, , c] = useAppStore.getState().batchQueue;
    useAppStore.getState().moveBatchQueuePrompt(a.id, c.id);
    expect(prompts()).toEqual(['b', 'c', 'a']);
    useAppStore.getState().moveBatchQueuePrompt(a.id, a.id);
    expect(prompts()).toEqual(['b', 'c', 'a']);
  });

  it('updates a card by its job id and ignores unknown jobs', () => {
    useAppStore.getState().appendBatchQueuePrompts(['a']);
    const [a] = useAppStore.getState().batchQueue;
    useAppStore.getState().updateBatchQueuePrompt(a.id, { status: 'generating', jobId: 'job-a' });
    const before = useAppStore.getState().batchQueue;
    useAppStore.getState().updateBatchQueuePromptByJob('job-unknown', { status: 'failed' });
    expect(useAppStore.getState().batchQueue).toBe(before);
    useAppStore.getState().updateBatchQueuePromptByJob('job-a', { status: 'completed', result: '/o.png' });
    expect(useAppStore.getState().batchQueue[0]).toMatchObject({ status: 'completed', result: '/o.png' });
  });

  it('clear all empties the queue back to one blank card and drops the notice', () => {
    useAppStore.getState().appendBatchQueuePrompts(['a', 'b']);
    useAppStore.getState().setBatchNotice({ tone: 'info', message: 'x' });
    useAppStore.getState().clearBatchQueue();
    expect(prompts()).toEqual(['']);
    expect(useAppStore.getState().batchNotice).toBeNull();
  });

  it('clamps the base seed into the backend range', () => {
    useAppStore.getState().setBatchSeedStrategy({ mode: 'fixed', baseSeed: -5 });
    expect(useAppStore.getState().batchSeedStrategy).toEqual({ mode: 'fixed', baseSeed: 0 });
    useAppStore.getState().setBatchSeedStrategy({ baseSeed: BATCH_SEED_MAX + 10 });
    expect(useAppStore.getState().batchSeedStrategy.baseSeed).toBe(BATCH_SEED_MAX);
  });
});

describe('resolveBatchSeeds', () => {
  it('fixed repeats the base seed', () => {
    expect(resolveBatchSeeds({ mode: 'fixed', baseSeed: 9 }, 3)).toEqual([9, 9, 9]);
  });

  it('increment counts up from the base, wrapping at the backend maximum', () => {
    expect(resolveBatchSeeds({ mode: 'increment', baseSeed: 41 }, 3)).toEqual([41, 42, 43]);
    expect(resolveBatchSeeds({ mode: 'increment', baseSeed: BATCH_SEED_MAX }, 2)).toEqual([BATCH_SEED_MAX, 0]);
  });

  it('random draws an in-range seed per prompt', () => {
    const values = [0, 0.5, 0.999999];
    const seeds = resolveBatchSeeds({ mode: 'random', baseSeed: 1 }, 3, () => values.shift() ?? 0);
    expect(seeds[0]).toBe(0);
    seeds.forEach((seed) => {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(BATCH_SEED_MAX);
    });
  });
});
