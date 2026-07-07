import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EditCanvas } from './EditCanvas';

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: ReactNode }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Rect: () => <div />,
  Image: () => <div />,
  Line: () => <div />,
  Text: () => <div />,
  Transformer: () => <div />,
}));

// jsdom never loads images: a stub that fires onload with intrinsic dims.
class LoadingImageMock {
  width = 640;
  height = 480;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('EditCanvas', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('Image', LoadingImageMock);
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('describes the editor canvas for assistive technology', () => {
    render(<EditCanvas />);

    expect(screen.getByRole('application', { name: /image editor canvas/i })).toBeInTheDocument();
    expect(screen.getByText(/Active tool:/)).toBeInTheDocument();
  });

  describe('AI mask surface (#34 PR2)', () => {
    async function renderWithImage() {
      useAppStore.setState({
        currentImage: 'preview://img.png',
        currentImageAssetPath: 'C:/img.png',
      });
      render(<EditCanvas />);
      // Flush the stubbed image onload microtask.
      await act(async () => {});
    }

    it('renders no surface while mask drawing is off', async () => {
      await renderWithImage();
      expect(screen.queryByTestId('edit-ai-mask-surface')).toBeNull();
    });

    it('overlays the drawing surface while a mask tool is open', async () => {
      useAppStore.setState({ editAiMaskDrawing: true });
      await renderWithImage();
      expect(screen.getByTestId('edit-ai-mask-surface')).toBeInTheDocument();
      expect(screen.getByTestId('region-mask-drawer')).toBeInTheDocument();
    });

    it('commits drawn masks to the store with edit defaults', async () => {
      useAppStore.setState({ editAiMaskDrawing: true, editAiMaskTool: 'brush' });
      await renderWithImage();
      const surface = screen.getByTestId('region-mask-drawer');
      surface.getBoundingClientRect = () =>
        ({
          left: 0, top: 0, right: 640, bottom: 480,
          width: 640, height: 480, x: 0, y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
      fireEvent.pointerMove(surface, { clientX: 200, clientY: 250, pointerId: 1 });
      fireEvent.pointerUp(surface, { clientX: 200, clientY: 250, pointerId: 1 });

      const mask = useAppStore.getState().editAiMask;
      expect(mask).not.toBeNull();
      expect(mask).toMatchObject({ type: 'brush', featherRadius: 2, blendEdges: true });
      expect(mask?.points.length).toBeGreaterThanOrEqual(2);
    });
  });
});
