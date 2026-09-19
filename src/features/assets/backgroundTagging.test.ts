import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { GenerationJob } from '@/store/appStore.types';
import type { AssetRecord } from '@/types/assets';

import { BACKGROUND_TAGGING_IDLE_MS, startBackgroundTagging } from './backgroundTagging';

/**
 * Settings offers "Background Batch: Analyze assets in batches during idle
 * time". enqueueForTagging queued the assets, and nothing ever drained the
 * queue - the mode behaved exactly like On Demand.
 */

function addAsset(i: number, prompt: string) {
  const asset: AssetRecord = {
    id: `asset-${i}`,
    jobId: `job-${i}`,
    name: `render-${i}.png`,
    type: 'image',
    path: `C:/out/render-${i}.png`,
    previewUrl: `file:///C:/out/render-${i}.png`,
    thumbnail: '',
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    prompt,
    negativePrompt: '',
    model: 'sdxl',
    favorite: false,
    params: {},
  };
  useAppStore.setState((state) => ({ assetLibrary: [...state.assetLibrary, asset] }));
  useAppStore.getState().enqueueForTagging([asset.id]);
}

function runningJob(): GenerationJob {
  return {
    id: 'job-running',
    type: 'image',
    status: 'processing',
    progress: 40,
    params: {},
    createdAt: new Date(),
  };
}

const tagged = (id: string) => useAppStore.getState().assetMetadata.has(id);

describe('Background Batch tagging', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ taggingMode: 'background-batch' });
    stop = startBackgroundTagging(useAppStore);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('tags the queued assets in one pass once generation has been idle', () => {
    addAsset(0, 'a cinematic portrait');
    addAsset(1, 'a serene watercolor landscape');

    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS - 1);
    expect(useAppStore.getState().taggingQueue).toEqual(['asset-0', 'asset-1']);

    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().taggingQueue).toEqual([]);
    expect(tagged('asset-0')).toBe(true);
    expect(tagged('asset-1')).toBe(true);
  });

  it('waits while a generation is running', () => {
    useAppStore.getState().addJob(runningJob());
    addAsset(0, 'a cinematic portrait');

    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS * 3);
    expect(tagged('asset-0')).toBe(false);

    useAppStore.getState().updateJob('job-running', { status: 'completed', progress: 100 });
    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS);
    expect(tagged('asset-0')).toBe(true);
  });

  it('restarts the wait when another asset arrives, so a burst is tagged together', () => {
    addAsset(0, 'a cinematic portrait');
    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS - 1);
    addAsset(1, 'a serene watercolor landscape');

    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS - 1);
    expect(tagged('asset-0')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(tagged('asset-0')).toBe(true);
    expect(tagged('asset-1')).toBe(true);
  });

  it('is not held off by unrelated store updates', () => {
    addAsset(0, 'a cinematic portrait');

    for (let t = 0; t < BACKGROUND_TAGGING_IDLE_MS; t += 1000) {
      useAppStore.setState({ comparisonMode: 'off' });
      vi.advanceTimersByTime(1000);
    }

    expect(tagged('asset-0')).toBe(true);
  });

  it('never drains in On Demand mode', () => {
    useAppStore.setState({ taggingMode: 'on-demand' });
    addAsset(0, 'a cinematic portrait');

    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS * 5);

    expect(useAppStore.getState().taggingQueue).toEqual(['asset-0']);
    expect(tagged('asset-0')).toBe(false);
  });

  it('picks up an existing backlog when the mode is switched to Background Batch', () => {
    useAppStore.setState({ taggingMode: 'on-demand' });
    addAsset(0, 'a cinematic portrait');

    useAppStore.getState().setTaggingMode('background-batch');
    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS);

    expect(tagged('asset-0')).toBe(true);
  });

  it('stops watching once stopped', () => {
    stop();
    addAsset(0, 'a cinematic portrait');

    vi.advanceTimersByTime(BACKGROUND_TAGGING_IDLE_MS * 5);

    expect(tagged('asset-0')).toBe(false);
  });
});
