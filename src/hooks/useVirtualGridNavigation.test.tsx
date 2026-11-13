import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { targetIndexForKey, useVirtualGridNavigation } from './useVirtualGridNavigation';

describe('targetIndexForKey', () => {
  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowRight', 9, 9],
    ['ArrowLeft', 0, 0],
    ['ArrowLeft', 4, 3],
    ['ArrowDown', 1, 4],
    ['ArrowDown', 8, 9],
    ['ArrowUp', 5, 2],
    ['ArrowUp', 1, 0],
    ['Home', 7, 0],
    ['End', 2, 9],
  ])('%s from %i in a 10-card, 3-column grid lands on %i', (key, from, to) => {
    expect(targetIndexForKey(key, from, 10, 3)).toBe(to);
  });

  it('ignores other keys and empty grids', () => {
    expect(targetIndexForKey('Enter', 0, 10, 3)).toBeNull();
    expect(targetIndexForKey('ArrowRight', 0, 0, 3)).toBeNull();
  });
});

/** Renders only the cards in `visible`, like a virtualizer with a small window. */
function Grid({ ids, scrollToRow }: { ids: string[]; scrollToRow: (row: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<string[]>(ids.slice(0, 2));
  const { getItemProps, handleNavigationKey } = useVirtualGridNavigation({
    ids,
    columns: 2,
    containerRef,
    scrollToRow: (row) => {
      scrollToRow(row);
      // The "virtualizer" mounts the requested row on the next frame.
      requestAnimationFrame(() => setVisible(ids.slice(row * 2, row * 2 + 2)));
    },
  });
  return (
    <div ref={containerRef}>
      {visible.map((id) => {
        const { tabIndex, ...itemProps } = getItemProps(id);
        return (
          <div
            key={id}
            role="button"
            tabIndex={tabIndex}
            data-testid={id}
            {...itemProps}
            onKeyDown={(event) => {
              if (handleNavigationKey(id, event)) event.preventDefault();
            }}
          >
            {id}
          </div>
        );
      })}
    </div>
  );
}

describe('useVirtualGridNavigation', () => {
  afterEach(cleanup);

  it('scrolls an unmounted target row into view and focuses the card once it renders', async () => {
    const scrollToRow = vi.fn();
    render(<Grid ids={['a', 'b', 'c', 'd', 'e']} scrollToRow={scrollToRow} />);
    screen.getByTestId('b').focus();

    fireEvent.keyDown(screen.getByTestId('b'), { key: 'ArrowDown' });
    expect(scrollToRow).toHaveBeenCalledWith(1);

    // The row mounts a frame later; wait for it rather than a fixed delay,
    // which flakes when a full-suite run starves the frame timer.
    await waitFor(() => expect(screen.getByTestId('d')).toHaveFocus());
    expect(screen.getByTestId('d')).toHaveAttribute('tabindex', '0');
  });

  it('leaves modified arrow keys to the app (Ctrl/Alt chords)', () => {
    const scrollToRow = vi.fn();
    render(<Grid ids={['a', 'b']} scrollToRow={scrollToRow} />);
    const event = fireEvent.keyDown(screen.getByTestId('a'), { key: 'ArrowRight', altKey: true });
    expect(event).toBe(true);
    expect(screen.getByTestId('a')).toHaveAttribute('tabindex', '0');
  });

  it('moves the tab stop to a card that receives focus by mouse or Tab', () => {
    render(<Grid ids={['a', 'b']} scrollToRow={vi.fn()} />);
    act(() => screen.getByTestId('b').focus());
    expect(screen.getByTestId('b')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('a')).toHaveAttribute('tabindex', '-1');
  });
});
