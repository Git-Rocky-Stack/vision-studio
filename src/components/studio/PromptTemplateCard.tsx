import { memo } from 'react';
import { Star } from 'lucide-react';
import type { PromptTemplate, PromptTemplateCategory } from '@/types/promptStudio';
import { cn } from '@/utils/cn';

interface PromptTemplateCardProps {
  template: PromptTemplate;
  onApply: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

/** Category badge color mapping. */
const CATEGORY_COLORS: Record<PromptTemplateCategory, string> = {
  portrait: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  landscape: 'bg-green-500/15 text-green-300 border-green-500/30',
  product: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  abstract: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  cinematic: 'bg-red-500/15 text-red-300 border-red-500/30',
  artistic: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  custom: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
};

const CATEGORY_LABELS: Record<PromptTemplateCategory, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  product: 'Product',
  abstract: 'Abstract',
  cinematic: 'Cinematic',
  artistic: 'Artistic',
  custom: 'Custom',
};

/**
 * Template card displaying name, description, category badge, and action buttons.
 * Apply/Merge buttons reveal on hover via group-hover pattern.
 */
export const PromptTemplateCard = memo(function PromptTemplateCard({
  template,
  onApply,
  onToggleFavorite,
}: PromptTemplateCardProps) {
  return (
    <div className="group relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 transition-colors duration-normal hover:border-border-hover">
      {/* Header: name + favorite */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-text-primary leading-snug">
          {template.name}
        </h4>
        <button
          type="button"
          onClick={() => onToggleFavorite(template.id)}
          className={cn(
            'shrink-0 rounded p-0.5 transition-colors duration-normal',
            'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30',
            template.isFavorite
              ? 'text-yellow-400'
              : 'text-text-muted/40 hover:text-text-muted',
          )}
          aria-label={
            template.isFavorite
              ? `Remove ${template.name} from favorites`
              : `Add ${template.name} to favorites`
          }
        >
          <Star
            size={14}
            className={template.isFavorite ? 'fill-current' : ''}
          />
        </button>
      </div>

      {/* Description - clamped to 2 lines */}
      <p className="line-clamp-2 text-xs text-text-muted leading-relaxed">
        {template.description}
      </p>

      {/* Category badge */}
      <span
        className={cn(
          'mt-auto inline-block w-fit rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
          CATEGORY_COLORS[template.category],
        )}
      >
        {CATEGORY_LABELS[template.category]}
      </span>

      {/* Action buttons - revealed on hover */}
      <div className="flex gap-2 opacity-0 transition-opacity duration-normal group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onApply(template.id)}
          className="flex-1 rounded border border-accent-primary-border bg-accent-primary/10 px-2 py-1 text-xs font-medium text-accent-primary transition-colors duration-normal hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30"
        >
          Apply
        </button>
      </div>
    </div>
  );
});