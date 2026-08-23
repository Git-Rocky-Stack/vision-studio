import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';
import { CollectionsPage } from '@/pages/CollectionsPage';

function seedAssets(...prompts: string[]) {
  const assets: AssetRecord[] = prompts.map((prompt, i) => ({
    id: `asset-${i}`,
    jobId: `job-${i}`,
    name: `render-${i}.png`,
    type: 'image',
    path: `C:/out/render-${i}.png`,
    previewUrl: `file:///C:/out/render-${i}.png`,
    thumbnail: `file:///C:/out/thumb-${i}.png`,
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    prompt,
    negativePrompt: '',
    model: 'sdxl',
    favorite: false,
    params: {},
  }));
  useAppStore.setState({ assetLibrary: assets });
}

describe('CollectionsPage', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('renders the collections heading', () => {
    render(<CollectionsPage />);
    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('shows empty state when no collections', () => {
    render(<CollectionsPage />);
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('renders category filter tabs', () => {
    render(<CollectionsPage />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Smart' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Manual' })).toBeInTheDocument();
  });

  it('creates a new collection on button click', async () => {
    const user = userEvent.setup();
    render(<CollectionsPage />);
    const newButton = screen.getByRole('button', { name: /new collection/i });
    await user.click(newButton);
    expect(useAppStore.getState().collections).toHaveLength(1);
  });

  it('displays collection cards', () => {
    useAppStore.getState().createCollection({ name: 'My Favorites', type: 'manual' });
    render(<CollectionsPage />);
    expect(screen.getByText('My Favorites')).toBeInTheDocument();
  });

  it('filters to collections whose assets are all tagged', async () => {
    const user = userEvent.setup();
    seedAssets('a cinematic portrait', 'a serene landscape');
    const store = useAppStore.getState();
    store.createCollection({ name: 'Tagged Set', type: 'manual' });
    store.createCollection({ name: 'Untagged Set', type: 'manual' });
    const [tagged, untagged] = useAppStore.getState().collections;
    store.addAssetToCollection(tagged.id, 'asset-0');
    store.addAssetToCollection(untagged.id, 'asset-1');
    store.analyzeAssets(['asset-0']);

    render(<CollectionsPage />);
    await user.click(screen.getByRole('tab', { name: 'Tagged' }));

    // The grid is inside <AnimatePresence>, so a filtered-out card leaves via
    // its exit animation rather than unmounting synchronously.
    await waitForElementToBeRemoved(() => screen.queryByText('Untagged Set'));
    expect(screen.getByText('Tagged Set')).toBeInTheDocument();
  });

  it('filters to collections still holding untagged assets', async () => {
    const user = userEvent.setup();
    seedAssets('a cinematic portrait', 'a serene landscape');
    const store = useAppStore.getState();
    store.createCollection({ name: 'Tagged Set', type: 'manual' });
    store.createCollection({ name: 'Untagged Set', type: 'manual' });
    const [tagged, untagged] = useAppStore.getState().collections;
    store.addAssetToCollection(tagged.id, 'asset-0');
    store.addAssetToCollection(untagged.id, 'asset-1');
    store.analyzeAssets(['asset-0']);

    render(<CollectionsPage />);
    await user.click(screen.getByRole('tab', { name: 'Untagged' }));

    await waitForElementToBeRemoved(() => screen.queryByText('Tagged Set'));
    expect(screen.getByText('Untagged Set')).toBeInTheDocument();
  });

  it('shows the real asset thumbnails on a collection card', () => {
    seedAssets('a cinematic portrait');
    const store = useAppStore.getState();
    store.createCollection({ name: 'My Favorites', type: 'manual' });
    store.addAssetToCollection(useAppStore.getState().collections[0].id, 'asset-0');

    render(<CollectionsPage />);

    const thumb = screen.getByRole('img', { name: /render-0\.png/i });
    expect(thumb).toHaveAttribute('src', 'file:///C:/out/thumb-0.png');
  });

  it('selects a collection when its card is activated', async () => {
    const user = userEvent.setup();
    useAppStore.getState().createCollection({ name: 'My Favorites', type: 'manual' });
    const id = useAppStore.getState().collections[0].id;

    render(<CollectionsPage />);
    await user.click(screen.getByRole('button', { name: /my favorites collection/i }));

    expect(useAppStore.getState().activeCollectionId).toBe(id);
  });

  it('surfaces the tags a smart collection actually matches on', () => {
    useAppStore.getState().createSmartCollection({
      name: 'Cinematic',
      smartQuery: { tags: ['cinematic', 'moody'] },
    });

    render(<CollectionsPage />);

    expect(screen.getByText('cinematic')).toBeInTheDocument();
    expect(screen.getByText('moody')).toBeInTheDocument();
  });
});
