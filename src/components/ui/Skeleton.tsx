import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton block - use directly for arbitrary shapes.
 * Inherits the `animate-pulse` shimmer and matches the app's
 * dark cinema surface hierarchy via `bg-elevated`.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        'animate-pulse rounded-md bg-elevated',
        className
      )}
    />
  );
}

/**
 * Card skeleton - mirrors the aspect-ratio thumbnail + metadata layout of a
 * result card. Internal to SkeletonGrid, its only consumer.
 */
function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-md border border-border p-3 space-y-3', className)}>
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * Grid skeleton - renders a `cols x rows` grid of SkeletonCard
 * elements. Defaults to 2 columns / 2 rows (AssetsPanel default).
 * Use `cols={3}` for the ResultsGrid 3-column grid view.
 *
 * `cols` sets the card count and the default column track. The track is a
 * class, not an inline style, so a caller's responsive `grid-cols-*` classes
 * replace it (tailwind-merge drops the default) instead of losing to an
 * inline `grid-template-columns` that no class can override.
 */
export function SkeletonGrid({
  cols = 2,
  rows = 2,
  className,
}: SkeletonProps & { cols?: number; rows?: number }) {
  return (
    <div
      className={cn('grid gap-3 grid-cols-[repeat(var(--skeleton-cols),minmax(0,1fr))]', className)}
      style={{ '--skeleton-cols': cols } as React.CSSProperties}
    >
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
