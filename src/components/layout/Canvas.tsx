import { cn } from '@/utils/cn';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Move,
  Hand,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AmbientParticles } from '@/components/effects/AmbientParticles';

export function Canvas() {
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom(Math.min(zoom + 10, 200));
  const handleZoomOut = () => setZoom(Math.max(zoom - 10, 25));
  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  // Handle pan
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
        initialPanX = pan.x;
        initialPanY = pan.y;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
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
  }, [isDragging, pan]);

  return (
    <div className="flex-1 flex flex-col bg-void relative overflow-hidden">
      {/* Ambient particles */}
      <AmbientParticles color="rgba(255, 200, 150, 0.25)" count={30} />

      {/* Canvas Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1 px-2 py-1.5 glass glass-border rounded-lg shadow-cinematic">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-text-primary w-14 text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-elevated transition-all"
            title="Reset View"
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
            title="Toggle Grid"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
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
                linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
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
            style={{ width: 1024, height: 1024 }}
          >
            {/* Placeholder Content */}
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

            {/* Canvas Border Overlay */}
            <div className="absolute inset-0 pointer-events-none border border-dashed border-border rounded-sm" />
          </div>
        </motion.div>
      </div>

      {/* Canvas Info */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="px-3 py-1.5 glass glass-border rounded-lg">
          <span className="font-mono text-xs text-text-body">
            1024 × 1024px &middot; Artboard 1
          </span>
        </div>
      </div>
    </div>
  );
}
