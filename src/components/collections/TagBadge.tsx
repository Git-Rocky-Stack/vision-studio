import { memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { AssetTag } from '@/types/collections';

const CATEGORY_COLORS: Record<AssetTag['category'], string> = {
  style: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  subject: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  color: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  mood: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  custom: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
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
        CATEGORY_COLORS[tag.category],
        tag.source === 'ai' && 'opacity-80',
        className,
      )}
      title={tag.source === 'ai' ? `AI confidence: ${Math.round(tag.confidence * 100)}%` : 'User tag'}
    >
      {tag.name}
      {tag.source === 'ai' && (
        <span className="text-[0.6rem] opacity-60">
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