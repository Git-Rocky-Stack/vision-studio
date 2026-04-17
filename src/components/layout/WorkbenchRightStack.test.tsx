import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkbenchRightStack } from './WorkbenchRightStack';

describe('WorkbenchRightStack', () => {
  afterEach(cleanup);

  it('renders stacked dock sections with stable labels', () => {
    render(
      <WorkbenchRightStack
        sections={[
          { id: 'boards', label: 'Boards', content: <div>Boards content</div> },
          { id: 'gallery', label: 'Gallery', content: <div>Gallery content</div> },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.getByText('Boards content')).toBeInTheDocument();
    expect(screen.getByText('Gallery content')).toBeInTheDocument();
  });

  it('collapses and expands a section from its header', () => {
    render(
      <WorkbenchRightStack
        sections={[
          { id: 'boards', label: 'Boards', content: <div>Boards content</div> },
          { id: 'gallery', label: 'Gallery', content: <div>Gallery content</div> },
        ]}
      />
    );

    const boardsHeader = screen.getByRole('button', { name: 'Boards' });

    expect(boardsHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Boards content')).toBeInTheDocument();

    fireEvent.click(boardsHeader);

    expect(boardsHeader).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Boards content')).not.toBeInTheDocument();
    expect(screen.getByText('Gallery content')).toBeInTheDocument();

    fireEvent.click(boardsHeader);

    expect(boardsHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Boards content')).toBeInTheDocument();
  });

  it('supports initially collapsed sections', () => {
    render(
      <WorkbenchRightStack
        sections={[
          { id: 'boards', label: 'Boards', content: <div>Boards content</div>, defaultCollapsed: true },
          { id: 'gallery', label: 'Gallery', content: <div>Gallery content</div> },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Boards content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Gallery content')).toBeInTheDocument();
  });
});
