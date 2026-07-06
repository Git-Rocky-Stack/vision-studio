import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

vi.mock('@/features/studio/runStudioGeneration', () => ({
  runStudioGeneration: vi.fn().mockResolvedValue({ ok: true, jobId: 'job-1' }),
}));

import { runStudioGeneration } from '@/features/studio/runStudioGeneration';

import { CompositionPreview } from './CompositionPreview';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('CompositionPreview', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders composition layer bar with all layer labels', () => {
    render(<CompositionPreview />);

    // The layer bar uses icon buttons with aria-labels like "Show Frame" or "Hide Frame"
    // Default state: all layers visible, so "Hide X" labels
    expect(screen.getByLabelText(/Hide Frame/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hide Reference/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hide ControlNet/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hide Masks/)).toBeInTheDocument();
  });

  it('renders the Generate button', () => {
    render(<CompositionPreview />);

    // The generate button has visible text "Generate"
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    render(<CompositionPreview />);

    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
  });

  it('renders empty state when no reference image', () => {
    render(<CompositionPreview />);

    // Empty state message from the component
    expect(screen.getByText(/Drop a reference image or start generating/i)).toBeInTheDocument();
  });

  it('renders ProgressivePreview when preview is active', () => {
    useAppStore.setState({
      isPreviewActive: true,
      currentStep: 5,
      totalSteps: 20,
    });

    render(<CompositionPreview />);

    // ProgressivePreview renders the step counter via ProgressiveStepOverlay
    expect(screen.getByText('Step 5 / 20')).toBeInTheDocument();
  });

  it('renders ProgressivePreview cancel button when preview is active', () => {
    useAppStore.setState({
      isPreviewActive: true,
      currentStep: 3,
      totalSteps: 10,
    });

    render(<CompositionPreview />);

    expect(screen.getByLabelText('Cancel generation')).toBeInTheDocument();
  });

  it('does not show empty state when reference image exists', () => {
    useAppStore.setState({
      currentImage: 'data:image/png;base64,testimage',
    });

    render(<CompositionPreview />);

    // Empty state message should NOT be present
    expect(screen.queryByText(/Drop a reference image/i)).not.toBeInTheDocument();

    // Instead, the reference image should be shown
    expect(screen.getByAltText('Composition reference')).toBeInTheDocument();
  });

  it('toggles layer visibility on layer button click', async () => {
    const user = userEvent.setup();
    render(<CompositionPreview />);

    // Default state: all layers visible ("Hide Frame")
    expect(screen.getByLabelText(/Hide Frame/)).toBeInTheDocument();

    // Click to toggle Frame layer visibility
    await user.click(screen.getByLabelText(/Hide Frame/));

    // After toggle: Frame layer is hidden ("Show Frame")
    expect(screen.getByLabelText(/Show Frame/)).toBeInTheDocument();
  });

  it('renders reset view button', () => {
    render(<CompositionPreview />);

    expect(screen.getByLabelText('Reset view')).toBeInTheDocument();
  });

  it('renders zoom to 100% button', () => {
    render(<CompositionPreview />);

    expect(screen.getByLabelText('Zoom to 100%')).toBeInTheDocument();
  });

  it('renders opacity slider label for the first visible layer', () => {
    render(<CompositionPreview />);

    // Default first visible layer is 'aspectFrame' which shows "Frame" label
    // The label appears as text content within the opacity control section
    expect(screen.getByText('Frame')).toBeInTheDocument();
  });

  it('Generate triggers the studio generation feature function', async () => {
    const user = userEvent.setup();
    render(<CompositionPreview />);

    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(runStudioGeneration).toHaveBeenCalledTimes(1);
  });

  it('renders the dismissible error strip when previewError is set', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ previewError: 'The model refused to load.' });

    render(<CompositionPreview />);

    const strip = screen.getByTestId('studio-preview-error');
    expect(strip).toHaveTextContent('The model refused to load.');

    await user.click(screen.getByLabelText('Dismiss generation error'));
    expect(useAppStore.getState().previewError).toBeNull();
  });

  it('does not render the error strip by default', () => {
    render(<CompositionPreview />);
    expect(screen.queryByTestId('studio-preview-error')).not.toBeInTheDocument();
  });
});