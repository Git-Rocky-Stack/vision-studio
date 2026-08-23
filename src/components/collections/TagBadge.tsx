import { memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { AssetTag } from '@/types/collections';

/**
 * Carbon Pro has one chrome accent, so tag categories are separated by surface
 * depth and weight rather than by hue (see DESIGN.md). The category still reads
 * distinctly without importing a second palette into the design system.
 */
const CATEGORY_STYLES: Record<AssetTag['category'], string> = {
  style: 'bg-accent-primary-muted text-accent-primary border-accent-primary-border',
  subject: 'bg-elevated text-text-primary border-border-hover',
  color: 'bg-surface text-text-body border-border',
  mood: 'bg-elevated text-text-body border-border-hover',
  custom: 'bg-void text-text-muted border-border',
};

interface TagBadgeProps {
  tag: AssetTag;
  onRemove?: (tagId: string) => void;
  className?: string;
}

export const TagBadge = memo(function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 type-micro',
        CATEGORY_STYLES[tag.category],
        tag.source === 'ai' && 'opacity-80',
        className,
      )}
      title={tag.source === 'ai' ? `AI confidence: ${Math.round(tag.confidence * 100)}%` : 'User tag'}
    >
      {tag.name}
      {tag.source === 'ai' && (
        <span className="type-badge opacity-60">
          {Math.round(tag.confidence * 100)}%
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
          className="ml-0.5 rounded-full hover:bg-white/10 p-0.5"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
});