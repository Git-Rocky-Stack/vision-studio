import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { NavBar } from './NavBar';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('NavBar', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(cleanup);

  it('renders all 6 tab icons', () => {
    render(<NavBar />);

    expect(screen.getByLabelText('Generate')).toBeInTheDocument();
    expect(screen.getByLabelText('Canvas')).toBeInTheDocument();
    expect(screen.getByLabelText('Story')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflows')).toBeInTheDocument();
    expect(screen.getByLabelText('Assets')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('highlights the active tab with data-active="true"', () => {
    useAppStore.setState({ activeTab: 'canvas' });
    render(<NavBar />);

    const canvasButton = screen.getByLabelText('Canvas');
    expect(canvasButton).toHaveAttribute('data-active', 'true');

    // Other tabs should NOT have data-active
    const generateButton = screen.getByLabelText('Generate');
    expect(generateButton).not.toHaveAttribute('data-active');
  });

  it('switches tab on click and updates store', async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    // Default is 'generate'
    expect(useAppStore.getState().activeTab).toBe('generate');

    await user.click(screen.getByLabelText('Workflows'));

    expect(useAppStore.getState().activeTab).toBe('workflows');
  });

  it('sets the default sub-mode when switching tabs', async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    // Switching to 'story' should set sub-mode to 'storyboard'
    await user.click(screen.getByLabelText('Story'));

    expect(useAppStore.getState().activeTab).toBe('story');
    expect(useAppStore.getState().activeSubMode).toBe('storyboard');

    // Switching to 'canvas' should set sub-mode to null
    await user.click(screen.getByLabelText('Canvas'));

    expect(useAppStore.getState().activeTab).toBe('canvas');
    expect(useAppStore.getState().activeSubMode).toBeNull();
  });

  it('shows GPU status indicator', () => {
    useAppStore.setState({
      systemInfo: {
        ...useAppStore.getState().systemInfo,
        gpuAvailable: true,
      },
    });
    render(<NavBar />);

    expect(screen.getByTestId('gpu-status')).toBeInTheDocument();
    expect(screen.getByLabelText('GPU available')).toBeInTheDocument();
  });

  it('shows warning indicator when GPU is unavailable', () => {
    useAppStore.setState({
      systemInfo: {
        ...useAppStore.getState().systemInfo,
        gpuAvailable: false,
      },
    });
    render(<NavBar />);

    expect(screen.getByTestId('gpu-status')).toBeInTheDocument();
    expect(screen.getByLabelText('GPU unavailable')).toBeInTheDocument();
  });

  it('renders bottom cluster below the divider', () => {
    render(<NavBar />);

    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();

    // Assets and Settings should appear in the bottom cluster
    const assetsButton = screen.getByLabelText('Assets');
    const settingsButton = screen.getByLabelText('Settings');

    // Both should exist in the document
    expect(assetsButton).toBeInTheDocument();
    expect(settingsButton).toBeInTheDocument();

    // The separator should come before the bottom cluster items in DOM order
    // (separator is between the spacer and bottom nav)
    expect(separator.compareDocumentPosition(assetsButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});