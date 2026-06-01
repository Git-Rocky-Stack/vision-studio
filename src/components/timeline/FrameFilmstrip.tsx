import { memo, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Plus, GripVertical } from 'lucide-react';

export interface FrameItem {
  id: string;
  thumbnail: string | null;
  label: string;
  duration: number; // ms
}

interface FrameFilmstripProps {
  frames: FrameItem[];
  activeFrameId: string | null;
  onFrameSelect: (frameId: string) => void;
  onFrameAdd: () => void;
  className?: string;
}

export const FrameFilmstrip = memo(function FrameFilmstrip({
  frames,
  activeFrameId,
  onFrameSelect,
  onFrameAdd,
  className,
}: FrameFilmstripProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, frameId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onFrameSelect(frameId);
      }
    },
    [onFrameSelect]
  );

  return (
    <div className={cn('flex items-center gap-1 p-1.5 overflow-x-auto scrollbar-hide', className)}>
      {frames.map((frame) => {
        const isActive = frame.id === activeFrameId;
        return (
          <div key={frame.id} className="flex-shrink-0 flex flex-col items-center gap-0.5">
            <button
              onClick={() => onFrameSelect(frame.id)}
              onKeyDown={(e) => handleKeyDown(e, frame.id)}
              className={cn(
                'relative w-14 h-10 rounded border overflow-hidden transition-all',
                isActive
                  ? 'border-accent-primary ring-1 ring-accent-primary/50'
                  : 'border-border hover:border-border-hover'
              )}
              aria-label={frame.label}
              aria-pressed={isActive}
              title={`${frame.label} (${frame.duration}ms)`}
            >
              {frame.thumbnail ? (
                <img src={frame.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-elevated flex items-center justify-center">
                  <GripVertical className="w-3 h-3 text-text-muted/30" />
                </div>
              )}
            </button>
            <span className="type-badge text-text-muted truncate max-w-14">
              {frame.duration}ms
            </span>
          </div>
        );
      })}

      {/* Add frame button */}
      <button
        onClick={onFrameAdd}
        className="flex-shrink-0 w-14 h-10 rounded border border-dashed border-border flex items-center justify-center text-text-muted hover:text-text-body hover:border-border-hover hover:bg-elevated/30 transition-all"
        aria-label="Add frame"
        title="Add frame"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
});
