import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    window.electron = {
      generation: {
        extractVideoFrame: vi.fn().mockResolvedValue({
          image: '/outputs/frame-020/canvas-frame.png',
          output_path: 'C:/vision-studio-output/frame-020/canvas-frame.png',
          width: 1280,
          height: 720,
          time_ms: 0,
          frame_index: 0,
        }),
      },
    } as unknown as typeof window.electron;
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

  it('mounts the iteration canvas overlay in overlay mode', () => {
    useAppStore.setState({ iterationView: 'overlay' });

    render(<Canvas />);

    expect(screen.getByTestId('iteration-canvas-overlay')).toBeInTheDocument();
  });

  it('extracts a selected video source into an editable frame', async () => {
    useAppStore.setState({
      currentImage: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      currentImageAssetPath: 'C:/vision-studio-output/clips/source.mp4',
    });

    render(<Canvas />);

    fireEvent.click(screen.getByRole('button', { name: 'Extract frame' }));

    await waitFor(() => {
      expect(useAppStore.getState().currentImageAssetPath).toBe(
        'C:/vision-studio-output/frame-020/canvas-frame.png',
      );
    });

    expect(useAppStore.getState().currentImage).toBe(
      'http://localhost:8000/outputs/frame-020/canvas-frame.png',
    );
  });
});
