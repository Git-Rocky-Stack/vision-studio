import { memo } from 'react';
import { Star } from 'lucide-react';
import type { PromptTemplate, PromptTemplateCategory } from '@/types/promptStudio';
import { cn } from '@/utils/cn';

interface PromptTemplateCardProps {
  template: PromptTemplate;
  onApply: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

/**
 * Category badge styling. Carbon Pro carries one accent, so categories are
 * separated by surface depth and text weight rather than by hue (see
 * DESIGN.md) - the label already names the category, the styling only has to
 * keep the badges distinguishable at a glance.
 */
const CATEGORY_STYLES: Record<PromptTemplateCategory, string> = {
  portrait: 'bg-accent-primary-muted text-accent-primary border-accent-primary-border',
  landscape: 'bg-elevated text-text-primary border-border-hover',
  product: 'bg-surface text-text-primary border-border-hover',
  abstract: 'bg-elevated text-text-body border-border',
  cinematic: 'bg-surface text-text-body border-border-hover',
  artistic: 'bg-canvas text-text-body border-border',
  custom: 'bg-void text-text-muted border-border',
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
    <div className="group relative flex flex-col gap-2 rounded-md border border-border bg-surface p-3 transition-colors duration-normal hover:border-border-hover">
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
              ? 'text-accent-primary'
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
          'mt-auto inline-block w-fit rounded border px-1.5 py-0.5 mono-label',
          CATEGORY_STYLES[template.category],
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