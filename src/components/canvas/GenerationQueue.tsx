import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageIcon } from 'lucide-react';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

export function GenerationQueue() {
  const { generationQueue, setCurrentImage } = useAppStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const completedItems = generationQueue.filter(
    (item) => item.status === 'completed' && item.thumbnail
  );

  if (completedItems.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
    >
      <div className="flex items-center gap-2 px-3 py-2 glass glass-border rounded-xl shadow-cinematic overflow-x-auto scrollbar-hide max-w-[500px]">
        {completedItems.map((item, index) => (
          <div key={item.id} className="relative flex-shrink-0">
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => {
                if (item.thumbnail) setCurrentImage(item.thumbnail);
              }}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              aria-label={`View generation ${index + 1}`}
              className={cn(
                'w-12 h-12 rounded-lg border overflow-hidden transition-all',
                hoveredItem === item.id
                  ? 'border-red-primary ring-1 ring-red-primary/40 scale-110'
                  : 'border-border hover:border-border-hover'
              )}
            >
              {item.thumbnail ? (
                <ImageWithFallback
                  src={item.thumbnail}
                  alt={`Generation ${index + 1}`}
                  className="w-full h-full object-cover"
                  fallbackClassName="w-12 h-12"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-elevated flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-text-muted" />
                </div>
              )}
            </motion.button>

            {/* Tooltip */}
            <AnimatePresence>
              {hoveredItem === item.id && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-elevated border border-border rounded-lg shadow-cinematic pointer-events-none"
                >
                  <p className="font-display text-xs text-text-primary line-clamp-2">
                    {item.prompt}
                  </p>
                  <p className="font-mono text-micro text-text-muted mt-1">
                    Click to load on canvas
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
