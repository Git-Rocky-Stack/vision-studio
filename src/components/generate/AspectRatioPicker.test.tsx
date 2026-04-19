import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AspectRatioPicker } from './AspectRatioPicker';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('AspectRatioPicker', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders all 8 aspect ratio options', () => {
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('1:1')).toBeInTheDocument();
    expect(screen.getByLabelText('16:9')).toBeInTheDocument();
    expect(screen.getByLabelText('9:16')).toBeInTheDocument();
    expect(screen.getByLabelText('4:3')).toBeInTheDocument();
    expect(screen.getByLabelText('3:4')).toBeInTheDocument();
    expect(screen.getByLabelText('21:9')).toBeInTheDocument();
    expect(screen.getByLabelText('3:2')).toBeInTheDocument();
    expect(screen.getByLabelText('2:3')).toBeInTheDocument();
  });

  it('renders 3 resolution tier buttons', () => {
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('Standard 512px')).toBeInTheDocument();
    expect(screen.getByLabelText('High 768px')).toBeInTheDocument();
    expect(screen.getByLabelText('Ultra 1024px')).toBeInTheDocument();
  });

  it('highlights the active ratio', () => {
    useAppStore.setState({ aspectRatio: '16:9' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('16:9')).toHaveAttribute('data-active', 'true');
  });

  it('highlights the active tier', () => {
    useAppStore.setState({ resolutionTier: 'high' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('High 768px')).toHaveAttribute('data-active', 'true');
  });

  it('changes ratio on click', async () => {
    const user = userEvent.setup();
    render(<AspectRatioPicker />);
    await user.click(screen.getByLabelText('16:9'));
    expect(useAppStore.getState().aspectRatio).toBe('16:9');
  });

  it('changes tier on click', async () => {
    const user = userEvent.setup();
    render(<AspectRatioPicker />);
    await user.click(screen.getByLabelText('Standard 512px'));
    expect(useAppStore.getState().resolutionTier).toBe('standard');
  });

  it('shows computed dimensions for current selection', () => {
    useAppStore.setState({ aspectRatio: '16:9', resolutionTier: 'ultra' });
    render(<AspectRatioPicker />);
    expect(screen.getByText('1024 x 576')).toBeInTheDocument();
  });

  it('shows custom inputs when custom ratio selected', async () => {
    useAppStore.setState({ aspectRatio: 'custom' });
    render(<AspectRatioPicker />);
    expect(screen.getByLabelText('Custom width')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom height')).toBeInTheDocument();
  });
});
