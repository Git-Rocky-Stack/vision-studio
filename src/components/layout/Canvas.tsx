import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Move,
  Hand,
} from 'lucide-react';
import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AmbientParticles } from '@/components/effects/AmbientParticles';

// Warm-amber particle color for the canvas viewport (slightly more transparent than the component default)
const CANVAS_PARTICLE_COLOR = 'rgba(255, 200, 150, 0.25)';
import { GenerationProgress } from '@/components/canvas/GenerationProgress';
import { GenerationQueue } from '@/components/canvas/GenerationQueue';
import { CanvasContextMenu } from '@/components/canvas/CanvasContextMenu';

export const Canvas = memo(function Canvas() {
  const { activeJobs, currentImage } = useAppStore();
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1024 });
  const [imageError, setImageError] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const isGenerating = activeJobs.some(
    (j) => j.status === 'pending' || j.status === 'processing'
  );

  const handleZoomIn = () => setZoom(Math.min(zoom + 10, 200));
  const handleZoomOut = () => setZoom(Math.max(zoom - 10, 25));
  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  // Detect image dimensions when currentImage changes
  useEffect(() => {
    if (!currentImage) {
      setImageSize({ width: 1024, height: 1024 });
      setImageError(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageError(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setImageError(true);
    };
    img.src = currentImage;
    return () => { cancelled = true; };
  }, [currentImage]);

  // Handle scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -5 : 5;
      setZoom((z) => Math.min(200, Math.max(25, z + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Keep refs in sync with state
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Handle pan - listeners registered once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        setIsDragging(true);
        startX = e.clientX;
        startY = e.clientY;
        initialPanX = panRef.current.x;
        initialPanY = panRef.current.y;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setPan({
        x: initialPanX + dx,
        y: initialPanY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // Empty dependency array - register once

  // Keyboard shortcuts for canvas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleResetZoom();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom]);

  return (
    <div
      className={cn(
        'flex-1 flex flex-col bg-void relative overflow-hidden',
        isGenerating && 'ring-1 ring-red-primary/20 animate-glow-pulse'
      )}
    >
      {/* Ambient particles */}
      <AmbientParticles color={CANVAS_PARTICLE_COLOR} count={30} />

      {/* Canvas Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 px-2 py-2 glass glass-border rounded-lg shadow-cinematic">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
            aria-label="Zoom out"
            disabled={zoom <= 25}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-text-primary w-14 text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
            aria-label="Zoom in"
            disabled={zoom >= 200}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all"
            aria-label="Reset view"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={cn(
              'p-1.5 rounded transition-all',
              showGrid
                ? 'text-red-primary bg-red-aura'
                : 'text-text-body hover:text-text-primary hover:bg-elevated'
            )}
            aria-label="Toggle grid"
            aria-pressed={showGrid}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex-1 relative overflow-hidden',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
        {/* Grid Background */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, var(--color-border) 1px, transparent 1px),
                linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)
              `,
              backgroundSize: '16px 16px',
            }}
          />
        )}

        {/* Canvas Content */}
        <motion.div
          ref={canvasRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Artboard */}
          <div
            className="relative bg-canvas shadow-cinematic border border-border"
            style={{ width: imageSize.width, height: imageSize.height }}
          >
            {/* Current Image or Placeholder */}
            {currentImage && !imageError ? (
              <img
                src={currentImage}
                alt="Canvas"
                data-testid="generation-result"
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : imageError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-body">
                <div className="text-center space-y-2">
                  <p className="font-display text-sm text-red-primary">Failed to load image</p>
                  <p className="font-mono text-xs text-text-muted">The file may be corrupted or missing</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-body">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center space-y-4"
                >
                  <div className="w-24 h-24 mx-auto rounded-2xl bg-elevated border border-border flex items-center justify-center">
                    <Move className="w-10 h-10 text-text-muted" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text-primary">
                      Create something extraordinary
                    </h3>
                    <p className="text-sm text-text-body mt-1">
                      Generate images and videos to see them here
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-center text-xs text-text-muted">
                    <Hand className="w-3.5 h-3.5" />
                    <span>Shift + Drag to pan</span>
                    <span>&middot;</span>
                    <span>Scroll to zoom</span>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Canvas Border Overlay */}
            <div className="absolute inset-0 pointer-events-none border border-dashed border-border rounded-sm" />
          </div>
        </motion.div>

        {/* Generation Progress Overlay */}
        <AnimatePresence>
          {isGenerating && <GenerationProgress />}
        </AnimatePresence>
      </div>

      {/* Generation Queue Strip */}
      <AnimatePresence>
        <GenerationQueue />
      </AnimatePresence>

      {/* Canvas Info */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="px-3 py-1.5 glass glass-border rounded-lg">
          <span className="font-mono text-xs text-text-body">
            {imageSize.width} &times; {imageSize.height}px &middot; Artboard 1
          </span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
