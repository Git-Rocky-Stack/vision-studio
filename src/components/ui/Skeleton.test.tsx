import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonList,
  SkeletonGrid,
} from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  describe('base Skeleton', () => {
    it('renders with default classes', () => {
      const { container } = render(<Skeleton />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('rounded-lg');
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
      expect(skeleton).toHaveClass('rounded-lg');
      expect(skeleton).toHaveClass('bg-elevated');
      expect(skeleton).toHaveClass('custom-class');
      expect(skeleton).toHaveClass('another-class');
    });
  });

  describe('SkeletonText', () => {
    it('renders two lines with space-y-2 container', () => {
      const { container } = render(<SkeletonText />);
      const containerEl = container.firstChild as HTMLElement;
      expect(containerEl).toHaveClass('space-y-2');

      const lines = containerEl.querySelectorAll('.animate-pulse');
      expect(lines).toHaveLength(2);
    });

    it('renders first line wider than second', () => {
      const { container } = render(<SkeletonText />);
      const lines = container.querySelectorAll('.animate-pulse');
      // First line: w-3/4, second line: w-1/2
      expect(lines[0]).toHaveClass('w-3/4');
      expect(lines[1]).toHaveClass('w-1/2');
    });

    it('applies custom className to container', () => {
      const { container } = render(<SkeletonText className="mt-4" />);
      const containerEl = container.firstChild as HTMLElement;
      expect(containerEl).toHaveClass('mt-4');
    });
  });

  describe('SkeletonCard', () => {
    it('renders with border and padding', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('border-border');
      expect(card).toHaveClass('p-3');
      expect(card).toHaveClass('space-y-3');
    });

    it('renders aspect-square image area', () => {
      const { container } = render(<SkeletonCard />);
      const imagePlaceholder = container.querySelector('.aspect-square');
      expect(imagePlaceholder).toHaveClass('w-full');
      expect(imagePlaceholder).toHaveClass('animate-pulse');
      expect(imagePlaceholder).toHaveClass('rounded-lg');
      expect(imagePlaceholder).toHaveClass('bg-elevated');
    });

    it('renders metadata section with two lines', () => {
      const { container } = render(<SkeletonCard />);
      const metadataLines = container.querySelectorAll('.space-y-2 .animate-pulse');
      expect(metadataLines).toHaveLength(2);
      expect(metadataLines[0]).toHaveClass('w-2/3');
      expect(metadataLines[1]).toHaveClass('w-1/3');
    });
  });

  describe('SkeletonList', () => {
    it('renders correct number of rows (default 5)', () => {
      const { container } = render(<SkeletonList />);
      const rows = container.querySelectorAll('.flex.items-center.gap-3');
      expect(rows).toHaveLength(5);
    });

    it('renders correct number of rows (custom)', () => {
      const { container } = render(<SkeletonList rows={3} />);
      const rows = container.querySelectorAll('.flex.items-center.gap-3');
      expect(rows).toHaveLength(3);
    });

    it('each row has thumbnail and two metadata lines', () => {
      const { container } = render(<SkeletonList rows={1} />);
      const row = container.querySelector('.flex.items-center.gap-3');
      expect(row).toBeInTheDocument();

      // Thumbnail: w-10 h-10 rounded-lg
      const thumbnail = row?.querySelector('.w-10.h-10');
      expect(thumbnail).toHaveClass('rounded-lg');
      expect(thumbnail).toHaveClass('animate-pulse');

      // Metadata container
      const metadata = row?.querySelector('.flex-1.space-y-1\\.5');
      expect(metadata).toBeInTheDocument();
    });

    it('applies custom className to container', () => {
      const { container } = render(<SkeletonList className="bg-custom" />);
      const containerEl = container.firstChild as HTMLElement;
      expect(containerEl).toHaveClass('bg-custom');
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

    it('applies grid template columns style', () => {
      const { container } = render(<SkeletonGrid cols={3} />);
      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveStyle('grid-template-columns: repeat(3, 1fr)');
    });

    it('applies custom className to container', () => {
      const { container } = render(<SkeletonGrid className="gap-4" />);
      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('gap-4');
    });
  });
});
