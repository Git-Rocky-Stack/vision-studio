import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('renders primary workspace modes as a compact rail', () => {
    render(<Sidebar />);

    expect(screen.getByLabelText('Generate')).toBeInTheDocument();
    expect(screen.getByLabelText('Quick')).toBeInTheDocument();
    expect(screen.getByLabelText('Storyboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    expect(screen.queryByLabelText('Preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced Settings')).not.toBeInTheDocument();
  });

  it('changes active panel when a mode is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByLabelText('Edit'));

    expect(useAppStore.getState().activePanel).toBe('edit');
  });
});
