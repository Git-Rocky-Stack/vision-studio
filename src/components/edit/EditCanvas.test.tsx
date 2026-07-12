import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer } from '@/features/edit/textLayers';
import { EditCanvas } from './EditCanvas';

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: ReactNode }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Rect: () => <div />,
  Image: () => <div />,
  Line: () => <div />,
  Text: ({
    text,
    fontFamily,
    fontSize,
    fontStyle,
    fill,
    x,
    y,
    onClick,
  }: {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: string;
    fill?: string;
    x?: number;
    y?: number;
    onClick?: () => void;
  }) => (
    <div
      data-testid="konva-text"
      data-text={text}
      data-font-family={fontFamily}
      data-font-size={fontSize}
      data-font-style={fontStyle}
      data-fill={fill}
      data-x={x}
      data-y={y}
      onClick={onClick}
    />
  ),
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

  describe('text layers (#32)', () => {
    async function renderWithImage() {
      useAppStore.setState({
        currentImage: 'preview://img.png',
        currentImageAssetPath: 'C:/img.png',
      });
      render(<EditCanvas />);
      await act(async () => {});
    }

    function seedTextLayer(overrides: Partial<Parameters<typeof createTextLayer>[0]> = {}) {
      const layer = createTextLayer({
        text: 'Overlay',
        position: { x: 120, y: 80 },
        style: { ...TEXT_LAYER_DEFAULT_STYLE, fontFamily: 'IBM Plex Mono', fontSize: 64 },
        ...overrides,
      });
      act(() => {
        useAppStore.getState().addEditLayer(layer);
      });
      return layer;
    }

    it('renders visible text layers with their stored styling and position', async () => {
      await renderWithImage();
      seedTextLayer();

      const node = screen.getByTestId('konva-text');
      expect(node.dataset.text).toBe('Overlay');
      expect(node.dataset.fontFamily).toBe('IBM Plex Mono');
      expect(node.dataset.fontSize).toBe('64');
      expect(node.dataset.x).toBe('120');
      expect(node.dataset.y).toBe('80');
    });

    it('does not render hidden text layers', async () => {
      await renderWithImage();
      const layer = seedTextLayer();
      act(() => {
        useAppStore.getState().updateEditLayer(layer.id, { visible: false });
      });

      expect(screen.queryByTestId('konva-text')).toBeNull();
    });

    it('selects the text layer in the shared store when clicked', async () => {
      await renderWithImage();
      const layer = seedTextLayer();

      fireEvent.click(screen.getByTestId('konva-text'));

      expect(useAppStore.getState().selectedEditLayerId).toBe(layer.id);
    });

    it('records the intrinsic image size for text placement', async () => {
      await renderWithImage();

      expect(useAppStore.getState().currentImageSize).toEqual({ width: 640, height: 480 });
    });
  });
});
