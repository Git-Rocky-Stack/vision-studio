import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { useNoticeStore } from '@/features/notices';
import type { BatchResult } from '@/types/generation';

// jsdom has no layout, so render every virtual row.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100 })),
  }),
}));

import { ResultsGrid } from './ResultsGrid';

function result(id: string): BatchResult {
  return {
    id,
    batchId: 'b1',
    promptIndex: 0,
    prompt: `prompt ${id}`,
    imagePath: `http://localhost/${id}.png`,
    assetPath: `C:/out/${id}.png`,
    seed: 1,
    generationTime: 1,
    params: {},
    createdAt: new Date(),
    isFavorite: false,
  };
}

function selectAll() {
  const cards = screen.getAllByRole('article');
  fireEvent.pointerDown(cards[0]);
  for (const card of cards.slice(1)) fireEvent.pointerDown(card, { ctrlKey: true });
}

describe('ResultsGrid bulk actions', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({ batchResults: [result('a'), result('b')] });
    useNoticeStore.getState().clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('asks for confirmation before deleting, and cancelling keeps everything', () => {
    const del = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('electron', { assets: { delete: del } });
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete 2 results?');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(del).not.toHaveBeenCalled();
    expect(useAppStore.getState().batchResults).toHaveLength(2);
  });

  it('reports partial delete failures and keeps the failures selected', async () => {
    const del = vi.fn(async (path: string) =>
      path.includes('/b.png') ? { success: false, error: 'file locked' } : { success: true },
    );
    vi.stubGlobal('electron', { assets: { delete: del } });
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i }).at(-1)!);

    await waitFor(() => expect(useAppStore.getState().batchResults.map((r) => r.id)).toEqual(['b']));
    expect(useNoticeStore.getState().notices[0]).toMatchObject({
      tone: 'error',
      message: expect.stringContaining('1 of 2 files could not be deleted: file locked'),
    });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('reports a failed single-file export', async () => {
    vi.stubGlobal('electron', {
      dialog: { saveFile: vi.fn().mockResolvedValue('D:/a.png') },
      assets: { export: vi.fn().mockResolvedValue({ success: false, error: 'EACCES' }) },
    });
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Download image' })[0]);

    await waitFor(() =>
      expect(useNoticeStore.getState().notices[0]?.message).toBe('Export failed: EACCES'),
    );
  });
});
