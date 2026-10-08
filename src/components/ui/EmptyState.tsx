import type { ElementType, ReactNode } from 'react';

import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description?: ReactNode;
  /** The way out of the empty state: one or two buttons. */
  children?: ReactNode;
  /**
   * Element for the title. A paragraph by default; pass a heading level only
   * when the title belongs in the page outline at that level.
   */
  titleAs?: 'p' | 'h2' | 'h3';
  className?: string;
}

/**
 * The one empty-state treatment: a raised icon tile, what is missing, what to
 * do about it, and the action that does it.
 *
 * The app had grown five variants (a tiled icon, a bare icon at two different
 * opacities, text with no icon, text in classes no stylesheet defines). An
 * empty panel is the first thing a new user sees on most surfaces, so they
 * should all say it the same way.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  titleAs: Title = 'p',
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex h-full min-h-0 flex-col items-center justify-center px-6 py-8 text-center',
        className,
      )}
    >
      <div className="raised-control flex h-12 w-12 flex-shrink-0 items-center justify-center text-text-muted">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <Title className="mt-4 type-section">{title}</Title>
      {description ? (
        <p className="mt-2 max-w-[42ch] text-xs text-text-muted">{description}</p>
      ) : null}
      {children ? (
        <div data-empty-state-actions className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
