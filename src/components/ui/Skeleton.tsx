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
        'animate-pulse rounded-lg bg-elevated',
        className
      )}
    />
  );
}

/**
 * Two-line text placeholder - suitable for titles + subtitles,
 * or any short block of body copy.
 */
export function SkeletonText({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/**
 * Card skeleton - mirrors the aspect-ratio thumbnail + metadata
 * layout used in AssetsPanel grid and ResultsGrid.
 */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg border border-border p-3 space-y-3', className)}>
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * List skeleton - renders `rows` placeholder rows, each with a
 * thumbnail-sized square and two lines of metadata. Matches the
 * list view layout used in AssetsPanel and ResultsGrid list mode.
 */
export function SkeletonList({
  rows = 5,
  className,
}: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Grid skeleton - renders a `cols x rows` grid of SkeletonCard
 * elements. Defaults to 2 columns / 2 rows (AssetsPanel default).
 * Use `cols={3}` for the ResultsGrid 3-column grid view.
 */
export function SkeletonGrid({
  cols = 2,
  rows = 2,
  className,
}: SkeletonProps & { cols?: number; rows?: number }) {
  return (
    <div
      className={cn('gap-3', className)}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
