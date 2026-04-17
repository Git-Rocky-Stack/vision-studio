import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkbenchRightStack } from './WorkbenchRightStack';

describe('WorkbenchRightStack', () => {
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
});
