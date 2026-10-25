import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Line, Text, Transformer } from 'react-konva';
import { ImageIcon } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { selectActiveRegionLock } from '@/store/slices/projectSlice';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useResolvedCssColors } from '@/hooks/useResolvedCssColors';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { RegionLockToolbar } from '@/components/edit/RegionLockToolbar';
import { RegionMaskDrawer } from '@/components/edit/RegionMaskDrawer';
import { CanvasControlLayerRail } from '@/components/canvas/CanvasControlLayerRail';
import { ShapeNode } from '@/components/edit/ShapeNode';
import { ToolOverlay, type ToolOverlayHandle } from '@/components/edit/ToolOverlay';
import { isTextLayer, konvaBlendMode, konvaFontStyle } from '@/features/edit/textLayers';
import { closesPath, createShapeLayer, isShapeLayer, shapeDataFromDrag } from '@/features/edit/shapeLayers';
import { finishPenPath } from '@/features/edit/penPath';
import { useRetouchedImage } from '@/features/edit/useRetouchedImage';
import { applyEditPipeline, isIdentityEdit } from '@/features/edit/imageFilters';
import { EXPORT_TAINTED_MESSAGE, registerEditFlattener, rgbToHex } from '@/features/edit/exportEdit';
import { useEditToolShortcuts } from '@/features/edit/useEditToolShortcuts';
import { PIXEL_ACCESS_NOTICE, cssFallbackFilter, loadEditableImage } from '@/features/edit/pixelAccess';
import type { RegionTool } from '@/components/edit/RegionLockToolbar';
import type { RegionMask } from '@/types/project';
import type { EditStroke, EditTool, RetouchStroke } from '@/types/editor';
import type Konva from 'konva';

const CHECKERBOARD_SIZE = 16;

// Konva draws to a canvas and cannot evaluate var(): the selection transformer
// takes these tokens resolved (useResolvedCssColors follows theme switches).
const TRANSFORMER_COLOR_TOKENS = {
  accent: '--color-feature-01',
  anchorStroke: '--color-text-primary',
  contrast: '--color-void',
} as const;

/** Tools that draw on a press-drag, so a click must not change the selection. */
const DRAWING_TOOLS: ReadonlySet<EditTool> = new Set(['brush', 'eraser', 'clone', 'heal', 'shape', 'pen']);

export const CLONE_SOURCE_HINT = 'Alt+click the image to set a clone source first.';
export const RETOUCH_TAINTED_MESSAGE = 'Clone Stamp and Heal need readable pixels, and this image cannot be read.';

function newStrokeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// #34 PR2: blank AI-tool mask shown before the first stroke is drawn.
const EMPTY_AI_MASK: RegionMask = {
  type: 'brush',
  points: [],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  featherRadius: 2,
  blendEdges: true,
};

export function EditCanvas() {
  const transformerColors = useResolvedCssColors(TRANSFORMER_COLOR_TOKENS);
  const {
    currentImage,
    activeEditTool,
    imageAdjustments,
    editLayers,
    selectedEditLayerId,
    setSelectedEditLayerId,
    updateEditLayer,
    setCurrentImageSize,
    regionMode,
    activeMaskTool,
    maskBrushSize,
    maskInverted,
    setActiveMaskTool,
    setMaskBrushSize,
    toggleMaskInverted,
    editAiMask,
    editAiMaskTool,
    editAiMaskBrushSize,
    editAiMaskDrawing,
    setEditAiMask,
    activeRegion,
    activeSceneId,
    updateRegionLock,
    setActiveTab,
    setCenterView,
    editStrokes,
    addEditStroke,
    editBrushColor,
    editBrushSize,
    setEditBrushColor,
    editFilters,
    editCompareOriginal,
    editRetouchStrokes,
    addEditLayer,
  } = useAppStore(useShallow((s) => ({
    editRetouchStrokes: s.editRetouchStrokes,
    addEditLayer: s.addEditLayer,
    setActiveTab: s.setActiveTab,
    setCenterView: s.setCenterView,
    editStrokes: s.editStrokes,
    addEditStroke: s.addEditStroke,
    editBrushColor: s.editBrushColor,
    editBrushSize: s.editBrushSize,
    setEditBrushColor: s.setEditBrushColor,
    editFilters: s.editFilters,
    editCompareOriginal: s.editCompareOriginal,
    currentImage: s.currentImage,
      activeEditTool: s.activeEditTool,
      imageAdjustments: s.imageAdjustments,
      editLayers: s.editLayers,
      selectedEditLayerId: s.selectedEditLayerId,
      setSelectedEditLayerId: s.setSelectedEditLayerId,
      updateEditLayer: s.updateEditLayer,
      setCurrentImageSize: s.setCurrentImageSize,
      regionMode: s.regionMode,
      activeMaskTool: s.activeMaskTool,
      maskBrushSize: s.maskBrushSize,
      maskInverted: s.maskInverted,
      setActiveMaskTool: s.setActiveMaskTool,
      setMaskBrushSize: s.setMaskBrushSize,
      toggleMaskInverted: s.toggleMaskInverted,
      editAiMask: s.editAiMask,
      editAiMaskTool: s.editAiMaskTool,
      editAiMaskBrushSize: s.editAiMaskBrushSize,
      editAiMaskDrawing: s.editAiMaskDrawing,
      setEditAiMask: s.setEditAiMask,
      // Resolved inside the selector, never as a `projects` subscription.
      // EditCanvas mounts the Konva stage, so a re-render here is one of the
      // most expensive in the app; subscribing to the array would re-render it
      // on every unrelated project write, because updateRegionLock and friends
      // rebuild `projects` wholesale. useShallow compares the resolved lock by
      // identity instead, and the slice actions preserve the identity of locks
      // they do not touch (projectSlice.ts:715).
      activeRegion: selectActiveRegionLock(s),
      activeSceneId: s.activeSceneId,
      updateRegionLock: s.updateRegionLock,
    })));

  const handleRegionMaskCommit = useCallback(
    (update: Parameters<Parameters<typeof RegionMaskDrawer>[0]['onMaskCommit']>[0]) => {
      if (!activeSceneId || !activeRegion) return;
      updateRegionLock(activeSceneId, activeRegion.id, {
        mask: {
          ...activeRegion.mask,
          type: update.type,
          points: update.points,
          bounds: update.bounds,
          brushSize: update.brushSize,
        },
      });
    },
    [activeSceneId, activeRegion, updateRegionLock],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const imageRef = useRef<Konva.Image>(null);
  const imageLayerRef = useRef<Konva.Layer>(null);
  const checkerLayerRef = useRef<Konva.Layer>(null);
  const overlayLayerRef = useRef<Konva.Layer>(null);
  const overlayRef = useRef<ToolOverlayHandle>(null);
  // In-progress Clone Stamp / Heal stroke and Shape drag. Kept in refs: the
  // overlay draws them, so the editor does not re-render per pointer move.
  const retouchDraftRef = useRef<Pick<RetouchStroke, 'tool' | 'points' | 'offset'> | null>(null);
  const shapeDragRef = useRef<{ x: number; y: number } | null>(null);

  useEditToolShortcuts();

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  // In-progress stroke only; committed strokes live in the store (editStrokes)
  // so they survive unmount and take part in undo/redo.
  const [draftStroke, setDraftStroke] = useState<EditStroke | null>(null);
  const draftStrokeRef = useRef<EditStroke | null>(null);
  // A tool's last refusal (eyedropper off the image, clone without a source),
  // shown while that tool stays active.
  const [toolNotice, setToolNotice] = useState<{ tool: EditTool; message: string } | null>(null);
  const setEyedropperError = useCallback(
    (message: string | null) => setToolNotice(message ? { tool: 'eyedropper', message } : null),
    [],
  );
  // False when the image taints the canvas (cross-origin without CORS):
  // pixel reads then throw, so the pixel pipeline, eyedropper and export
  // cannot run (see features/edit/pixelAccess.ts).
  const [pixelAccess, setPixelAccess] = useState(true);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load image with cleanup and error handling. The intrinsic size is shared
  // through the store so TextControls can center new text layers (#32).
  useEffect(() => {
    if (!currentImage) {
      setLoadedImage(null);
      setCurrentImageSize(null);
      return;
    }
    let cancelled = false;
    loadEditableImage(currentImage).then(
      ({ image, pixelAccess: readable }) => {
        if (cancelled) return;
        setLoadedImage(image);
        setPixelAccess(readable);
        setCurrentImageSize({ width: image.width, height: image.height });
      },
      () => {
        if (cancelled) return;
        setLoadedImage(null);
        setCurrentImageSize(null);
      },
    );
    return () => { cancelled = true; };
  }, [currentImage, setCurrentImageSize]);

  // Fit image to container
  useEffect(() => {
    if (!loadedImage) return;
    const scaleX = containerSize.width / loadedImage.width;
    const scaleY = containerSize.height / loadedImage.height;
    const scale = Math.min(scaleX, scaleY, 1) * 0.85;
    setStageScale(scale);
    setStagePos({
      x: (containerSize.width - loadedImage.width * scale) / 2,
      y: (containerSize.height - loadedImage.height * scale) / 2,
    });
  }, [loadedImage, containerSize]);

  // Attach transformer to the selected node. Text layers select through the
  // shared store id; the base image keeps its local id (#32). The rotate tool
  // attaches too so its rotateEnabled handle is reachable.
  const activeNodeId = selectedEditLayerId ?? selectedId;
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;

    const transformTool =
      activeEditTool === 'move' || activeEditTool === 'scale' || activeEditTool === 'rotate';
    if (activeNodeId && transformTool) {
      const node = stage.findOne(`#${activeNodeId}`);
      if (node) {
        transformer.nodes([node]);
        transformer.getLayer()?.batchDraw();
        return;
      }
    }
    transformer.nodes([]);
    transformer.getLayer()?.batchDraw();
  }, [activeNodeId, activeEditTool, editLayers]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const scaleBy = 1.05;
      const oldScale = stageScale;
      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
      setStageScale(Math.max(0.1, Math.min(5, newScale)));
    },
    [stageScale]
  );

  // Eyedropper: sample the rendered (adjusted) base image under the pointer
  // into the brush colour, and into the selected text layer's fill.
  const sampleColorAtPointer = useCallback(() => {
    const stage = stageRef.current;
    const layer = imageLayerRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !layer || !pointer) return;
    try {
      const ratio = layer.getCanvas().getPixelRatio();
      const pixel = layer
        .getContext()
        .getImageData(Math.floor(pointer.x * ratio), Math.floor(pointer.y * ratio), 1, 1).data;
      if (pixel[3] === 0) {
        setEyedropperError('Nothing to sample there. Click on the image.');
        return;
      }
      const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
      setEditBrushColor(hex);
      setEyedropperError(null);
      const state = useAppStore.getState();
      const selected = state.editLayers.find((l) => l.id === state.selectedEditLayerId);
      if (selected && isTextLayer(selected)) {
        updateEditLayer(selected.id, { data: { ...selected.data, fill: hex } }, 'Eyedropper text colour');
      }
    } catch {
      // A cross-origin image taints the canvas; reading pixels then throws.
      setEyedropperError('This image cannot be sampled.');
    }
  }, [setEditBrushColor, setEyedropperError, updateEditLayer]);

  // Stage click (deselect / zoom tool / eyedropper)
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeEditTool === 'eyedropper') {
        sampleColorAtPointer();
        return;
      }
      // A drawing tool's press-drag selects what it drew; the click that
      // ends it must not clear that selection.
      if (DRAWING_TOOLS.has(activeEditTool)) return;
      if (e.target === stageRef.current) {
        setSelectedId(null);
        setSelectedEditLayerId(null);
      }
      if (activeEditTool === 'zoom') {
        const scaleBy = e.evt.shiftKey ? 0.9 : 1.15;
        setStageScale((s) => Math.max(0.1, Math.min(5, s * scaleBy)));
      }
    },
    [activeEditTool, setSelectedEditLayerId, sampleColorAtPointer]
  );

  // Strokes are recorded in image pixels (the stage's local space), so they
  // stay put when the view zooms or pans, and export at full resolution.
  const handleMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.evt.button !== undefined && event.evt.button !== 0) return;
      const pos = stageRef.current?.getRelativePointerPosition();
      if (!pos) return;
      const state = useAppStore.getState();

      if (activeEditTool === 'brush' || activeEditTool === 'eraser') {
        const stroke: EditStroke = {
          id: newStrokeId('stroke'),
          tool: activeEditTool,
          points: [pos.x, pos.y],
          color: editBrushColor,
          size: activeEditTool === 'eraser' ? editBrushSize * 2 : editBrushSize,
        };
        draftStrokeRef.current = stroke;
        setDraftStroke(stroke);
        return;
      }

      if (activeEditTool === 'clone' || activeEditTool === 'heal') {
        if (!loadedImage) return;
        if (!pixelAccess) {
          setToolNotice({ tool: activeEditTool, message: RETOUCH_TAINTED_MESSAGE });
          return;
        }
        if (event.evt.altKey) {
          state.setEditCloneSource({ x: pos.x, y: pos.y });
          setToolNotice(null);
          return;
        }
        let offset: RetouchStroke['offset'] = null;
        if (state.editCloneSource) {
          // Aligned sampling: the first stroke after a new source fixes the
          // offset, and later strokes keep it.
          offset = state.editCloneOffset ?? {
            x: state.editCloneSource.x - pos.x,
            y: state.editCloneSource.y - pos.y,
          };
          if (!state.editCloneOffset) state.setEditCloneOffset(offset);
        } else if (activeEditTool === 'clone') {
          setToolNotice({ tool: 'clone', message: CLONE_SOURCE_HINT });
          return;
        }
        setToolNotice(null);
        retouchDraftRef.current = { tool: activeEditTool, points: [pos.x, pos.y], offset };
        overlayRef.current?.setRetouchDraft([pos.x, pos.y]);
        return;
      }

      if (activeEditTool === 'shape') {
        shapeDragRef.current = { x: pos.x, y: pos.y };
        return;
      }

      if (activeEditTool === 'pen') {
        const draft = state.editPenDraft;
        // The second press of a double-click ends an open path.
        if (draft && event.evt.detail >= 2) {
          finishPenPath(false);
          return;
        }
        if (draft && closesPath(draft, pos, stageScale)) {
          finishPenPath(true);
          return;
        }
        state.setEditPenDraft(draft ? [...draft, pos.x, pos.y] : [pos.x, pos.y]);
      }
    },
    [activeEditTool, editBrushColor, editBrushSize, loadedImage, pixelAccess, stageScale]
  );

  const handleMouseMove = useCallback((event?: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getRelativePointerPosition();
    if (!pos) return;
    overlayRef.current?.setPointer({ x: pos.x, y: pos.y });

    const draft = draftStrokeRef.current;
    if (draft) {
      const next = { ...draft, points: [...draft.points, pos.x, pos.y] };
      draftStrokeRef.current = next;
      setDraftStroke(next);
      return;
    }

    const retouch = retouchDraftRef.current;
    if (retouch) {
      // Skip sub-pixel steps: the mask is round, so dense points add nothing.
      const minStep = Math.max(1, useAppStore.getState().editBrushSize / 8);
      const lastX = retouch.points[retouch.points.length - 2];
      const lastY = retouch.points[retouch.points.length - 1];
      if (Math.hypot(pos.x - lastX, pos.y - lastY) < minStep) return;
      retouch.points = [...retouch.points, pos.x, pos.y];
      overlayRef.current?.setRetouchDraft(retouch.points);
      return;
    }

    const shapeStart = shapeDragRef.current;
    if (shapeStart) {
      const state = useAppStore.getState();
      overlayRef.current?.setShapeDraft(
        shapeDataFromDrag(state.editShapeKind, shapeStart, pos, state.editShapeStyle, Boolean(event?.evt.shiftKey)),
      );
    }
  }, []);

  const handleMouseUp = useCallback((event?: { evt?: MouseEvent } | MouseEvent) => {
    const state = useAppStore.getState();
    const draft = draftStrokeRef.current;
    draftStrokeRef.current = null;
    if (draft) {
      setDraftStroke(null);
      addEditStroke(draft);
    }

    const retouch = retouchDraftRef.current;
    retouchDraftRef.current = null;
    if (retouch) {
      overlayRef.current?.setRetouchDraft(null);
      state.addRetouchStroke({
        id: newStrokeId(retouch.tool),
        tool: retouch.tool,
        points: retouch.points,
        size: state.editBrushSize,
        hardness: state.editRetouchHardness,
        opacity: state.editRetouchOpacity,
        offset: retouch.offset,
      });
    }

    const shapeStart = shapeDragRef.current;
    shapeDragRef.current = null;
    if (shapeStart) {
      overlayRef.current?.setShapeDraft(null);
      const pos = stageRef.current?.getRelativePointerPosition();
      const mouse = event && 'evt' in event ? event.evt : (event as MouseEvent | undefined);
      const data = pos
        ? shapeDataFromDrag(state.editShapeKind, shapeStart, pos, state.editShapeStyle, Boolean(mouse?.shiftKey))
        : null;
      if (data) {
        const layer = createShapeLayer(data);
        addEditLayer(layer, `Add ${layer.name.toLowerCase()}`);
        setSelectedEditLayerId(layer.id);
      }
    }
  }, [addEditLayer, addEditStroke, setSelectedEditLayerId]);

  // A drag released outside the stage still ends (and commits) the stroke.
  useEffect(() => {
    const onWindowMouseUp = (event: MouseEvent) => handleMouseUp(event);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, [handleMouseUp]);

  // The tool's notice belongs to it: switching tools clears it.
  useEffect(() => {
    setToolNotice((notice) => (notice && notice.tool !== activeEditTool ? null : notice));
  }, [activeEditTool]);

  // Clone Stamp and Heal burn into the base pixels; Before/After shows the
  // original without them.
  const retouchedImage = useRetouchedImage(loadedImage, editRetouchStrokes, pixelAccess);
  const baseImage = editCompareOriginal ? loadedImage : retouchedImage;

  // Adjustments and look filters run on real pixels through a Konva filter
  // on the base image, so the canvas shows exactly what Export flattens.
  // Before/After compare renders the untouched original.
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !loadedImage) return;
    // A tainted canvas cannot be read back; the CSS fallback below previews instead.
    if (!pixelAccess || editCompareOriginal || isIdentityEdit(imageAdjustments, editFilters)) {
      node.filters([]);
      node.clearCache();
    } else {
      const adjustments = imageAdjustments;
      const filters = editFilters;
      node.filters([
        (imageData: ImageData) =>
          applyEditPipeline(imageData.data, imageData.width, imageData.height, adjustments, filters),
      ]);
      node.cache();
    }
    node.getLayer()?.batchDraw();
  }, [imageAdjustments, editFilters, editCompareOriginal, baseImage, pixelAccess]);

  // Export flattener: the stage at intrinsic image resolution, without the
  // checkerboard or transform handles.
  useEffect(() => {
    registerEditFlattener(() => {
      const stage = stageRef.current;
      if (!stage || !loadedImage) return null;
      if (!pixelAccess) throw new Error(EXPORT_TAINTED_MESSAGE);
      const transformer = transformerRef.current;
      const previousNodes = transformer?.nodes() ?? [];
      const scale = stage.scaleX() || 1;
      transformer?.nodes([]);
      checkerLayerRef.current?.hide();
      overlayLayerRef.current?.hide();
      try {
        return stage.toDataURL({
          x: stage.x(),
          y: stage.y(),
          width: loadedImage.width * scale,
          height: loadedImage.height * scale,
          pixelRatio: 1 / scale,
          mimeType: 'image/png',
        });
      } finally {
        checkerLayerRef.current?.show();
        overlayLayerRef.current?.show();
        transformer?.nodes(previousNodes);
        stage.batchDraw();
      }
    });
    return () => registerEditFlattener(null);
  }, [loadedImage, pixelAccess]);

  const fallbackCssFilter =
    !pixelAccess && !editCompareOriginal ? cssFallbackFilter(imageAdjustments) : '';

  const visibleStrokes = draftStroke ? [...editStrokes, draftStroke] : editStrokes;

  // Determine if stage is draggable (hand tool or no image)
  const isDraggable = activeEditTool === 'hand';

  // Cursor based on tool
  const getCursor = () => {
    switch (activeEditTool) {
      case 'hand':
        return 'grab';
      case 'brush':
      case 'eraser':
      case 'clone':
      case 'heal':
      case 'shape':
      case 'pen':
        return 'crosshair';
      case 'zoom':
        return 'zoom-in';
      case 'eyedropper':
        return 'crosshair';
      case 'text':
        return 'text';
      default:
        return 'default';
    }
  };

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Image editor canvas"
      aria-roledescription="canvas editor"
      tabIndex={0}
      className="w-full h-full relative overflow-hidden bg-void"
      style={{ cursor: getCursor() }}
    >
      <div className="sr-only" aria-live="polite">
        {`Editing ${currentImage ? 'image' : 'empty canvas'}. ${editLayers.length} layers. Active tool: ${activeEditTool}.`}
      </div>
      {/* Region Lock Toolbar - visible when region mode is active */}
      {regionMode && (
        <RegionLockToolbar
          activeTool={activeMaskTool as RegionTool}
          brushSize={maskBrushSize}
          isInverted={maskInverted}
          onToolChange={(tool) => setActiveMaskTool(tool)}
          onBrushSizeChange={setMaskBrushSize}
          onInvertToggle={toggleMaskInverted}
        />
      )}

      <CanvasControlLayerRail
        className={cn(
          'absolute top-4 z-10',
          regionMode ? 'left-20' : 'left-4',
        )}
      />

      {toolNotice && toolNotice.tool === activeEditTool && (
        <p
          role="alert"
          className="recessed-well absolute bottom-4 left-1/2 z-10 -translate-x-1/2 px-3 py-1.5 type-caption text-status-error"
        >
          {toolNotice.message}
        </p>
      )}

      {editCompareOriginal && currentImage && (
        <span className="recessed-well mono-label absolute right-4 top-4 z-10 px-2 py-1 text-text-primary">
          Before
        </span>
      )}

      {!pixelAccess && currentImage && (
        <p
          role="status"
          className="recessed-well absolute bottom-4 left-4 right-4 z-10 px-3 py-2 type-caption text-text-body"
        >
          {PIXEL_ACCESS_NOTICE}
        </p>
      )}

      <div style={{ filter: fallbackCssFilter || undefined }}>
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={isDraggable}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => overlayRef.current?.setPointer(null)}
          onDragEnd={(e) => {
            if (isDraggable) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
        >
          {/* Background checkerboard layer */}
          <Layer ref={checkerLayerRef}>
            {loadedImage &&
              Array.from({
                length: Math.ceil(loadedImage.width / CHECKERBOARD_SIZE),
              }).map((_, col) =>
                Array.from({
                  length: Math.ceil(loadedImage.height / CHECKERBOARD_SIZE),
                }).map((_, row) => (
                  <Rect
                    key={`${col}-${row}`}
                    x={col * CHECKERBOARD_SIZE}
                    y={row * CHECKERBOARD_SIZE}
                    width={CHECKERBOARD_SIZE}
                    height={CHECKERBOARD_SIZE}
                    fill={
                      (col + row) % 2 === 0
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(255,255,255,0.02)'
                    }
                  />
                ))
              )}
          </Layer>

          {/* Main image layer */}
          <Layer ref={imageLayerRef}>
            {loadedImage && (
              <KonvaImage
                id="main-image"
                ref={imageRef}
                image={baseImage ?? loadedImage}
                x={0}
                y={0}
                width={loadedImage.width}
                height={loadedImage.height}
                draggable={
                  activeEditTool === 'move' || activeEditTool === 'scale'
                }
                onClick={() => {
                  if (DRAWING_TOOLS.has(activeEditTool)) return;
                  setSelectedId('main-image');
                  setSelectedEditLayerId(null);
                }}
                onTap={() => {
                  if (DRAWING_TOOLS.has(activeEditTool)) return;
                  setSelectedId('main-image');
                  setSelectedEditLayerId(null);
                }}
              />
            )}
          </Layer>

          {/* Text, shape and path layers, stacked in layer-panel order. */}
          <Layer visible={!editCompareOriginal}>
            {editLayers.filter((layer) => layer.visible).map((layer) => {
              if (!isTextLayer(layer) && !isShapeLayer(layer)) return null;
              const selectLayer = () => {
                if (DRAWING_TOOLS.has(activeEditTool)) return;
                setSelectedEditLayerId(layer.id);
                setSelectedId(null);
              };
              const persistTransform = (e: Konva.KonvaEventObject<Event>) => {
                const node = e.target;
                updateEditLayer(layer.id, {
                  data: {
                    ...layer.data,
                    x: node.x(),
                    y: node.y(),
                    rotation: node.rotation(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                  },
                });
              };
              const draggable =
                !layer.locked && (activeEditTool === 'move' || activeEditTool === 'scale');

              if (isShapeLayer(layer)) {
                return (
                  <ShapeNode
                    key={layer.id}
                    id={layer.id}
                    data={layer.data}
                    opacity={layer.opacity}
                    globalCompositeOperation={konvaBlendMode(layer.blendMode)}
                    listening={!layer.locked}
                    draggable={draggable}
                    onClick={selectLayer}
                    onTap={selectLayer}
                    onDragEnd={persistTransform}
                    onTransformEnd={persistTransform}
                  />
                );
              }

              return (
                <Text
                  key={layer.id}
                  id={layer.id}
                  text={layer.data.text}
                  x={layer.data.x}
                  y={layer.data.y}
                  rotation={layer.data.rotation}
                  scaleX={layer.data.scaleX}
                  scaleY={layer.data.scaleY}
                  fontFamily={layer.data.fontFamily}
                  fontSize={layer.data.fontSize}
                  fontStyle={konvaFontStyle(layer.data)}
                  textDecoration={layer.data.underline ? 'underline' : ''}
                  align={layer.data.align}
                  fill={layer.data.fill}
                  letterSpacing={layer.data.letterSpacing}
                  lineHeight={layer.data.lineHeight}
                  opacity={layer.opacity}
                  globalCompositeOperation={konvaBlendMode(layer.blendMode)}
                  shadowEnabled={layer.data.shadowEnabled}
                  shadowColor={layer.data.shadowColor}
                  shadowBlur={layer.data.shadowBlur}
                  shadowOffsetX={layer.data.shadowOffsetX}
                  shadowOffsetY={layer.data.shadowOffsetY}
                  strokeEnabled={layer.data.strokeEnabled}
                  stroke={layer.data.strokeColor}
                  strokeWidth={layer.data.strokeWidth}
                  fillAfterStrokeEnabled
                  listening={!layer.locked}
                  draggable={draggable}
                  onClick={selectLayer}
                  onTap={selectLayer}
                  onDragEnd={persistTransform}
                  onTransformEnd={persistTransform}
                />
              );
            })}
          </Layer>

          {/* Drawing layer */}
          <Layer name="drawing-layer" visible={!editCompareOriginal}>
            {visibleStrokes.map((line) => (
              <Line
                key={line.id}
                points={line.points}
                stroke={line.tool === 'eraser' ? 'rgba(0,0,0,1)' : line.color}
                strokeWidth={line.size}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            ))}
          </Layer>

          {/* Tool feedback: brush footprint, clone source, drafts. Never exported. */}
          <Layer ref={overlayLayerRef} listening={false} visible={!editCompareOriginal && Boolean(loadedImage)}>
            <ToolOverlay
              ref={overlayRef}
              stageScale={stageScale}
              accentColor={transformerColors.accent}
              contrastColor={transformerColors.contrast}
            />
          </Layer>

          {/* Transform handles layer */}
          <Layer>
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
              borderStroke={transformerColors.accent}
              borderStrokeWidth={1}
              anchorFill={transformerColors.accent}
              anchorStroke={transformerColors.anchorStroke}
              anchorSize={8}
              anchorCornerRadius={2}
              rotateEnabled={activeEditTool === 'rotate'}
              enabledAnchors={
                activeEditTool === 'move'
                  ? []
                  : activeEditTool === 'scale'
                    ? [
                        'top-left',
                        'top-right',
                        'bottom-left',
                        'bottom-right',
                        'middle-left',
                        'middle-right',
                        'top-center',
                        'bottom-center',
                      ]
                    : []
              }
            />
          </Layer>
        </Stage>
      </div>

      {/* #34 PR2: AI-tool inpaint mask surface (Generative Fill / Object
          Removal). Overlays the displayed image exactly; while a mask tool is
          open in the AI panel this surface owns the pointer. */}
      {editAiMaskDrawing && loadedImage && (
        <div
          data-testid="edit-ai-mask-surface"
          className="absolute"
          style={{
            left: stagePos.x,
            top: stagePos.y,
            width: loadedImage.width * stageScale,
            height: loadedImage.height * stageScale,
          }}
        >
          <RegionMaskDrawer
            activeRegion={{ id: 'edit-ai-mask', mask: editAiMask ?? EMPTY_AI_MASK }}
            canvasWidth={loadedImage.width}
            canvasHeight={loadedImage.height}
            tool={editAiMaskTool}
            brushSize={editAiMaskBrushSize}
            onMaskCommit={(update) =>
              setEditAiMask({ ...update, featherRadius: 2, blendEdges: true })
            }
          />
        </div>
      )}

      {/* Region-lock mask surface. Mirrors the AI mask surface geometry so the
          drawer overlays the displayed image exactly and scales with the stage;
          an `absolute inset-0` surface would size to the whole editor instead.
          The AI mask takes precedence: while it is open it owns the pointer,
          and two stacked drawers would both claim the same drag. */}
      {regionMode && activeRegion && !editAiMaskDrawing && loadedImage && (
        <div
          data-testid="edit-region-mask-surface"
          className="absolute"
          style={{
            left: stagePos.x,
            top: stagePos.y,
            width: loadedImage.width * stageScale,
            height: loadedImage.height * stageScale,
          }}
        >
          <RegionMaskDrawer
            activeRegion={{ id: activeRegion.id, mask: activeRegion.mask }}
            canvasWidth={loadedImage.width}
            canvasHeight={loadedImage.height}
            tool={activeMaskTool}
            brushSize={maskBrushSize}
            onMaskCommit={handleRegionMaskCommit}
          />
        </div>
      )}

      {/* No image state. The canvas has no drop handler, so the copy points at
          the two places an image can actually be sent here from. The overlay
          lets pointer events through; only the card itself takes them. */}
      {!currentImage && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <EmptyState
            className="pointer-events-auto h-auto"
            icon={ImageIcon}
            title="Load an image to start editing"
            description="Generate one, or pick a result in the Viewer and send it to the canvas."
          >
            <Button variant="primary" size="sm" onClick={() => setActiveTab('generate')}>
              Open Generate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActiveTab('generate');
                setCenterView('viewer');
              }}
            >
              Open Viewer
            </Button>
          </EmptyState>
        </div>
      )}
    </div>
  );
}
