import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { ProgressivePreview } from './ProgressivePreview';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('ProgressivePreview', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders step counter when generation is in progress', () => {
    useAppStore.setState({
      currentStep: 5,
      totalSteps: 20,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByText('Step 5 / 20')).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    useAppStore.setState({
      currentStep: 1,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByLabelText('Cancel generation')).toBeInTheDocument();
  });

  it('renders loading state when no step images are available', () => {
    useAppStore.setState({
      currentStep: 0,
      totalSteps: 0,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    // When no step image is available, shows the initializing spinner
    expect(screen.getByText('Initializing generation...')).toBeInTheDocument();
  });

  it('renders step image when available for current step', () => {
    const images = new Map<number, string>();
    images.set(3, 'data:image/png;base64,testimage');

    useAppStore.setState({
      stepImages: images,
      currentStep: 3,
      totalSteps: 20,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByAltText('Generation step 3')).toBeInTheDocument();
  });

  it('renders the progress ring overlay with cancel button', () => {
    useAppStore.setState({
      currentStep: 7,
      totalSteps: 25,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    // The step counter should show the progress
    expect(screen.getByText('Step 7 / 25')).toBeInTheDocument();
    // Cancel button should always be present during generation
    expect(screen.getByLabelText('Cancel generation')).toBeInTheDocument();
  });

  it('shows the latest available frame when the counter runs ahead of the decoder', () => {
    const images = new Map<number, string>();
    images.set(1, 'data:image/png;base64,step1');

    useAppStore.setState({
      stepImages: images,
      currentStep: 2,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    // The step-1 frame stays visible instead of regressing to the spinner.
    expect(screen.getByAltText('Generation step 1')).toBeInTheDocument();
    expect(screen.queryByText('Initializing generation...')).not.toBeInTheDocument();
  });

  it('shows the honest decoder-less state once steps tick with no frames', () => {
    useAppStore.setState({
      currentStep: 3,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(
      screen.getByText('Rendering - step preview unavailable on this run.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Initializing generation...')).not.toBeInTheDocument();
  });

  it('keeps the initializing spinner before the first step', () => {
    useAppStore.setState({
      currentStep: 0,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByText('Initializing generation...')).toBeInTheDocument();
  });

  it('cancel calls the backend for the tracked job before clearing', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', Object.assign(window, {
      electron: { generation: { cancel } },
    }));

    useAppStore.setState({
      currentStep: 5,
      totalSteps: 20,
      isPreviewActive: true,
      previewJobId: 'job-77',
    });

    render(<ProgressivePreview />);
    await user.click(screen.getByLabelText('Cancel generation'));

    expect(cancel).toHaveBeenCalledWith('job-77');
    expect(useAppStore.getState().isPreviewActive).toBe(false);
    expect(useAppStore.getState().previewJobId).toBeNull();
  });

  it('clears preview state when cancel button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    useAppStore.setState({
      currentStep: 5,
      totalSteps: 20,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    expect(screen.getByText('Step 5 / 20')).toBeInTheDocument();

    // Click cancel
    await user.click(screen.getByLabelText('Cancel generation'));

    // After clearPreview, the store should reset
    const state = useAppStore.getState();
    expect(state.isPreviewActive).toBe(false);
    expect(state.currentStep).toBe(0);
    expect(state.totalSteps).toBe(0);
  });
});