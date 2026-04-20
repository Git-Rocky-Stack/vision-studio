import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UserGuidePage } from './UserGuidePage';

afterEach(cleanup);

describe('UserGuidePage', () => {
  it('renders the guide from sharded sections', () => {
    render(<UserGuidePage />);

    expect(screen.getByRole('heading', { name: 'User Guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('exposes stable section anchors for deep links', () => {
    render(<UserGuidePage />);

    expect(screen.getByRole('region', { name: 'Generate' })).toHaveAttribute('id', 'guide-generate');
    expect(screen.getByRole('region', { name: 'Settings' })).toHaveAttribute('id', 'guide-settings');
  });
});
