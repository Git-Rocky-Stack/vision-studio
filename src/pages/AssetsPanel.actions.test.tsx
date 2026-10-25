import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { useNoticeStore } from '@/features/notices';
import type { AssetRecord } from '@/types/assets';

// jsdom has no layout, so render every virtual row.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100 })),
  }),
}));

import { AssetsPanel } from './AssetsPanel';

const asset: AssetRecord = {
  id: 'asset-0',
  jobId: 'job-0',
  name: 'render-0.png',
  type: 'image',
  path: 'C:/out/render-0.png',
  previewUrl: 'file:///C:/out/render-0.png',
  thumbnail: 'file:///C:/out/render-0.png',
  createdAt: new Date(1_700_000_000_000).toISOString(),
  prompt: 'a portrait',
  negativePrompt: '',
  model: 'sdxl',
  favorite: false,
  params: {},
} as AssetRecord;

describe('AssetsPanel row actions', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({ assetLibrary: [asset] });
    useNoticeStore.getState().clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports a failed export', async () => {
    vi.stubGlobal('electron', {
      dialog: { saveFile: vi.fn().mockResolvedValue('D:/render-0.png') },
      assets: { export: vi.fn().mockResolvedValue({ success: false, error: 'EACCES' }) },
    });
    render(<AssetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Export asset' }));
    await waitFor(() => expect(useNoticeStore.getState().notices[0]?.message).toBe('Export failed: EACCES'));
  });

  it('adds an asset to a collection without toggling its selection', () => {
    const collection = useAppStore.getState().createCollection({ name: 'Picks', type: 'manual' });
    render(<AssetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Picks' }));

    expect(useAppStore.getState().collections.find((c) => c.id === collection.id)?.assetIds).toEqual(['asset-0']);
    expect(screen.queryByText('1 selected')).toBeNull();
  });
});
