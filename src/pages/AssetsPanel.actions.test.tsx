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
    scrollToIndex: () => undefined,
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

  it('clears the selection from a labelled, non-submitting button', () => {
    render(<AssetsPanel />);
    fireEvent.click(screen.getByText('render-0.png'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    const clear = screen.getByRole('button', { name: 'Clear selection' });
    expect(clear).toHaveAttribute('type', 'button');
    fireEvent.click(clear);
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('reports a failed delete instead of closing silently', async () => {
    vi.stubGlobal('electron', {
      assets: { delete: vi.fn().mockResolvedValue({ success: false, error: 'EBUSY' }) },
    });
    render(<AssetsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete asset' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);

    await waitFor(() =>
      expect(useNoticeStore.getState().notices[0]?.message).toBe(
        'Could not delete "render-0.png": EBUSY. It is still in the library.',
      ),
    );
    expect(useAppStore.getState().assetLibrary).toHaveLength(1);
  });
});

describe('AssetsPanel keyboard', () => {
  const assets = ['a', 'b', 'c'].map((suffix, index) => ({
    ...asset,
    id: `asset-${suffix}`,
    name: `render-${suffix}.png`,
    path: `C:/out/render-${suffix}.png`,
    createdAt: new Date(1_700_000_000_000 + index).toISOString(),
  })) as AssetRecord[];

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({ assetLibrary: assets });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const card = (suffix: string) => screen.getByTestId(`asset-card-asset-${suffix}`);

  it('has one tab stop and moves between cards with the arrow keys', () => {
    render(<AssetsPanel />);
    const order = screen.getAllByRole('group').filter((el) => el.dataset.navId);
    expect(order.map((el) => el.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const [first, second, third] = order;

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    // Grid view has two columns, so Down moves one row.
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: 'Home' });
    expect(first).toHaveFocus();
  });

  it('selects with Space, opens with Enter and asks before deleting with Delete', () => {
    render(<AssetsPanel />);
    fireEvent.keyDown(card('a'), { key: ' ' });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(card('a')).toHaveAccessibleName('render-a.png, selected');
    expect(card('a')).toHaveAccessibleDescription(/Space selects or deselects/);

    fireEvent.keyDown(card('b'), { key: 'Enter' });
    expect(useAppStore.getState().activeViewerItemId).toBe('asset-asset-b');

    fireEvent.keyDown(card('c'), { key: 'Delete' });
    expect(screen.getByRole('dialog', { name: 'Delete Asset' })).toHaveTextContent('render-c.png');
  });

  it('leaves keys pressed on an inner button to that button', () => {
    render(<AssetsPanel />);
    const favorite = screen.getAllByRole('button', { name: 'Toggle favorite' })[0];
    fireEvent.keyDown(favorite, { key: ' ' });
    expect(screen.queryByText('1 selected')).toBeNull();
  });
});
