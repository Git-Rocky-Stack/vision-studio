import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OnionSkinOverlay } from './OnionSkinOverlay';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

const mockFrames = [
  'data:image/png;base64,frame1',
  'data:image/png;base64,frame2',
  'data:image/png;base64,frame3',
  'data:image/png;base64,frame4',
  'data:image/png;base64,frame5',
];

describe('OnionSkinOverlay', () => {
  beforeEach(() => {
    cleanup();
    resetStore();
  });

  afterEach(cleanup);

  it('renders nothing when onion skin is disabled', () => {
    useAppStore.setState({ onionSkinEnabled: false });
    const { container } = render(
      <OnionSkinOverlay frames={mockFrames} currentFrameIndex={2} />
    );
    expect(container.querySelector('[data-testid="onion-skin-overlay"]')).toBeNull();
  });

  it('renders ghost frames when enabled', () => {
    useAppStore.setState({ onionSkinEnabled: true });
    render(<OnionSkinOverlay frames={mockFrames} currentFrameIndex={2} />);
    expect(screen.getByTestId('onion-skin-overlay')).toBeInTheDocument();
    // With default settings (frameCount=2, direction='both'), should show prev 2 + next 2 = 4 ghosts
    const images = screen.getByTestId('onion-skin-overlay').querySelectorAll('img');
    expect(images.length).toBe(4);
  });

  it('respects onionSkinFrameCount', () => {
    useAppStore.setState({ onionSkinEnabled: true, onionSkinFrameCount: 1 });
    render(<OnionSkinOverlay frames={mockFrames} currentFrameIndex={2} />);
    const images = screen.getByTestId('onion-skin-overlay').querySelectorAll('img');
    expect(images.length).toBe(2); // 1 prev + 1 next
  });

  it('respects direction=prev (no next frames)', () => {
    useAppStore.setState({ onionSkinEnabled: true, onionSkinDirection: 'prev' });
    render(<OnionSkinOverlay frames={mockFrames} currentFrameIndex={2} />);
    const images = screen.getByTestId('onion-skin-overlay').querySelectorAll('img');
    expect(images.length).toBe(2); // only prev frames
  });

  it('respects direction=next (no prev frames)', () => {
    useAppStore.setState({ onionSkinEnabled: true, onionSkinDirection: 'next' });
    render(<OnionSkinOverlay frames={mockFrames} currentFrameIndex={2} />);
    const images = screen.getByTestId('onion-skin-overlay').querySelectorAll('img');
    expect(images.length).toBe(2); // only next frames
  });

  it('renders nothing when frames array is empty', () => {
    useAppStore.setState({ onionSkinEnabled: true });
    const { container } = render(
      <OnionSkinOverlay frames={[]} currentFrameIndex={0} />
    );
    expect(container.querySelector('[data-testid="onion-skin-overlay"]')).toBeNull();
  });
});
