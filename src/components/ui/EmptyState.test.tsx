import { cleanup, render, screen, within } from '@testing-library/react';
import { ImageIcon } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('states what is missing and what to do about it', () => {
    render(
      <EmptyState icon={ImageIcon} title="No assets yet" description="Generate something to see it here.">
        <button type="button">Open Generate</button>
      </EmptyState>,
    );

    const state = screen.getByTestId('empty-state');
    expect(within(state).getByText('No assets yet')).toHaveClass('type-section');
    expect(within(state).getByText('Generate something to see it here.')).toBeInTheDocument();
    expect(within(state).getByRole('button', { name: 'Open Generate' })).toBeInTheDocument();
  });

  it('draws its icon as decoration, on the shared raised tile', () => {
    render(<EmptyState icon={ImageIcon} title="No assets yet" />);

    const icon = screen.getByTestId('empty-state').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.parentElement).toHaveClass('raised-control');
  });

  it('renders no empty rows when there is no description or action', () => {
    render(<EmptyState icon={ImageIcon} title="No iterations yet" />);

    const state = screen.getByTestId('empty-state');
    expect(state.querySelectorAll('p')).toHaveLength(1);
    expect(state.querySelector('[data-empty-state-actions]')).toBeNull();
  });

  // A title is not a heading unless the host says where it sits in the outline.
  it('renders its title as a paragraph by default and as the heading it is told to be', () => {
    const { rerender } = render(<EmptyState icon={ImageIcon} title="No Project Open" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    rerender(<EmptyState icon={ImageIcon} title="No Project Open" titleAs="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No Project Open' })).toBeInTheDocument();
  });

  it('holds its description to a readable measure', () => {
    render(<EmptyState icon={ImageIcon} title="t" description="d" />);

    expect(screen.getByText('d').className).toMatch(/max-w-\[\d+ch\]/);
  });

  it('has a compact size for short strips that keeps the description in view', () => {
    render(<EmptyState icon={ImageIcon} title="t" description="d" size="compact" />);

    const root = screen.getByTestId('empty-state');
    expect(root.className).toContain('py-3');
    expect(root.firstElementChild?.className).toContain('h-8');
  });
});
