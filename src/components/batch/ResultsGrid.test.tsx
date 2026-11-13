import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { useNoticeStore } from '@/features/notices';
import type { BatchResult } from '@/types/generation';

// jsdom has no layout, so render every virtual row.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100 })),
    scrollToIndex: () => undefined,
    measure: () => undefined,
  }),
}));

import { ResultsGrid } from './ResultsGrid';
import { resultGridColumns } from './resultGridLayout';

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

describe('ResultCard selection semantics', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({ batchResults: [result('a'), result('b')] });
  });
  afterEach(cleanup);

  it('exposes selection as a toggle button, not as aria-selected on an article', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    for (const card of screen.getAllByRole('article')) {
      expect(card).not.toHaveAttribute('aria-selected');
    }
    const toggle = screen.getByRole('button', { name: 'Select result: prompt a' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('builds a multi-selection from the keyboard-reachable toggles', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select result: prompt a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select result: prompt b' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    const deselect = screen.getByRole('button', { name: 'Deselect result: prompt a' });
    expect(deselect).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(deselect);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('opens the preview from a button, not only by double-click', () => {
    const onPreviewImage = vi.fn();
    render(<ResultsGrid onPreviewImage={onPreviewImage} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open preview' })[0]);
    expect(onPreviewImage).toHaveBeenCalledWith('a');
  });
});

describe('ResultsGrid keyboard', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    // Same createdAt for all, so the created-desc sort keeps insertion order.
    const createdAt = new Date('2026-11-01T00:00:00Z');
    useAppStore.setState({ batchResults: ids.map((id) => ({ ...result(id), createdAt })) });
  });
  afterEach(cleanup);

  const card = (id: string) => screen.getByTestId(`result-card-${id}`);

  it('gives the grid a single tab stop on the first card, described by the key help', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} />);
    expect(card('a')).toHaveAttribute('tabindex', '0');
    for (const id of ids.slice(1)) expect(card(id)).toHaveAttribute('tabindex', '-1');
    expect(card('a')).toHaveAccessibleDescription(/Enter opens the preview/);
  });

  it('moves focus with the arrow keys, by a whole row for Up/Down, and Home/End', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} viewMode="grid" />);
    card('a').focus();

    fireEvent.keyDown(card('a'), { key: 'ArrowRight' });
    expect(card('b')).toHaveFocus();
    expect(card('b')).toHaveAttribute('tabindex', '0');
    expect(card('a')).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(card('b'), { key: 'ArrowDown' });
    expect(card('e')).toHaveFocus();
    fireEvent.keyDown(card('e'), { key: 'ArrowUp' });
    expect(card('b')).toHaveFocus();
    fireEvent.keyDown(card('b'), { key: 'End' });
    expect(card('e')).toHaveFocus();
    fireEvent.keyDown(card('e'), { key: 'Home' });
    expect(card('a')).toHaveFocus();
    fireEvent.keyDown(card('a'), { key: 'ArrowLeft' });
    expect(card('a')).toHaveFocus();
  });

  it('opens the preview with Enter and selects with Space, Ctrl+Space and Shift+Space', () => {
    const onPreviewImage = vi.fn();
    render(<ResultsGrid onPreviewImage={onPreviewImage} />);

    fireEvent.keyDown(card('b'), { key: 'Enter' });
    expect(onPreviewImage).toHaveBeenCalledWith('b');

    fireEvent.keyDown(card('a'), { key: ' ' });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(card('a')).toHaveAccessibleName('prompt a, selected');

    fireEvent.keyDown(card('c'), { key: ' ', ctrlKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.keyDown(card('e'), { key: ' ', shiftKey: true });
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('does not open a preview for a failed result', () => {
    useAppStore.setState({ batchResults: [{ ...result('x'), imagePath: undefined as unknown as string }] });
    const onPreviewImage = vi.fn();
    render(<ResultsGrid onPreviewImage={onPreviewImage} />);
    fireEvent.keyDown(card('x'), { key: 'Enter' });
    expect(onPreviewImage).not.toHaveBeenCalled();
    expect(card('x')).toHaveAccessibleName('prompt x, failed');
  });

  it('leaves keys pressed on an inner button to that button', () => {
    const onPreviewImage = vi.fn();
    render(<ResultsGrid onPreviewImage={onPreviewImage} />);
    const favorite = screen.getAllByRole('button', { name: 'Add to favorites' })[0];
    fireEvent.keyDown(favorite, { key: 'ArrowRight' });
    fireEvent.keyDown(favorite, { key: 'Enter' });
    expect(onPreviewImage).not.toHaveBeenCalled();
    expect(card('a')).toHaveAttribute('tabindex', '0');
  });
});

describe('resultGridColumns', () => {
  it.each([
    ['grid', 0, 3],
    ['grid', 500, 2],
    ['grid', 803, 2],
    ['grid', 804, 3],
    ['grid', 2400, 3],
    ['large', 0, 2],
    ['large', 815, 1],
    ['large', 816, 2],
    ['list', 2400, 1],
  ] as const)('%s view at %ipx has %i columns', (viewMode, width, columns) => {
    expect(resultGridColumns(viewMode, width)).toBe(columns);
  });
});

describe('ResultsGrid measured columns', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  let resize: ((width: number) => void) | null = null;

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    const createdAt = new Date('2026-11-01T00:00:00Z');
    useAppStore.setState({ batchResults: ids.map((id) => ({ ...result(id), createdAt })) });
    resize = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {
          resize = (width) =>
            this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const rows = () => screen.getAllByTestId('results-grid-row');
  const card = (id: string) => screen.getByTestId(`result-card-${id}`);

  it('packs 2 results per row, as 2 grid tracks, when the panel fits two cards', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} viewMode="grid" />);
    act(() => resize?.(600));

    expect(rows()).toHaveLength(4);
    for (const row of rows()) {
      expect(row).toHaveAttribute('data-columns', '2');
      // jsdom normalises the zero length to `0px`; both spellings are the same track.
      expect(row.style.gridTemplateColumns).toMatch(/^repeat\(2, minmax\(0(px)?, 1fr\)\)$/);
      expect(row.children.length).toBeLessThanOrEqual(2);
    }
    // Down moves to the card drawn directly below: two ahead, not three.
    card('a').focus();
    fireEvent.keyDown(card('a'), { key: 'ArrowDown' });
    expect(card('c')).toHaveFocus();
  });

  it('packs 3 per row when the panel is wide, and follows a resize back to 2', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} viewMode="grid" />);
    act(() => resize?.(1000));

    expect(rows()).toHaveLength(3);
    expect(rows()[0].style.gridTemplateColumns).toMatch(/^repeat\(3, minmax\(0(px)?, 1fr\)\)$/);
    card('a').focus();
    fireEvent.keyDown(card('a'), { key: 'ArrowDown' });
    expect(card('d')).toHaveFocus();

    act(() => resize?.(560));
    expect(rows()).toHaveLength(4);
    fireEvent.keyDown(card('d'), { key: 'ArrowUp' });
    expect(card('b')).toHaveFocus();
  });

  it('keeps keyboard focus on the same card when a resize changes the columns', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} viewMode="grid" />);
    act(() => resize?.(1000));
    card('a').focus();
    fireEvent.keyDown(card('a'), { key: 'ArrowRight' });
    expect(card('b')).toHaveFocus();

    act(() => resize?.(560));
    expect(card('b')).toHaveFocus();
  });

  it('keeps list view to one result per row', () => {
    render(<ResultsGrid onPreviewImage={vi.fn()} viewMode="list" />);
    act(() => resize?.(1600));
    expect(rows()).toHaveLength(7);
    expect(rows()[0].style.gridTemplateColumns).toBe('');
  });
});
