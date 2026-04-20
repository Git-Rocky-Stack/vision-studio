import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { ProgressivePreview } from './ProgressivePreview';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('ProgressivePreview', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(cleanup);

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

  it('shows spinner when currentStep is greater than 0 but no image for that step', () => {
    const images = new Map<number, string>();
    // Images exist for step 1 but current step is 2 (no image yet)
    images.set(1, 'data:image/png;base64,step1');

    useAppStore.setState({
      stepImages: images,
      currentStep: 2,
      totalSteps: 10,
      isPreviewActive: true,
    });

    render(<ProgressivePreview />);

    // currentStep is 2, but no image at index 2, so spinner should show
    expect(screen.getByText('Initializing generation...')).toBeInTheDocument();
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