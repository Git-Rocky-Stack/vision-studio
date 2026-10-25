import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TEXT_LAYER_DEFAULT_STYLE, createTextLayer } from '@/features/edit/textLayers';
import { EditCanvas } from './EditCanvas';

// The pointer the mocked stage reports, in image pixels. Tests move it, then
// fire mouse events on the stage element.
const pointer = { x: 0, y: 0 };
type StageMouseHandler = (event: { evt: MouseEvent; target: unknown }) => void;

vi.mock('react-konva', () => ({
  Stage: forwardRef(function MockStage(
    {
      children,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onClick,
    }: {
      children: ReactNode;
      onClick?: StageMouseHandler;
      onMouseDown?: StageMouseHandler;
      onMouseMove?: StageMouseHandler;
      onMouseUp?: StageMouseHandler;
    },
    ref,
  ) {
    const handle = useRef({
      getRelativePointerPosition: () => ({ ...pointer }),
      getPointerPosition: () => ({ ...pointer }),
      findOne: () => null,
    }).current;
    useImperativeHandle(ref, () => handle);
    // Like Konva: the target is the stage only when nothing on it was hit.
    const forward = (handler?: StageMouseHandler) => (event: React.MouseEvent) =>
      handler?.({
        evt: event.nativeEvent,
        target: event.target === event.currentTarget ? handle : event.target,
      });
    return (
      <div
        data-testid="konva-stage"
        onMouseDown={forward(onMouseDown)}
        onMouseMove={forward(onMouseMove)}
        onMouseUp={forward(onMouseUp)}
        onClick={forward(onClick)}
      >
        {children}
      </div>
    );
  }),
  Group: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Circle: () => <div data-testid="konva-circle" />,
  Ellipse: ({ id }: { id?: string }) => <div data-testid="konva-ellipse" data-id={id} />,
  Arrow: ({ id }: { id?: string }) => <div data-testid="konva-arrow" data-id={id} />,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Rect: ({ id, width, height }: { id?: string; width?: number; height?: number }) => (
    <div data-testid={id ? 'konva-shape-rect' : undefined} data-id={id} data-width={width} data-height={height} />
  ),
  Image: () => <div />,
  Line: ({ stroke, strokeWidth }: { stroke?: string; strokeWidth?: number }) => (
    <div data-testid="konva-line" data-stroke={stroke} data-stroke-width={strokeWidth} />
  ),
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

  // The empty canvas used to say "drag one onto the canvas". Nothing handles
  // a drop here, so the state now offers the two routes that do load an image.
  describe('with no image loaded', () => {
    it('offers real ways to get an image instead of a drag it cannot take', () => {
      render(<EditCanvas />);

      const state = screen.getByTestId('empty-state');
      expect(state).toHaveTextContent('Load an image to start editing');
      expect(state).not.toHaveTextContent(/drag/i);
    });

    it('opens Generate from the empty canvas', () => {
      useAppStore.getState().setActiveTab('canvas');
      render(<EditCanvas />);

      fireEvent.click(screen.getByRole('button', { name: 'Open Generate' }));

      expect(useAppStore.getState().activeTab).toBe('generate');
    });

    it('opens the Viewer, where a result can be sent to the canvas', () => {
      useAppStore.getState().setActiveTab('canvas');
      render(<EditCanvas />);

      fireEvent.click(screen.getByRole('button', { name: 'Open Viewer' }));

      expect(useAppStore.getState().activeTab).toBe('generate');
      expect(useAppStore.getState().centerView).toBe('viewer');
    });

    it('lets pointer events through to the canvas around the card', () => {
      render(<EditCanvas />);

      const state = screen.getByTestId('empty-state');
      expect(state).toHaveClass('pointer-events-auto');
      expect(state.parentElement).toHaveClass('pointer-events-none');
    });
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
      useAppStore.setState({ editAiMaskDrawing: true, editAiMaskTool: 'rectangle' });
      await renderWithImage();

      // The surface sits exactly over the displayed image: the 640x480 stub is
      // fitted at 0.85 and centred in the default 800x600 stage.
      const surface = screen.getByTestId('edit-ai-mask-surface');
      expect(surface).toHaveStyle({ left: '128px', top: '96px', width: '544px', height: '408px' });

      // The drawer fills that surface, takes the pointer, and is bound to the AI
      // mask and to the tool picked in the panel, not to a region lock.
      const drawer = screen.getByTestId('region-mask-drawer');
      expect(surface).toContainElement(drawer);
      expect(drawer).toHaveClass('absolute', 'inset-0');
      expect(drawer).toHaveStyle({ pointerEvents: 'auto' });
      expect(drawer).toHaveAttribute('data-active-region', 'edit-ai-mask');
      expect(drawer).toHaveAttribute('data-active-tool', 'rectangle');
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

  describe('brush strokes live in the store', () => {
    const stroke = { id: 's1', tool: 'brush' as const, points: [0, 0, 4, 4], color: '#ff0000', size: 6 };

    it('renders committed strokes from the store and keeps them across a remount', () => {
      act(() => {
        useAppStore.getState().addEditStroke(stroke);
      });
      const { unmount } = render(<EditCanvas />);
      expect(screen.getByTestId('konva-line').dataset.stroke).toBe('#ff0000');
      unmount();

      render(<EditCanvas />);
      expect(screen.getAllByTestId('konva-line')).toHaveLength(1);
    });

    it('hides strokes while Before/After shows the original', () => {
      act(() => {
        useAppStore.getState().setCurrentImage('img.png', 'C:/img.png');
        useAppStore.getState().addEditStroke(stroke);
        useAppStore.getState().setEditCompareOriginal(true);
      });
      render(<EditCanvas />);
      expect(screen.getByText('Before')).toBeInTheDocument();
    });
  });

  describe('edit tool shortcuts (mounted with the editor)', () => {
    it('switches tools with single letters', () => {
      render(<EditCanvas />);
      fireEvent.keyDown(window, { key: 'b' });
      expect(useAppStore.getState().activeEditTool).toBe('brush');
      fireEvent.keyDown(window, { key: 'I' });
      expect(useAppStore.getState().activeEditTool).toBe('eyedropper');
    });

    it.each([
      ['s', 'clone'],
      ['j', 'heal'],
      ['u', 'shape'],
      ['p', 'pen'],
    ] as const)('selects the retouch and vector tools: %s', (key, tool) => {
      render(<EditCanvas />);
      fireEvent.keyDown(window, { key });
      expect(useAppStore.getState().activeEditTool).toBe(tool);
    });

    it('ignores letters typed into inputs, selects and contentEditable, and Ctrl chords', () => {
      render(
        <>
          <EditCanvas />
          <input aria-label="field" />
          <select aria-label="pick"><option>a</option></select>
          <div contentEditable aria-label="rich" suppressContentEditableWarning>x</div>
        </>,
      );
      fireEvent.keyDown(screen.getByLabelText('field'), { key: 'b' });
      fireEvent.keyDown(screen.getByLabelText('pick'), { key: 'b' });
      fireEvent.keyDown(screen.getByLabelText('rich'), { key: 'b' });
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      expect(useAppStore.getState().activeEditTool).toBe('move');
    });

    it('drives region mask tools while region mode is on', () => {
      useAppStore.setState({ regionMode: true });
      render(<EditCanvas />);
      fireEvent.keyDown(window, { key: 'l' });
      expect(useAppStore.getState().activeMaskTool).toBe('polygon');
      expect(useAppStore.getState().activeEditTool).toBe('move');
    });

    it('stops listening once the editor unmounts', () => {
      const { unmount } = render(<EditCanvas />);
      unmount();
      fireEvent.keyDown(window, { key: 'b' });
      expect(useAppStore.getState().activeEditTool).toBe('move');
    });
  });

  describe('drawing tools', () => {
    async function renderWithImage(tool: Parameters<ReturnType<typeof useAppStore.getState>['setActiveEditTool']>[0]) {
      act(() => {
        useAppStore.getState().setCurrentImage('preview://img.png', 'C:/img.png');
        useAppStore.getState().setActiveEditTool(tool);
      });
      render(<EditCanvas />);
      await act(async () => {});
      return screen.getByTestId('konva-stage');
    }

    const at = (x: number, y: number) => {
      pointer.x = x;
      pointer.y = y;
    };

    it('draws a rectangle layer on a drag and selects it', async () => {
      const stage = await renderWithImage('shape');
      at(10, 20);
      fireEvent.mouseDown(stage, { button: 0 });
      at(110, 70);
      fireEvent.mouseMove(stage);
      fireEvent.mouseUp(stage);

      const { editLayers, selectedEditLayerId } = useAppStore.getState();
      const shape = editLayers.find((layer) => layer.type === 'shape');
      expect(shape?.data).toMatchObject({ kind: 'rectangle', x: 10, y: 20, width: 100, height: 50 });
      expect(selectedEditLayerId).toBe(shape?.id);
      expect(screen.getByTestId('konva-shape-rect')).toHaveAttribute('data-id', shape?.id);
      expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Add rectangle');
    });

    it('draws the kind picked in the tool options', async () => {
      useAppStore.getState().setEditShapeKind('ellipse');
      const stage = await renderWithImage('shape');
      at(0, 0);
      fireEvent.mouseDown(stage, { button: 0 });
      at(40, 20);
      fireEvent.mouseUp(stage);
      expect(useAppStore.getState().editLayers.at(-1)?.data).toMatchObject({ kind: 'ellipse', x: 20, y: 10 });
      expect(screen.getByTestId('konva-ellipse')).toBeInTheDocument();
    });

    it('ignores a click that is not a drag', async () => {
      const stage = await renderWithImage('shape');
      at(5, 5);
      fireEvent.mouseDown(stage, { button: 0 });
      fireEvent.mouseUp(stage);
      expect(useAppStore.getState().editLayers.some((layer) => layer.type === 'shape')).toBe(false);
    });

    it('builds a pen path from clicks and closes it on the first anchor', async () => {
      const stage = await renderWithImage('pen');
      for (const [x, y] of [[0, 0], [100, 0], [100, 100]]) {
        at(x, y);
        fireEvent.mouseDown(stage, { button: 0 });
        fireEvent.mouseUp(stage);
      }
      expect(useAppStore.getState().editPenDraft).toEqual([0, 0, 100, 0, 100, 100]);

      at(1, 1);
      fireEvent.mouseDown(stage, { button: 0 });
      const path = useAppStore.getState().editLayers.at(-1);
      expect(path?.data).toMatchObject({ kind: 'path', closed: true, points: [0, 0, 100, 0, 100, 100] });
      expect(useAppStore.getState().editPenDraft).toBeNull();
    });

    it('finishes an open pen path with Enter and cancels one with Escape', async () => {
      const stage = await renderWithImage('pen');
      at(0, 0);
      fireEvent.mouseDown(stage, { button: 0 });
      at(50, 50);
      fireEvent.mouseDown(stage, { button: 0 });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(useAppStore.getState().editLayers.at(-1)?.data).toMatchObject({ kind: 'path', closed: false });

      at(10, 10);
      fireEvent.mouseDown(stage, { button: 0 });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useAppStore.getState().editPenDraft).toBeNull();
    });

    it('asks for a source before cloning, and Alt+click sets one', async () => {
      const stage = await renderWithImage('clone');
      at(30, 30);
      fireEvent.mouseDown(stage, { button: 0 });
      expect(screen.getByRole('alert')).toHaveTextContent('Alt+click the image to set a clone source first.');
      expect(useAppStore.getState().editRetouchStrokes).toEqual([]);

      at(5, 6);
      fireEvent.mouseDown(stage, { button: 0, altKey: true });
      expect(useAppStore.getState().editCloneSource).toEqual({ x: 5, y: 6 });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('commits a clone stroke with the aligned offset, and keeps the offset for the next stroke', async () => {
      const stage = await renderWithImage('clone');
      act(() => useAppStore.getState().setEditCloneSource({ x: 10, y: 10 }));
      at(40, 50);
      fireEvent.mouseDown(stage, { button: 0 });
      at(60, 50);
      fireEvent.mouseMove(stage);
      fireEvent.mouseUp(stage);

      at(200, 200);
      fireEvent.mouseDown(stage, { button: 0 });
      fireEvent.mouseUp(stage);

      const [first, second] = useAppStore.getState().editRetouchStrokes;
      expect(first).toMatchObject({ tool: 'clone', points: [40, 50, 60, 50], offset: { x: -30, y: -40 } });
      expect(second.offset).toEqual({ x: -30, y: -40 });
      expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Clone Stamp stroke');
    });

    it('spot heals without a source', async () => {
      const stage = await renderWithImage('heal');
      at(20, 20);
      fireEvent.mouseDown(stage, { button: 0 });
      fireEvent.mouseUp(stage);
      expect(useAppStore.getState().editRetouchStrokes[0]).toMatchObject({ tool: 'heal', offset: null });
      expect(useAppStore.getState().editHistory.at(-1)?.action).toBe('Spot heal stroke');
    });

    it('does not change the selection when a drawing tool click ends', async () => {
      const stage = await renderWithImage('shape');
      at(0, 0);
      fireEvent.mouseDown(stage, { button: 0 });
      at(30, 30);
      fireEvent.mouseUp(stage);
      fireEvent.click(stage);
      expect(useAppStore.getState().selectedEditLayerId).not.toBeNull();

      // The same click with the Move tool still clears the selection.
      act(() => useAppStore.getState().setActiveEditTool('move'));
      fireEvent.click(stage);
      expect(useAppStore.getState().selectedEditLayerId).toBeNull();
    });
  });
});
