import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedAssets(...prompts: string[]): AssetRecord[] {
  const assets = prompts.map((prompt, i) => ({
    id: `asset-${i}`,
    jobId: `job-${i}`,
    name: `render-${i}.png`,
    type: 'image' as const,
    path: `C:/out/render-${i}.png`,
    previewUrl: `file:///C:/out/render-${i}.png`,
    thumbnail: '',
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    prompt,
    negativePrompt: '',
    model: 'sdxl',
    favorite: false,
    params: {},
  }));
  useAppStore.setState({ assetLibrary: assets });
  return assets;
}

describe('collections: asset analysis', () => {
  beforeEach(resetStore);

  it('populates assetMetadata for the assets it is given', () => {
    seedAssets('a cinematic portrait', 'a serene watercolor landscape');

    useAppStore.getState().analyzeAssets(['asset-0']);

    const meta = useAppStore.getState().assetMetadata;
    expect(meta.get('asset-0')?.detectedStyle).toContain('cinematic');
    expect(meta.get('asset-1')).toBeUndefined();
  });

  it('drains the tagging queue for every asset it analyses', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingQueue: ['asset-0'] });

    useAppStore.getState().analyzeAssets(['asset-0']);

    expect(useAppStore.getState().taggingQueue).toEqual([]);
  });

  it('ignores ids that are not in the asset library', () => {
    seedAssets('a cinematic portrait');

    useAppStore.getState().analyzeAssets(['does-not-exist']);

    expect(useAppStore.getState().assetMetadata.size).toBe(0);
  });

  it('registers every derived tag in availableTags without duplicating them', () => {
    seedAssets('a cinematic portrait', 'a cinematic landscape');

    useAppStore.getState().analyzeAssets(['asset-0', 'asset-1']);

    const names = useAppStore.getState().availableTags.map((t) => t.name);
    expect(names).toContain('cinematic');
    expect(names.filter((n) => n === 'cinematic')).toHaveLength(1);
    expect(names).toContain('portrait');
    expect(names).toContain('landscape');
  });
});

describe('collections: analyzeUntaggedAssets', () => {
  beforeEach(resetStore);

  it('analyses every library asset that has no metadata yet', () => {
    seedAssets('a cinematic portrait', 'a serene watercolor landscape');

    useAppStore.getState().analyzeUntaggedAssets();

    expect(useAppStore.getState().assetMetadata.size).toBe(2);
  });

  it('does not re-analyse an asset that already has metadata', () => {
    seedAssets('a cinematic portrait', 'a serene landscape');
    useAppStore.getState().analyzeAssets(['asset-0']);
    const firstStamp = useAppStore.getState().assetMetadata.get('asset-0')?.analyzedAt;

    useAppStore.getState().analyzeUntaggedAssets();

    expect(useAppStore.getState().assetMetadata.get('asset-0')?.analyzedAt).toBe(firstStamp);
    expect(useAppStore.getState().assetMetadata.size).toBe(2);
  });
});

describe('collections: taggingMode routing', () => {
  beforeEach(resetStore);

  it('analyses immediately in on-generation mode', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'on-generation' });

    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().assetMetadata.has('asset-0')).toBe(true);
    expect(useAppStore.getState().taggingQueue).toEqual([]);
  });

  it('defers to the queue in on-demand mode', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'on-demand' });

    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().assetMetadata.has('asset-0')).toBe(false);
    expect(useAppStore.getState().taggingQueue).toEqual(['asset-0']);
  });

  it('defers to the queue in background-batch mode', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'background-batch' });

    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().taggingQueue).toEqual(['asset-0']);
  });

  it('does nothing at all when tagging is off', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'off' });

    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().assetMetadata.size).toBe(0);
    expect(useAppStore.getState().taggingQueue).toEqual([]);
  });

  it('never queues the same asset twice', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'on-demand' });

    useAppStore.getState().enqueueForTagging(['asset-0']);
    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().taggingQueue).toEqual(['asset-0']);
  });

  it('never queues an asset that already has metadata', () => {
    seedAssets('a cinematic portrait');
    useAppStore.getState().analyzeAssets(['asset-0']);
    useAppStore.setState({ taggingMode: 'on-demand' });

    useAppStore.getState().enqueueForTagging(['asset-0']);

    expect(useAppStore.getState().taggingQueue).toEqual([]);
  });
});

describe('collections: smart collection refresh', () => {
  beforeEach(resetStore);

  it('matches assets by a tag derived from the prompt', () => {
    seedAssets('a cinematic portrait', 'a serene watercolor landscape');
    useAppStore.getState().analyzeUntaggedAssets();

    useAppStore.getState().createSmartCollection({
      name: 'Cinematic',
      smartQuery: { tags: ['cinematic'] },
    });
    const id = useAppStore.getState().collections[0].id;
    useAppStore.getState().refreshSmartCollection(id);

    expect(useAppStore.getState().collections[0].assetIds).toEqual(['asset-0']);
  });

  it('refreshes every smart collection when new metadata lands', () => {
    seedAssets('a cinematic portrait');
    useAppStore.getState().createSmartCollection({
      name: 'Cinematic',
      smartQuery: { tags: ['cinematic'] },
    });

    // Analysing an asset must re-evaluate smart collections, otherwise a smart
    // collection stays permanently empty until something manually refreshes it.
    useAppStore.getState().analyzeUntaggedAssets();

    expect(useAppStore.getState().collections[0].assetIds).toEqual(['asset-0']);
  });

  it('drops an asset that no longer matches after the library changes', () => {
    seedAssets('a cinematic portrait');
    useAppStore.getState().analyzeUntaggedAssets();
    useAppStore.getState().createSmartCollection({
      name: 'Cinematic',
      smartQuery: { tags: ['cinematic'] },
    });
    useAppStore.getState().refreshSmartCollection(useAppStore.getState().collections[0].id);
    expect(useAppStore.getState().collections[0].assetIds).toEqual(['asset-0']);

    useAppStore.setState({ assetLibrary: [] });
    useAppStore.getState().refreshAllSmartCollections();

    expect(useAppStore.getState().collections[0].assetIds).toEqual([]);
  });

  it('leaves manual collections untouched on a refresh-all', () => {
    seedAssets('a cinematic portrait');
    useAppStore.getState().createCollection({ name: 'Hand picked', type: 'manual' });
    const id = useAppStore.getState().collections[0].id;
    useAppStore.getState().addAssetToCollection(id, 'asset-0');

    useAppStore.getState().refreshAllSmartCollections();

    expect(useAppStore.getState().collections[0].assetIds).toEqual(['asset-0']);
  });
});

describe('collections: generation feeds the tagger', () => {
  beforeEach(resetStore);

  it('analyses a newly-synced asset when tagging runs on generation', () => {
    useAppStore.setState({ taggingMode: 'on-generation' });

    useAppStore.getState().syncAssetsFromJobStatus({
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      params: { prompt: 'a cinematic portrait', width: 1024, height: 1024 },
      result: { images: ['C:/out/a.png'] },
    } as never);

    const library = useAppStore.getState().assetLibrary;
    expect(library).toHaveLength(1);
    expect(useAppStore.getState().assetMetadata.get(library[0].id)?.detectedStyle).toContain(
      'cinematic',
    );
  });

  it('queues a newly-synced asset instead when tagging is on demand', () => {
    useAppStore.setState({ taggingMode: 'on-demand' });

    useAppStore.getState().syncAssetsFromJobStatus({
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      params: { prompt: 'a cinematic portrait' },
      result: { images: ['C:/out/a.png'] },
    } as never);

    const library = useAppStore.getState().assetLibrary;
    expect(useAppStore.getState().taggingQueue).toEqual([library[0].id]);
    expect(useAppStore.getState().assetMetadata.size).toBe(0);
  });

  it('does not tag a synced asset when tagging is off', () => {
    useAppStore.setState({ taggingMode: 'off' });

    useAppStore.getState().syncAssetsFromJobStatus({
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      params: { prompt: 'a cinematic portrait' },
      result: { images: ['C:/out/a.png'] },
    } as never);

    expect(useAppStore.getState().assetLibrary).toHaveLength(1);
    expect(useAppStore.getState().assetMetadata.size).toBe(0);
    expect(useAppStore.getState().taggingQueue).toEqual([]);
  });

  it('leaves a still-running job alone', () => {
    useAppStore.setState({ taggingMode: 'on-generation' });

    useAppStore.getState().syncAssetsFromJobStatus({
      job_id: 'job-1',
      status: 'processing',
      type: 'image',
      params: { prompt: 'a cinematic portrait' },
    } as never);

    expect(useAppStore.getState().assetLibrary).toHaveLength(0);
    expect(useAppStore.getState().assetMetadata.size).toBe(0);
  });
});
