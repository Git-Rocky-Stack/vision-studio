import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowPlaceholder } from '@/components/workflow/WorkflowPlaceholder';
import { WorkbenchShell } from './WorkbenchShell';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('Workbench Carbon Pro chrome', () => {
  afterEach(cleanup);

  it('uses accent styling for active shell tabs without legacy primary red chrome', () => {
    const { container } = render(
      <WorkbenchShell
        activeView="canvas"
        onViewChange={vi.fn()}
        canvas={<div>Canvas content</div>}
        viewer={<div>Viewer content</div>}
        workflow={<WorkflowPlaceholder />}
        rightDockTabs={[
          { id: 'settings', label: 'Settings', content: <div>Settings content</div> },
        ]}
      />
    );

    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveClass('text-accent-primary');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });

  it('keeps the Workflow placeholder on Carbon Pro accent tokens', () => {
    const { container } = render(<WorkflowPlaceholder />);

    expect(screen.getByText('Planned')).toHaveClass('bg-accent-primary-muted');
    expect(screen.getByText('Linear UI')).toHaveClass('text-accent-primary');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
