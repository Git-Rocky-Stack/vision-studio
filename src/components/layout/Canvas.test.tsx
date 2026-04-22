import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { Canvas } from './Canvas';

vi.mock('@/components/canvas/CanvasContextMenu', () => ({
  CanvasContextMenu: ({ x, y }: { x: number; y: number }) => (
    <div role="menu" aria-label="Canvas actions">
      {x},{y}
    </div>
  ),
}));

describe('Canvas', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('provides an accessible canvas application region', () => {
    render(<Canvas />);

    expect(screen.getByRole('application', { name: /image canvas/i })).toBeInTheDocument();
  });

  it('opens the canvas context menu from the keyboard', () => {
    render(<Canvas />);

    fireEvent.keyDown(screen.getByRole('application', { name: /image canvas/i }), {
      key: 'F10',
      shiftKey: true,
    });

    expect(screen.getByRole('menu', { name: 'Canvas actions' })).toBeInTheDocument();
  });

  it('routes the empty canvas CTA to Viewer', () => {
    render(<Canvas />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Viewer' }));

    expect(useAppStore.getState().centerView).toBe('viewer');
  });
});
