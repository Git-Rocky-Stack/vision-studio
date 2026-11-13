import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Skeleton, SkeletonGrid } from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  describe('base Skeleton', () => {
    it('renders with default classes', () => {
      const { container } = render(<Skeleton />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('rounded-md');
      expect(skeleton).toHaveClass('bg-elevated');
    });

    it('renders with custom dimensions from className', () => {
      const { container } = render(<Skeleton className="w-64 h-32" />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass('w-64');
      expect(skeleton).toHaveClass('h-32');
    });

    it('applies custom className alongside defaults', () => {
      const { container } = render(<Skeleton className="custom-class another-class" />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('rounded-md');
      expect(skeleton).toHaveClass('bg-elevated');
      expect(skeleton).toHaveClass('custom-class');
      expect(skeleton).toHaveClass('another-class');
    });
  });

  describe('grid cards', () => {
    it('renders with border and padding', () => {
      const { container } = render(<SkeletonGrid cols={1} rows={1} />);
      const card = (container.firstChild as HTMLElement).firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-md');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('border-border');
      expect(card).toHaveClass('p-3');
      expect(card).toHaveClass('space-y-3');
    });

    it('renders aspect-square image area', () => {
      const { container } = render(<SkeletonGrid cols={1} rows={1} />);
      const imagePlaceholder = container.querySelector('.aspect-square');
      expect(imagePlaceholder).toHaveClass('w-full');
      expect(imagePlaceholder).toHaveClass('animate-pulse');
      expect(imagePlaceholder).toHaveClass('rounded-md');
      expect(imagePlaceholder).toHaveClass('bg-elevated');
    });

    it('renders metadata section with two lines', () => {
      const { container } = render(<SkeletonGrid cols={1} rows={1} />);
      const metadataLines = container.querySelectorAll('.space-y-3 > .space-y-2 .animate-pulse');
      expect(metadataLines).toHaveLength(2);
      expect(metadataLines[0]).toHaveClass('w-2/3');
      expect(metadataLines[1]).toHaveClass('w-1/3');
    });
  });

  describe('SkeletonGrid', () => {
    it('renders correct grid layout (2x2 default)', () => {
      const { container } = render(<SkeletonGrid />);
      const cardContainers = container.querySelectorAll('.aspect-square');
      expect(cardContainers).toHaveLength(4); // 2 * 2
    });

    it('renders custom cols x rows grid', () => {
      const { container } = render(<SkeletonGrid cols={3} rows={2} />);
      const cardContainers = container.querySelectorAll('.aspect-square');
      expect(cardContainers).toHaveLength(6); // 3 * 2
    });

    it('lays out cols columns by default through a class, not an inline track', () => {
      const { container } = render(<SkeletonGrid cols={3} />);
      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('grid', 'grid-cols-[repeat(var(--skeleton-cols),minmax(0,1fr))]');
      expect(grid.style.getPropertyValue('--skeleton-cols')).toBe('3');
      expect(grid.style.gridTemplateColumns).toBe('');
    });

    it("lets a caller's responsive grid-cols classes replace the default track", () => {
      const { container } = render(
        <SkeletonGrid cols={3} rows={2} className="grid-cols-1 md:grid-cols-2 xl:grid-cols-3" />,
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3');
      expect(grid.className).not.toContain('--skeleton-cols');
      expect(grid.style.gridTemplateColumns).toBe('');
      expect(container.querySelectorAll('.aspect-square')).toHaveLength(6);
    });

    it('applies custom className to container', () => {
      const { container } = render(<SkeletonGrid className="gap-4" />);
      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('gap-4');
    });
  });
});
