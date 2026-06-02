import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Line, Transformer } from 'react-konva';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { RegionLockToolbar } from '@/components/edit/RegionLockToolbar';
import { CanvasControlLayerRail } from '@/components/canvas/CanvasControlLayerRail';
import type { RegionTool } from '@/components/edit/RegionLockToolbar';
import type Konva from 'konva';

const CHECKERBOARD_SIZE = 16;

export function EditCanvas() {
  const {
    currentImage,
    activeEditTool,
    imageAdjustments,
    editLayers,
    regionMode,
    activeMaskTool,
    maskBrushSize,
    maskInverted,
    setActiveMaskTool,
    setMaskBrushSize,
    toggleMaskInverted,
  } = useAppStore(useShallow((s) => ({
    currentImage: s.currentImage,
      activeEditTool: s.activeEditTool,
      imageAdjustments: s.imageAdjustments,
      editLayers: s.editLayers,
      regionMode: s.regionMode,
      activeMaskTool: s.activeMaskTool,
      maskBrushSize: s.maskBrushSize,
      maskInverted: s.maskInverted,
      setActiveMaskTool: s.setActiveMaskTool,
      setMaskBrushSize: s.setMaskBrushSize,
      toggleMaskInverted: s.toggleMaskInverted,
    })));

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const imageRef = useRef<Konva.Image>(null);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [lines, setLines] = useState<{ points: number[]; tool: string }[]>([]);
  const currentLineRef = useRef<{ points: number[]; tool: string } | null>(null);

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

  // Load image with cleanup and error handling
  useEffect(() => {
    if (!currentImage) {
      setLoadedImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setLoadedImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setLoadedImage(null);
    };
    img.src = currentImage;
    return () => { cancelled = true; };
  }, [currentImage]);

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

  // Attach transformer to selected node
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;

    if (selectedId && (activeEditTool === 'move' || activeEditTool === 'scale')) {
      const node = stage.findOne(`#${selectedId}`);
      if (node) {
        transformer.nodes([node]);
        transformer.getLayer()?.batchDraw();
        return;
      }
    }
    transformer.nodes([]);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, activeEditTool]);

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

  // Stage click (deselect / zoom tool)
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === stageRef.current) {
        setSelectedId(null);
      }
      if (activeEditTool === 'zoom') {
        const scaleBy = e.evt.shiftKey ? 0.9 : 1.15;
        setStageScale((s) => Math.max(0.1, Math.min(5, s * scaleBy)));
      }
    },
    [activeEditTool]
  );

  // Drawing handlers - use ref for in-progress line to avoid array copy on every mouse move
  const handleMouseDown = useCallback(
    (_event: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeEditTool !== 'brush' && activeEditTool !== 'eraser') return;
      setIsDrawing(true);
      const pos = stageRef.current?.getPointerPosition();
      if (pos) {
        const newLine = { points: [pos.x, pos.y], tool: activeEditTool };
        currentLineRef.current = newLine;
        setLines((prev) => [...prev, newLine]);
      }
    },
    [activeEditTool]
  );

  const handleMouseMove = useCallback(
    (_event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || !currentLineRef.current) return;
      const pos = stageRef.current?.getPointerPosition();
      if (!pos) return;
      // Mutate the current line ref directly for performance
      currentLineRef.current.points = currentLineRef.current.points.concat([pos.x, pos.y]);
      // Force a re-render of the Konva layer without full state copy
      const layer = stageRef.current?.findOne('.drawing-layer');
      if (layer) (layer as unknown as { batchDraw: () => void }).batchDraw();
    },
    [isDrawing]
  );

  const handleMouseUp = useCallback(() => {
    if (currentLineRef.current) {
      // Commit final line state
      setLines((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...currentLineRef.current! };
        return updated;
      });
      currentLineRef.current = null;
    }
    setIsDrawing(false);
  }, []);

  // CSS filter string from adjustments
  const cssFilter = [
    `brightness(${1 + imageAdjustments.brightness / 100})`,
    `contrast(${1 + imageAdjustments.contrast / 100})`,
    `saturate(${1 + imageAdjustments.saturation / 100})`,
    imageAdjustments.blur > 0 ? `blur(${imageAdjustments.blur * 0.2}px)` : '',
    imageAdjustments.temperature !== 0
      ? `sepia(${Math.abs(imageAdjustments.temperature) / 200})`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Determine if stage is draggable (hand tool or no image)
  const isDraggable = activeEditTool === 'hand';

  // Cursor based on tool
  const getCursor = () => {
    switch (activeEditTool) {
      case 'hand':
        return 'grab';
      case 'brush':
      case 'eraser':
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

      <div style={{ filter: cssFilter || undefined }}>
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
          onDragEnd={(e) => {
            if (isDraggable) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
        >
          {/* Background checkerboard layer */}
          <Layer>
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
          <Layer>
            {loadedImage && (
              <KonvaImage
                id="main-image"
                ref={imageRef}
                image={loadedImage}
                x={0}
                y={0}
                width={loadedImage.width}
                height={loadedImage.height}
                draggable={
                  activeEditTool === 'move' || activeEditTool === 'scale'
                }
                onClick={() => setSelectedId('main-image')}
                onTap={() => setSelectedId('main-image')}
              />
            )}
          </Layer>

          {/* Drawing layer */}
          <Layer name="drawing-layer">
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points}
                stroke={
                  line.tool === 'eraser'
                    ? 'rgba(0,0,0,1)'
                    : 'rgba(230, 230, 230, 0.5)'
                }
                strokeWidth={line.tool === 'eraser' ? 20 : 10}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            ))}
          </Layer>

          {/* Transform handles layer */}
          <Layer>
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
              borderStroke="var(--color-feature-01)"
              borderStrokeWidth={1}
              anchorFill="var(--color-feature-01)"
              anchorStroke="#ffffff"
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

      {/* No image state */}
      {!currentImage && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-sm text-text-muted">
              Load an image to start editing
            </p>
            <p className="text-xs text-text-muted mt-1">
              Generate an image or drag one onto the canvas
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
