import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/Slider';
import { ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-full bg-elevated flex flex-col items-center justify-center">
      <ImageIcon className="w-8 h-8 text-text-muted mb-2" />
      <span className="type-caption">
        Select image {label}
      </span>
    </div>
  );
}

function ImageLabel({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'absolute top-3 rounded bg-void/60 px-2 py-0.5 type-ui text-text-primary backdrop-blur-sm',
        className
      )}
    >
      {label}
    </div>
  );
}

export const ComparisonView = memo(function ComparisonView() {
  const { comparisonMode, comparisonImages, generationQueue } = useAppStore(
    useShallow((s) => ({
      comparisonMode: s.comparisonMode,
      comparisonImages: s.comparisonImages,
      generationQueue: s.generationQueue,
    }))
  );
  const [sliderPosition, setSliderPosition] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  const imageA = comparisonImages[0] || null;
  const imageB = comparisonImages[1] || null;

  // Slider drag handler - stable callback with no dependencies
  const handleSliderDrag = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPosition(Math.max(0, Math.min(100, x)));
    },
    []
  );

  // Mouse up handler - stable callback
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Event listeners registered once, use ref for dragging check
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      handleSliderDrag(e);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleSliderDrag, handleMouseUp]);

  if (!comparisonMode || comparisonMode === 'off') return null;

  // Completed images for grid mode
  const recentImages = generationQueue
    .filter((item) => item.status === 'completed' && item.thumbnail)
    .slice(0, 9);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      ref={containerRef}
      className="absolute inset-0 z-10"
    >
      {/* Side by Side */}
      {comparisonMode === 'side-by-side' && (
        <div className="w-full h-full flex">
          <div className="flex-1 relative border-r border-border overflow-hidden">
            {imageA ? (
              <img
                src={imageA}
                alt="Image A"
                className="w-full h-full object-contain bg-void"
              />
            ) : (
              <ImagePlaceholder label="A" />
            )}
            <ImageLabel label="A" className="left-3" />
          </div>
          <div className="flex-1 relative overflow-hidden">
            {imageB ? (
              <img
                src={imageB}
                alt="Image B"
                className="w-full h-full object-contain bg-void"
              />
            ) : (
              <ImagePlaceholder label="B" />
            )}
            <ImageLabel label="B" className="left-3" />
          </div>
        </div>
      )}

      {/* Slider */}
      {comparisonMode === 'slider' && (
        <div className="w-full h-full relative overflow-hidden bg-void">
          {/* Image B (background) */}
          {imageB ? (
            <img
              src={imageB}
              alt="Image B"
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <ImagePlaceholder label="B" />
          )}

          {/* Image A (clipped) */}
          {imageA && (
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
              <img
                src={imageA}
                alt="Image A"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Labels */}
          <ImageLabel label="A" className="left-3" />
          <ImageLabel label="B" className="right-3" />

          {/* Divider line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-accent-primary z-10"
            style={{ left: `${sliderPosition}%` }}
          >
            {/* Handle */}
            <button
              onMouseDown={() => setIsDragging(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setSliderPosition(Math.max(0, sliderPosition - 1));
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setSliderPosition(Math.min(100, sliderPosition + 1));
                }
              }}
              role="slider"
              aria-label="Comparison slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPosition)}
              tabIndex={0}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-accent-primary border-2 border-text-primary flex items-center justify-center cursor-ew-resize shadow-[0_0_12px_var(--color-accent-primary-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
            >
              <div className="flex gap-1">
                <div className="w-0.5 h-3 bg-void rounded-full" />
                <div className="w-0.5 h-3 bg-void rounded-full" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Onion Skin */}
      {comparisonMode === 'onion' && (
        <div className="w-full h-full relative overflow-hidden bg-void">
          {/* Image A (base) */}
          {imageA ? (
            <img
              src={imageA}
              alt="Image A"
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <ImagePlaceholder label="A" />
          )}

          {/* Image B (overlay with opacity) */}
          {imageB && (
            <img
              src={imageB}
              alt="Image B"
              className="absolute inset-0 w-full h-full object-contain"
              style={{ opacity: onionOpacity / 100 }}
            />
          )}

          <ImageLabel label="A" className="left-3" />
          <ImageLabel label="B" className="right-3" />

          {/* Opacity slider */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-64 px-4 py-3 raised-panel">
            <Slider
              label="Overlay Opacity"
              value={onionOpacity}
              min={0}
              max={100}
              onChange={setOnionOpacity}
              valueFormatter={(v) => `${v}%`}
            />
          </div>
        </div>
      )}

      {/* Grid */}
      {comparisonMode === 'grid' && (
        <div className="w-full h-full overflow-auto p-4 bg-void">
          <div className="grid grid-cols-3 gap-2 max-w-[600px] mx-auto">
            {recentImages.map((item, index) => (
              <button
                key={item.id}
                className={cn(
                  'relative aspect-square rounded-md border overflow-hidden transition-all',
                  (comparisonImages[0] === item.thumbnail ||
                    comparisonImages[1] === item.thumbnail)
                    ? 'border-accent-primary ring-1 ring-accent-primary/40'
                    : 'border-border hover:border-border-hover'
                )}
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={`Generation ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-elevated flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-text-muted" />
                  </div>
                )}
                <div className="absolute bottom-1 left-1 right-1">
                  <p className="truncate rounded bg-void/60 px-1.5 py-0.5 type-caption text-text-primary backdrop-blur-sm">
                    {item.prompt}
                  </p>
                </div>
              </button>
            ))}
            {recentImages.length === 0 && (
              <div className="col-span-3 py-16 text-center">
                <ImageIcon className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
                <p className="type-caption">
                  No generations to compare
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
});
