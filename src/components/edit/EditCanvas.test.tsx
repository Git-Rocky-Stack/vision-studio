import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
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

  // The Canvas tab renders EditCanvas, not the generation Canvas
  // (DockviewLayout.tsx:64), and EditCanvas already renders RegionLockToolbar.
  // Without a mask surface on this same component the region tools are inert:
  // the user picks Rectangle and no drag can ever reach a region lock.
  describe('region lock mask surface', () => {
    async function renderWithRegionLock(
      overrides: Partial<{ regionMode: boolean; editAiMaskDrawing: boolean }> = {},
    ) {
      const { createProject, addScene, setActiveProject, setActiveScene } =
        useAppStore.getState();
      const project = createProject('Region Edit', { width: 640, height: 480 });
      const scene = addScene(project.id);
      setActiveProject(project.id);
      setActiveScene(scene.id);
      const lock = useAppStore
        .getState()
        .createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });

      useAppStore.setState({
        currentImage: 'preview://img.png',
        currentImageAssetPath: 'C:/img.png',
        regionMode: true,
        activeRegionId: lock.id,
        activeMaskTool: 'rectangle',
        ...overrides,
      });

      render(<EditCanvas />);
      await act(async () => {});
      return { sceneId: scene.id, lockId: lock.id };
    }

    function readMask(sceneId: string, lockId: string) {
      const scene = useAppStore
        .getState()
        .projects.flatMap((p) => p.scenes)
        .find((s) => s.id === sceneId);
      return scene?.regionLocks.find((l) => l.id === lockId)?.mask ?? null;
    }

    it('renders no region surface while region mode is off', async () => {
      await renderWithRegionLock({ regionMode: false });
      expect(screen.queryByTestId('edit-region-mask-surface')).toBeNull();
    });

    it('overlays a drawing surface bound to the active region lock', async () => {
      const { lockId } = await renderWithRegionLock();
      expect(screen.getByTestId('edit-region-mask-surface')).toBeInTheDocument();
      expect(screen.getByTestId('region-mask-drawer')).toHaveAttribute(
        'data-active-region',
        lockId,
      );
    });

    it('yields the pointer to the AI mask surface when one is open', async () => {
      await renderWithRegionLock({ editAiMaskDrawing: true });
      expect(screen.queryByTestId('edit-region-mask-surface')).toBeNull();
      expect(screen.getByTestId('edit-ai-mask-surface')).toBeInTheDocument();
    });

    it('commits a drawn rectangle to the active region lock', async () => {
      const { sceneId, lockId } = await renderWithRegionLock();
      // Untouched lock still carries the 100x100 default.
      expect(readMask(sceneId, lockId)?.bounds).toEqual({
        x: 0, y: 0, width: 100, height: 100,
      });

      const surface = screen.getByTestId('region-mask-drawer');
      // The stubbed image is 640x480, so a 640x480 client rect maps 1:1.
      surface.getBoundingClientRect = () =>
        ({
          left: 0, top: 0, right: 640, bottom: 480,
          width: 640, height: 480, x: 0, y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.pointerDown(surface, { clientX: 64, clientY: 48, button: 0, pointerId: 1 });
      fireEvent.pointerMove(surface, { clientX: 320, clientY: 240, pointerId: 1 });
      fireEvent.pointerUp(surface, { clientX: 320, clientY: 240, pointerId: 1 });

      const mask = readMask(sceneId, lockId);
      expect(mask?.type).toBe('rectangle');
      expect(mask?.bounds).toEqual({ x: 64, y: 48, width: 256, height: 192 });
    });
  });

  // EditCanvas mounts a Konva Stage and every layer under it; a re-render here
  // is one of the most expensive in the app. Deriving the active region lock
  // from a `projects` subscription made every unrelated project mutation --
  // renaming a project on another tab, a background scene write -- push a new
  // `projects` array identity through useShallow and re-render the whole stage.
  // The subscription must be to the resolved lock object, not the array.
  describe('render isolation from unrelated project state', () => {
    it('does not re-render when an unrelated project mutates', async () => {
      const { createProject, addScene, setActiveProject, setActiveScene } =
        useAppStore.getState();
      const active = createProject('Active', { width: 640, height: 480 });
      const scene = addScene(active.id);
      setActiveProject(active.id);
      setActiveScene(scene.id);
      const lock = useAppStore
        .getState()
        .createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });
      const unrelated = createProject('Unrelated', { width: 640, height: 480 });

      useAppStore.setState({
        currentImage: 'preview://img.png',
        currentImageAssetPath: 'C:/img.png',
        regionMode: true,
        activeRegionId: lock.id,
        activeMaskTool: 'rectangle',
      });

      let commits = 0;
      render(
        <Profiler id="edit-canvas" onRender={() => { commits += 1; }}>
          <EditCanvas />
        </Profiler>,
      );
      await act(async () => {});

      // Sanity: the surface really is mounted, so we are counting commits of a
      // live stage rather than an early-returned placeholder.
      expect(screen.getByTestId('edit-region-mask-surface')).toBeInTheDocument();

      const baseline = commits;
      await act(async () => {
        useAppStore.getState().updateProject(unrelated.id, { name: 'Renamed' });
      });

      expect(commits).toBe(baseline);
    });

    it('still re-renders when the active region lock itself changes', async () => {
      const { createProject, addScene, setActiveProject, setActiveScene } =
        useAppStore.getState();
      const active = createProject('Active', { width: 640, height: 480 });
      const scene = addScene(active.id);
      setActiveProject(active.id);
      setActiveScene(scene.id);
      const lock = useAppStore
        .getState()
        .createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });

      useAppStore.setState({
        currentImage: 'preview://img.png',
        currentImageAssetPath: 'C:/img.png',
        regionMode: true,
        activeRegionId: lock.id,
        activeMaskTool: 'rectangle',
      });

      let commits = 0;
      render(
        <Profiler id="edit-canvas" onRender={() => { commits += 1; }}>
          <EditCanvas />
        </Profiler>,
      );
      await act(async () => {});

      const baseline = commits;
      await act(async () => {
        useAppStore.getState().updateRegionLock(scene.id, lock.id, { name: 'Renamed region' });
      });

      expect(commits).toBeGreaterThan(baseline);
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
