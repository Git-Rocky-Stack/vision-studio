import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { AddToCollectionMenu } from './AddToCollectionMenu';

describe('AddToCollectionMenu', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(cleanup);

  it('toggles the asset in a manual collection', () => {
    const collection = useAppStore.getState().createCollection({ name: 'Picks', type: 'manual' });
    useAppStore.getState().createSmartCollection({ name: 'Auto', smartQuery: { tags: ['x'] } });
    render(<AddToCollectionMenu assetId="asset-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
    // Smart collections fill from their query, so they are not offered.
    expect(screen.queryByRole('checkbox', { name: 'Auto' })).toBeNull();
    const picks = screen.getByRole('checkbox', { name: 'Picks' });
    fireEvent.click(picks);
    expect(useAppStore.getState().collections.find((c) => c.id === collection.id)?.assetIds).toEqual(['asset-1']);
    expect(picks).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(picks);
    expect(useAppStore.getState().collections.find((c) => c.id === collection.id)?.assetIds).toEqual([]);
  });

  it('creates a new collection holding the asset', () => {
    render(<AddToCollectionMenu assetId="asset-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New collection name' }), {
      target: { value: 'Hero shots' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection with this asset' }));

    expect(useAppStore.getState().collections).toEqual([
      expect.objectContaining({ name: 'Hero shots', assetIds: ['asset-1'] }),
    ]);
  });

  it('does not let clicks inside the menu reach the surrounding tile', () => {
    const onTileClick = vi.fn();
    useAppStore.getState().createCollection({ name: 'Picks', type: 'manual' });
    render(
      <div onClick={onTileClick}>
        <AddToCollectionMenu assetId="asset-1" iconOnly />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Picks' }));
    expect(onTileClick).not.toHaveBeenCalled();
  });

  it('is disabled for an item with no library record', () => {
    render(<AddToCollectionMenu assetId={null} />);
    expect(screen.getByRole('button', { name: 'Add to collection' })).toBeDisabled();
  });
});
